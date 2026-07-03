// Verify Cashfree API keys are valid by creating a throwaway SANDBOX order.
//
// The order is amount ₹1 and is never paid — it simply expires. This only proves
// the CASHFREE_APP_ID / CASHFREE_SECRET_KEY are accepted for the selected mode.
//
// Run (Node 20.6+/22, loads .env.local automatically):
//   node --env-file=.env.local scripts/verify-cashfree.mjs
//
// Do NOT run this against production keys casually — it would create a real
// (unpaid) order. It refuses unless you pass --allow-production.

const appId = process.env.CASHFREE_APP_ID;
const secret = process.env.CASHFREE_SECRET_KEY;
const mode = process.env.NEXT_PUBLIC_CASHFREE_MODE || "sandbox";
const apiVersion = process.env.CASHFREE_API_VERSION || "2025-01-01";

if (!appId || !secret) {
  console.error(
    "❌ Missing CASHFREE_APP_ID and/or CASHFREE_SECRET_KEY. Did you run with --env-file=.env.local ?",
  );
  process.exit(1);
}

if (mode === "production" && !process.argv.includes("--allow-production")) {
  console.error(
    "❌ NEXT_PUBLIC_CASHFREE_MODE=production. Re-run with --allow-production only if you really mean to.",
  );
  process.exit(1);
}

const base =
  mode === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
const orderId = `verify_${Date.now()}`;

const res = await fetch(`${base}/orders`, {
  method: "POST",
  headers: {
    "x-client-id": appId,
    "x-client-secret": secret,
    "x-api-version": apiVersion,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    order_id: orderId,
    order_amount: 1,
    order_currency: "INR",
    customer_details: {
      customer_id: "verify_customer",
      customer_phone: "9999999999",
      customer_email: "verify@nomail.rashinailart.in",
    },
  }),
});

const body = await res.json().catch(() => null);

if (res.ok && body?.payment_session_id) {
  console.log(`✅ Cashfree keys valid (${mode}). Created test order ${body.order_id}.`);
  process.exit(0);
}

console.error(`❌ Cashfree rejected the request (HTTP ${res.status}):`);
console.error(JSON.stringify(body, null, 2));
console.error(
  "\nCommon causes: wrong keys, or keys don't match NEXT_PUBLIC_CASHFREE_MODE (sandbox vs production).",
);
process.exit(1);
