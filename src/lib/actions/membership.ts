"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { MEMBERSHIP_PRICE } from "@/lib/salon-data";
import {
  createOrder,
  getOrder,
  getSuccessfulPayment,
  orderIdFor,
  parseOrderId,
  synthEmail,
} from "@/lib/cashfree";
import { fulfillMembershipPayment, type MembershipPayment } from "@/lib/payments-core";
import { notifyCustomer } from "@/lib/notify";
import { membershipSchema, type MembershipValues } from "@/lib/validations/membership";

/** Absolute base URL (no trailing slash) for Cashfree return/notify URLs. */
function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Start a ₹100 membership purchase. Creates a `payments` row in `pending_payment`
 * and returns its id (the customer's capability). The membership row itself is
 * only created once Cashfree confirms payment (see confirmMembershipByOrder →
 * fulfillMembershipPayment), with benefits starting on the join date.
 */
export async function createMembership(input: MembershipValues) {
  const parsed = membershipSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }
  const { client_name, phone } = parsed.data;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("payments")
    .insert({
      purpose: "membership",
      amount: MEMBERSHIP_PRICE,
      currency: "INR",
      status: "pending_payment",
      client_name,
      phone,
    })
    .select("id")
    .single();
  if (error) return { ok: false as const, error: error.message };
  const pay = data as { id: string };
  return { ok: true as const, paymentId: pay.id, amount: MEMBERSHIP_PRICE };
}

/**
 * Create a Cashfree order for a pending membership. The unguessable payment id is
 * the capability; the amount is fixed SERVER-SIDE (MEMBERSHIP_PRICE). Returns the
 * payment session id for the checkout SDK.
 */
export async function createMembershipOrder(input: { paymentId: string }) {
  const parsed = z.object({ paymentId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid payment reference." };
  const admin = createAdminClient();

  const { data } = await admin
    .from("payments")
    .select("id, client_name, phone, status, purpose")
    .eq("id", parsed.data.paymentId)
    .maybeSingle();
  const pay = data as
    | { id: string; client_name: string | null; phone: string | null; status: string; purpose: string }
    | null;
  if (!pay || pay.purpose !== "membership") {
    return { ok: false as const, error: "Membership request not found. Please start again." };
  }
  if (pay.status !== "pending_payment") {
    return { ok: false as const, error: "This membership is no longer awaiting payment." };
  }

  const orderId = orderIdFor("membership", pay.id);
  const phone = pay.phone ?? "";
  try {
    const order = await createOrder({
      orderId,
      amount: MEMBERSHIP_PRICE,
      customer: {
        id: pay.id,
        name: pay.client_name ?? "Member",
        phone,
        email: synthEmail(phone),
      },
      returnUrl: `${siteUrl()}/membership/confirm?order_id=${orderId}`,
      notifyUrl: `${siteUrl()}/api/webhooks/cashfree`,
    });
    await admin
      .from("payments")
      .update({ cashfree_order_id: orderId, updated_at: new Date().toISOString() })
      .eq("id", pay.id)
      .eq("status", "pending_payment");
    return { ok: true as const, paymentSessionId: order.payment_session_id, orderId };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Could not start payment. Please try again.",
    };
  }
}

/** Details rendered on the membership confirmation page and its receipt. */
export type MembershipReceipt = {
  clientName: string;
  phone: string;
  amount: number;
  orderId: string;
  cfPaymentId: string | null;
  paymentMethod: string | null;
  startDate: string | null;
  expiresAt: string | null;
};

export type MembershipConfirmResult =
  | { status: "confirmed"; membership: MembershipReceipt }
  | { status: "pending" }
  | { status: "failed"; reason?: string }
  | { status: "error"; error: string };

/**
 * Reconcile a membership against Cashfree after the customer returns from
 * checkout. Fetches the authoritative order status (never trusts the redirect),
 * and on PAID flips the payment to `verified` (guarded) then creates the
 * membership via the idempotent fulfillMembershipPayment. Safe to call repeatedly
 * and alongside the webhook.
 */
export async function confirmMembershipByOrder(
  input: { orderId: string },
): Promise<MembershipConfirmResult> {
  const orderId = String(input?.orderId ?? "");
  const parsed = parseOrderId(orderId);
  if (!parsed || parsed.kind !== "membership") {
    return { status: "error", error: "Invalid payment reference." };
  }
  const admin = createAdminClient();

  let order;
  try {
    order = await getOrder(orderId);
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "Could not verify payment." };
  }
  if (order.order_status !== "PAID") {
    if (order.order_status === "ACTIVE") return { status: "pending" };
    return { status: "failed", reason: order.order_status };
  }

  const pay = await getSuccessfulPayment(orderId);
  await admin
    .from("payments")
    .update({
      status: "verified",
      paid_at: new Date().toISOString(),
      verified_at: new Date().toISOString(),
      cf_payment_id: pay?.cfPaymentId ?? null,
      payment_method: pay?.method ?? null,
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.recordId)
    .eq("purpose", "membership")
    .eq("status", "pending_payment");

  const { data } = await admin
    .from("payments")
    .select("id, purpose, client_name, phone, amount, membership_id, cf_payment_id, payment_method")
    .eq("id", parsed.recordId)
    .maybeSingle();
  const row = data as
    | (MembershipPayment & { cf_payment_id: string | null; payment_method: string | null })
    | null;
  if (!row) return { status: "error", error: "Membership request not found." };

  // Create the membership row (idempotent — no-op if this payment already links one).
  const membershipId = await fulfillMembershipPayment(admin, row);

  if (row.cf_payment_id) {
    await admin.from("payment_events").insert({
      event_type: "RETURN_CONFIRM",
      order_id: orderId,
      cf_payment_id: row.cf_payment_id,
      kind: "membership",
      source: "return",
      processed: true,
      raw: { order_status: order.order_status },
    });
  }

  let startDate: string | null = null;
  let expiresAt: string | null = null;
  if (membershipId) {
    const { data: mem } = await admin
      .from("memberships")
      .select("start_date, expires_at")
      .eq("id", membershipId)
      .maybeSingle();
    const m = mem as { start_date: string; expires_at: string } | null;
    startDate = m?.start_date ?? null;
    expiresAt = m?.expires_at ?? null;
  }

  await notifyCustomer({
    phone: row.phone ?? "",
    message: `Hi ${row.client_name ?? "there"}, your Rashi membership is confirmed — benefits are active now. Ask us in-store about your member discount!`,
  });

  return {
    status: "confirmed",
    membership: {
      clientName: row.client_name ?? "Member",
      phone: row.phone ?? "",
      amount: row.amount,
      orderId,
      cfPaymentId: row.cf_payment_id,
      paymentMethod: row.payment_method,
      startDate,
      expiresAt,
    },
  };
}
