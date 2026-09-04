# Cashfree Payment Gateway — Setup Guide

This app collects the booking/membership fee through the **Cashfree Payment Gateway** and
**auto-confirms** the booking the moment payment succeeds (no manual verification). This
document is the complete setup checklist for a developer or for Claude.

> **Legend**
> - 🧑 **Human-only** — needs a Cashfree/Vercel/Supabase login; Claude cannot do it.
> - 🤖 **Claude-can-do** — a code/CLI task Claude can perform if given access.

---

## 0. How the flow works (context)

```
Booking form → createBooking() holds the slot (pending_payment)
  → "Pay ₹50 securely" → createBookingOrder() [server] creates a Cashfree order
  → redirect to Cashfree hosted checkout (UPI / card / wallet / netbanking)
  → Cashfree processes payment
       ├─ Webhook  POST /api/webhooks/cashfree   ← authoritative, HMAC-verified
       └─ Redirect /booking/confirm?order_id=...  ← re-checks order via Get Order API
  → status flips to "verified" (idempotent), receipt PDF auto-downloads,
    booking appears automatically in the admin panel.
```
Memberships work identically via `/membership/confirm`.

Key code (for reference): `src/lib/cashfree.ts`, `src/lib/cashfree-checkout.ts`,
`src/app/api/webhooks/cashfree/route.ts`, order/confirm actions in
`src/lib/actions/booking.ts` & `src/lib/actions/membership.ts`, migration
`supabase/migrations/20260702120000_cashfree_payments.sql`.

---

## 1. 🧑 Create a Cashfree account & get API keys

1. Sign up / log in at **https://merchant.cashfree.com**.
2. Complete KYC/business onboarding (required before you can accept **live** payments;
   **sandbox** works immediately without KYC).
3. Switch the dashboard environment using the **Test / Production** toggle (top of the dashboard).
   - Start in **Test (Sandbox)** for development.
4. Go to **Developers → API Keys** (a.k.a. "Payment Gateway → Credentials").
5. Copy the two values for the current environment:
   - **App ID** (a.k.a. `x-client-id`) → this is `CASHFREE_APP_ID`.
   - **Secret Key** (a.k.a. `x-client-secret`) → this is `CASHFREE_SECRET_KEY`.
   - ⚠️ The **Secret Key doubles as the webhook signature secret** — there is no separate
     webhook secret to configure.
6. Keep the **Sandbox** and **Production** key pairs separate — they are different values.

> Never paste the Secret Key into chat, commit it, or expose it to the browser.

---

## 2. Environment variables

### 2.1 The variables

| Variable | Scope | Required | What it is |
|---|---|---|---|
| `CASHFREE_APP_ID` | **Server only** | ✅ | Cashfree App ID (`x-client-id`). |
| `CASHFREE_SECRET_KEY` | **Server only** | ✅ | Cashfree Secret Key (`x-client-secret`) — also the webhook HMAC secret. |
| `NEXT_PUBLIC_CASHFREE_MODE` | Public | ✅ | `sandbox` or `production`. Selects the SDK + API base URL for **both** browser and server. |
| `NEXT_PUBLIC_SITE_URL` | Public | ✅ | Absolute base URL of the deployment (already used by the app). Builds the Cashfree `return_url` and `notify_url`. **Must** be the real https URL in production. |
| `CASHFREE_API_VERSION` | Server only | Optional | Pin the Cashfree API version. Defaults to `2025-01-01` in code — leave unset unless Cashfree tells you otherwise. |

Only the `NEXT_PUBLIC_*` vars reach the browser. `CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY`
stay server-side (same pattern as `SUPABASE_SERVICE_ROLE_KEY`).

### 2.2 🤖 Local development — `.env.local`

Add to `.env.local` (this file is git-ignored; **never commit it**). Use **sandbox** keys:

