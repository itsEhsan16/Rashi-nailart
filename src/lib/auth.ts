import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/integrations/supabase/types";

export type UserRole = Database["public"]["Enums"]["user_role"];
export type Branch = Database["public"]["Enums"]["branch"];

export type AuthProfile = {
  id: string;
  email: string | null;
  role: UserRole;
  branch: Branch | null;
  staffName: string | null;
  fullName: string | null;
};

/**
 * Resolve the signed-in user's profile (role/branch/staff name) from the request
 * cookies. Returns null if not authenticated or no profile row exists.
 */
export async function getCurrentProfile(): Promise<AuthProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, role, branch, staff_name, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const profile = data as {
    id: string;
    email: string | null;
    role: UserRole;
    branch: Branch | null;
    staff_name: string | null;
    full_name: string | null;
  } | null;

  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    branch: profile.branch,
    staffName: profile.staff_name,
    fullName: profile.full_name,
  };
}

/** Default landing route for a given role. */
export function dashboardPathForRole(role: UserRole): string {
  if (role === "admin") return "/admin";
  if (role === "manager") return "/manager";
  return "/staff";
}
