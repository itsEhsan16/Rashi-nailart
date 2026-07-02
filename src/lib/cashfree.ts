import "server-only";
import crypto from "node:crypto";

/**
 * Server-side Cashfree Payment Gateway helpers (Orders API + webhook signature).
 *
 * We call the REST API directly with fetch — no SDK — mirroring how the rest of
 * the app talks to services. Secrets are read from process.env and NEVER reach
 * the browser (only the payment_session_id + NEXT_PUBLIC_CASHFREE_MODE do).
 *
 * Docs:
 *   Create Order  https://www.cashfree.com/docs/api-reference/payments/latest/orders/create
 *   Get Order     https://www.cashfree.com/docs/api-reference/payments/latest/orders/get
 *   Webhook sig   https://www.cashfree.com/docs/api-reference/vrs/webhook-signature-verification
 */

const API_VERSION = process.env.CASHFREE_API_VERSION ?? "2025-01-01";

export type OrderKind = "booking" | "membership";

/** Cashfree order lifecycle (see Get Order). PAID = at least one successful txn. */
export type CashfreeOrderStatus =
  | "ACTIVE"
  | "PAID"
  | "EXPIRED"
  | "TERMINATED"
  | "TERMINATION_REQUESTED";

type CreateOrderResponse = {
  payment_session_id: string;
  order_id: string;
  cf_order_id?: string | number;
  order_status: CashfreeOrderStatus;
};

type GetOrderResponse = {
  order_id: string;
  order_status: CashfreeOrderStatus;
  order_amount: number;
  order_currency: string;
};

/** A single payment attempt against an order (Get Payments for an order). */
type OrderPayment = {
  cf_payment_id?: string | number;
  payment_status?: string; // SUCCESS | FAILED | PENDING | ...
  payment_amount?: number;
  payment_group?: string; // 'upi' | 'credit_card' | ...
  payment_method?: unknown;
};

function isProd(): boolean {
  return process.env.NEXT_PUBLIC_CASHFREE_MODE === "production";
}

function baseUrl(): string {
  return isProd() ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
}

/** Client id/secret for the REST API. Throws a clear error if unconfigured. */
function authHeaders(): Record<string, string> {
  const appId = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!appId || !secret) {
    throw new Error(
      "Cashfree is not configured — set CASHFREE_APP_ID and CASHFREE_SECRET_KEY.",
    );
  }
  return {
    "x-client-id": appId,
    "x-client-secret": secret,
    "x-api-version": API_VERSION,
    "Content-Type": "application/json",
  };
}

/** Pull a human-readable message out of a Cashfree error response body. */
function describeApiError(status: number, body: unknown): string {
  const msg =
    (body && typeof body === "object" && "message" in body && typeof body.message === "string"
      ? body.message
      : null) ?? `Cashfree request failed (${status})`;
  return msg;
}

export type CreateOrderArgs = {
  orderId: string;
  amount: number;
  customer: { id: string; name: string; phone: string; email: string };
  returnUrl: string;
  notifyUrl: string;
};

/** Create a Cashfree order for `amount` (₹). Returns the payment session id. */
export async function createOrder(args: CreateOrderArgs): Promise<CreateOrderResponse> {
  const res = await fetch(`${baseUrl()}/orders`, {
    method: "POST",
    headers: { ...authHeaders(), "x-idempotency-key": args.orderId },
    cache: "no-store",
    body: JSON.stringify({
      order_id: args.orderId,
      order_amount: args.amount,
      order_currency: "INR",
      customer_details: {
        customer_id: args.customer.id,
        customer_name: args.customer.name,
        customer_phone: args.customer.phone,
        customer_email: args.customer.email,
      },
      order_meta: {
        return_url: args.returnUrl,
        notify_url: args.notifyUrl,
      },
    }),
  });
  const body = (await res.json().catch(() => null)) as CreateOrderResponse | null;
  if (!res.ok || !body?.payment_session_id) {
    throw new Error(describeApiError(res.status, body));
  }
  return body;
}

/** Fetch the authoritative order status server-side (used on the return page). */
export async function getOrder(orderId: string): Promise<GetOrderResponse> {
  const res = await fetch(`${baseUrl()}/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: authHeaders(),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as GetOrderResponse | null;
  if (!res.ok || !body?.order_status) {
    throw new Error(describeApiError(res.status, body));
  }
  return body;
}

/**
 * Best-effort enrichment: the latest SUCCESSful payment for an order (for
 * cf_payment_id + method). Tolerates 404/empty — the webhook is authoritative.
 */
export async function getSuccessfulPayment(orderId: string): Promise<{
  cfPaymentId: string | null;
  method: string | null;
} | null> {
  try {
    const res = await fetch(`${baseUrl()}/orders/${encodeURIComponent(orderId)}/payments`, {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const list = (await res.json().catch(() => null)) as OrderPayment[] | null;
    if (!Array.isArray(list) || list.length === 0) return null;
    const success = list.find((p) => (p.payment_status ?? "").toUpperCase() === "SUCCESS") ?? list[0];
    return {
      cfPaymentId: success.cf_payment_id != null ? String(success.cf_payment_id) : null,
      method: success.payment_group ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Verify a Cashfree webhook. Signature = base64(HMAC_SHA256(timestamp + rawBody,
 * CASHFREE_SECRET_KEY)). Compared in constant time. Returns false on any
 * malformed input rather than throwing.
 */
export function verifyWebhookSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
): boolean {
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!secret || !timestamp || !signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(timestamp + rawBody)
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Cashfree requires a customer_email. We collect phone only (WhatsApp comes
 * later), so synthesize a valid-format, non-deliverable address from the digits.
 */
export function synthEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "") || "customer";
  return `${digits}@nomail.rashinailart.in`;
}

const PREFIX: Record<OrderKind, string> = { booking: "bk", membership: "ms" };

/**
 * Build a Cashfree order_id that embeds the record uuid (≤45 chars, [A-Za-z0-9_-]):
 *   bk_<32-hex-uuid>_<rand>   for bookings
 *   ms_<32-hex-uuid>_<rand>   for memberships
 * The embedded uuid makes the order↔record mapping stable across retries; a fresh
 * random suffix lets a customer retry with a new order for the same record.
 */
export function orderIdFor(kind: OrderKind, recordId: string): string {
  const hex = recordId.replace(/-/g, "");
  const rand = crypto.randomBytes(3).toString("hex"); // 6 chars
  return `${PREFIX[kind]}_${hex}_${rand}`;
}

/** Recover {kind, recordId} from an order_id built by orderIdFor. null if unrecognized. */
export function parseOrderId(orderId: string): { kind: OrderKind; recordId: string } | null {
  const m = /^(bk|ms)_([0-9a-f]{32})_/.exec(orderId);
  if (!m) return null;
  const kind: OrderKind = m[1] === "bk" ? "booking" : "membership";
  const h = m[2];
  const recordId = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  return { kind, recordId };
}
