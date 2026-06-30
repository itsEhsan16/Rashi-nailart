"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, type AuthProfile, type UserRole } from "@/lib/auth";
import { BRANCHES_TUPLE } from "@/lib/validations/booking";
import {
  describeStorageError,
  prepareImageForStorage,
  pruneSiblings,
  signedProofUrl,
} from "@/lib/payment-proofs";
import {
  MAX_PROOF_BYTES,
  isAcceptedProofFile,
  PAYMENT_MODE_VALUES,
  type PaymentMode,
} from "@/lib/salon-data";
import { fulfillMembershipPayment, type MembershipPayment } from "@/lib/payments-core";
import { sweepStalePendingHolds } from "@/lib/actions/booking";
import { notifyCustomer } from "@/lib/notify";
import { UPI_VPA_RE } from "@/lib/upi";
import { isMissingStaffPhotoColumn } from "@/lib/staff-photos";

type Admin = ReturnType<typeof createAdminClient>;

async function requireRole(roles: UserRole[]): Promise<AuthProfile | null> {
  const profile = await getCurrentProfile();
  if (!profile || !roles.includes(profile.role)) return null;
  return profile;
}

const UNAUTHORIZED = { ok: false as const, error: "Unauthorized" };

// ─────────────────────────── Appointment rows ───────────────────────────────
export type BookingRow = {
  id: string;
  client_name: string;
  phone: string;
  branch: string;
  appointment_date: string;
  time_slot: string;
  service: string;
  price: number;
  amount: number;
  staff_name: string;
  special_requests: string | null;
  payment_status: string;
  upi_screenshot_url: string | null;
  uploaded_at: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  is_member: boolean;
  discount_applied: number;
  completed: boolean;
  created_at: string;
  /** How the in-store balance (price + extras) was settled. "upi" is legacy. null = unrecorded. */
  payment_mode: PaymentMode | "upi" | null;
  /** Sum of staff-added extra line items (₹). Computed, not an appointments column. */
  extras_total: number;
};

const BOOKING_COLUMNS =
  "id, client_name, phone, branch, appointment_date, time_slot, service, price, amount, staff_name, special_requests, payment_status, upi_screenshot_url, uploaded_at, verified_at, rejection_reason, is_member, discount_applied, completed, created_at, payment_mode";

const filtersSchema = z.object({
  date: z.string().optional(),
  branch: z.enum(BRANCHES_TUPLE).optional(),
  staff: z.string().optional(),
  status: z
    .enum(["pending_payment", "payment_uploaded", "verified", "rejected", "cancelled", "completed"])
    .optional(),
});

/** Role-scoped booking list: admin = all, manager = own branch, staff = own name. */
export async function listBookings(input: z.infer<typeof filtersSchema> = {}) {
  const profile = await requireRole(["admin", "manager", "staff"]);
  if (!profile) return { ...UNAUTHORIZED, bookings: [] as BookingRow[] };
  const f = filtersSchema.safeParse(input).data ?? {};
  const admin = createAdminClient();

  // Clear out abandoned, never-proven holds so they don't surface as bookings.
  await sweepStalePendingHolds();

  let q = admin
    .from("appointments")
    .select(BOOKING_COLUMNS)
    .order("appointment_date", { ascending: false })
    .order("time_slot", { ascending: true });

  if (profile.role === "staff") {
    q = q.ilike("staff_name", profile.staffName ?? "__none__");
  } else if (profile.role === "manager" && profile.branch) {
    q = q.eq("branch", profile.branch);
  } else if (f.branch) {
    q = q.eq("branch", f.branch);
  }
  if (f.date) q = q.eq("appointment_date", f.date);
  if (f.staff) q = q.ilike("staff_name", `%${f.staff}%`);
  if (f.status === "completed") q = q.eq("completed", true);
  else if (f.status) q = q.eq("payment_status", f.status);
  // Un-proven holds aren't real bookings — hide them unless explicitly requested.
  if (f.status !== "pending_payment") q = q.neq("payment_status", "pending_payment");

  const { data, error } = await q;
  if (error) return { ok: false as const, error: error.message, bookings: [] as BookingRow[] };
  let bookings = ((data as Omit<BookingRow, "extras_total">[] | null) ?? []).map((b) => ({
    ...b,
    extras_total: 0,
  })) as BookingRow[];

  // Attach each booking's extras total in one batched query (avoids N+1).
  if (bookings.length) {
    const totals = await extrasTotalsFor(admin, bookings.map((b) => b.id));
    bookings = bookings.map((b) => ({ ...b, extras_total: totals.get(b.id) ?? 0 }));
  }

  // Staff must not see client phone numbers; redact before sending to the client.
  if (profile.role === "staff") {
    bookings = bookings.map((b) => ({ ...b, phone: "" }));
  }
  return { ok: true as const, bookings, role: profile.role };
}

const idSchema = z.object({ id: z.string().uuid() });

async function scopedAppointmentMatch(admin: Admin, profile: AuthProfile, id: string) {
  // returns true if this profile may act on the appointment
  if (profile.role === "admin") return true;
  const { data } = await admin
    .from("appointments")
    .select("branch, staff_name")
    .eq("id", id)
    .maybeSingle();
  const row = data as { branch: string; staff_name: string } | null;
  if (!row) return false;
  if (profile.role === "manager") return row.branch === profile.branch;
  return row.staff_name.toLowerCase() === (profile.staffName ?? "").toLowerCase();
}

/** Sum appointment_extras.amount per appointment id in one batched query. */
async function extrasTotalsFor(admin: Admin, apptIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (!apptIds.length) return totals;
  const { data } = await admin
    .from("appointment_extras")
    .select("appointment_id, amount")
    .in("appointment_id", apptIds);
  for (const e of (data as { appointment_id: string; amount: number }[] | null) ?? []) {
    totals.set(e.appointment_id, (totals.get(e.appointment_id) ?? 0) + (e.amount ?? 0));
  }
  return totals;
}

