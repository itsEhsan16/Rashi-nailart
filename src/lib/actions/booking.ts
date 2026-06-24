"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BOOKING_FEE,
  PENDING_HOLD_MINUTES,
  SERVICES,
  SLOT_HOLDING_STATUSES,
} from "@/lib/salon-data";
import { uploadProof, validateProofFile } from "@/lib/payment-proofs";
import {
  BRANCHES_TUPLE,
  createBookingInputSchema,
  uploadProofSchema,
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
 * Reserve the slot immediately as `pending_payment`. The unique index blocks
 * concurrent bookings of the same slot. The booking is only finalized once an
 * admin verifies the uploaded UPI screenshot. Member nail-art bookings get the
 * 50% discount on the service (charged in-store), priced authoritatively.
 *
 * Returns the appointment id (the customer's capability token for uploading
 * their proof), the booking fee, and the live UPI settings to render the
 * payment screen.
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
      error: "That stylist isn't available at the selected time. Please pick another slot, date, or stylist.",
    };
  }

  const svc = await resolveService(admin, d.service);
  if (!svc) return { ok: false as const, error: "Selected service is unavailable" };

  const { isMember } = await activeMember(admin, d.phone);
  const discount = isMember && svc.isNailArt ? Math.round(svc.price * 0.5) : 0;
  const finalServicePrice = svc.price - discount;

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
      price: finalServicePrice,
      amount: BOOKING_FEE,
      staff_name: d.staff_name,
      special_requests: d.special_requests ?? null,
      payment_status: "pending_payment",
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

  const settings = await getPaymentSettings();
  return {
    ok: true as const,
    appointmentId: appt.id,
    amount: BOOKING_FEE,
    isMember,
    discount,
    finalServicePrice,
    settings,
  };
}

/** Public UPI payment details for the payment screen (admin-editable). */
export type PaymentSettings = {
  upiId: string;
  payeeName: string;
  qrUrl: string;
};

/** Resolve the QR image, treating blanks and the old SVG placeholder as unset. */
function normalizeQrUrl(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v || v === "/upi-qr.svg") return "/QR.png";
  return v;
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select("upi_id, payee_name, upi_qr_url")
    .eq("id", "default")
    .maybeSingle();
  const row = data as { upi_id: string; payee_name: string; upi_qr_url: string } | null;
  return {
    upiId: row?.upi_id ?? "",
    payeeName: row?.payee_name ?? "Rashi Nail Art Studio",
    qrUrl: normalizeQrUrl(row?.upi_qr_url),
  };
}

/**
 * Customer uploads their UPI payment screenshot for a held booking. The
 * unguessable appointment id (returned only to the booker) is the capability;
 * the booking must still be awaiting payment. Validates the image server-side,
 * stores it in the private bucket, and flips the booking to `payment_uploaded`.
 */
export async function uploadBookingProof(formData: FormData) {
  const parsed = uploadProofSchema.safeParse({ id: formData.get("appointmentId") });
  if (!parsed.success) return { ok: false as const, error: "Invalid booking reference." };

  const valid = validateProofFile(formData.get("screenshot"));
  if (!valid.ok) return { ok: false as const, error: valid.error };

  const admin = createAdminClient();
  const { data: apptData } = await admin
    .from("appointments")
    .select("id, payment_status")
    .eq("id", parsed.data.id)
    .maybeSingle();
  const appt = apptData as { id: string; payment_status: string } | null;
  if (!appt) return { ok: false as const, error: "Booking not found. Please start again." };
  if (appt.payment_status !== "pending_payment" && appt.payment_status !== "payment_uploaded") {
    return { ok: false as const, error: "This booking can no longer accept a payment proof." };
  }

  const uploaded = await uploadProof(admin, "bookings", appt.id, valid.file);
  if (!uploaded.ok) return { ok: false as const, error: uploaded.error };

  const { error } = await admin
    .from("appointments")
    .update({
      upi_screenshot_url: uploaded.path,
      uploaded_at: new Date().toISOString(),
      payment_status: "payment_uploaded",
    })
    .eq("id", appt.id);
  if (error) return { ok: false as const, error: error.message };

  return { ok: true as const };
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
