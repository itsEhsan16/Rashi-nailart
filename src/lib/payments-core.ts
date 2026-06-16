import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

export type MembershipPayment = {
  id: string;
  purpose: string;
  client_name: string | null;
  phone: string | null;
  amount: number;
  membership_id: string | null;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Create the membership a verified membership payment pays for: starts today,
 * ACTIVATES in 10 days, expires in 1 year. Idempotent — if the payment already
 * links a membership, this is a no-op. Returns the membership id (existing or new).
 */
export async function fulfillMembershipPayment(
  admin: Admin,
  pay: MembershipPayment,
): Promise<string | null> {
  if (pay.purpose !== "membership") return null;
  if (pay.membership_id) return pay.membership_id; // already fulfilled

  const today = new Date();
  const activation = new Date(today);
  activation.setDate(activation.getDate() + 10); // 10-day activation rule
  const expires = new Date(today);
  expires.setFullYear(expires.getFullYear() + 1);

  const { data: mem } = await admin
    .from("memberships")
    .insert({
      client_name: pay.client_name ?? "Member",
      phone: pay.phone ?? "",
      start_date: isoDate(today),
      activation_date: isoDate(activation),
      expires_at: isoDate(expires),
      active: true,
      amount_paid: pay.amount,
    })
    .select("id")
    .single();

  const memRow = mem as { id: string } | null;
  if (!memRow) return null;

  await admin.from("payments").update({ membership_id: memRow.id }).eq("id", pay.id);
  return memRow.id;
}
