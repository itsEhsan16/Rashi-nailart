"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dashboardPathForRole, type UserRole } from "@/lib/auth";
import { signInSchema } from "@/lib/validations/auth";

/**
 * Sign in with email + password (Supabase Auth). On success, redirects to the
 * role's dashboard. On failure, returns an error for inline display.
 */
export async function signIn(values: {
  email: string;
  password: string;
}): Promise<{ error: string } | void> {
  const parsed = signInSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { error: "Invalid email or password" };
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  const role = (profileRow as { role: UserRole } | null)?.role;
  if (!role) {
    // Authenticated but no internal profile — not a staff/admin account.
    await supabase.auth.signOut();
    return { error: "This account has no staff access." };
  }

  redirect(dashboardPathForRole(role));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