```bash
# Cashfree (sandbox)
CASHFREE_APP_ID="TEST_xxxxxxxxxxxxxxxxxxxxx"
CASHFREE_SECRET_KEY="cfsk_ma_test_xxxxxxxxxxxxxxxxxxxxx"
NEXT_PUBLIC_CASHFREE_MODE="sandbox"

# Site URL — for local webhooks this must be your ngrok/tunnel URL (see §5),
# otherwise Cashfree cannot POST to /api/webhooks/cashfree.
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

The template with comments is in `.env.example`. After editing `.env.local`, restart `npm run dev`.

### 2.3 🧑 Production — Vercel

In **Vercel → Project → Settings → Environment Variables**, add (Environment: **Production**,
and Preview if you use preview deploys) with **production** keys:

```
CASHFREE_APP_ID           = <live app id>
CASHFREE_SECRET_KEY       = <live secret key>
NEXT_PUBLIC_CASHFREE_MODE = production
NEXT_PUBLIC_SITE_URL      = https://your-production-domain.com
```

Redeploy after changing env vars (Vercel does not hot-reload them).

---

## 3. 🤖 Apply the database migration

The migration adds gateway columns (`cashfree_order_id`, `cf_payment_id`, `paid_at`,
`payment_method`) to `appointments` and `payments`, plus a `payment_events` idempotency table.

> ⚠️ **Apply it to the LIVE Supabase project `wvosbrierwuwjgiplksz`.**
> Do **NOT** use the Supabase MCP — it points at a different project. `supabase/config.toml`
> also references a different ref, so `supabase db push` may target the wrong project unless linked.

**Option A — Supabase SQL Editor (simplest, no CLI):**
1. Open the project `wvosbrierwuwjgiplksz` at https://supabase.com/dashboard.
2. SQL Editor → New query → paste the entire contents of
   `supabase/migrations/20260702120000_cashfree_payments.sql` → **Run**.
   (It is idempotent and additive — safe to re-run.)

**Option B — Supabase CLI:**
```bash
supabase link --project-ref wvosbrierwuwjgiplksz
supabase db push
```

**After applying:** the generated types in `src/integrations/supabase/types.ts` were already
hand-updated to match. If you later regenerate them, run against the correct project:
```bash
supabase gen types typescript --project-id wvosbrierwuwjgiplksz > src/integrations/supabase/types.ts
```

---

## 4. 🧑 Register the webhook in Cashfree

1. Dashboard → **Developers → Webhooks** (per environment — do this for **both** Sandbox and Production).
2. Add a new webhook endpoint URL:
   - Sandbox: `https://<your-ngrok-domain>/api/webhooks/cashfree`
   - Production: `https://your-production-domain.com/api/webhooks/cashfree`
3. Subscribe to at least these events:
   - `PAYMENT_SUCCESS_WEBHOOK` (required — this is what confirms bookings)
   - `PAYMENT_FAILED_WEBHOOK`
   - `PAYMENT_USER_DROPPED_WEBHOOK`
4. Save. Use the dashboard's **"Test"** button to send a sample event and confirm the endpoint
   returns **200**. A `401` means the signature check failed (usually a wrong/rotated Secret Key).

No separate webhook secret is entered anywhere — signature verification uses `CASHFREE_SECRET_KEY`.

---

## 5. 🤖 Local webhook testing (tunnel)

Cashfree can't reach `localhost`, so expose it:
```bash
# terminal 1
npm run dev
# terminal 2 — install ngrok first (https://ngrok.com)
ngrok http 3000
```
Then:
1. Set `NEXT_PUBLIC_SITE_URL` in `.env.local` to the ngrok https URL and restart `npm run dev`
   (so `return_url`/`notify_url` point at the tunnel).
2. Register `https://<ngrok>.ngrok-free.app/api/webhooks/cashfree` as the sandbox webhook (§4).

