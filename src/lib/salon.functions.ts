import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import crypto from "crypto";

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// ---------- AUTH ----------
export const loginFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      username: z.string().trim().min(1).max(64),
      password: z.string().min(1).max(128),
    })
  )
  .handler(async ({ data }) => {
    const { data: user, error } = await supabaseAdmin
      .from("app_users")
      .select("id, username, role, branch, staff_name, password_hash")
      .eq("username", data.username.toLowerCase())
      .maybeSingle();

    if (error) return { ok: false as const, error: "Login failed" };
    if (!user) return { ok: false as const, error: "Invalid credentials" };
    if (user.password_hash !== sha256(data.password))
      return { ok: false as const, error: "Invalid credentials" };

    return {
      ok: true as const,
      session: {
        id: user.id,
        username: user.username,
        role: user.role,
        branch: user.branch,
        staffName: user.staff_name,
      },
    };
  });

// ---------- BOOK APPOINTMENT (public) ----------
export const bookAppointmentFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      client_name: z.string().trim().min(1).max(100),
      phone: z.string().trim().min(7).max(20),
      branch: z.enum(["Vile Parle", "Bandra", "Kandivali"]),
      appointment_date: z.string().min(1),
      time_slot: z.string().min(1).max(50),
      service: z.string().min(1).max(100),
      price: z.number().int().positive(),
      staff_name: z.string().min(1).max(50),
      special_requests: z.string().max(500).optional().nullable(),
    })
  )
  .handler(async ({ data }) => {
    // Capacity per slot: 1 normally, 2 during peak season (Aug 1 – Dec 31)
    const month = Number(data.appointment_date.slice(5, 7));
    const isPeakSeason = month >= 8 && month <= 12;
    const capacity = isPeakSeason ? 2 : 1;

    const { data: existing } = await supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("branch", data.branch)
      .eq("staff_name", data.staff_name)
      .eq("appointment_date", data.appointment_date)
      .eq("time_slot", data.time_slot);
    if ((existing?.length ?? 0) >= capacity) {
      return {
        ok: false as const,
        error: `This slot is fully booked for ${data.staff_name} on ${data.appointment_date} at ${data.time_slot}. Please pick another time or stylist.`,
      };
    }
    const { error } = await supabaseAdmin.from("appointments").insert(data);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// ---------- BOOKED SLOTS (public) ----------
export const getBookedSlotsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      branch: z.enum(["Vile Parle", "Bandra", "Kandivali"]),
      staff_name: z.string().min(1).max(50),
      appointment_date: z.string().min(1),
    })
  )
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("appointments")
      .select("time_slot")
      .eq("branch", data.branch)
      .eq("staff_name", data.staff_name)
      .eq("appointment_date", data.appointment_date);
    if (error) return { ok: false as const, error: error.message, slots: [] as string[] };
    // A slot is "full" if it has reached capacity (2 during Aug–Dec peak, else 1)
    const month = Number(data.appointment_date.slice(5, 7));
    const capacity = month >= 8 && month <= 12 ? 2 : 1;
    const counts = new Map<string, number>();
    for (const r of rows ?? []) counts.set(r.time_slot, (counts.get(r.time_slot) ?? 0) + 1);
    const fullSlots = [...counts.entries()].filter(([, n]) => n >= capacity).map(([s]) => s);
    return { ok: true as const, slots: fullSlots };
  });

// ---------- LIST APPOINTMENTS (role-aware) ----------
const sessionSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["admin", "manager", "staff"]),
  branch: z.enum(["Vile Parle", "Bandra", "Kandivali"]).nullable(),
  staffName: z.string().nullable(),
});

export const listAppointmentsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      session: sessionSchema,
      filters: z
        .object({
          date: z.string().optional(),
          branch: z.enum(["Vile Parle", "Bandra", "Kandivali"]).optional(),
          staff: z.string().optional(),
        })
        .optional(),
    })
  )
  .handler(async ({ data }) => {
    // Verify session is real
    const { data: u } = await supabaseAdmin
      .from("app_users")
      .select("id, role, branch, staff_name")
      .eq("id", data.session.id)
      .maybeSingle();
    if (!u) return { ok: false as const, error: "Unauthorized", appointments: [] };

    let q = supabaseAdmin
      .from("appointments")
      .select("*")
      .order("appointment_date", { ascending: false })
      .order("time_slot", { ascending: true });

    if (u.role === "staff") {
      // staff: only their own appointments (case-insensitive match)
      q = q.ilike("staff_name", u.staff_name ?? "__none__");
    } else {
      // admin/manager filters
      const f = data.filters ?? {};
      if (f.date) q = q.eq("appointment_date", f.date);
      // Managers are scoped to their own branch
      if (u.role === "manager" && u.branch) {
        q = q.eq("branch", u.branch);
      } else if (f.branch) {
        q = q.eq("branch", f.branch);
      }
      if (f.staff) q = q.eq("staff_name", f.staff);
    }

    const { data: rows, error } = await q;
    if (error) return { ok: false as const, error: error.message, appointments: [] };
    return { ok: true as const, appointments: rows ?? [], role: u.role };
  });

