"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BOOKING_FEE,
  PENDING_HOLD_MINUTES,
  SERVICES,
  SLOT_HOLDING_STATUSES,
} from "@/lib/salon-data";
import {
  createOrder,
  getOrder,
  getSuccessfulPayment,
  orderIdFor,
  parseOrderId,
  synthEmail,
} from "@/lib/cashfree";
import { notifyCustomer } from "@/lib/notify";
import { isSlotCutoffBlocked, isSlotInPast } from "@/lib/utils";
import {
  BRANCHES_TUPLE,
  createBookingInputSchema,
  type CreateBookingInput,
} from "@/lib/validations/booking";

type Admin = ReturnType<typeof createAdminClient>;

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Absolute base URL (no trailing slash) for Cashfree return/notify URLs. */
function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Active member = active row whose activation_date has passed and not expired. */
async function activeMember(
  admin: Admin,
  phone: string,
): Promise<{ isMember: boolean; name: string | null }> {
  const today = isoToday();
  const { data } = await admin
    .from("memberships")
    .select("id, client_name")
    .eq("phone", phone.trim())
    .eq("active", true)
    .lte("activation_date", today)
    .gte("expires_at", today)
    .order("expires_at", { ascending: false })
    .limit(1);
  const rows = (data as { id: string; client_name: string }[] | null) ?? [];
  return { isMember: rows.length > 0, name: rows[0]?.client_name ?? null };
}

export async function checkMembership(input: { phone: string }) {
  const parsed = z.object({ phone: z.string().trim().min(7).max(20) }).safeParse(input);
  if (!parsed.success) return { isMember: false as const, memberName: null };
  const admin = createAdminClient();
  const { isMember, name } = await activeMember(admin, parsed.data.phone);
  return { isMember, memberName: name };
}

