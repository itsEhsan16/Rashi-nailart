"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, type AuthProfile, type UserRole } from "@/lib/auth";
import { BRANCHES_TUPLE } from "@/lib/validations/booking";

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
  staff_name: string;
  special_requests: string | null;
  payment_status: string;
  is_member: boolean;
  discount_applied: number;
  completed: boolean;
  created_at: string;
};

const filtersSchema = z.object({
  date: z.string().optional(),
  branch: z.enum(BRANCHES_TUPLE).optional(),
  staff: z.string().optional(),
  status: z.enum(["pending", "paid", "cancelled", "completed"]).optional(),
});

/** Role-scoped booking list: admin = all, manager = own branch, staff = own name. */
export async function listBookings(input: z.infer<typeof filtersSchema> = {}) {
  const profile = await requireRole(["admin", "manager", "staff"]);
  if (!profile) return { ...UNAUTHORIZED, bookings: [] as BookingRow[] };
  const f = filtersSchema.safeParse(input).data ?? {};
  const admin = createAdminClient();

  let q = admin
    .from("appointments")
    .select(
      "id, client_name, phone, branch, appointment_date, time_slot, service, price, staff_name, special_requests, payment_status, is_member, discount_applied, completed, created_at",
    )
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
  return { ok: true as const, bookings: (data as BookingRow[] | null) ?? [], role: profile.role };
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

// ─────────────────────────────── Overview ───────────────────────────────────
export type Overview = {
  totalRevenue: number;
  feeRevenue: number;
  membershipRevenue: number;
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

  const [payRes, apptRes, memRes] = await Promise.all([
    admin.from("payments").select("amount, purpose, created_at").eq("status", "paid"),
    admin.from("appointments").select("appointment_date, branch").eq("payment_status", "paid"),
    admin.from("memberships").select("id").eq("active", true),
  ]);

  const payments = (payRes.data as { amount: number; purpose: string; created_at: string }[] | null) ?? [];
  const appts = (apptRes.data as { appointment_date: string; branch: string }[] | null) ?? [];
  const members = (memRes.data as { id: string }[] | null) ?? [];

  const feeRevenue = payments.filter((p) => p.purpose === "booking").reduce((s, p) => s + p.amount, 0);
  const membershipRevenue = payments
    .filter((p) => p.purpose === "membership")
    .reduce((s, p) => s + p.amount, 0);

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
  const revenueByDay = days.map((date) => {
    const dayPays = payments.filter((p) => p.created_at.slice(0, 10) === date);
    return {
      date: date.slice(5),
      fees: dayPays.filter((p) => p.purpose === "booking").reduce((s, p) => s + p.amount, 0),
      memberships: dayPays.filter((p) => p.purpose === "membership").reduce((s, p) => s + p.amount, 0),
    };
  });

  const branchCounts = new Map<string, number>();
  for (const a of appts) branchCounts.set(a.branch, (branchCounts.get(a.branch) ?? 0) + 1);
  const bookingsByBranch = [...branchCounts.entries()].map(([branch, count]) => ({ branch, count }));

  const overview: Overview = {
    totalRevenue: feeRevenue + membershipRevenue,
    feeRevenue,
    membershipRevenue,
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
  const { error } = await admin.auth.admin.createUser({
    email: c.email,
    password: c.password,
    email_confirm: true,
    user_metadata: {
      role: c.role,
      full_name: c.full_name,
      staff_name: c.staff_name,
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