// ---------- STAFF (admin manage) ----------
export const listStaffFn = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("*")
    .order("branch")
    .order("name");
  if (error) return { ok: false as const, error: error.message, staff: [] };
  return { ok: true as const, staff: data ?? [] };
});

export const addStaffFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      adminId: z.string().uuid(),
      name: z.string().trim().min(1).max(50),
      branch: z.enum(["Vile Parle", "Bandra", "Kandivali"]),
    })
  )
  .handler(async ({ data }) => {
    const { data: u } = await supabaseAdmin
      .from("app_users")
      .select("role")
      .eq("id", data.adminId)
      .maybeSingle();
    if (!u || u.role !== "admin") return { ok: false as const, error: "Unauthorized" };

    const { error } = await supabaseAdmin
      .from("staff")
      .insert({ name: data.name, branch: data.branch });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// ---------- CREDENTIALS (admin & manager manage staff logins) ----------
async function assertManagerOrAdmin(actorId: string) {
  const { data: u } = await supabaseAdmin
    .from("app_users")
    .select("role, branch")
    .eq("id", actorId)
    .maybeSingle();
  if (!u || (u.role !== "admin" && u.role !== "manager")) return null;
  return u;
}

function genPassword(len = 10) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

export const listCredentialsFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ actorId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const u = await assertManagerOrAdmin(data.actorId);
    if (!u) return { ok: false as const, error: "Unauthorized", users: [] };
    let q = supabaseAdmin
      .from("app_users")
      .select("id, username, role, branch, staff_name, created_at")
      .order("role")
      .order("username");
    // Managers only see logins in their own branch
    if (u.role === "manager" && u.branch) {
      q = q.eq("branch", u.branch);
    }
    const { data: rows, error } = await q;
    if (error) return { ok: false as const, error: error.message, users: [] };
    return { ok: true as const, users: rows ?? [] };
  });

const credInput = z.object({
  username: z.string().trim().toLowerCase().min(3).max(40).regex(/^[a-z0-9._-]+$/, "Use letters, numbers, . _ -"),
  password: z.string().min(6).max(64),
  staff_name: z.string().trim().min(1).max(50),
  branch: z.enum(["Vile Parle", "Bandra", "Kandivali"]).nullable().optional(),
  role: z.enum(["staff", "manager"]).default("staff"),
});

