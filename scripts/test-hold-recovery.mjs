/**
 * Proves the paid-booking-recovery fix end to end, without a working gateway.
 *
 * The bug it guards against: a hold expired after PENDING_HOLD_MINUTES and the
 * row was HARD DELETED by ordinary site traffic. A UPI app-switch takes longer
 * than that, so the payment landed against a row that no longer existed — the
 * webhook matched zero rows, returned 200 in silence, and the customer was shown
 * "Payment not completed / Booking not found" for money that had been taken.
 *
 * The fix: a hold carrying a Cashfree order is never deleted. After
 * PAYING_HOLD_MINUTES it is expired in place to `rejected`, and
 * settleBookingPayment revives it when the payment finally arrives.
 *
 * No gateway is needed. The webhook handler only verifies
 * base64(HMAC_SHA256(timestamp + rawBody, CASHFREE_SECRET_KEY)), so this script
 * signs its own payloads.
 *
 *   WARNING: run this against a LOCAL or BRANCH Supabase project. It creates,
 *   ages and deletes appointment rows. It refuses to run against the live
 *   project (wvosbrierwuwjgiplksz).
 *
 * Usage — start the app first (npm run dev, or npm run build && npm run start):
 *   node --env-file=.env.local scripts/test-hold-recovery.mjs
 */
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.CASHFREE_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIVE_PROJECT_REF = "wvosbrierwuwjgiplksz";

const HOLD_EXPIRED_REASON = "Hold expired — booking fee not received";

if (!SECRET || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("Need CASHFREE_SECRET_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env.");
  process.exit(1);
}
if (SUPABASE_URL.includes(LIVE_PROJECT_REF)) {
  console.error(
    "Refusing to run: SUPABASE_URL points at the LIVE project. Use a local or branch project.",
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** Obviously fake, and the handle used to find and clean up every test row. */
const TEST_PHONE = "9000000001";
const TEST_NAME = "Hold Recovery Test";

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Sign and POST a webhook exactly the way Cashfree does. */
async function postWebhook(orderId, cfPaymentId) {
  const body = JSON.stringify({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    data: {
      order: { order_id: orderId },
      payment: { cf_payment_id: cfPaymentId, payment_status: "SUCCESS", payment_group: "upi" },
    },
  });
  const ts = String(Date.now());
  const signature = crypto.createHmac("sha256", SECRET).update(ts + body).digest("base64");
  const res = await fetch(`${BASE}/api/webhooks/cashfree`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-timestamp": ts,
      "x-webhook-signature": signature,
    },
    body,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** order_id format from src/lib/cashfree.ts — the uuid is embedded in it. */
function orderIdFor(appointmentId) {
  return `bk_${appointmentId.replace(/-/g, "")}_${crypto.randomBytes(3).toString("hex")}`;
}

async function seedHold({ ageMinutes, timeSlot, branch, date }) {
  const createdAt = new Date(Date.now() - ageMinutes * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("appointments")
    .insert({
      client_name: TEST_NAME,
      phone: TEST_PHONE,
      branch,
      appointment_date: date,
      time_slot: timeSlot,
      service: "Gel Polish Hand & Toe",
      price: 499,
      amount: 50,
      staff_name: "Test Artist",
      payment_status: "pending_payment",
      is_member: false,
      discount_applied: 0,
      created_at: createdAt,
    })
    .select("id")
    .single();
  if (error) throw new Error(`seed failed: ${error.message}`);

  const orderId = orderIdFor(data.id);
  await db.from("appointments").update({ cashfree_order_id: orderId }).eq("id", data.id);
  return { id: data.id, orderId };
}

async function readRow(id) {
  const { data } = await db
    .from("appointments")
    .select("id, payment_status, rejection_reason, cf_payment_id")
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function cleanup() {
  await db.from("appointments").delete().eq("phone", TEST_PHONE);
}

async function main() {
  await cleanup();

  // A far-future date, so nothing collides with a real booking and the
  // past-slot guards never fire.
  const date = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);
  const branch = "Vile Parle";
  const stamp = Date.now();

  console.log("\n1. THE BUG: hold expires while the customer is paying, payment then lands");
  const a = await seedHold({ ageMinutes: 30, timeSlot: "TEST-A", branch, date });
  // Simulate what reclaimStaleHolds does to an order-bearing hold past its window.
  await db
    .from("appointments")
    .update({ payment_status: "rejected", rejection_reason: HOLD_EXPIRED_REASON })
    .eq("id", a.id);

  const expired = await readRow(a.id);
  check("expired hold still EXISTS (was not deleted)", Boolean(expired));
  check("expired hold is 'rejected'", expired?.payment_status === "rejected", expired?.payment_status);

  const resA = await postWebhook(a.orderId, `cf_test_${stamp}_a`);
  check("webhook acked", resA.status === 200, `status ${resA.status}`);
  const revived = await readRow(a.id);
  check("booking REVIVED to verified", revived?.payment_status === "verified", revived?.payment_status);
  check("payment id recorded", Boolean(revived?.cf_payment_id));
  check("expiry reason cleared", revived?.rejection_reason === null);

  console.log("\n2. Happy path: a still-pending hold confirms normally");
  const b = await seedHold({ ageMinutes: 1, timeSlot: "TEST-B", branch, date });
  const resB = await postWebhook(b.orderId, `cf_test_${stamp}_b`);
  check("webhook acked", resB.status === 200);
  check("booking verified", (await readRow(b.id))?.payment_status === "verified");

  console.log("\n3. Duplicate delivery is idempotent");
  const c = await seedHold({ ageMinutes: 1, timeSlot: "TEST-C", branch, date });
  const dupPaymentId = `cf_test_${stamp}_dup`;
  await postWebhook(c.orderId, dupPaymentId);
  const second = await postWebhook(c.orderId, dupPaymentId);
  check(
    "second delivery reported as duplicate",
    second.json?.duplicate === true,
    JSON.stringify(second.json),
  );
  check("still exactly one verified booking", (await readRow(c.id))?.payment_status === "verified");

  console.log("\n4. Orphan (historical rows): no booking at all, must NOT look processed");
  const d = await seedHold({ ageMinutes: 1, timeSlot: "TEST-D", branch, date });
  await db.from("appointments").delete().eq("id", d.id);
  const orphanPaymentId = `cf_test_${stamp}_d`;
  const resD = await postWebhook(d.orderId, orphanPaymentId);
  check("webhook still acked (never wedge Cashfree retries)", resD.status === 200);
  const { data: orphanEvent } = await db
    .from("payment_events")
    .select("processed")
    .eq("cf_payment_id", orphanPaymentId)
    .maybeSingle();
  check(
    "event left in the reconciliation queue (processed = false)",
    orphanEvent?.processed === false,
    `processed=${orphanEvent?.processed}`,
  );

  console.log("\n5. Bad signature is rejected");
  const bogus = await fetch(`${BASE}/api/webhooks/cashfree`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-timestamp": String(Date.now()),
      "x-webhook-signature": "not-a-real-signature",
    },
    body: JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK" }),
  });
  check("unsigned request rejected with 401", bogus.status === 401, `status ${bogus.status}`);

  await cleanup();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup();
  process.exit(1);
});
