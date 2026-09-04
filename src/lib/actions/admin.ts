"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, type AuthProfile, type UserRole } from "@/lib/auth";
import { BRANCHES_TUPLE } from "@/lib/validations/booking";
import {
  describeStorageError,
  prepareImageForStorage,
  pruneSiblings,
} from "@/lib/image-upload";
import {
  MAX_PROOF_BYTES,
  isAcceptedProofFile,
  PAYMENT_MODE_VALUES,
  SLOT_HOLDING_STATUSES,
  SERVICES,
  type PaymentMode,
} from "@/lib/salon-data";
import { monthBounds, daysInMonth, sortSlotsByStart } from "@/lib/utils";
import { sweepStalePendingHolds } from "@/lib/actions/booking";
import { UPI_VPA_RE } from "@/lib/upi";
import { BUSINESS } from "@/lib/business";
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
  /** Readable breakdown of those line items ("Nail Art ×10 @120; Hair spa @500") for
   *  the CSV export. Empty when there are no extras, or on paths that skip detail. */
  extras_detail: string;
  /** Artist the customer originally booked, if a manager reassigned them. null = never reassigned. */
  original_staff_name: string | null;
  /** Staff view only: true when this booking was reassigned AWAY from the viewer to
   *  another artist (so their dashboard shows it read-only, not counted in earnings). */
  reassigned_away: boolean;
};