export const createCredentialFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ actorId: z.string().uuid(), credential: credInput }))
  .handler(async ({ data }) => {
    const u = await assertManagerOrAdmin(data.actorId);
    if (!u) return { ok: false as const, error: "Unauthorized" };

    const { credential: c } = data;
    const { data: existing } = await supabaseAdmin
      .from("app_users")
      .select("id")
      .eq("username", c.username)
      .maybeSingle();
    if (existing) return { ok: false as const, error: `Username "${c.username}" already exists` };

    // Managers can only create logins in their own branch
    if (u.role === "manager" && u.branch && c.branch !== u.branch) {
      return { ok: false as const, error: "Managers can only create logins for their own branch" };
    }
    // Both staff and manager require a branch
    if (!c.branch) {
      return { ok: false as const, error: "Branch is required" };
    }

    const { error } = await supabaseAdmin.from("app_users").insert({
      username: c.username,
      password_hash: sha256(c.password),
      role: c.role,
      branch: c.branch,
      staff_name: c.staff_name,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, credential: { username: c.username, password: c.password, role: c.role } };
  });

// ---------- DELETE APPOINTMENT (admin) ----------
export const deleteAppointmentFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ adminId: z.string().uuid(), appointmentId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { data: u } = await supabaseAdmin
      .from("app_users")
      .select("role")
      .eq("id", data.adminId)
      .maybeSingle();
    if (!u || u.role !== "admin") return { ok: false as const, error: "Unauthorized" };
    const { error } = await supabaseAdmin.from("appointments").delete().eq("id", data.appointmentId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// ---------- COMPLETE APPOINTMENT (staff) ----------
export const completeAppointmentFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ staffId: z.string().uuid(), appointmentId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { data: u } = await supabaseAdmin
      .from("app_users")
      .select("role, staff_name")
      .eq("id", data.staffId)
      .maybeSingle();
    if (!u) return { ok: false as const, error: "Unauthorized" };
    // Staff can only complete their own; admin/manager can complete any
    let q = supabaseAdmin
      .from("appointments")
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq("id", data.appointmentId);
    if (u.role === "staff") q = q.eq("staff_name", u.staff_name ?? "__none__");
    const { error } = await q;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const bulkCreateCredentialsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      actorId: z.string().uuid(),
      branch: z.enum(["Vile Parle", "Bandra", "Kandivali"]).optional(),
      defaultPassword: z.string().min(6).max(64).optional(),
    })
  )
  .handler(async ({ data }) => {
    const u = await assertManagerOrAdmin(data.actorId);
    if (!u) return { ok: false as const, error: "Unauthorized", created: [], skipped: [] };

    // Managers are restricted to their own branch
    const effectiveBranch =
      u.role === "manager" && u.branch ? u.branch : data.branch;

    let q = supabaseAdmin.from("staff").select("id, name, branch");
    if (effectiveBranch) q = q.eq("branch", effectiveBranch);
    const { data: staffRows, error: sErr } = await q;
    if (sErr) return { ok: false as const, error: sErr.message, created: [], skipped: [] };

    const { data: existing } = await supabaseAdmin
      .from("app_users")
      .select("id, username, staff_name, branch")
      .eq("role", "staff");
    const existingByName = new Map(
      (existing ?? []).map((r) => [(r.staff_name ?? "").toLowerCase(), r]),
    );

    const created: { staff_name: string; branch: string; username: string; password: string }[] = [];
    const skipped: { staff_name: string; reason: string }[] = [];

    // If a default password is provided, apply it to ALL existing staff logins
    // in scope so the entire team shares the same password after bulk action.
    if (data.defaultPassword) {
      const hash = sha256(data.defaultPassword);
      for (const s of staffRows ?? []) {
        const ex = existingByName.get(s.name.toLowerCase());
        if (!ex) continue;
        const { error: uErr } = await supabaseAdmin
          .from("app_users")
          .update({ password_hash: hash })
          .eq("id", ex.id);
        if (uErr) {
          skipped.push({ staff_name: s.name, reason: `Update failed: ${uErr.message}` });
          continue;
        }
        created.push({
          staff_name: s.name,
          branch: s.branch,
          username: ex.username,
          password: data.defaultPassword,
        });
      }
    }

    for (const s of staffRows ?? []) {
      if (existingByName.has(s.name.toLowerCase())) {
        if (!data.defaultPassword) {
          skipped.push({ staff_name: s.name, reason: "Already has login" });
        }
        continue;
      }
      const baseUsername = s.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      let username = baseUsername;
      let suffix = 0;
      // ensure unique
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: ex } = await supabaseAdmin
          .from("app_users")
          .select("id")
          .eq("username", username)
          .maybeSingle();
        if (!ex) break;
        suffix += 1;
        username = `${baseUsername}${suffix}`;
      }
      const password = data.defaultPassword || genPassword(10);
      const { error: iErr } = await supabaseAdmin.from("app_users").insert({
        username,
        password_hash: sha256(password),
        role: "staff",
        branch: s.branch,
        staff_name: s.name,
      });
      if (iErr) {
        skipped.push({ staff_name: s.name, reason: iErr.message });
        continue;
      }
      created.push({ staff_name: s.name, branch: s.branch, username, password });
    }

    return { ok: true as const, created, skipped };
  });

export const resetCredentialPasswordFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      actorId: z.string().uuid(),
      userId: z.string().uuid(),
      newPassword: z.string().min(6).max(64).optional(),
    })
  )
  .handler(async ({ data }) => {
    const u = await assertManagerOrAdmin(data.actorId);
    if (!u) return { ok: false as const, error: "Unauthorized" };
    const { data: target } = await supabaseAdmin
      .from("app_users")
      .select("id, role, username, branch")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target) return { ok: false as const, error: "User not found" };
    if (target.role === "admin") return { ok: false as const, error: "Cannot reset admin password here" };
    if (u.role === "manager" && u.branch && target.branch !== u.branch) {
      return { ok: false as const, error: "Out of your branch scope" };
    }

    const password = data.newPassword || genPassword(10);
    const { error } = await supabaseAdmin
      .from("app_users")
      .update({ password_hash: sha256(password) })
      .eq("id", data.userId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, username: target.username, password };
  });

export const deleteCredentialFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ actorId: z.string().uuid(), userId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const u = await assertManagerOrAdmin(data.actorId);
    if (!u) return { ok: false as const, error: "Unauthorized" };
    const { data: target } = await supabaseAdmin
      .from("app_users")
      .select("role, branch")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target) return { ok: false as const, error: "User not found" };
    if (target.role === "admin") return { ok: false as const, error: "Cannot delete admin login" };
    if (u.role === "manager" && u.branch && target.branch !== u.branch) {
      return { ok: false as const, error: "Out of your branch scope" };
    }
    const { error } = await supabaseAdmin.from("app_users").delete().eq("id", data.userId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const removeStaffFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      adminId: z.string().uuid(),
      staffId: z.string().uuid(),
    })
  )
  .handler(async ({ data }) => {
    const { data: u } = await supabaseAdmin
      .from("app_users")
      .select("role")
      .eq("id", data.adminId)
      .maybeSingle();
    if (!u || u.role !== "admin") return { ok: false as const, error: "Unauthorized" };

    const { error } = await supabaseAdmin.from("staff").delete().eq("id", data.staffId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
