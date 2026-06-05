import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/razorpay/server";
import {
  markPaymentPaid,
  markPaymentFailed,
  fulfillPayment,
} from "@/lib/payments-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RazorpayWebhook = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string } };
  };
};

/**
 * Razorpay webhook — the source of truth for payment status. HMAC-verified
 * against RAZORPAY_WEBHOOK_SECRET, then confirms bookings / creates memberships
 * idempotently (so it's safe alongside the client-side verify handoff).
 */
export async function POST(request: Request) {
  const signature = request.headers.get("x-razorpay-signature");
  const body = await request.text();

  if (!signature || !verifyWebhookSignature(body, signature)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let payload: RazorpayWebhook;
  try {
    payload = JSON.parse(body) as RazorpayWebhook;
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }

  const event = payload.event;
  const entity = payload.payload?.payment?.entity;
  const orderId = entity?.order_id;
  const paymentId = entity?.id ?? null;

  if (!orderId) return new NextResponse("ok"); // ignore non-order events

  const admin = createAdminClient();

  if (event === "payment.captured" || event === "order.paid") {
    const pay = await markPaymentPaid(admin, orderId, paymentId);
    if (pay) await fulfillPayment(admin, pay);
  } else if (event === "payment.failed") {
    await markPaymentFailed(admin, orderId);
  }

  return new NextResponse("ok", { status: 200 });
}
