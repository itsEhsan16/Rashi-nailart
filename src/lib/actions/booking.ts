"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BOOKING_FEE,
  HOLD_EXPIRED_REASON,
  PAYING_HOLD_MINUTES,
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
import { settleBookingPayment } from "@/lib/payments-core";
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

  // Reclaim abandoned holds for this exact slot. This is the riskiest reclaim in
  // the app — it is the path where a second customer takes a slot a first
  // customer may still be paying for — so it goes through the same two-window
  // helper as the global sweep and can never delete a hold that has a live order.
  await reclaimStaleHolds(admin, {
    branch: d.branch,
    staff_name: d.staff_name,
    appointment_date: d.appointment_date,
    time_slot: d.time_slot,
  });

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
 * — any client-supplied value is ignored. Also refreshes `created_at` and sets
 * `cashfree_order_id`, which together move the row onto the longer
 * PAYING_HOLD_MINUTES window so the reclaim can't take the slot while the
 * customer is away on Cashfree's hosted page. Returns the payment session id for
 * the checkout SDK plus the new hold expiry, so the client countdown matches the
 * server instead of still counting down from the original created_at.
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
    const heldFrom = new Date();
    const { error: holdErr } = await admin
      .from("appointments")
      .update({ cashfree_order_id: orderId, created_at: heldFrom.toISOString() })
      .eq("id", appt.id)
      .eq("payment_status", "pending_payment");
    if (holdErr) console.error("[createBookingOrder] hold update failed:", holdErr.message);
    return {
      ok: true as const,
      paymentSessionId: order.payment_session_id,
      orderId,
      holdExpiresAt: new Date(heldFrom.getTime() + PAYING_HOLD_MINUTES * 60 * 1000).toISOString(),
    };
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

/**
 * Machine-readable outcome. The page maps these to safe copy; raw gateway and
 * database strings are logged server-side only and never rendered — a
 * misconfigured environment would otherwise print
 * "set CASHFREE_APP_ID and CASHFREE_SECRET_KEY" onto a public page.
 */
export type BookingConfirmCode =
  | "invalid_reference"
  | "gateway_unreachable"
  | "slot_taken"
  | "orphaned_payment";

export type BookingConfirmResult =
  | { status: "confirmed"; booking: BookingReceipt }
  | { status: "pending" }
  | { status: "failed"; reason?: string }
  /** Paid, but we could not attach it to a slot. A human must resolve it. */
  | { status: "needs_attention"; code: BookingConfirmCode; orderId: string; cfPaymentId: string | null }
  | { status: "error"; code: BookingConfirmCode };

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
    return { status: "error", code: "invalid_reference" };
  }
  const admin = createAdminClient();

  let order;
  try {
    order = await getOrder(orderId);
  } catch (e) {
    console.error("[confirmBookingByOrder] getOrder failed:", e);
    return { status: "error", code: "gateway_unreachable" };
  }

  if (order.order_status !== "PAID") {
    if (order.order_status === "ACTIVE") {
      // Still at the gateway. Push the hold out so the reclaim can't expire a
      // booking the customer is actively paying for — PendingAutoRefresh polls
      // this every few seconds, so the hold keeps extending while they're there.
      const { error } = await admin
        .from("appointments")
        .update({ created_at: new Date().toISOString() })
        .eq("id", parsed.recordId)
        .eq("payment_status", "pending_payment");
      if (error) console.error("[confirmBookingByOrder] hold extend failed:", error.message);
      return { status: "pending" };
    }
    return { status: "failed", reason: order.order_status };
  }

  // Paid. Attach it to the booking — idempotent, and it revives a hold that
  // expired while the customer was at the gateway.
  const pay = await getSuccessfulPayment(orderId);
  const cfPaymentId = pay?.cfPaymentId ?? null;
  const outcome = await settleBookingPayment(admin, parsed.recordId, {
    cfPaymentId,
    method: pay?.method ?? null,
  });

  if (outcome !== "verified") {
    // Money was taken and we cannot show a confirmed booking. Journal it as
    // unprocessed so it surfaces in the payment_events reconciliation queue,
    // and tell the customer to call us rather than pay again.
    console.error(
      `[confirmBookingByOrder] paid but unsettled (${outcome}) order=${orderId} appointment=${parsed.recordId}`,
    );
    const { error } = await admin.from("payment_events").insert({
      event_type: outcome === "missing" ? "RETURN_ORPHAN" : "RETURN_CONFLICT",
      order_id: orderId,
      cf_payment_id: cfPaymentId,
      kind: "booking",
      source: "return",
      processed: false,
      raw: { order_status: order.order_status, outcome },
    });
    // A duplicate cf_payment_id just means the webhook already journaled it.
    if (error && (error as { code?: string }).code !== "23505") {
      console.error("[confirmBookingByOrder] journal failed:", error.message);
    }
    return {
      status: "needs_attention",
      code: outcome === "missing" ? "orphaned_payment" : "slot_taken",
      orderId,
      cfPaymentId,
    };
  }

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
  if (!row) {
    // settleBookingPayment said "verified", so the row existed a moment ago.
    // Defensive only — treat it like any other paid-but-unattached payment.
    console.error(`[confirmBookingByOrder] receipt row vanished order=${orderId}`);
    return { status: "needs_attention", code: "orphaned_payment", orderId, cfPaymentId };
  }

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

