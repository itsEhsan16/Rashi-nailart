"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayOrder, getRazorpayKeyId } from "@/lib/razorpay/server";
import { MEMBERSHIP_PRICE } from "@/lib/salon-data";
import { membershipSchema, type MembershipValues } from "@/lib/validations/membership";

/**
 * Create a ₹100 membership order. The membership row itself is only created once
 * payment is verified (see fulfillPayment), with activation_date = +10 days.
 */
export async function createMembershipOrder(input: MembershipValues) {
  const parsed = membershipSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }
  const { client_name, phone } = parsed.data;
  const admin = createAdminClient();

  try {
    const order = await createRazorpayOrder(MEMBERSHIP_PRICE, {
      purpose: "membership",
      phone,
      client_name,
    });

    const { data } = await admin
      .from("payments")
      .insert({
        purpose: "membership",
        amount: MEMBERSHIP_PRICE,
        currency: "INR",
        status: "created",
        razorpay_order_id: order.id,
        client_name,
        phone,
      })
      .select("id")
      .single();
    const pay = data as { id: string } | null;

    return {
      ok: true as const,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: getRazorpayKeyId(),
      paymentId: pay?.id ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not start payment";
    return { ok: false as const, error: msg };
  }
}
