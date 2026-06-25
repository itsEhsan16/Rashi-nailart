"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, type AuthProfile, type UserRole } from "@/lib/auth";
import { BRANCHES_TUPLE } from "@/lib/validations/booking";
import { prepareImageForStorage, signedProofUrl } from "@/lib/payment-proofs";
import { MAX_PROOF_BYTES, isAcceptedProofFile } from "@/lib/salon-data";
import { fulfillMembershipPayment, type MembershipPayment } from "@/lib/payments-core";
import { notifyCustomer } from "@/lib/notify";

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
};

const BOOKING_COLUMNS =
  "id, client_name, phone, branch, appointment_date, time_slot, service, price, amount, staff_name, special_requests, payment_status, upi_screenshot_url, uploaded_at, verified_at, rejection_reason, is_member, discount_applied, completed, created_at";

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

  const { data, error } = await q;
  if (error) return { ok: false as const, error: error.message, bookings: [] as BookingRow[] };
  let bookings = (data as BookingRow[] | null) ?? [];
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
  upi_id: z.string().trim().max(120),
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
  if (upErr) return { ok: false as const, error: upErr.message, url: null };

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

// ─────────────────────────────── Overview ───────────────────────────────────
export type Overview = {
  totalRevenue: number;
  feeRevenue: number;
  membershipRevenue: number;
  pendingVerification: number;
  bookingsToday: number;
  bookingsWeek: number;
  bookingsMonth: number;
  activeMembers: number;
  revenueByDay: { date: string; fees: number; memberships: number }[];
  bookingsByBranch: { branch: string; count: number }[];
};

export async function getAdminOverview() {
  const profile = await requireRole(["admin"]);
  if (!profile) return { ...UNAUTHORIZED, overview: null };
  const admin = createAdminClient();

  const [memberPayRes, apptRes, memRes, pendingApptRes, pendingMemRes] = await Promise.all([
    // membership revenue: verified membership payments only
    admin
      .from("payments")
      .select("amount, created_at")
      .eq("purpose", "membership")
      .eq("status", "verified"),
    // confirmed bookings: verified only (fee revenue derives from these)
    admin
      .from("appointments")
      .select("appointment_date, branch, amount, verified_at")
      .eq("payment_status", "verified"),
    admin.from("memberships").select("id").eq("active", true),
    admin.from("appointments").select("id", { count: "exact", head: true }).eq("payment_status", "payment_uploaded"),
    admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("purpose", "membership")
      .eq("status", "payment_uploaded"),
  ]);

  const memberPays = (memberPayRes.data as { amount: number; created_at: string }[] | null) ?? [];
  const appts =
    (apptRes.data as
      | { appointment_date: string; branch: string; amount: number; verified_at: string | null }[]
      | null) ?? [];
  const members = (memRes.data as { id: string }[] | null) ?? [];
  const pendingVerification = (pendingApptRes.count ?? 0) + (pendingMemRes.count ?? 0);

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

  const overview: Overview = {
    totalRevenue: feeRevenue + membershipRevenue,
    feeRevenue,
    membershipRevenue,
    pendingVerification,
    bookingsToday,
    bookingsWeek,
    bookingsMonth,
    activeMembers: members.length,
    revenueByDay,
    bookingsByBranch,
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
export type StaffRow = { id: string; name: string; branch: string };

export async function listStaffManage() {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return { ...UNAUTHORIZED, staff: [] as StaffRow[] };
  const admin = createAdminClient();
  let q = admin.from("staff").select("id, name, branch").order("branch").order("name");
  if (profile.role === "manager" && profile.branch) q = q.eq("branch", profile.branch);
  const { data, error } = await q;
  if (error) return { ok: false as const, error: error.message, staff: [] as StaffRow[] };
  return { ok: true as const, staff: (data as StaffRow[] | null) ?? [] };
}

const addStaffInput = z.object({
  name: z.string().trim().min(1).max(50),
  branch: z.enum(BRANCHES_TUPLE),
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
        error: "Pick a stylist from the branch roster (add them under Manage → Stylists first).",
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