> Without a tunnel you can still test the happy path — the **return page** re-checks the order
> via the Get Order API and confirms the booking even if the webhook never arrives. The webhook
> only matters for reliability (e.g. the user closing the tab before redirect).

---

## 6. 🧑 Sandbox test payments

On the Cashfree hosted checkout in sandbox, use Cashfree's test instruments. As of writing:
- **UPI:** `testsuccess@gocash` (succeeds) / `testfailure@gocash` (fails).
- **Card:** `4111 1111 1111 1111`, any future expiry, any CVV; OTP `111000`.

⚠️ These test values change occasionally — confirm against the current
**Cashfree sandbox / test-data docs** if one stops working.

### What to verify
- [ ] Book → "Pay ₹50 securely" → Cashfree page → pay success → lands on `/booking/confirm`
      showing **Confirmed**, receipt PDF auto-downloads.
- [ ] Booking appears automatically under **Admin → Bookings** as "Confirmed" (no verification tab).
- [ ] Tamper a webhook body in the dashboard test tool → endpoint returns **401**.
- [ ] Replay the same success webhook / refresh the confirm page → still exactly one confirmed
      booking (idempotent), one `payment_events` row per payment.
- [ ] Pay-failure / user-drop → booking stays hidden and the slot frees on the reclaim
      schedule (see `PENDING_HOLD_MINUTES` / `PAYING_HOLD_MINUTES` in `src/lib/salon-data.ts`).
- [ ] Membership: same end-to-end via `/membership/confirm`; the member then gets 50% off nail art.

---

## 7. 🧑 Going live (production checklist)

1. Complete Cashfree KYC and activate the production account.
2. Put **production** `CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY` in Vercel, set
   `NEXT_PUBLIC_CASHFREE_MODE=production`, and set `NEXT_PUBLIC_SITE_URL` to the real domain.
3. Register the **production** webhook URL (§4) and send a test event.
4. Redeploy on Vercel.
5. Do one real low-value live transaction end-to-end and confirm it in the admin panel + Cashfree
   dashboard, then refund it if desired.

---

## 8. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Order creation error "Cashfree is not configured" | `CASHFREE_APP_ID`/`CASHFREE_SECRET_KEY` missing in the running environment. Restart after editing `.env.local`. |
| Order creation fails with a Cashfree 401/auth error | Wrong keys for the selected mode (sandbox keys with `NEXT_PUBLIC_CASHFREE_MODE=production`, or vice-versa). |
| Redirect goes to Cashfree but returns to a broken/blank page | `NEXT_PUBLIC_SITE_URL` is wrong — `return_url` was built from it. |
| Webhook returns 401 | Signature mismatch — `CASHFREE_SECRET_KEY` is wrong or was rotated in the dashboard. |
| Booking not confirming, no webhook locally | No tunnel — either add ngrok (§5) or rely on the return-page confirmation. |
| Confirm page says "Payment processing…" | Order status is still `ACTIVE` (payment not completed). Refresh; or the payment failed/was dropped. |
| DB error about unknown column `cashfree_order_id` | Migration not applied to `wvosbrierwuwjgiplksz` (§3). |
| Slot got freed while a slow UPI payment was in progress | Shouldn't happen any more. A hold with a Cashfree order is never deleted — after `PAYING_HOLD_MINUTES` it is expired in place to `rejected` + `HOLD_EXPIRED_REASON`, and `settleBookingPayment` revives it when the payment lands. If the slot was genuinely retaken meanwhile, the customer sees the "we've received your payment" screen and the event stays `processed = false` in `payment_events` for manual reconciliation. |
| Customer says they paid but has no booking | `select * from payment_events where processed = false order by received_at desc` — that is the reconciliation queue. Cross-check the `order_id` in the Cashfree dashboard, then either rebook the slot manually or refund from the dashboard (there is no refund API integration). |

---

## 9. Security notes (already implemented in code)

