"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayOrder, getRazorpayKeyId } from "@/lib/razorpay/server";
import { BOOKING_FEE, SERVICES } from "@/lib/salon-data";
import {
  BRANCHES_TUPLE,
  createBookingInputSchema,
  type CreateBookingInput,
} from "@/lib/validations/booking";

type Admin = ReturnType<typeof createAdminClient>;

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
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
  const { data } = await admin
    .from("appointments")
    .select("time_slot")
    .eq("branch", parsed.data.branch)
    .eq("staff_name", parsed.data.staff_name)
    .eq("appointment_date", parsed.data.appointment_date)
    .neq("payment_status", "cancelled");
  const rows = (data as { time_slot: string }[] | null) ?? [];
  return { slots: Array.from(new Set(rows.map((r) => r.time_slot))) };
}

/** Authoritative price + nail-art flag from DB (falls back to constants pre-migration). */
async function resolveService(
  admin: Admin,
  name: string,
): Promise<{ price: number; isNailArt: boolean } | null> {
  const { data } = await admin
    .from("services")
    .select("price, is_nail_art")
    .eq("name", name)
    .eq("active", true)
    .maybeSingle();
  const row = data as { price: number; is_nail_art: boolean } | null;
  if (row) return { price: row.price, isNailArt: row.is_nail_art };
  const c = SERVICES.find((s) => s.name === name);
  if (c) return { price: c.price, isNailArt: /nail/i.test(c.name) };
  return null;
}

/**
 * Reserve the slot, then create a ₹50 Razorpay order. The appointment is held in
 * `pending` (the unique index blocks concurrent bookings of the same slot); it is
 * only confirmed once payment is verified server-side. Member nail-art bookings
 * get the 50% discount on the service (charged in-store), priced authoritatively.
 */
export async function createBookingOrder(input: CreateBookingInput) {
  const parsed = createBookingInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid booking details" };
  }
  const d = parsed.data;
  const admin = createAdminClient();

  const svc = await resolveService(admin, d.service);
  if (!svc) return { ok: false as const, error: "Selected service is unavailable" };

  const { isMember } = await activeMember(admin, d.phone);
  const discount = isMember && svc.isNailArt ? Math.round(svc.price * 0.5) : 0;
  const finalServicePrice = svc.price - discount;

  // Release abandoned holds for this exact slot (unpaid, older than 15 minutes).
  const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await admin
    .from("appointments")
    .delete()
    .eq("branch", d.branch)
    .eq("staff_name", d.staff_name)
    .eq("appointment_date", d.appointment_date)
    .eq("time_slot", d.time_slot)
    .eq("payment_status", "pending")
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
      price: finalServicePrice,
      staff_name: d.staff_name,
      special_requests: d.special_requests ?? null,
      payment_status: "pending",
      is_member: isMember,
      discount_applied: discount,
    })
    .select("id")
    .single();

  if (aErr) {
    if ((aErr as { code?: string }).code === "23505") {
      return {
        ok: false as const,
        error: "That slot was just booked. Please choose another time or stylist.",
      };
    }
    return { ok: false as const, error: aErr.message };
  }
  const appt = apptData as { id: string };

  try {
    const order = await createRazorpayOrder(BOOKING_FEE, {
      purpose: "booking",
      phone: d.phone,
      client_name: d.client_name,
    });
    await admin.from("appointments").update({ razorpay_order_id: order.id }).eq("id", appt.id);

    const { data: payData } = await admin
      .from("payments")
      .insert({
        purpose: "booking",
        amount: BOOKING_FEE,
        currency: "INR",
        status: "created",
        razorpay_order_id: order.id,
        client_name: d.client_name,
        phone: d.phone,
        appointment_id: appt.id,
      })
      .select("id")
      .single();
    const pay = payData as { id: string } | null;

    return {
      ok: true as const,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: getRazorpayKeyId(),
      paymentId: pay?.id ?? null,
      appointmentId: appt.id,
      isMember,
      discount,
      finalServicePrice,
    };
  } catch (e) {
    // Release the held slot if we couldn't start payment.
    await admin.from("appointments").delete().eq("id", appt.id);
    const msg = e instanceof Error ? e.message : "Could not start payment";
    return { ok: false as const, error: msg };
  }
}

/** Free a still-pending hold immediately (e.g. the customer dismissed checkout). */
export async function cancelPendingBooking(input: { appointmentId: string }) {
  const parsed = z.object({ appointmentId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false as const };
  const admin = createAdminClient();
  await admin
    .from("appointments")
    .delete()
    .eq("id", parsed.data.appointmentId)
    .eq("payment_status", "pending");
  return { ok: true as const };
}