const slotsInputSchema = z.object({
  branch: z.enum(BRANCHES_TUPLE),
  staff_name: z.string().min(1).max(50),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Slots already taken (any non-cancelled booking) for a staff/branch/date. */
export async function getBookedSlots(input: z.infer<typeof slotsInputSchema>) {
  const parsed = slotsInputSchema.safeParse(input);
  if (!parsed.success) return { slots: [] as string[] };
  const admin = createAdminClient();
  // Drop abandoned no-proof holds first so they don't show the slot as taken.
  await sweepStalePendingHolds();
  const { data } = await admin
    .from("appointments")
    .select("time_slot")
    .eq("branch", parsed.data.branch)
    .eq("staff_name", parsed.data.staff_name)
    .eq("appointment_date", parsed.data.appointment_date)
    .in("payment_status", SLOT_HOLDING_STATUSES as unknown as string[]);
  const rows = (data as { time_slot: string }[] | null) ?? [];
  return { slots: Array.from(new Set(rows.map((r) => r.time_slot))) };
}

/** True if (name+branch) is scheduled to work `timeSlot` on the weekday of isoDate. */
async function staffWorksSlot(
  admin: Admin,
  branch: CreateBookingInput["branch"],
  staffName: string,
  isoDate: string,
  timeSlot: string,
): Promise<boolean> {
  // getUTCDay on an explicit UTC-midnight string = the chosen calendar day's
  // weekday, independent of server timezone. Matches the client's local getDay()
  // because a fixed calendar date has the same weekday everywhere.
  const dow = new Date(`${isoDate}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  const { data: staffRow } = await admin
    .from("staff")
    .select("id")
    .eq("name", staffName)
    .eq("branch", branch)
    .maybeSingle();
  const sid = (staffRow as { id: string } | null)?.id;
  if (!sid) return false;
  const { data } = await admin
    .from("staff_schedules")
    .select("id")
    .eq("staff_id", sid)
    .eq("day_of_week", dow)
    .eq("time_slot", timeSlot)
    .limit(1);
  return ((data as { id: string }[] | null) ?? []).length > 0;
}

/** Authoritative price from DB (falls back to constants pre-migration). */
async function resolveService(
  admin: Admin,
  name: string,
): Promise<{ price: number } | null> {
  const { data } = await admin
    .from("services")
    .select("price")
    .eq("name", name)
    .eq("active", true)
    .maybeSingle();
  const row = data as { price: number } | null;
  if (row) return { price: row.price };
  const c = SERVICES.find((s) => s.name === name);
  if (c) return { price: c.price };
  return null;
}

/**
 * Reserve the slot immediately as `pending_payment`. The unique index blocks
 * concurrent bookings of the same slot. The booking is finalized (→ `verified`)
 * automatically once Cashfree confirms the ₹50 fee (see createBookingOrder +
 * confirmBookingByOrder + the webhook). Service is always priced at full
 * price online — any membership discount is applied manually in-store by the
 * manager, never automatically here. `is_member` is still stored so staff can
 * see who's a member.
 *
 * Returns the appointment id (the customer's capability token for starting the
 * Cashfree payment) and the booking fee.
 */
export async function createBooking(input: CreateBookingInput) {
  const parsed = createBookingInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid booking details" };
  }
  const d = parsed.data;
  const admin = createAdminClient();

  // Availability guard: the stylist must be scheduled for this weekday + slot.
  // Defends against stale/crafted submissions that bypass the form's filtering.
  if (!(await staffWorksSlot(admin, d.branch, d.staff_name, d.appointment_date, d.time_slot))) {
    return {
      ok: false as const,
      error: "That artist isn't available at the selected time. Please pick another slot, date, or artist.",
    };
  }

  // Dated cutoff: specific calendar dates close earlier than the full slot list
  // (see DATED_BOOKING_CUTOFFS). Defends against a crafted submission bypassing
  // the form's disabled option.
  if (isSlotCutoffBlocked(d.appointment_date, d.time_slot)) {
    return {
      ok: false as const,
      error: "That time isn't available for this date. Please choose an earlier slot or another date.",
    };
  }

  // Same-day guard: never accept a slot whose start time has already passed
  // (interpreted in IST). Otherwise a customer booking the 4:15 PM slot at 4:40 PM
  // lands an appointment in the past that never surfaces on the admin's day view.
  if (isSlotInPast(d.appointment_date, d.time_slot)) {
    return {
      ok: false as const,
      error: "That time has already passed. Please choose a later slot or another date.",
    };
  }

  const svc = await resolveService(admin, d.service);
  if (!svc) return { ok: false as const, error: "Selected service is unavailable" };

  const { isMember } = await activeMember(admin, d.phone);

  // Reclaim abandoned holds for this exact slot (never uploaded a proof, older
  // than the hold window). payment_uploaded/verified holds are never reclaimed.
  const staleCutoff = new Date(Date.now() - PENDING_HOLD_MINUTES * 60 * 1000).toISOString();
  await admin
    .from("appointments")
    .delete()
    .eq("branch", d.branch)
    .eq("staff_name", d.staff_name)
    .eq("appointment_date", d.appointment_date)
    .eq("time_slot", d.time_slot)
    .eq("payment_status", "pending_payment")
    .lt("created_at", staleCutoff);

  // Reserve the slot. uq_appointment_slot guarantees one non-cancelled booking.
  const { data: apptData, error: aErr } = await admin
    .from("appointments")
    .insert({
      client_name: d.client_name,
      phone: d.phone,
      branch: d.branch,
      appointment_date: d.appointment_date,
      time_slot: d.time_slot,
      service: d.service,
      price: svc.price,
      amount: BOOKING_FEE,
      staff_name: d.staff_name,
      special_requests: d.special_requests ?? null,
      payment_status: "pending_payment",
      is_member: isMember,
      discount_applied: 0,
    })
    .select("id")
    .single();

  if (aErr) {
    if ((aErr as { code?: string }).code === "23505") {
      return {
        ok: false as const,
        error: "That slot was just booked. Please choose another time or artist.",
      };
    }
    return { ok: false as const, error: aErr.message };
  }
  const appt = apptData as { id: string };

  return {
    ok: true as const,
    appointmentId: appt.id,
    amount: BOOKING_FEE,
    isMember,
  };
}

/**
 * Create a Cashfree order for a held booking's ₹50 fee. The unguessable
 * appointment id (returned only to the booker) is the capability; the booking
 * must still be awaiting payment. The amount is fixed SERVER-SIDE (BOOKING_FEE)
 * — any client-supplied value is ignored. Also refreshes `created_at` so the
 * 5-minute stale-hold sweep can't reclaim the slot while the customer is away on
 * Cashfree's hosted page. Returns the payment session id for the checkout SDK.
 */
export async function createBookingOrder(input: { appointmentId: string }) {
  const parsed = z.object({ appointmentId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid booking reference." };
  const admin = createAdminClient();

  const { data } = await admin
    .from("appointments")
    .select("id, client_name, phone, payment_status")
    .eq("id", parsed.data.appointmentId)
    .maybeSingle();
  const appt = data as
    | { id: string; client_name: string; phone: string; payment_status: string }
    | null;
  if (!appt) return { ok: false as const, error: "Booking not found. Please start again." };
  if (appt.payment_status !== "pending_payment") {
    return { ok: false as const, error: "This booking is no longer awaiting payment." };
  }

  const orderId = orderIdFor("booking", appt.id);
  try {
    const order = await createOrder({
      orderId,
      amount: BOOKING_FEE,
      customer: {
        id: appt.id,
        name: appt.client_name,
        phone: appt.phone,
        email: synthEmail(appt.phone),
      },
      returnUrl: `${siteUrl()}/booking/confirm?order_id=${orderId}`,
      notifyUrl: `${siteUrl()}/api/webhooks/cashfree`,
    });
    // Store the order and extend the hold. Guarded so a row that already advanced
    // (e.g. a fast webhook) is never disturbed.
    await admin
      .from("appointments")
      .update({ cashfree_order_id: orderId, created_at: new Date().toISOString() })
      .eq("id", appt.id)
      .eq("payment_status", "pending_payment");
    return { ok: true as const, paymentSessionId: order.payment_session_id, orderId };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Could not start payment. Please try again.",
    };
  }
}

/** Full details rendered on the confirmation page and printed on the receipt. */
export type BookingReceipt = {
  clientName: string;
  phone: string;
  branch: string;
  date: string; // appointment_date (yyyy-MM-dd)
  timeSlot: string;
  service: string;
  staffName: string;
  amount: number; // ₹ booking fee paid online
  orderId: string;
  cfPaymentId: string | null;
  paymentMethod: string | null;
};

export type BookingConfirmResult =
  | { status: "confirmed"; booking: BookingReceipt }
  | { status: "pending" }
  | { status: "failed"; reason?: string }
  | { status: "error"; error: string };

/**
 * Reconcile a booking against Cashfree after the customer returns from checkout.
 * NEVER trusts the redirect — it fetches the authoritative order status from
 * Cashfree (Get Order). On PAID it flips the booking to `verified` with a guarded
 * update (only a still-pending row), so it's idempotent and safe to call on every
 * refresh and alongside the webhook. Returns everything the receipt needs.
 */
export async function confirmBookingByOrder(input: { orderId: string }): Promise<BookingConfirmResult> {
  const orderId = String(input?.orderId ?? "");
  const parsed = parseOrderId(orderId);
  if (!parsed || parsed.kind !== "booking") {
    return { status: "error", error: "Invalid payment reference." };
  }
  const admin = createAdminClient();

  let order;
  try {
    order = await getOrder(orderId);
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "Could not verify payment." };
  }

  if (order.order_status !== "PAID") {
    if (order.order_status === "ACTIVE") return { status: "pending" };
    return { status: "failed", reason: order.order_status };
  }

  // Paid — enrich with the payment id/method and flip to verified idempotently.
  const pay = await getSuccessfulPayment(orderId);
  await admin
    .from("appointments")
    .update({
      payment_status: "verified",
      paid_at: new Date().toISOString(),
      verified_at: new Date().toISOString(),
      cf_payment_id: pay?.cfPaymentId ?? null,
      payment_method: pay?.method ?? null,
      rejection_reason: null,
    })
    .eq("id", parsed.recordId)
    .eq("payment_status", "pending_payment");

  const { data } = await admin
    .from("appointments")
    .select(
      "client_name, phone, branch, appointment_date, time_slot, service, staff_name, amount, cf_payment_id, payment_method",
    )
    .eq("id", parsed.recordId)
    .maybeSingle();
  const row = data as
    | {
        client_name: string;
        phone: string;
        branch: string;
        appointment_date: string;
        time_slot: string;
        service: string;
        staff_name: string;
        amount: number;
        cf_payment_id: string | null;
        payment_method: string | null;
      }
    | null;
  if (!row) return { status: "error", error: "Booking not found." };

  // Journal the confirmation. The unique cf_payment_id index dedupes against the
  // webhook — a duplicate simply returns an error we ignore.
  if (row.cf_payment_id) {
    await admin.from("payment_events").insert({
      event_type: "RETURN_CONFIRM",
      order_id: orderId,
      cf_payment_id: row.cf_payment_id,
      kind: "booking",
      source: "return",
      processed: true,
      raw: { order_status: order.order_status },
    });
  }

  await notifyCustomer({
    phone: row.phone,
    message: `Hi ${row.client_name}, your Rashi Nail Art Studio booking is confirmed. See you soon!`,
  });

  return {
    status: "confirmed",
    booking: {
      clientName: row.client_name,
      phone: row.phone,
      branch: row.branch,
      date: row.appointment_date,
      timeSlot: row.time_slot,
      service: row.service,
      staffName: row.staff_name,
      amount: row.amount,
      orderId,
      cfPaymentId: row.cf_payment_id,
      paymentMethod: row.payment_method,
    },
  };
}

/** Free a still-pending hold immediately (e.g. the customer abandoned payment). */
export async function cancelPendingBooking(input: { appointmentId: string }) {
  const parsed = z.object({ appointmentId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false as const };
  const admin = createAdminClient();
  await admin
    .from("appointments")
    .delete()
    .eq("id", parsed.data.appointmentId)
    .eq("payment_status", "pending_payment");
  return { ok: true as const };
}

/**
 * Global reclaim of abandoned, never-proven holds: delete every `pending_payment`
 * row older than the hold window. This is the guaranteed cleanup (the same-slot
 * reclaim in createBooking only fires when someone rebooks that exact slot), so
 * an abandoned booking never lingers as a phantom that occupies a slot or shows
 * up in the dashboards. payment_uploaded/verified holds are never touched.
 */
export async function sweepStalePendingHolds() {
  const admin = createAdminClient();
  const staleCutoff = new Date(Date.now() - PENDING_HOLD_MINUTES * 60 * 1000).toISOString();
  await admin
    .from("appointments")
    .delete()
    .eq("payment_status", "pending_payment")
    .lt("created_at", staleCutoff);
  return { ok: true as const };
}
