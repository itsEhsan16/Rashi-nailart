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
      branch: z.enum(["Vile Parle", "Bandra"]),
      appointment_date: z.string().min(1),
      time_slot: z.string().min(1).max(50),
      service: z.string().min(1).max(100),
      price: z.number().int().positive(),
      staff_name: z.string().min(1).max(50),
      special_requests: z.string().max(500).optional().nullable(),
    })
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("appointments").insert(data);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// ---------- LIST APPOINTMENTS (role-aware) ----------
const sessionSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["admin", "manager", "staff"]),
  branch: z.enum(["Vile Parle", "Bandra"]).nullable(),
  staffName: z.string().nullable(),
});

export const listAppointmentsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      session: sessionSchema,
      filters: z
        .object({
          date: z.string().optional(),
          branch: z.enum(["Vile Parle", "Bandra"]).optional(),
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
      // staff: only their own appointments
      q = q.eq("staff_name", u.staff_name ?? "__none__");
    } else {
      // admin/manager filters
      const f = data.filters ?? {};
      if (f.date) q = q.eq("appointment_date", f.date);
      if (f.branch) q = q.eq("branch", f.branch);
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
      branch: z.enum(["Vile Parle", "Bandra"]),
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
