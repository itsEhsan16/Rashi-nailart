import "server-only";
import crypto from "crypto";

function authHeader(): string {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) {
    throw new Error(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    );
  }
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export function getRazorpayKeyId(): string {
  return process.env.RAZORPAY_KEY_ID ?? "";
}

export type RazorpayOrder = { id: string; amount: number; currency: string };

/** Create a Razorpay order via the REST API (works on Node and edge-safe fetch). */
export async function createRazorpayOrder(
  amountRupees: number,
  notes: Record<string, string>,
): Promise<RazorpayOrder> {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      amount: amountRupees * 100, // paise
      currency: "INR",
      notes,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Razorpay order failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as RazorpayOrder;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Verify the checkout handoff signature: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return safeEqual(expected, signature);
}

/** Verify a webhook payload signature against RAZORPAY_WEBHOOK_SECRET. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}