/** Optional slot scope — when given, only that one slot's holds are reclaimed. */
type SlotScope = {
  branch: CreateBookingInput["branch"];
  staff_name: string;
  appointment_date: string;
  time_slot: string;
};

/**
 * Reclaim stale `pending_payment` holds, treating the two states differently.
 * Both delete sites in this file go through here so they can never drift apart.
 *
 *   no order yet   → hard delete after PENDING_HOLD_MINUTES. Nothing of value is
 *                    attached; the customer never reached the gateway.
 *   order created  → NEVER deleted. After PAYING_HOLD_MINUTES the row is expired
 *                    in place to `rejected` + HOLD_EXPIRED_REASON, which frees
 *                    the slot (uq_appointment_slot and SLOT_HOLDING_STATUSES both
 *                    exclude `rejected`) while KEEPING the cashfree_order_id →
 *                    booking mapping. A late webhook or return-page reconcile can
 *                    then revive it instead of finding nothing and silently
 *                    dropping a payment we already took.
 *
 * payment_uploaded/verified holds are never touched.
 */
async function reclaimStaleHolds(admin: Admin, scope?: SlotScope) {
  const now = Date.now();
  const pendingCutoff = new Date(now - PENDING_HOLD_MINUTES * 60 * 1000).toISOString();
  const payingCutoff = new Date(now - PAYING_HOLD_MINUTES * 60 * 1000).toISOString();

  // (a) Never reached the gateway — safe to remove outright.
  let del = admin
    .from("appointments")
    .delete()
    .eq("payment_status", "pending_payment")
    .is("cashfree_order_id", null)
    .lt("created_at", pendingCutoff);
  if (scope) {
    del = del
      .eq("branch", scope.branch)
      .eq("staff_name", scope.staff_name)
      .eq("appointment_date", scope.appointment_date)
      .eq("time_slot", scope.time_slot);
  }
  const { error: delErr } = await del;
  if (delErr) console.error("[reclaimStaleHolds] delete failed:", delErr.message);

  // (b) Has a live order — expire in place, keep the row.
  let exp = admin
    .from("appointments")
    .update({ payment_status: "rejected", rejection_reason: HOLD_EXPIRED_REASON })
    .eq("payment_status", "pending_payment")
    .not("cashfree_order_id", "is", null)
    .lt("created_at", payingCutoff);
  if (scope) {
    exp = exp
      .eq("branch", scope.branch)
      .eq("staff_name", scope.staff_name)
      .eq("appointment_date", scope.appointment_date)
      .eq("time_slot", scope.time_slot);
  }
  const { error: expErr } = await exp;
  if (expErr) console.error("[reclaimStaleHolds] expire failed:", expErr.message);
}

/**
 * Global reclaim of abandoned holds, so one never lingers as a phantom that
 * occupies a slot or shows up in the dashboards. Called from the slot picker and
 * the staff/admin dashboards; see reclaimStaleHolds for the two-window rules.
 */
export async function sweepStalePendingHolds() {
  await reclaimStaleHolds(createAdminClient());
  return { ok: true as const };
}