const BOOKING_COLUMNS =
  "id, client_name, phone, branch, appointment_date, time_slot, service, price, amount, staff_name, special_requests, payment_status, uploaded_at, verified_at, rejection_reason, is_member, discount_applied, completed, created_at, payment_mode, original_staff_name";

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
    // Own current bookings PLUS ones reassigned away to another artist (so the
    // originally-booked stylist still sees where their customer went).
    const name = profile.staffName ?? "__none__";
    q = q.or(`staff_name.ilike.${name},original_staff_name.ilike.${name}`);
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
  let bookings = (
    (data as Omit<BookingRow, "extras_total" | "extras_detail" | "reassigned_away">[] | null) ?? []
  ).map((b) => ({ ...b, extras_total: 0, extras_detail: "", reassigned_away: false })) as BookingRow[];

  // Attach each booking's extras total + breakdown in one batched query (avoids N+1).
  if (bookings.length) {
    const summary = await extrasSummaryFor(admin, bookings.map((b) => b.id));
    bookings = bookings.map((b) => ({
      ...b,
      extras_total: summary.get(b.id)?.total ?? 0,
      extras_detail: summary.get(b.id)?.detail ?? "",
    }));
  }

  // Staff view: redact client phone, and flag bookings reassigned away from them
  // (staff_name is now someone else, so it was reassigned to another artist).
  if (profile.role === "staff") {
    const me = (profile.staffName ?? "").toLowerCase();
    bookings = bookings.map((b) => ({
      ...b,
      phone: "",
      reassigned_away: b.staff_name.toLowerCase() !== me,
    }));
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

type ExtraLine = {
  appointment_id: string;
  label: string;
  amount: number;
  quantity: number;
  unit_amount: number;
};

/** One extra, human-readable: "Nail Art ×10 @120" (count omitted when it's 1). */
function formatExtraLine(e: ExtraLine): string {
  return e.quantity > 1 ? `${e.label} ×${e.quantity} @${e.unit_amount}` : `${e.label} @${e.unit_amount}`;
}

/**
 * Both the total AND a readable per-line breakdown per appointment, in one batched
 * query. The breakdown is what makes the per-nail detail exportable — a bare total
 * loses the rate and the count. Used by listBookings (which feeds the CSV export);
 * revenue paths that only need money use `extrasTotalsFor`.
 */
async function extrasSummaryFor(
  admin: Admin,
  apptIds: string[],
): Promise<Map<string, { total: number; detail: string }>> {
  const out = new Map<string, { total: number; detail: string }>();
  if (!apptIds.length) return out;
  const { data } = await admin
    .from("appointment_extras")
    .select("appointment_id, label, amount, quantity, unit_amount")
    .in("appointment_id", apptIds)
    .order("created_at");
  const lines = new Map<string, string[]>();
  for (const e of (data as ExtraLine[] | null) ?? []) {
    const cur = out.get(e.appointment_id) ?? { total: 0, detail: "" };
    cur.total += e.amount ?? 0;
    out.set(e.appointment_id, cur);
    lines.set(e.appointment_id, [...(lines.get(e.appointment_id) ?? []), formatExtraLine(e)]);
  }
  for (const [id, parts] of lines) out.get(id)!.detail = parts.join("; ");
  return out;
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

/** Cancel a confirmed booking, freeing its slot (payment_status → "cancelled",
 *  which is not a slot-holding status). Admin and manager may cancel at any time. */
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

// ─────────────────── Reassign a booking to another artist ────────────────────
export type ReassignCandidate = {
  staffId: string;
  name: string;
  /** Has a staff_schedules row for this weekday + slot. */
  scheduled: boolean;
  /** Already holds this branch/date/slot — the unique index makes the move impossible. */
  busy: boolean;
};

/**
 * Every artist in the booking's branch who could take over this slot, excluding
 * the currently-assigned one. Deliberately NOT filtered by roster: the manager is
 * standing in the studio and knows who is actually free, so an artist without a
 * shift for this slot is offered with `scheduled: false` rather than hidden. Only
 * `busy` is a hard stop, and that's enforced by uq_appointment_slot regardless.
 */
export async function listReassignCandidates(input: { id: string }) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return { ...UNAUTHORIZED, candidates: [] as ReassignCandidate[] };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, error: "Invalid id", candidates: [] as ReassignCandidate[] };
  const admin = createAdminClient();
  if (!(await scopedAppointmentMatch(admin, profile, parsed.data.id)))
    return { ...UNAUTHORIZED, candidates: [] as ReassignCandidate[] };

  const { data: b } = await admin
    .from("appointments")
    .select("branch, appointment_date, time_slot, staff_name")
    .eq("id", parsed.data.id)
    .maybeSingle();
  const bk = b as
    | { branch: string; appointment_date: string; time_slot: string; staff_name: string }
    | null;
  if (!bk)
    return { ok: false as const, error: "Booking not found", candidates: [] as ReassignCandidate[] };

  // Weekday of the booking date — same UTC-midnight expression as staffWorksSlot.
  const dow = new Date(`${bk.appointment_date}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat

  const { data: staffRows } = await admin
    .from("staff")
    .select("id, name")
    .eq("branch", bk.branch as (typeof BRANCHES_TUPLE)[number]);
  const roster = (staffRows as { id: string; name: string }[] | null) ?? [];
  if (!roster.length) return { ok: true as const, candidates: [] as ReassignCandidate[] };

  // Which of them are scheduled for this weekday + slot?
  const { data: sched } = await admin
    .from("staff_schedules")
    .select("staff_id")
    .eq("day_of_week", dow)
    .eq("time_slot", bk.time_slot)
    .in("staff_id", roster.map((s) => s.id));
  const scheduled = new Set(((sched as { staff_id: string }[] | null) ?? []).map((r) => r.staff_id));

  // Expired holds must not make an artist look busy — now that busy artists are
  // shown (and blocked) rather than silently dropped, a stale hold would be a
  // visibly wrong reason. Same sweep listBookings does before reading.
  await sweepStalePendingHolds();

  // Who already holds that exact slot (mirror of the uq_appointment_slot index)?
  const { data: occ } = await admin
    .from("appointments")
    .select("staff_name")
    .eq("branch", bk.branch as (typeof BRANCHES_TUPLE)[number])
    .eq("appointment_date", bk.appointment_date)
    .eq("time_slot", bk.time_slot)
    .in("payment_status", SLOT_HOLDING_STATUSES as unknown as string[]);
  const occupied = new Set(
    ((occ as { staff_name: string }[] | null) ?? []).map((r) => r.staff_name.toLowerCase()),
  );

  const current = bk.staff_name.toLowerCase();
  const candidates = roster
    .filter((s) => s.name.toLowerCase() !== current)
    .map((s) => ({
      staffId: s.id,
      name: s.name,
      scheduled: scheduled.has(s.id),
      busy: occupied.has(s.name.toLowerCase()),
    }))
    // Free-and-rostered first, then off-shift (pickable), then busy (blocked).
    .sort((a, b) => {
      const rank = (c: ReassignCandidate) => (c.busy ? 2 : c.scheduled ? 0 : 1);
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });

  return { ok: true as const, candidates };
}

const reassignInput = z.object({
  id: z.string().uuid(),
  staffName: z.string().trim().min(1).max(50),
});

/**
 * Move a booking to another artist by updating staff_name (the exact-name link the
 * artist dashboards match on, so it propagates to all panels). Canonicalizes to the
 * branch roster's spelling and catches the unique-slot collision (23505).
 */
export async function reassignBookingStaff(input: z.infer<typeof reassignInput>) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = reassignInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid" };
  const admin = createAdminClient();
  if (!(await scopedAppointmentMatch(admin, profile, parsed.data.id))) return UNAUTHORIZED;

  const { data: b } = await admin
    .from("appointments")
    .select("branch, staff_name, original_staff_name")
    .eq("id", parsed.data.id)
    .maybeSingle();
  const bk = b as
    | { branch: string; staff_name: string; original_staff_name: string | null }
    | null;
  if (!bk) return { ok: false as const, error: "Booking not found" };

  // Canonicalize to the exact roster spelling in that branch so the staff-name
  // match stays exact (mirrors createTeamMember).
  const { data: rosterRow } = await admin
    .from("staff")
    .select("name")
    .eq("branch", bk.branch as (typeof BRANCHES_TUPLE)[number])
    .ilike("name", parsed.data.staffName)
    .maybeSingle();
  const canonical = (rosterRow as { name: string } | null)?.name;
  if (!canonical) return { ok: false as const, error: "Pick an artist from this branch's roster." };
  if (canonical.toLowerCase() === bk.staff_name.toLowerCase()) {
    return { ok: false as const, error: "That artist is already assigned to this booking." };
  }

  // Preserve who the customer FIRST booked. Reassigning back to the original clears
  // the marker (no longer a reassignment).
  const trueOriginal = bk.original_staff_name ?? bk.staff_name;
  const original_staff_name =
    canonical.toLowerCase() === trueOriginal.toLowerCase() ? null : trueOriginal;

  const { error } = await admin
    .from("appointments")
    .update({ staff_name: canonical, original_staff_name })
    .eq("id", parsed.data.id);
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return {
        ok: false as const,
        error: "That artist already has a booking in this slot. Pick another artist.",
      };
    }
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const };
}

// ─────────────────── Change a booking's base service ────────────────────────
export type ServiceOptionRow = { name: string; price: number };

/**
 * Active services (name + price) for the in-studio "change service" picker.
 * Available to any staff/manager/admin acting on their own bookings (unlike the
 * admin-only `listServices`). Falls back to the bundled constants pre-migration.
 */
export async function listActiveServices() {
  const profile = await requireRole(["admin", "manager", "staff"]);
  if (!profile) return { ...UNAUTHORIZED, services: [] as ServiceOptionRow[] };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("services")
    .select("name, price")
    .eq("active", true)
    .order("sort_order");
  if (error) return { ok: false as const, error: error.message, services: [] as ServiceOptionRow[] };
  const rows = (data as ServiceOptionRow[] | null) ?? [];
  const services = rows.length ? rows : SERVICES.map((s) => ({ name: s.name, price: s.price }));
  return { ok: true as const, services };
}

/** Authoritative price for an active service by name (fallback to constants). null if unknown. */
async function resolveActiveServicePrice(admin: Admin, name: string): Promise<number | null> {
  const { data } = await admin
    .from("services")
    .select("price")
    .eq("name", name)
    .eq("active", true)
    .maybeSingle();
  const row = data as { price: number } | null;
  if (row) return row.price;
  const c = SERVICES.find((s) => s.name === name);
  return c ? c.price : null;
}

const changeServiceInput = z.object({
  id: z.string().uuid(),
  service: z.string().trim().min(1).max(100),
});

/**
 * Swap a booking's base service — e.g. the customer arrives and decides to do a
 * different service than they booked. Re-prices from the services table (fallback
 * to constants), updating both `service` and `price` so earnings/revenue reflect
 * what was actually done. Only on confirmed, not-yet-completed bookings.
 * Authorized for the assigned stylist, the branch manager and admin.
 */
export async function changeBookingService(input: z.infer<typeof changeServiceInput>) {
  const profile = await requireRole(["admin", "manager", "staff"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = changeServiceInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid" };
  const admin = createAdminClient();
  if (!(await scopedAppointmentMatch(admin, profile, parsed.data.id))) return UNAUTHORIZED;

  const { data: b } = await admin
    .from("appointments")
    .select("payment_status, completed")
    .eq("id", parsed.data.id)
    .maybeSingle();
  const bk = b as { payment_status: string; completed: boolean } | null;
  if (!bk) return { ok: false as const, error: "Booking not found" };
  if (bk.payment_status !== "verified") {
    return { ok: false as const, error: "Only a confirmed booking's service can be changed." };
  }
  if (bk.completed) {
    return { ok: false as const, error: "A completed booking's service can't be changed." };
  }

  const price = await resolveActiveServicePrice(admin, parsed.data.service);
  if (price == null) return { ok: false as const, error: "That service isn't available." };

  const { error } = await admin
    .from("appointments")
    .update({ service: parsed.data.service, price })
    .eq("id", parsed.data.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

// ───────────────────── Appointment extras (in-studio add-ons) ────────────────
export type ExtraRow = {
  id: string;
  label: string;
  amount: number;
  quantity: number;
  unit_amount: number;
  unit_label: string | null;
  addon_id: string | null;
  created_at: string;
};

const EXTRA_COLUMNS = "id, label, amount, quantity, unit_amount, unit_label, addon_id, created_at";

const addExtraInput = z.object({
  appointmentId: z.string().uuid(),
  label: z.string().trim().min(1, "Describe the extra").max(100),
  unitAmount: z.coerce.number().int("Whole rupees only").min(0).max(100000),
  quantity: z.coerce.number().int("Whole units only").min(1, "At least 1").max(500).default(1),
  addonId: z.string().uuid().optional(),
  unitLabel: z.string().trim().min(1).max(20).optional(),
});

/**
 * Staff/manager/admin add an extra line item to a booking they're scoped to.
 * Priced as rate × count (10 nails of nail art at ₹120 = ₹1,200); the stored
 * `amount` is the line TOTAL, computed HERE — a client-supplied total is never
 * trusted. When the line came from the catalog, the label and unit are resolved
 * from the add-on server-side, but the rate stays overridable so staff can
 * discount an individual booking.
 */
export async function addAppointmentExtra(input: z.infer<typeof addExtraInput>) {
  const profile = await requireRole(["admin", "manager", "staff"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = addExtraInput.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const admin = createAdminClient();
  if (!(await scopedAppointmentMatch(admin, profile, parsed.data.appointmentId))) return UNAUTHORIZED;

  let { label, unitLabel, quantity } = parsed.data;
  const { addonId, unitAmount } = parsed.data;

  if (addonId) {
    const { data } = await admin
      .from("service_addons")
      .select("name, unit_label, per_unit")
      .eq("id", addonId)
      .eq("active", true)
      .maybeSingle();
    const addon = data as { name: string; unit_label: string; per_unit: boolean } | null;
    if (!addon) return { ok: false as const, error: "That add-on is no longer available." };
    label = addon.name;
    unitLabel = addon.unit_label;
    if (!addon.per_unit) quantity = 1; // flat charge — count is meaningless
  }

  const amount = unitAmount * quantity;
  if (amount > 100000) return { ok: false as const, error: "That total is too large." };

  const { error } = await admin.from("appointment_extras").insert({
    appointment_id: parsed.data.appointmentId,
    label,
    amount,
    quantity,
    unit_amount: unitAmount,
    unit_label: unitLabel ?? null,
    addon_id: addonId ?? null,
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
    .select(EXTRA_COLUMNS)
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

// ──────────────────────── UPI settings (LEGACY, unused) ─────────────────────
// Left over from the manual UPI + screenshot flow that Cashfree replaced. No
// customer-facing code reads these any more — the payment screen is pure
// Cashfree. Kept only so historical rows stay readable and the admin screen
// doesn't break; the stored values are blanked by the 20260904 migration.
// Do NOT put a UPI ID or QR back here: a direct-UPI payment path visible on the
// site reads to a payment aggregator as collecting outside the gateway.
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
    payee_name: BUSINESS.tradingName,
    upi_qr_url: "",
  };
  return { ok: true as const, settings };
}

const settingsInput = z.object({
  // Empty is allowed and is the expected state; a non-empty value must still be
  // a well-formed VPA so it can't corrupt or inject into a UPI link.
  upi_id: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || UPI_VPA_RE.test(v), "Enter a valid UPI ID like name@bank"),
  payee_name: z.string().trim().min(1).max(120),
  // No default: the old `.transform(v => v || "/QR.png")` wrote a path back into
  // the database whenever an admin cleared the field, which is how a deleted
  // asset kept resurrecting as a broken image.
  upi_qr_url: z.string().trim().max(500),
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
  month: string; // "YYYY-MM" this overview is scoped to
  totalRevenue: number;
  feeRevenue: number;
  membershipRevenue: number;
  bookingsMonth: number; // verified appts with appointment_date in the month
  completedSessions: number; // of those, completed
  pendingSessions: number; // of those, verified but not yet completed
  newMembers: number; // membership payments received in the month
  activeMembers: number; // live count of currently-active memberships (not month-scoped)
  // whole revenue split per day: booking fees + in-store services&extras + memberships
  revenueByDay: { date: string; fees: number; services: number; memberships: number }[];
  bookingsByBranch: { branch: string; count: number }[];
  breakdown: RevenueBreakdown;
  staffStats: StaffEarning[];
};

/** Manager dashboard: branch-scoped revenue + per-artist rollup for one month (no
 *  memberships, which are salon-wide, and none of the admin-only counts). */
export type ManagerOverview = {
  month: string; // "YYYY-MM" this overview is scoped to
  branch: string;
  totalRevenue: number;
  breakdown: RevenueBreakdown;
  staffStats: StaffEarning[];
};

/** Resolve a requested "YYYY-MM" to a valid month, defaulting to the current one. */
function resolveMonth(month: string | undefined): string {
  if (month && /^\d{4}-\d{2}$/.test(month)) return month;
  return new Date().toISOString().slice(0, 7);
}

export async function getManagerOverview(input?: { month?: string }) {
  const profile = await requireRole(["manager"]);
  if (!profile) return { ...UNAUTHORIZED, overview: null };
  if (!profile.branch) return { ok: false as const, error: "No branch assigned", overview: null };
  const admin = createAdminClient();
  const month = resolveMonth(input?.month);
  const { start, end } = monthBounds(month);
  // Scope to appointments whose appointment_date falls in the month (same month
  // basis as the staff monthly earnings/commission, so the numbers reconcile).
  const { data, error } = await admin
    .from("appointments")
    .select("id, branch, amount, price, staff_name, completed, payment_mode")
    .eq("payment_status", "verified")
    .eq("branch", profile.branch)
    .gte("appointment_date", start)
    .lt("appointment_date", end);
  if (error) return { ok: false as const, error: error.message, overview: null };
  const verified = (data as VerifiedAppt[] | null) ?? [];
  const completedIds = verified.filter((a) => a.completed).map((a) => a.id);
  const extrasByAppt = await extrasTotalsFor(admin, completedIds);
  const { breakdown, staffStats, totalRevenue } = aggregateRevenue(verified, extrasByAppt, 0);
  const overview: ManagerOverview = { month, branch: profile.branch, totalRevenue, breakdown, staffStats };
  return { ok: true as const, overview };
}

export async function getAdminOverview(input?: { month?: string }) {
  const profile = await requireRole(["admin"]);
  if (!profile) return { ...UNAUTHORIZED, overview: null };
  const admin = createAdminClient();

  const nowMonth = new Date().toISOString().slice(0, 7);
  const month = resolveMonth(input?.month);
  const { start, end } = monthBounds(month);

  const [memberPayRes, apptRes, memRes] = await Promise.all([
    // membership revenue: verified membership payments received in the month
    admin
      .from("payments")
      .select("amount, created_at")
      .eq("purpose", "membership")
      .eq("status", "verified")
      .gte("created_at", start)
      .lt("created_at", end),
    // confirmed bookings whose appointment falls in the month (fees from all
    // verified; service+extras only once completed)
    admin
      .from("appointments")
      .select("id, appointment_date, branch, amount, price, staff_name, completed, payment_mode")
      .eq("payment_status", "verified")
      .gte("appointment_date", start)
      .lt("appointment_date", end),
    // active members is a live roster count, not month-scoped
    admin.from("memberships").select("id").eq("active", true),
  ]);

  const memberPays = (memberPayRes.data as { amount: number; created_at: string }[] | null) ?? [];
  const appts =
    (apptRes.data as (VerifiedAppt & { appointment_date: string })[] | null) ?? [];
  const members = (memRes.data as { id: string }[] | null) ?? [];

  const feeRevenue = appts.reduce((s, a) => s + (a.amount ?? 0), 0);
  const membershipRevenue = memberPays.reduce((s, p) => s + p.amount, 0);
  const bookingsMonth = appts.length;
  const completedSessions = appts.filter((a) => a.completed).length;
  const pendingSessions = appts.filter((a) => !a.completed).length;

  // Per-booking extras (service + extras realise only once the booking is completed).
  const completedIds = appts.filter((a) => a.completed).map((a) => a.id);
  const extrasByAppt = await extrasTotalsFor(admin, completedIds);

  // Whole daily revenue: booking fees (all verified, by appointment date) + in-store
  // service&extras (completed, by appointment date) + memberships (by payment date).
  // For the current month, stop at today so future days aren't empty.
  const todayStr = new Date().toISOString().slice(0, 10);
  const allDays = daysInMonth(month);
  const chartDays = month === nowMonth ? allDays.filter((d) => d <= todayStr) : allDays;
  const revenueByDay = chartDays.map((date) => {
    const onDay = appts.filter((a) => a.appointment_date === date);
    return {
      date: date.slice(5),
      fees: onDay.reduce((s, a) => s + (a.amount ?? 0), 0),
      services: onDay
        .filter((a) => a.completed)
        .reduce((s, a) => s + (a.price ?? 0) + (extrasByAppt.get(a.id) ?? 0), 0),
      memberships: memberPays
        .filter((p) => (p.created_at ?? "").slice(0, 10) === date)
        .reduce((s, p) => s + p.amount, 0),
    };
  });

  const branchCounts = new Map<string, number>();
  for (const a of appts) branchCounts.set(a.branch, (branchCounts.get(a.branch) ?? 0) + 1);
  const bookingsByBranch = [...branchCounts.entries()].map(([branch, count]) => ({ branch, count }));

  // Full revenue (fees + service + extras + memberships) and per-artist rollup.
  const { breakdown, staffStats, totalRevenue } = aggregateRevenue(
    appts,
    extrasByAppt,
    membershipRevenue,
  );

  const overview: Overview = {
    month,
    totalRevenue,
    feeRevenue,
    membershipRevenue,
    bookingsMonth,
    completedSessions,
    pendingSessions,
    newMembers: memberPays.length,
    activeMembers: members.length,
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

// ────────────────────────── Add-on catalog (admin) ───────────────────────────
// The rates staff charge for in-studio add-ons. `rate` is per `unit_label` when
// per_unit (nail art at ₹120/nail); a flat charge otherwise. Mirrors the services
// catalog above. The staff-facing reader is `listActiveAddons`.
export type AddonRow = {
  id: string;
  name: string;
  rate: number;
  unit_label: string;
  per_unit: boolean;
  active: boolean;
  sort_order: number;
};

const ADDON_COLUMNS = "id, name, rate, unit_label, per_unit, active, sort_order";

export async function listAddons() {
  const profile = await requireRole(["admin"]);
  if (!profile) return { ...UNAUTHORIZED, addons: [] as AddonRow[] };
  const admin = createAdminClient();
  const { data, error } = await admin.from("service_addons").select(ADDON_COLUMNS).order("sort_order");
  if (error) return { ok: false as const, error: error.message, addons: [] as AddonRow[] };
  return { ok: true as const, addons: (data as AddonRow[] | null) ?? [] };
}

const addonInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  rate: z.coerce.number().int().min(0).max(100000),
  unit_label: z.string().trim().min(1).max(20),
  per_unit: z.boolean(),
  active: z.boolean(),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export async function saveAddon(input: z.infer<typeof addonInput>) {
  const profile = await requireRole(["admin"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = addonInput.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const admin = createAdminClient();
  const { id, ...fields } = parsed.data;
  const { error } = id
    ? await admin.from("service_addons").update(fields).eq("id", id)
    : await admin.from("service_addons").insert(fields);
  if (error) {
    if ((error as { code?: string }).code === "23505")
      return { ok: false as const, error: "An add-on with that name already exists." };
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const };
}

/**
 * Delete an add-on. Extras already charged keep their own snapshot of the label
 * and rate (addon_id is ON DELETE SET NULL), so past bookings are unaffected.
 */
export async function deleteAddon(input: { id: string }) {
  const profile = await requireRole(["admin"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid id" };
  const admin = createAdminClient();
  const { error } = await admin.from("service_addons").delete().eq("id", parsed.data.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/**
 * Active add-ons for the in-studio extras picker. Available to any staff/manager/
 * admin acting on their own bookings (unlike the admin-only `listAddons`) — the
 * same split as listActiveServices vs listServices.
 */
export async function listActiveAddons() {
  const profile = await requireRole(["admin", "manager", "staff"]);
  if (!profile) return { ...UNAUTHORIZED, addons: [] as AddonRow[] };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("service_addons")
    .select(ADDON_COLUMNS)
    .eq("active", true)
    .order("sort_order");
  if (error) return { ok: false as const, error: error.message, addons: [] as AddonRow[] };
  return { ok: true as const, addons: (data as AddonRow[] | null) ?? [] };
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
  return {
    ok: true as const,
    slots: sortSlotsByStart((data as SlotRow[] | null) ?? [], (s) => s.label),
  };
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
  let bookings = ((bData as Omit<BookingRow, "extras_total" | "extras_detail">[] | null) ?? []).map(
    (b) => ({ ...b, extras_total: 0, extras_detail: "" }),
  ) as BookingRow[];
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
  return {
    ok: true as const,
    slots: sortSlotsByStart((data as { label: string }[] | null) ?? [], (r) => r.label).map(
      (r) => r.label,
    ),
  };
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

// ─────────────────────────── Staff salaries (payroll) ───────────────────────
/**
 * One stylist's payroll for a month. Net pay is DERIVED (never stored) so it always
 * reflects the current salary/rate/absences: net = max(0, base − absent×perDay).
 */
export type SalaryView = {
  staffId: string;
  month: string; // "YYYY-MM"
  base_salary: number;
  per_day_deduction: number;
  absent_days: number;
  deduction: number; // absent_days × per_day_deduction
  net: number; // max(0, base_salary − deduction)
  exists: boolean; // whether a row is actually saved for this month
};

type SalaryRow = {
  staff_id: string;
  month: string;
  base_salary: number;
  per_day_deduction: number;
  absent_days: number;
};

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Invalid month");

function salaryView(
  staffId: string,
  month: string,
  row: SalaryRow | null,
  defaults: { base_salary: number; per_day_deduction: number },
): SalaryView {
  const base_salary = row?.base_salary ?? defaults.base_salary;
  const per_day_deduction = row?.per_day_deduction ?? defaults.per_day_deduction;
  const absent_days = row?.absent_days ?? 0;
  const deduction = absent_days * per_day_deduction;
  return {
    staffId,
    month,
    base_salary,
    per_day_deduction,
    absent_days,
    deduction,
    net: Math.max(0, base_salary - deduction),
    exists: !!row,
  };
}

/** The saved salary row for staff+month, or null (also null if the table is absent). */
async function readSalaryRow(admin: Admin, staffId: string, month: string): Promise<SalaryRow | null> {
  const { data, error } = await admin
    .from("staff_salaries")
    .select("staff_id, month, base_salary, per_day_deduction, absent_days")
    .eq("staff_id", staffId)
    .eq("month", month)
    .maybeSingle();
  if (error) return null; // no row, or migration not applied yet → treat as unset
  return (data as SalaryRow | null) ?? null;
}

/** Salary/rate to carry forward when a month has no row yet (latest earlier month). */
async function latestSalaryDefaults(
  admin: Admin,
  staffId: string,
  beforeMonth: string,
): Promise<{ base_salary: number; per_day_deduction: number }> {
  const { data } = await admin
    .from("staff_salaries")
    .select("base_salary, per_day_deduction, month")
    .eq("staff_id", staffId)
    .lt("month", beforeMonth)
    .order("month", { ascending: false })
    .limit(1);
  const row = ((data as { base_salary: number; per_day_deduction: number }[] | null) ?? [])[0];
  return { base_salary: row?.base_salary ?? 0, per_day_deduction: row?.per_day_deduction ?? 0 };
}

/** Admin/manager read a stylist's payroll for a month (carries salary from the
 *  latest earlier month when this month has no row yet). */
export async function getStaffSalary(input: { staffId: string; month: string }) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return { ...UNAUTHORIZED, salary: null };
  const parsed = z.object({ staffId: z.string().uuid(), month: monthSchema }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid", salary: null };
  const admin = createAdminClient();
  if (!(await staffInScope(admin, profile, parsed.data.staffId)))
    return { ...UNAUTHORIZED, salary: null };
  const row = await readSalaryRow(admin, parsed.data.staffId, parsed.data.month);
  const defaults = row
    ? { base_salary: row.base_salary, per_day_deduction: row.per_day_deduction }
    : await latestSalaryDefaults(admin, parsed.data.staffId, parsed.data.month);
  return { ok: true as const, salary: salaryView(parsed.data.staffId, parsed.data.month, row, defaults) };
}

const setPayInput = z.object({
  staffId: z.string().uuid(),
  month: monthSchema,
  base_salary: z.coerce.number().int("Whole rupees only").min(0).max(10_000_000),
  per_day_deduction: z.coerce.number().int("Whole rupees only").min(0).max(10_000_000),
});

/** Admin sets a stylist's base salary + per-absent-day deduction for a month
 *  (preserving any absent_days already recorded). */
export async function setStaffSalaryPay(input: z.infer<typeof setPayInput>) {
  const profile = await requireRole(["admin"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = setPayInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const admin = createAdminClient();
  const existing = await readSalaryRow(admin, parsed.data.staffId, parsed.data.month);
  const { error } = await admin.from("staff_salaries").upsert(
    {
      staff_id: parsed.data.staffId,
      month: parsed.data.month,
      base_salary: parsed.data.base_salary,
      per_day_deduction: parsed.data.per_day_deduction,
      absent_days: existing?.absent_days ?? 0,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "staff_id,month" },
  );
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

const setAbsenceInput = z.object({
  staffId: z.string().uuid(),
  month: monthSchema,
  absent_days: z.coerce.number().int().min(0).max(31),
});

/** Admin + manager record how many days a stylist was absent that month. Salary and
 *  rate are preserved (carried from the latest earlier month if the row is new). */
export async function setStaffAbsentDays(input: z.infer<typeof setAbsenceInput>) {
  const profile = await requireRole(["admin", "manager"]);
  if (!profile) return UNAUTHORIZED;
  const parsed = setAbsenceInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const admin = createAdminClient();
  if (!(await staffInScope(admin, profile, parsed.data.staffId))) return UNAUTHORIZED;
  const existing = await readSalaryRow(admin, parsed.data.staffId, parsed.data.month);
  const carried = existing
    ? { base_salary: existing.base_salary, per_day_deduction: existing.per_day_deduction }
    : await latestSalaryDefaults(admin, parsed.data.staffId, parsed.data.month);
  const { error } = await admin.from("staff_salaries").upsert(
    {
      staff_id: parsed.data.staffId,
      month: parsed.data.month,
      base_salary: carried.base_salary,
      per_day_deduction: carried.per_day_deduction,
      absent_days: parsed.data.absent_days,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "staff_id,month" },
  );
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** A stylist reads their own payroll for a month (absent days + net pay). Resolves
 *  their staff row by roster name (+ branch). Returns null if no roster/record. */
export async function getMySalary(input: { month: string }) {
  const profile = await requireRole(["staff", "admin", "manager"]);
  if (!profile) return { ...UNAUTHORIZED, salary: null as SalaryView | null };
  const parsed = z.object({ month: monthSchema }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid month", salary: null as SalaryView | null };
  const name = profile.staffName ?? "";
  if (!name) return { ok: true as const, salary: null as SalaryView | null };
  const admin = createAdminClient();
  let q = admin.from("staff").select("id").ilike("name", name);
  if (profile.branch) q = q.eq("branch", profile.branch as (typeof BRANCHES_TUPLE)[number]);
  const { data } = await q.limit(1);
  const staffId = ((data as { id: string }[] | null) ?? [])[0]?.id;
  if (!staffId) return { ok: true as const, salary: null as SalaryView | null };
  const row = await readSalaryRow(admin, staffId, parsed.data.month);
  const defaults = row
    ? { base_salary: row.base_salary, per_day_deduction: row.per_day_deduction }
    : await latestSalaryDefaults(admin, staffId, parsed.data.month);
  return { ok: true as const, salary: salaryView(staffId, parsed.data.month, row, defaults) };
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
