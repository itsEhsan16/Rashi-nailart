"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPaymentSignature } from "@/lib/razorpay/server";
import { markPaymentPaid, fulfillPayment } from "@/lib/payments-core";
import { verifyPaymentSchema, type VerifyPaymentInput } from "@/lib/validations/booking";

/**
 * Verify a Razorpay checkout handoff server-side (never trust the client) and
 * fulfill the payment (confirm booking / create membership). The webhook is the
 * source of truth; this gives instant UX feedback. Both are idempotent.
 */
export async function verifyPayment(input: VerifyPaymentInput) {
  const parsed = verifyPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid payment data" };
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  if (!verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    return { ok: false as const, error: "Payment verification failed" };
  }

  const admin = createAdminClient();
  const pay = await markPaymentPaid(admin, razorpay_order_id, razorpay_payment_id);
  if (!pay) return { ok: false as const, error: "Payment record not found" };

  await fulfillPayment(admin, pay);
  return { ok: true as const, purpose: pay.purpose };
}
