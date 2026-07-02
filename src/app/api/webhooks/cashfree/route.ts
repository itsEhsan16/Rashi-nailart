import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseOrderId, verifyWebhookSignature } from "@/lib/cashfree";
import { fulfillMembershipPayment, type MembershipPayment } from "@/lib/payments-core";
import { notifyCustomer } from "@/lib/notify";

// Needs the Node crypto module (HMAC) and the raw request body — not the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WebhookPayment = {
  cf_payment_id?: string | number;
  payment_status?: string;
  payment_amount?: number;
  payment_group?: string;
};
type WebhookPayload = {
  type?: string;
  data?: {
    order?: { order_id?: string };
    payment?: WebhookPayment;
  };
};

/**
 * Cashfree Payment Gateway webhook — the authoritative confirmation channel.
 *
 * Cashfree POSTs here (notify_url) when a payment resolves. We verify the HMAC
 * signature over the raw body, journal the event (unique cf_payment_id gives
 * idempotency), and on success flip the booking/membership straight to
 * `verified`. The guarded update + the return-page reconciliation converge
 * safely — whichever runs first wins, the other is a no-op. Always returns 200
 * for signed requests so Cashfree doesn't retry needlessly; 401 only on a bad
 * signature.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-webhook-signature");
  const timestamp = req.headers.get("x-webhook-timestamp");

  if (!verifyWebhookSignature(raw, timestamp, signature)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let evt: WebhookPayload;
  try {
    evt = JSON.parse(raw) as WebhookPayload;
  } catch {
    // Signed but unparseable — ack so Cashfree stops retrying; nothing to do.
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();
  const type = evt.type ?? "UNKNOWN";
  const orderId = evt.data?.order?.order_id ?? null;
  const payment = evt.data?.payment;
  const cfPaymentId = payment?.cf_payment_id != null ? String(payment.cf_payment_id) : null;
  const mapping = orderId ? parseOrderId(orderId) : null;

  // Journal every event. The unique index on cf_payment_id is our idempotency
  // guard: a duplicate insert means this payment was already handled → ack & stop.
  const { error: journalErr } = await admin.from("payment_events").insert({
    event_type: type,
    order_id: orderId,
    cf_payment_id: cfPaymentId,
    kind: mapping?.kind ?? null,
    source: "webhook",
    processed: false,
    raw: evt as unknown as Record<string, never>,
  });
  if (journalErr) {
    // 23505 = unique violation on cf_payment_id → already processed.
    if ((journalErr as { code?: string }).code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    // Any other journal error: ack anyway (don't wedge Cashfree retries on our DB).
    return NextResponse.json({ received: true });
  }

  try {
    if (type === "PAYMENT_SUCCESS_WEBHOOK" && mapping) {
      const paidAt = new Date().toISOString();
      const method = payment?.payment_group ?? null;

      if (mapping.kind === "booking") {
        const { data } = await admin
          .from("appointments")
          .update({
            payment_status: "verified",
            paid_at: paidAt,
            verified_at: paidAt,
            cf_payment_id: cfPaymentId,
            payment_method: method,
            rejection_reason: null,
          })
          .eq("id", mapping.recordId)
          .eq("payment_status", "pending_payment")
          .select("client_name, phone")
          .maybeSingle();
        const row = data as { client_name: string; phone: string } | null;
        if (row) {
          await notifyCustomer({
            phone: row.phone,
            message: `Hi ${row.client_name}, your Rashi Nail Art Studio booking is confirmed. See you soon!`,
          });
        }
      } else {
        await admin
          .from("payments")
          .update({
            status: "verified",
            paid_at: paidAt,
            verified_at: paidAt,
            cf_payment_id: cfPaymentId,
            payment_method: method,
            rejection_reason: null,
            updated_at: paidAt,
          })
          .eq("id", mapping.recordId)
          .eq("purpose", "membership")
          .eq("status", "pending_payment");

        const { data } = await admin
          .from("payments")
          .select("id, purpose, client_name, phone, amount, membership_id")
          .eq("id", mapping.recordId)
          .maybeSingle();
        const pay = data as MembershipPayment | null;
        if (pay) {
          await fulfillMembershipPayment(admin, pay);
          await notifyCustomer({
            phone: pay.phone ?? "",
            message: `Hi ${pay.client_name ?? "there"}, your Rashi membership is confirmed — benefits are active now. Enjoy 50% off nail art!`,
          });
        }
      }

      await admin
        .from("payment_events")
        .update({ processed: true })
        .eq("cf_payment_id", cfPaymentId as string);
    }
    // PAYMENT_FAILED_WEBHOOK / PAYMENT_USER_DROPPED_WEBHOOK: journaled only. The
    // row stays pending_payment so the 5-minute sweep reclaims the slot and the
    // customer can retry cleanly — no status write here.
  } catch {
    // Never fail the webhook on a downstream error; the return-page reconcile and
    // the journaled event provide a recovery path. Ack so Cashfree doesn't retry.
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
