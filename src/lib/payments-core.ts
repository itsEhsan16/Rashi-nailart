import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

export type PaidPayment = {
  id: string;
  purpose: string;
  appointment_id: string | null;
  client_name: string | null;
  phone: string | null;
  amount: number;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Mark a payment row as paid (idempotent on order id). Returns the payment, or
 * null if no matching order exists.
 */
export async function markPaymentPaid(
  admin: Admin,
  orderId: string,
  paymentId: string | null,
): Promise<PaidPayment | null> {
  const { data } = await admin
    .from("payments")
    .update({
      status: "paid",
      razorpay_payment_id: paymentId,
      updated_at: new Date().toISOString(),
    })
    .eq("razorpay_order_id", orderId)
    .select("id, purpose, appointment_id, client_name, phone, amount")
    .maybeSingle();
  return (data as PaidPayment | null) ?? null;
}

export async function markPaymentFailed(admin: Admin, orderId: string): Promise<void> {
  await admin
    .from("payments")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("razorpay_order_id", orderId);
}

/**
 * Apply the side effects of a successful payment:
 *  - booking   → confirm the appointment (payment_status = paid)
 *  - membership→ create the membership (start today, ACTIVATES in 10 days,
 *                expires in 1 year). Idempotent: skips if already linked.
 * Shared by the server action (checkout handoff) and the webhook handler.
 */
export async function fulfillPayment(admin: Admin, pay: PaidPayment): Promise<void> {
  if (pay.purpose === "booking" && pay.appointment_id) {
    await admin
      .from("appointments")
      .update({ payment_status: "paid" })
      .eq("id", pay.appointment_id);
    return;
  }

  if (pay.purpose === "membership") {
    const { data: existing } = await admin
      .from("payments")
      .select("membership_id")
      .eq("id", pay.id)
      .maybeSingle();
    const ex = existing as { membership_id: string | null } | null;
    if (ex?.membership_id) return; // already fulfilled

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
    if (memRow) {
      await admin
        .from("payments")
        .update({ membership_id: memRow.id })
        .eq("id", pay.id);
    }
  }
}