- **Amounts are computed server-side** (`BOOKING_FEE` / `MEMBERSHIP_PRICE`); the client value is ignored.
- **Webhook signature** verified with HMAC-SHA256 (`timestamp + rawBody`, constant-time compare); bad signature → 401.
- **The return page never trusts redirect params** — it re-fetches the order from Cashfree (Get Order) before confirming.
- **Idempotent**: guarded `WHERE payment_status = 'pending_payment'` updates + a unique `cf_payment_id` in `payment_events`. The webhook and the return page converge safely.
- **Secrets** (`CASHFREE_APP_ID`/`CASHFREE_SECRET_KEY`) are server-only; the browser only ever receives a `payment_session_id` + `NEXT_PUBLIC_CASHFREE_MODE`.

---

## 10. Loading your Cashfree data into the env (with Claude)

### What Claude can and can't do
- ❌ **Claude cannot read your keys from the Cashfree dashboard.** The Secret Key is shown only
  to a logged-in human in the Cashfree UI, and Cashfree has **no API to list your own API keys**
  without already holding valid credentials. So the two values must be **copied by you once**.
- ✅ Once you provide them, Claude **can**: write/format `.env.local`, set the derived public vars,
  and **verify the keys actually work** by calling the Cashfree sandbox API — then tell you exactly
  what to set on Vercel.

### Step A — 🧑 copy the two values
Cashfree Dashboard → **Test/Sandbox** toggle → **Developers → API Keys** → copy:
- **App ID** → `CASHFREE_APP_ID`
- **Secret Key** → `CASHFREE_SECRET_KEY`

### Step B — hand them to Claude (pick one)
- **Option 1 — most private (recommended):** paste the two values into `.env.local` yourself
  (see §2.2 format), then tell Claude: *"verify my Cashfree keys"*. The secret never enters the
  chat transcript.
- **Option 2 — convenient:** paste the two values in a message and ask Claude to write `.env.local`.
  The secret then lives in the chat history — **rotate it later** in the Cashfree dashboard if that
  matters to you.

**Ready-to-paste prompt for Claude (Option 2):**
> Set up my Cashfree sandbox env. App ID: `PASTE_APP_ID`  Secret Key: `PASTE_SECRET_KEY`.
> Write them into `.env.local` (create it if missing) with `NEXT_PUBLIC_CASHFREE_MODE=sandbox`,
> keep my existing `NEXT_PUBLIC_SITE_URL` and Supabase vars untouched, then verify the keys work
> by running the Cashfree verification script. Do not print the secret key back to me.

### Step C — 🤖 Claude verifies the keys
A verification script is included at `scripts/verify-cashfree.mjs`. It creates a throwaway
**sandbox** order (amount ₹1, never paid — it just expires) and confirms the keys are accepted:

```bash
# Node 20.6+/22 loads .env.local via --env-file
node --env-file=.env.local scripts/verify-cashfree.mjs
```
- ✅ `Cashfree keys valid (sandbox). Created test order …` → you're good.
- ❌ `Cashfree rejected the request (HTTP 401)` → wrong keys, or keys don't match the mode
  (sandbox keys with `NEXT_PUBLIC_CASHFREE_MODE=production`, or vice-versa).

> Only run the verifier while `NEXT_PUBLIC_CASHFREE_MODE=sandbox`. It never prints the secret.

### Step D — 🧑 production keys (Claude can't set these)
Claude cannot write Vercel's environment for you unless the `vercel` CLI is already logged in on
this machine. Normally you set the **production** keys yourself in
**Vercel → Settings → Environment Variables** (see §2.3) and redeploy. If `vercel` CLI *is*
authenticated, you may ask Claude to run:
```bash
vercel env add CASHFREE_APP_ID production
vercel env add CASHFREE_SECRET_KEY production
vercel env add NEXT_PUBLIC_CASHFREE_MODE production   # value: production
```
(each prompts for the value), then `vercel deploy --prod`.