export async function completeBooking(input: { id: string }) {
  const profile = await requireRole(["admin", "manager", "staff"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid id" };
  const admin = createAdminClient();
  if (!(await scopedAppointmentMatch(admin, profile, parsed.data.id))) return UNAUTHORIZED;
  const { error } = await admin
    .from("appointments")
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq("id", parsed.data.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

const paymentModeInput = z.object({
  id: z.string().uuid(),
  mode: z.enum(PAYMENT_MODE_VALUES).nullable(), // null clears a previously-set mode
});

/** Record how the customer settled the in-store balance (price + extras). Staff,
 *  manager and admin may set it on a booking they're scoped to. */
export async function setBookingPaymentMode(input: z.infer<typeof paymentModeInput>) {
  const profile = await requireRole(["admin", "manager", "staff"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = paymentModeInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid payment mode" };
  const admin = createAdminClient();
  if (!(await scopedAppointmentMatch(admin, profile, parsed.data.id))) return UNAUTHORIZED;
  const { error } = await admin
    .from("appointments")
    .update({ payment_mode: parsed.data.mode })
    .eq("id", parsed.data.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function cancelBooking(input: { id: string }) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid id" };
  const admin = createAdminClient();
  if (!(await scopedAppointmentMatch(admin, profile, parsed.data.id))) return UNAUTHORIZED;
  const { error } = await admin
    .from("appointments")
    .update({ payment_status: "cancelled" })
    .eq("id", parsed.data.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function deleteBooking(input: { id: string }) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid id" };
  const admin = createAdminClient();
  if (!(await scopedAppointmentMatch(admin, profile, parsed.data.id))) return UNAUTHORIZED;
  const { error } = await admin.from("appointments").delete().eq("id", parsed.data.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

// ───────────────────── Appointment extras (in-studio add-ons) ────────────────
export type ExtraRow = { id: string; label: string; amount: number; created_at: string };

const addExtraInput = z.object({
  appointmentId: z.string().uuid(),
  label: z.string().trim().min(1, "Describe the extra").max(100),
  amount: z.coerce.number().int("Whole rupees only").min(0).max(100000),
});

/** Staff/manager/admin add an extra line item to a booking they're scoped to. */
export async function addAppointmentExtra(input: z.infer<typeof addExtraInput>) {
  const profile = await requireRole(["admin", "manager", "staff"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = addExtraInput.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const admin = createAdminClient();
  if (!(await scopedAppointmentMatch(admin, profile, parsed.data.appointmentId))) return UNAUTHORIZED;
  const { error } = await admin.from("appointment_extras").insert({
    appointment_id: parsed.data.appointmentId,
    label: parsed.data.label,
    amount: parsed.data.amount,
    created_by: profile.id,
  });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function listAppointmentExtras(input: { appointmentId: string }) {
  const profile = await requireRole(["admin", "manager", "staff"]);
  if (!profile) return { ...UNAUTHORIZED, extras: [] as ExtraRow[] };
  const parsed = z.object({ appointmentId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid id", extras: [] as ExtraRow[] };
  const admin = createAdminClient();
  if (!(await scopedAppointmentMatch(admin, profile, parsed.data.appointmentId)))
    return { ...UNAUTHORIZED, extras: [] as ExtraRow[] };
  const { data, error } = await admin
    .from("appointment_extras")
    .select("id, label, amount, created_at")
    .eq("appointment_id", parsed.data.appointmentId)
    .order("created_at");
  if (error) return { ok: false as const, error: error.message, extras: [] as ExtraRow[] };
  return { ok: true as const, extras: (data as ExtraRow[] | null) ?? [] };
}

export async function deleteAppointmentExtra(input: { id: string; appointmentId: string }) {
  const profile = await requireRole(["admin", "manager", "staff"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = z
    .object({ id: z.string().uuid(), appointmentId: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid" };
  const admin = createAdminClient();
  if (!(await scopedAppointmentMatch(admin, profile, parsed.data.appointmentId))) return UNAUTHORIZED;
  const { error } = await admin
    .from("appointment_extras")
    .delete()
    .eq("id", parsed.data.id)
    .eq("appointment_id", parsed.data.appointmentId); // bind delete to the authorized parent
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

// ─────────────────────────── Payment verification ───────────────────────────
export type VerificationRow = {
  kind: "booking" | "membership";
  id: string;
  client_name: string;
  phone: string;
  branch: string | null;
  appointment_date: string | null;
  time_slot: string | null;
  service: string | null;
  staff_name: string | null;
  amount: number;
  uploaded_at: string | null;
  has_proof: boolean;
};

/** Bookings + memberships awaiting verification (status payment_uploaded), newest first. */
export async function listPendingVerifications() {
  const profile = await requireRole(["admin"]);
  if (!profile) return { ...UNAUTHORIZED, rows: [] as VerificationRow[] };
  const admin = createAdminClient();

  const [apptRes, payRes] = await Promise.all([
    admin
      .from("appointments")
      .select(BOOKING_COLUMNS)
      .eq("payment_status", "payment_uploaded")
      .order("uploaded_at", { ascending: false }),
    admin
      .from("payments")
      .select("id, client_name, phone, amount, uploaded_at, upi_screenshot_url")
      .eq("purpose", "membership")
      .eq("status", "payment_uploaded")
      .order("uploaded_at", { ascending: false }),
  ]);

  const appts = (apptRes.data as BookingRow[] | null) ?? [];
  const pays =
    (payRes.data as
      | { id: string; client_name: string | null; phone: string | null; amount: number; uploaded_at: string | null; upi_screenshot_url: string | null }[]
      | null) ?? [];

  const rows: VerificationRow[] = [
    ...appts.map((a): VerificationRow => ({
      kind: "booking",
      id: a.id,
      client_name: a.client_name,
      phone: a.phone,
      branch: a.branch,
      appointment_date: a.appointment_date,
      time_slot: a.time_slot,
      service: a.service,
      staff_name: a.staff_name,
      amount: a.amount,
      uploaded_at: a.uploaded_at,
      has_proof: !!a.upi_screenshot_url,
    })),
    ...pays.map((p): VerificationRow => ({
      kind: "membership",
      id: p.id,
      client_name: p.client_name ?? "Member",
      phone: p.phone ?? "",
      branch: null,
      appointment_date: null,
      time_slot: null,
      service: "1-Year Membership",
      staff_name: null,
      amount: p.amount,
      uploaded_at: p.uploaded_at,
      has_proof: !!p.upi_screenshot_url,
    })),
  ].sort((a, b) => (b.uploaded_at ?? "").localeCompare(a.uploaded_at ?? ""));

  return { ok: true as const, rows };
}

const proofInput = z.object({ kind: z.enum(["booking", "membership"]), id: z.string().uuid() });

/** Short-lived signed URL for a proof image. Admin = any; manager = own-branch bookings. */
export async function getProofUrl(input: z.infer<typeof proofInput>) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return { ...UNAUTHORIZED, url: null };
  const parsed = proofInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid", url: null };
  const admin = createAdminClient();

  let path: string | null = null;
  if (parsed.data.kind === "booking") {
    const { data } = await admin
      .from("appointments")
      .select("upi_screenshot_url, branch")
      .eq("id", parsed.data.id)
      .maybeSingle();
    const row = data as { upi_screenshot_url: string | null; branch: string } | null;
    if (!row) return { ok: false as const, error: "Not found", url: null };
    if (profile.role === "manager" && row.branch !== profile.branch) {
      return { ...UNAUTHORIZED, url: null };
    }
    path = row.upi_screenshot_url;
  } else {
    if (profile.role !== "admin") return { ...UNAUTHORIZED, url: null };
    const { data } = await admin
      .from("payments")
      .select("upi_screenshot_url")
      .eq("id", parsed.data.id)
      .maybeSingle();
    path = (data as { upi_screenshot_url: string | null } | null)?.upi_screenshot_url ?? null;
  }

  if (!path) return { ok: false as const, error: "No screenshot on file", url: null };
  const url = await signedProofUrl(admin, path);
  if (!url) return { ok: false as const, error: "Could not open screenshot", url: null };
  return { ok: true as const, url };
}

/** Verify a booking payment → finalize the slot. */
export async function verifyBookingPayment(input: { id: string }) {
  const profile = await requireRole(["admin"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid id" };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("appointments")
    .update({
      payment_status: "verified",
      verified_by: profile.id,
      verified_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq("id", parsed.data.id)
    .eq("payment_status", "payment_uploaded")
    .select("client_name, phone")
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "Booking is no longer awaiting verification." };
  const row = data as { client_name: string; phone: string };
  // TODO(notify): wire a real SMS/WhatsApp provider.
  await notifyCustomer({
    phone: row.phone,
    message: `Hi ${row.client_name}, your Rashi Nail Art Studio booking is confirmed. See you soon!`,
  });
  return { ok: true as const };
}

const rejectInput = z.object({ id: z.string().uuid(), reason: z.string().trim().min(1).max(300) });

/** Reject a booking payment → release the held slot. */
export async function rejectBookingPayment(input: z.infer<typeof rejectInput>) {
  const profile = await requireRole(["admin"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = rejectInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("appointments")
    .update({
      payment_status: "rejected",
      verified_by: profile.id,
      verified_at: new Date().toISOString(),
      rejection_reason: parsed.data.reason,
    })
    .eq("id", parsed.data.id)
    .eq("payment_status", "payment_uploaded")
    .select("client_name, phone")
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "Booking is no longer awaiting verification." };
  const row = data as { client_name: string; phone: string };
  await notifyCustomer({
    phone: row.phone,
    message: `Hi ${row.client_name}, we couldn't verify your payment: ${parsed.data.reason}. Please re-book or contact the studio.`,
  });
  return { ok: true as const };
}

/** Verify a membership payment → create the membership (benefits start on join). */
export async function verifyMembershipPayment(input: { id: string }) {
  const profile = await requireRole(["admin"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid id" };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payments")
    .update({
      status: "verified",
      verified_by: profile.id,
      verified_at: new Date().toISOString(),
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("purpose", "membership")
    .eq("status", "payment_uploaded")
    .select("id, purpose, client_name, phone, amount, membership_id")
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "Request is no longer awaiting verification." };
  const pay = data as MembershipPayment;
  await fulfillMembershipPayment(admin, pay);
  await notifyCustomer({
    phone: pay.phone ?? "",
    message: `Hi ${pay.client_name ?? "there"}, your Rashi membership is confirmed — your benefits are active now. Enjoy 50% off nail art!`,
  });
  return { ok: true as const };
}

/** Reject a membership payment. */
export async function rejectMembershipPayment(input: z.infer<typeof rejectInput>) {
  const profile = await requireRole(["admin"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = rejectInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payments")
    .update({
      status: "rejected",
      verified_by: profile.id,
      verified_at: new Date().toISOString(),
      rejection_reason: parsed.data.reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("purpose", "membership")
    .eq("status", "payment_uploaded")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "Request is no longer awaiting verification." };
  return { ok: true as const };
}

// ─────────────────────────────── UPI settings ───────────────────────────────
export type AppSettings = { upi_id: string; payee_name: string; upi_qr_url: string };

export async function getAppSettings() {
  const profile = await requireRole(["admin"]);
  if (!profile) return { ...UNAUTHORIZED, settings: null };
  const admin = createAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select("upi_id, payee_name, upi_qr_url")
    .eq("id", "default")
    .maybeSingle();
  const settings = (data as AppSettings | null) ?? {
    upi_id: "",
    payee_name: "Rashi Nail Art Studio",
    upi_qr_url: "/QR.png",
  };
  return { ok: true as const, settings };
}

const settingsInput = z.object({
  // Empty is allowed (the pay button + copy row just hide); a non-empty value
  // must be a well-formed VPA so it can't corrupt or inject into the UPI link.
  upi_id: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || UPI_VPA_RE.test(v), "Enter a valid UPI ID like name@bank"),
  payee_name: z.string().trim().min(1).max(120),
  upi_qr_url: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || "/QR.png"),
});

export async function saveAppSettings(input: z.infer<typeof settingsInput>) {
  const profile = await requireRole(["admin"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = settingsInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const admin = createAdminClient();
  const { error } = await admin
    .from("app_settings")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", "default");
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

const QR_BUCKET = "app-assets";

/**
 * Upload a QR image to the public app-assets bucket and persist its public URL
 * as the UPI QR. Returns the new URL so the panel can update its preview/field.
 */
export async function uploadQrImage(formData: FormData) {
  const profile = await requireRole(["admin"]);
  if (!profile) return { ...UNAUTHORIZED, url: null };

  const value = formData.get("file");
  if (!value || typeof value === "string") {
    return { ok: false as const, error: "Please choose an image to upload.", url: null };
  }
  const file = value;
  if (file.size === 0) return { ok: false as const, error: "The selected file is empty.", url: null };
  if (file.size > MAX_PROOF_BYTES) {
    return { ok: false as const, error: "Image is too large (max 10 MB).", url: null };
  }
  if (!isAcceptedProofFile(file)) {
    return { ok: false as const, error: "Only JPG, PNG, WebP or HEIC images are allowed.", url: null };
  }

  // HEIC QR images are transcoded to JPEG so they render for customers.
  const prepared = await prepareImageForStorage(file);
  if (!prepared.ok) return { ok: false as const, error: prepared.error, url: null };

  const admin = createAdminClient();
  const path = `upi-qr/qr.${prepared.image.ext}`;
  const { error: upErr } = await admin.storage.from(QR_BUCKET).upload(path, prepared.image.buffer, {
    contentType: prepared.image.contentType,
    upsert: true,
  });
  if (upErr) return { ok: false as const, error: describeStorageError(upErr.message), url: null };

  // Drop a superseded QR object (e.g. qr.png replaced by a HEIC -> qr.jpg).
  await pruneSiblings(admin, QR_BUCKET, "upi-qr", `qr.${prepared.image.ext}`);

  const { data: pub } = admin.storage.from(QR_BUCKET).getPublicUrl(path);
  // Cache-bust so the new image shows immediately at the reused path.
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: saveErr } = await admin
    .from("app_settings")
    .update({ upi_qr_url: url, updated_at: new Date().toISOString() })
    .eq("id", "default");
  if (saveErr) return { ok: false as const, error: saveErr.message, url: null };

  return { ok: true as const, url };
}

const STAFF_PHOTO_DIR = "staff-photos";

/**
 * Upload a stylist's profile photo to the public app-assets bucket and persist
 * its URL on the staff row. Authorized for admin (any) and manager (own branch
 * via staffInScope). Reuses the same image pipeline as the QR upload. Returns the
 * new URL so the employee page can update its preview immediately.
 */
export async function uploadStaffPhoto(formData: FormData) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return { ...UNAUTHORIZED, url: null };

  const staffId = formData.get("staffId");
  if (typeof staffId !== "string" || !z.string().uuid().safeParse(staffId).success) {
    return { ok: false as const, error: "Invalid artist.", url: null };
  }

  const value = formData.get("file");
  if (!value || typeof value === "string") {
    return { ok: false as const, error: "Please choose an image to upload.", url: null };
  }
  const file = value;
  if (file.size === 0) return { ok: false as const, error: "The selected file is empty.", url: null };
  if (file.size > MAX_PROOF_BYTES) {
    return { ok: false as const, error: "Image is too large (max 10 MB).", url: null };
  }
  if (!isAcceptedProofFile(file)) {
    return { ok: false as const, error: "Only JPG, PNG, WebP or HEIC images are allowed.", url: null };
  }

  const admin = createAdminClient();
  if (!(await staffInScope(admin, profile, staffId))) return { ...UNAUTHORIZED, url: null };

  // HEIC photos are transcoded to JPEG so they render everywhere.
  const prepared = await prepareImageForStorage(file);
  if (!prepared.ok) return { ok: false as const, error: prepared.error, url: null };

  const dir = `${STAFF_PHOTO_DIR}/${staffId}`;
  const path = `${dir}/photo.${prepared.image.ext}`;
  const { error: upErr } = await admin.storage.from(QR_BUCKET).upload(path, prepared.image.buffer, {
    contentType: prepared.image.contentType,
    upsert: true,
  });
  if (upErr) return { ok: false as const, error: describeStorageError(upErr.message), url: null };

  // Drop a superseded photo (e.g. photo.png replaced by a HEIC -> photo.jpg).
  await pruneSiblings(admin, QR_BUCKET, dir, `photo.${prepared.image.ext}`);

  const { data: pub } = admin.storage.from(QR_BUCKET).getPublicUrl(path);
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: saveErr } = await admin.from("staff").update({ photo_url: url }).eq("id", staffId);
  if (saveErr) return { ok: false as const, error: saveErr.message, url: null };

  return { ok: true as const, url };
}

// ─────────────────────────────── Overview ───────────────────────────────────

/** Per-artist completed-work rollup (mirrors staff-metrics earnedAmount). */
export type StaffEarning = {
  staffName: string;
  completed: number; // completed && verified bookings
  serviceRevenue: number; // Σ price
  extrasRevenue: number; // Σ extras
  earnings: number; // service + extras
};

/** Where total revenue comes from. `upi + cash + unrecorded === serviceCharges + extras`. */
export type RevenueBreakdown = {
  bookingFees: number; // verified bookings × ₹50 amount
  serviceCharges: number; // completed+verified × price
  extras: number; // completed+verified × extras
  memberships: number; // verified membership payments (0 for a branch view)
  upi: number; // in-store balance settled by UPI
  cash: number; // in-store balance settled by cash
  unrecorded: number; // completed but payment_mode not yet set
};

type VerifiedAppt = {
  id: string;
  branch: string;
  amount: number;
  price: number;
  staff_name: string;
  completed: boolean;
  payment_mode: string | null;
};

/**
 * Pure revenue/earnings aggregation shared by the admin (all branches) and
 * manager (one branch) overviews. Booking fees count for every verified
 * booking; service charges + extras count only once the booking is completed
 * (money actually collected in-store). `membershipRevenue` is salon-wide and
 * supplied by the caller (0 for a branch view).
 */
function aggregateRevenue(
  verified: VerifiedAppt[],
  extrasByAppt: Map<string, number>,
  membershipRevenue: number,
): { breakdown: RevenueBreakdown; staffStats: StaffEarning[]; totalRevenue: number } {
  const bookingFees = verified.reduce((s, a) => s + (a.amount ?? 0), 0);

  let serviceCharges = 0;
  let extras = 0;
  let upi = 0;
  let cash = 0;
  let unrecorded = 0;
  const byStaff = new Map<string, StaffEarning>();

  for (const a of verified) {
    if (!a.completed) continue; // service + extras realised only when done
    const ex = extrasByAppt.get(a.id) ?? 0;
    const earned = (a.price ?? 0) + ex;
    serviceCharges += a.price ?? 0;
    extras += ex;
    if (a.payment_mode === "upi") upi += earned;
    else if (a.payment_mode === "cash") cash += earned;
    else unrecorded += earned;

    const key = a.staff_name?.trim() || "Unassigned";
    const cur =
      byStaff.get(key) ??
      { staffName: key, completed: 0, serviceRevenue: 0, extrasRevenue: 0, earnings: 0 };
    cur.completed += 1;
    cur.serviceRevenue += a.price ?? 0;
    cur.extrasRevenue += ex;
    cur.earnings += earned;
    byStaff.set(key, cur);
  }

  const breakdown: RevenueBreakdown = {
    bookingFees,
    serviceCharges,
    extras,
    memberships: membershipRevenue,
    upi,
    cash,
    unrecorded,
  };
  const totalRevenue = bookingFees + serviceCharges + extras + membershipRevenue;
  const staffStats = [...byStaff.values()].sort((a, b) => b.earnings - a.earnings);
  return { breakdown, staffStats, totalRevenue };
}

export type Overview = {
  totalRevenue: number;
  feeRevenue: number;
  membershipRevenue: number;
  pendingVerification: number;
  bookingsToday: number;
  bookingsWeek: number;
  bookingsMonth: number;
  activeMembers: number;
  completedSessions: number;
  pendingSessions: number;
  revenueByDay: { date: string; fees: number; memberships: number }[];
  bookingsByBranch: { branch: string; count: number }[];
  breakdown: RevenueBreakdown;
  staffStats: StaffEarning[];
};

/** Manager dashboard: branch-scoped revenue + per-artist rollup (no memberships,
 *  which are salon-wide, and none of the admin-only counts). */
export type ManagerOverview = {
  branch: string;
  totalRevenue: number;
  breakdown: RevenueBreakdown;
  staffStats: StaffEarning[];
};

export async function getManagerOverview() {
  const profile = await requireRole(["manager"]);
  if (!profile) return { ...UNAUTHORIZED, overview: null };
  if (!profile.branch) return { ok: false as const, error: "No branch assigned", overview: null };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("appointments")
    .select("id, branch, amount, price, staff_name, completed, payment_mode")
    .eq("payment_status", "verified")
    .eq("branch", profile.branch);
  if (error) return { ok: false as const, error: error.message, overview: null };
  const verified = (data as VerifiedAppt[] | null) ?? [];
  const completedIds = verified.filter((a) => a.completed).map((a) => a.id);
  const extrasByAppt = await extrasTotalsFor(admin, completedIds);
  const { breakdown, staffStats, totalRevenue } = aggregateRevenue(verified, extrasByAppt, 0);
  const overview: ManagerOverview = { branch: profile.branch, totalRevenue, breakdown, staffStats };
  return { ok: true as const, overview };
}

export async function getAdminOverview() {
  const profile = await requireRole(["admin"]);
  if (!profile) return { ...UNAUTHORIZED, overview: null };
  const admin = createAdminClient();

  const [memberPayRes, apptRes, memRes, pendingApptRes, pendingMemRes, completedRes, pendingSessRes] =
    await Promise.all([
      // membership revenue: verified membership payments only
      admin
        .from("payments")
        .select("amount, created_at")
        .eq("purpose", "membership")
        .eq("status", "verified"),
      // confirmed bookings: verified only (fees from all; service+extras from completed)
      admin
        .from("appointments")
        .select(
          "id, appointment_date, branch, amount, price, staff_name, completed, payment_mode, verified_at",
        )
        .eq("payment_status", "verified"),
      admin.from("memberships").select("id").eq("active", true),
      admin.from("appointments").select("id", { count: "exact", head: true }).eq("payment_status", "payment_uploaded"),
      admin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("purpose", "membership")
        .eq("status", "payment_uploaded"),
      // sessions: completed vs confirmed-but-not-yet-completed
      admin.from("appointments").select("id", { count: "exact", head: true }).eq("completed", true),
      admin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("payment_status", "verified")
        .eq("completed", false),
    ]);

  const memberPays = (memberPayRes.data as { amount: number; created_at: string }[] | null) ?? [];
  const appts =
    (apptRes.data as
      | (VerifiedAppt & { appointment_date: string; verified_at: string | null })[]
      | null) ?? [];
  const members = (memRes.data as { id: string }[] | null) ?? [];
  const pendingVerification = (pendingApptRes.count ?? 0) + (pendingMemRes.count ?? 0);
  const completedSessions = completedRes.count ?? 0;
  const pendingSessions = pendingSessRes.count ?? 0;

  const feeRevenue = appts.reduce((s, a) => s + (a.amount ?? 0), 0);
  const membershipRevenue = memberPays.reduce((s, p) => s + p.amount, 0);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthStr = todayStr.slice(0, 7);

  const bookingsToday = appts.filter((a) => a.appointment_date === todayStr).length;
  const bookingsWeek = appts.filter((a) => a.appointment_date >= weekAgo.toISOString().slice(0, 10)).length;
  const bookingsMonth = appts.filter((a) => a.appointment_date.slice(0, 7) === monthStr).length;

  // revenue by day for the last 14 days
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const revenueByDay = days.map((date) => ({
    date: date.slice(5),
    fees: appts
      .filter((a) => (a.verified_at ?? "").slice(0, 10) === date)
      .reduce((s, a) => s + (a.amount ?? 0), 0),
    memberships: memberPays
      .filter((p) => p.created_at.slice(0, 10) === date)
      .reduce((s, p) => s + p.amount, 0),
  }));

  const branchCounts = new Map<string, number>();
  for (const a of appts) branchCounts.set(a.branch, (branchCounts.get(a.branch) ?? 0) + 1);
  const bookingsByBranch = [...branchCounts.entries()].map(([branch, count]) => ({ branch, count }));

  // Full revenue (fees + service + extras + memberships) and per-artist rollup.
  const completedIds = appts.filter((a) => a.completed).map((a) => a.id);
  const extrasByAppt = await extrasTotalsFor(admin, completedIds);
  const { breakdown, staffStats, totalRevenue } = aggregateRevenue(
    appts,
    extrasByAppt,
    membershipRevenue,
  );

  const overview: Overview = {
    totalRevenue,
    feeRevenue,
    membershipRevenue,
    pendingVerification,
    bookingsToday,
    bookingsWeek,
    bookingsMonth,
    activeMembers: members.length,
    completedSessions,
    pendingSessions,
    revenueByDay,
    bookingsByBranch,
    breakdown,
    staffStats,
  };
  return { ok: true as const, overview };
}

// ─────────────────────────────── Members ────────────────────────────────────
export type MemberRow = {
  id: string;
  client_name: string;
  phone: string;
  start_date: string;
  activation_date: string | null;
  expires_at: string;
  active: boolean;
  amount_paid: number;
  status: "pending" | "active" | "expired";
};

export async function listMembers() {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return { ...UNAUTHORIZED, members: [] as MemberRow[] };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("memberships")
    .select("id, client_name, phone, start_date, activation_date, expires_at, active, amount_paid")
    .order("created_at", { ascending: false });
  if (error) return { ok: false as const, error: error.message, members: [] as MemberRow[] };
  const today = new Date().toISOString().slice(0, 10);
  const rows = (data as Omit<MemberRow, "status">[] | null) ?? [];
  const members: MemberRow[] = rows.map((m) => {
    let status: MemberRow["status"] = "active";
    if (!m.active || m.expires_at < today) status = "expired";
    else if (m.activation_date && m.activation_date > today) status = "pending";
    return { ...m, status };
  });
  return { ok: true as const, members };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const memberInput = z.object({
  id: z.string().uuid(),
  client_name: z.string().trim().min(1, "Name is required").max(100),
  phone: z.string().trim().min(1, "Phone is required").max(40),
  start_date: z.string().regex(DATE_RE, "Invalid purchase date"),
  activation_date: z.string().regex(DATE_RE, "Invalid activation date").nullable(),
  expires_at: z.string().regex(DATE_RE, "Invalid expiry date"),
  active: z.boolean(),
  amount_paid: z.coerce.number().int().min(0),
});

export async function updateMember(input: z.infer<typeof memberInput>) {
  const profile = await requireRole(["admin"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = memberInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const admin = createAdminClient();
  const { id, ...fields } = parsed.data;
  const { error } = await admin.from("memberships").update(fields).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function deleteMember(input: { id: string }) {
  const profile = await requireRole(["admin"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid id" };
  const admin = createAdminClient();
  const { error } = await admin.from("memberships").delete().eq("id", parsed.data.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

// ─────────────────────────────── Services ───────────────────────────────────
export type ServiceRow = {
  id: string;
  name: string;
  price: number;
  is_nail_art: boolean;
  active: boolean;
  sort_order: number;
};

export async function listServices() {
  const profile = await requireRole(["admin"]);
  if (!profile) return { ...UNAUTHORIZED, services: [] as ServiceRow[] };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("services")
    .select("id, name, price, is_nail_art, active, sort_order")
    .order("sort_order");
  if (error) return { ok: false as const, error: error.message, services: [] as ServiceRow[] };
  return { ok: true as const, services: (data as ServiceRow[] | null) ?? [] };
}

const serviceInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  price: z.coerce.number().int().min(0),
  is_nail_art: z.boolean(),
  active: z.boolean(),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export async function saveService(input: z.infer<typeof serviceInput>) {
  const profile = await requireRole(["admin"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = serviceInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const admin = createAdminClient();
  const { id, ...fields } = parsed.data;
  const { error } = id
    ? await admin.from("services").update(fields).eq("id", id)
    : await admin.from("services").insert(fields);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function deleteService(input: { id: string }) {
  const profile = await requireRole(["admin"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid id" };
  const admin = createAdminClient();
  const { error } = await admin.from("services").delete().eq("id", parsed.data.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

// ─────────────────────────────── Time slots ─────────────────────────────────
export type SlotRow = { id: string; label: string; active: boolean; sort_order: number };

export async function listTimeSlots() {
  const profile = await requireRole(["admin"]);
  if (!profile) return { ...UNAUTHORIZED, slots: [] as SlotRow[] };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("time_slots")
    .select("id, label, active, sort_order")
    .order("sort_order");
  if (error) return { ok: false as const, error: error.message, slots: [] as SlotRow[] };
  return { ok: true as const, slots: (data as SlotRow[] | null) ?? [] };
}

const slotInput = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(50),
  active: z.boolean(),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export async function saveTimeSlot(input: z.infer<typeof slotInput>) {
  const profile = await requireRole(["admin"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = slotInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const admin = createAdminClient();
  const { id, ...fields } = parsed.data;
  const { error } = id
    ? await admin.from("time_slots").update(fields).eq("id", id)
    : await admin.from("time_slots").insert(fields);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function deleteTimeSlot(input: { id: string }) {
  const profile = await requireRole(["admin"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid id" };
  const admin = createAdminClient();

  // Stylist schedules reference slots by label (staff_schedules.time_slot), not id.
  // Deleting a slot that's still in use would silently empty those stylists' booking
  // dropdowns, so refuse and tell the admin to clear it from the schedules first.
  const { data: slot } = await admin
    .from("time_slots")
    .select("label")
    .eq("id", parsed.data.id)
    .single();
  if (slot?.label) {
    const { count } = await admin
      .from("staff_schedules")
      .select("id", { count: "exact", head: true })
      .eq("time_slot", slot.label);
    if ((count ?? 0) > 0)
      return {
        ok: false as const,
        error: `Can't delete "${slot.label}" — ${count} artist schedule${
          count === 1 ? "" : "s"
        } still use it. Remove it from those artists' weekly schedules first.`,
      };
  }

  const { error } = await admin.from("time_slots").delete().eq("id", parsed.data.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

// ─────────────────────────────── Branches ───────────────────────────────────
export type BranchRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  map_url: string | null;
  active: boolean;
};

export async function listBranchesManage() {
  const profile = await requireRole(["admin"]);
  if (!profile) return { ...UNAUTHORIZED, branches: [] as BranchRow[] };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("branches")
    .select("id, name, address, phone, map_url, active")
    .order("sort_order");
  if (error) return { ok: false as const, error: error.message, branches: [] as BranchRow[] };
  return { ok: true as const, branches: (data as BranchRow[] | null) ?? [] };
}

const branchInput = z.object({
  id: z.string().uuid(),
  address: z.string().max(300).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  map_url: z.string().max(500).nullable().optional(),
  active: z.boolean(),
});

export async function saveBranch(input: z.infer<typeof branchInput>) {
  const profile = await requireRole(["admin"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = branchInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid" };
  const admin = createAdminClient();
  const { id, ...fields } = parsed.data;
  const { error } = await admin.from("branches").update(fields).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

// ─────────────────────────────── Staff ──────────────────────────────────────
export type StaffRow = {
  id: string;
  name: string;
  branch: string;
  store_number: string | null;
  photo_url: string | null;
};

export async function listStaffManage() {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return { ...UNAUTHORIZED, staff: [] as StaffRow[] };
  const admin = createAdminClient();
  const branch = profile.role === "manager" && profile.branch ? profile.branch : null;

  // photo_url is additive; retry without it if the migration hasn't been applied.
  const run = (cols: string) => {
    let q = admin.from("staff").select(cols).order("branch").order("name");
    if (branch) q = q.eq("branch", branch);
    return q;
  };
  let { data, error } = await run("id, name, branch, store_number, photo_url");
  if (isMissingStaffPhotoColumn(error)) ({ data, error } = await run("id, name, branch, store_number"));
  if (error) return { ok: false as const, error: error.message, staff: [] as StaffRow[] };

  const staff: StaffRow[] = ((data as Record<string, unknown>[] | null) ?? []).map((s) => ({
    id: String(s.id),
    name: String(s.name),
    branch: String(s.branch),
    store_number: (s.store_number as string | null) ?? null,
    photo_url: (s.photo_url as string | null | undefined) ?? null,
  }));
  return { ok: true as const, staff };
}

const addStaffInput = z.object({
  name: z.string().trim().min(1).max(50),
  branch: z.enum(BRANCHES_TUPLE),
  store_number: z.string().trim().max(60).nullable().optional(),
});

export async function addStaff(input: z.infer<typeof addStaffInput>) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = addStaffInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid" };
  if (profile.role === "manager" && profile.branch !== parsed.data.branch) {
    return { ok: false as const, error: "Managers can only add staff to their own branch" };
  }
  const admin = createAdminClient();
  const { error } = await admin.from("staff").insert(parsed.data);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

const updateStaffInput = z.object({
  id: z.string().uuid(),
  store_number: z.string().trim().max(60).nullable().optional(),
});

/**
 * Edit an existing stylist's store number. Deliberately scoped to store_number
 * only: changing `name` would orphan staff logins/bookings that match on the
 * roster name (profiles.staff_name). Authorized via staffInScope (admin = any,
 * manager = own branch only).
 */
export async function updateStaff(input: z.infer<typeof updateStaffInput>) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = updateStaffInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid" };
  const admin = createAdminClient();
  if (!(await staffInScope(admin, profile, parsed.data.id))) return UNAUTHORIZED;
  const { error } = await admin
    .from("staff")
    .update({ store_number: parsed.data.store_number ?? null })
    .eq("id", parsed.data.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function removeStaff(input: { id: string }) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid id" };
  const admin = createAdminClient();
  const { error } = await admin.from("staff").delete().eq("id", parsed.data.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export type StaffLogin = { email: string; full_name: string | null; role: string };
export type StaffDetailData = {
  staff: {
    id: string;
    name: string;
    branch: string;
    store_number: string | null;
    photo_url: string | null;
    created_at: string;
  };
  bookings: BookingRow[];
  schedule: ScheduleEntry[];
  login: StaffLogin | null;
};

/**
 * Everything the admin/manager employee page needs for one stylist: their roster
 * row, their full booking history (for earnings/commission, computed client-side),
 * weekly schedule, and linked login if any. Authorized via staffInScope.
 */
export async function getStaffDetail(input: { staffId: string }) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return { ...UNAUTHORIZED, detail: null };
  const parsed = z.object({ staffId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid id", detail: null };
  const admin = createAdminClient();
  if (!(await staffInScope(admin, profile, parsed.data.staffId)))
    return { ...UNAUTHORIZED, detail: null };

  // photo_url is additive; retry without it if the migration hasn't been applied.
  const runStaff = (cols: string) =>
    admin.from("staff").select(cols).eq("id", parsed.data.staffId).maybeSingle();
  let { data: staffData, error: staffErr } = await runStaff(
    "id, name, branch, store_number, photo_url, created_at",
  );
  if (isMissingStaffPhotoColumn(staffErr))
    ({ data: staffData, error: staffErr } = await runStaff(
      "id, name, branch, store_number, created_at",
    ));
  if (staffErr) return { ok: false as const, error: staffErr.message, detail: null };
  const row = staffData as Record<string, unknown> | null;
  if (!row) return { ok: false as const, error: "Artist not found", detail: null };
  const staff: StaffDetailData["staff"] = {
    id: String(row.id),
    name: String(row.name),
    branch: String(row.branch),
    store_number: (row.store_number as string | null) ?? null,
    photo_url: (row.photo_url as string | null | undefined) ?? null,
    created_at: String(row.created_at),
  };

  // Exact (case-insensitive) name match within the branch — `ilike` with no
  // wildcards never pulls in another stylist whose name is a superstring.
  const { data: bData, error: bErr } = await admin
    .from("appointments")
    .select(BOOKING_COLUMNS)
    .ilike("staff_name", staff.name)
    .eq("branch", staff.branch as (typeof BRANCHES_TUPLE)[number])
    .neq("payment_status", "pending_payment")
    .order("appointment_date", { ascending: false })
    .order("time_slot", { ascending: true });
  if (bErr) return { ok: false as const, error: bErr.message, detail: null };
  let bookings = ((bData as Omit<BookingRow, "extras_total">[] | null) ?? []).map((b) => ({
    ...b,
    extras_total: 0,
  })) as BookingRow[];
  if (bookings.length) {
    const totals = await extrasTotalsFor(admin, bookings.map((b) => b.id));
    bookings = bookings.map((b) => ({ ...b, extras_total: totals.get(b.id) ?? 0 }));
  }

  const { data: schedData } = await admin
    .from("staff_schedules")
    .select("day_of_week, time_slot")
    .eq("staff_id", staff.id);
  const schedule = (schedData as ScheduleEntry[] | null) ?? [];

  // Linked login (if any), matched on the roster name + branch.
  const { data: profData } = await admin
    .from("profiles")
    .select("email, full_name, role")
    .ilike("staff_name", staff.name)
    .eq("branch", staff.branch as (typeof BRANCHES_TUPLE)[number])
    .limit(1);
  const prof = ((profData as { email: string | null; full_name: string | null; role: string }[] | null) ?? [])[0];
  const login: StaffLogin | null = prof
    ? { email: prof.email ?? "", full_name: prof.full_name, role: prof.role }
    : null;

  return { ok: true as const, detail: { staff, bookings, schedule, login } as StaffDetailData };
}

// ─────────────────────────── Staff schedules (weekly) ───────────────────────
export type ScheduleEntry = { day_of_week: number; time_slot: string };

const setScheduleInput = z.object({
  staff_id: z.string().uuid(),
  entries: z
    .array(
      z.object({
        day_of_week: z.number().int().min(0).max(6),
        time_slot: z.string().trim().min(1).max(50),
      }),
    )
    .max(100),
});

/** admin → any stylist; manager → only stylists in their own branch. */
async function staffInScope(admin: Admin, profile: AuthProfile, staffId: string): Promise<boolean> {
  if (profile.role === "admin") return true;
  const { data } = await admin.from("staff").select("branch").eq("id", staffId).maybeSingle();
  const row = data as { branch: string } | null;
  return !!row && profile.role === "manager" && row.branch === profile.branch;
}

/** Active time-slot labels for the schedule editor (admin + manager). */
export async function getSchedulableSlots() {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return { ...UNAUTHORIZED, slots: [] as string[] };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("time_slots")
    .select("label")
    .eq("active", true)
    .order("sort_order");
  if (error) return { ok: false as const, error: error.message, slots: [] as string[] };
  return { ok: true as const, slots: ((data as { label: string }[] | null) ?? []).map((r) => r.label) };
}

export async function getStaffSchedule(input: { staffId: string }) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return { ...UNAUTHORIZED, entries: [] as ScheduleEntry[] };
  const parsed = z.object({ staffId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid id", entries: [] as ScheduleEntry[] };
  const admin = createAdminClient();
  if (!(await staffInScope(admin, profile, parsed.data.staffId)))
    return { ...UNAUTHORIZED, entries: [] as ScheduleEntry[] };
  const { data, error } = await admin
    .from("staff_schedules")
    .select("day_of_week, time_slot")
    .eq("staff_id", parsed.data.staffId);
  if (error) return { ok: false as const, error: error.message, entries: [] as ScheduleEntry[] };
  return { ok: true as const, entries: (data as ScheduleEntry[] | null) ?? [] };
}

/** Replace a stylist's entire weekly schedule (delete-all then insert). */
export async function setStaffSchedule(input: z.infer<typeof setScheduleInput>) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = setScheduleInput.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const admin = createAdminClient();
  if (!(await staffInScope(admin, profile, parsed.data.staff_id))) return UNAUTHORIZED;

  const seen = new Set<string>();
  const rows = parsed.data.entries
    .filter((e) => {
      const k = `${e.day_of_week}|${e.time_slot}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((e) => ({ staff_id: parsed.data.staff_id, day_of_week: e.day_of_week, time_slot: e.time_slot }));

  const { error: delErr } = await admin
    .from("staff_schedules")
    .delete()
    .eq("staff_id", parsed.data.staff_id);
  if (delErr) return { ok: false as const, error: delErr.message };
  if (rows.length) {
    const { error: insErr } = await admin.from("staff_schedules").insert(rows);
    if (insErr) return { ok: false as const, error: insErr.message };
  }
  return { ok: true as const };
}

// ─────────────────────────────── Team (auth users) ──────────────────────────
export type TeamRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  branch: string | null;
  staff_name: string | null;
};

export async function listTeam() {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return { ...UNAUTHORIZED, team: [] as TeamRow[] };
  const admin = createAdminClient();
  let q = admin
    .from("profiles")
    .select("id, email, full_name, role, branch, staff_name")
    .order("role");
  if (profile.role === "manager" && profile.branch) q = q.eq("branch", profile.branch);
  const { data, error } = await q;
  if (error) return { ok: false as const, error: error.message, team: [] as TeamRow[] };
  return { ok: true as const, team: (data as TeamRow[] | null) ?? [] };
}

const createTeamInput = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
  full_name: z.string().trim().min(1).max(80),
  role: z.enum(["manager", "staff"]),
  branch: z.enum(BRANCHES_TUPLE),
  staff_name: z.string().trim().min(1).max(50),
});

export async function createTeamMember(input: z.infer<typeof createTeamInput>) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = createTeamInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const c = parsed.data;
  if (profile.role === "manager") {
    if (c.role !== "staff") return { ok: false as const, error: "Managers can only create staff logins" };
    if (c.branch !== profile.branch) return { ok: false as const, error: "Out of your branch scope" };
  }
  const admin = createAdminClient();

  // Staff dashboards match bookings by exact roster name (see listBookings).
  // Force a staff login's staff_name to an existing stylist in that branch and
  // store the canonical spelling, so the dashboard can never come up empty from
  // a typo or full-name mismatch. Managers aren't name-matched, so skip them.
  let staffName = c.staff_name;
  if (c.role === "staff") {
    const { data: rosterRow } = await admin
      .from("staff")
      .select("name")
      .eq("branch", c.branch)
      .ilike("name", c.staff_name)
      .maybeSingle();
    const canonical = (rosterRow as { name: string } | null)?.name;
    if (!canonical) {
      return {
        ok: false as const,
        error: "Pick an artist from the branch roster (add them under Manage → Artists first).",
      };
    }
    staffName = canonical;
  }

  const { error } = await admin.auth.admin.createUser({
    email: c.email,
    password: c.password,
    email_confirm: true,
    user_metadata: {
      role: c.role,
      full_name: c.full_name,
      staff_name: staffName,
      branch: c.branch,
    },
  });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

const resetInput = z.object({ id: z.string().uuid(), password: z.string().min(8).max(72) });

export async function resetTeamPassword(input: z.infer<typeof resetInput>) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = resetInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid" };
  const admin = createAdminClient();
  // managers may only reset within their branch and never admins
  const { data } = await admin.from("profiles").select("role, branch").eq("id", parsed.data.id).maybeSingle();
  const target = data as { role: UserRole; branch: string | null } | null;
  if (!target) return { ok: false as const, error: "User not found" };
  if (target.role === "admin") return { ok: false as const, error: "Cannot reset an admin here" };
  if (profile.role === "manager" && target.branch !== profile.branch) return UNAUTHORIZED;
  const { error } = await admin.auth.admin.updateUserById(parsed.data.id, {
    password: parsed.data.password,
  });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function deleteTeamMember(input: { id: string }) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid id" };
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("role, branch").eq("id", parsed.data.id).maybeSingle();
  const target = data as { role: UserRole; branch: string | null } | null;
  if (!target) return { ok: false as const, error: "User not found" };
  if (target.role === "admin") return { ok: false as const, error: "Cannot delete an admin" };
  if (profile.role === "manager" && target.branch !== profile.branch) return UNAUTHORIZED;
  if (parsed.data.id === profile.id) return { ok: false as const, error: "You cannot delete yourself" };
  const { error } = await admin.auth.admin.deleteUser(parsed.data.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
