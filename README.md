# Rashi Nail Art Studio

A production-ready salon appointment-booking platform — **Next.js 14+ (App Router)**, **TypeScript (strict)**, **Tailwind v4 + shadcn/ui**, **Supabase** (Auth, Postgres, RLS, Storage) with **manual UPI + screenshot-verified** payments. Migrated from the original TanStack Start app (see [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md)).

Branches: **Vile Parle · Bandra · Kandivali** (Mumbai).

---

## ✨ Features

**Customers (no account needed — guest/phone-based)**
- Marketing landing page (hero, services, gallery, membership, branches, testimonials, FAQ) with subtle motion and SEO/JSON-LD.
- Smart booking form (react-hook-form + zod): cascading **branch → stylist → date → time-slot** with **live availability** (booked slots disabled, no double-booking).
- **₹50 booking fee** paid over **manual UPI**: the slot is held immediately, the customer pays via QR / UPI ID and uploads a payment screenshot, and an **admin verifies it by hand** before the booking is confirmed. Form details survive a refresh.
- **₹100 one-year membership** → **50% off nail-art services** (same UPI + verification flow). Benefits **activate 10 days** after the payment is verified; members are auto-detected by phone and the discount is applied automatically.

**Staff / Manager / Admin (Supabase Auth)**
- **Admin**: a **Payments / Verification** queue (verify or reject uploaded UPI proofs, view full-size screenshots via signed URLs), revenue analytics (recharts, counts **only verified** bookings/memberships + a **Pending verification** stat), bookings table (filter by date/branch/staff/status, complete/cancel/delete, **CSV export**), members list (activation/expiry), a **Settings** tab to edit the **UPI ID / payee / QR** live, manage **services, time slots, branches, stylists**, and **team logins**.
- **Manager**: branch-scoped bookings with **payment status + screenshot view (view-only)**, members, stylists and team.
- **Staff**: their own appointments + “mark complete”.
- Routes protected by middleware; fine-grained role checks in each dashboard layout; **RLS on every table**.

---

## 🧱 Tech stack

| Area | Choice |
|---|---|
| Framework | Next.js 15 (App Router, RSC, Server Actions) |
| Language | TypeScript (`strict`, no `any`) |
| Styling | Tailwind v4 (`@tailwindcss/postcss`) + shadcn/ui |
| Data/Auth | Supabase (`@supabase/ssr`) — Postgres, RLS, Auth |
| Payments | Manual UPI + screenshot upload → admin verification (Supabase Storage, signed URLs) |
| Forms | react-hook-form + zod |
| Charts | recharts · Motion: framer-motion |
| Deploy | Vercel |

---

## 🚀 Quick start

```bash
# 1. install (an .npmrc sets legacy-peer-deps for React 19 peers)
npm install

# 2. configure env
cp .env.example .env.local   # then fill in real values (see below)

# 3. run
npm run dev                  # http://localhost:3000
```

`npm run build` produces a clean production build; `npm run start` serves it.

---

## 🔑 Environment variables

Copy `.env.example` → `.env.local` and fill these in. **Never commit `.env.local`.**

| Variable | Scope | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon/publishable key |
| `SUPABASE_URL` | server | Same project URL (server-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server, secret** | Service-role key — used by server actions for trusted writes + proof storage. Bypasses RLS. |
| `NEXT_PUBLIC_SITE_URL` | public | Public base URL (SEO/canonical) |

> 💡 There are **no payment-gateway secrets**. The UPI ID, payee name and QR image live in the `app_settings` table and are edited in **Admin → Settings**.

> ⚠️ **Rotate the old anon key.** The original project committed an anon key to git history. Generate a fresh one in Supabase → Project Settings → API and update `.env.local` / Vercel.

---

## 🗄️ Supabase setup

The app reuses the existing project. Migrations live in [`supabase/migrations/`](./supabase/migrations):

1. `…_auth_supabase_profiles.sql` — `profiles` table (1:1 with `auth.users`), role helpers (`my_role`, `is_admin`, …), a trigger that creates a profile from auth metadata, and profile RLS.
2. `…_management_tables_activation_guard.sql` — `services`, `time_slots`, `branches` (seeded), `memberships.activation_date` (purchase + 10 days), and the `uq_appointment_slot` unique index that guarantees **one non-cancelled booking per slot**.
3. `…_rls_policies.sql` — Row Level Security for every table.
4. `…_manual_upi_verification.sql` — the manual-UPI flow: new `payment_status` enum (`pending_payment → payment_uploaded → verified / rejected`, + `cancelled`), proof/verification columns on `appointments` and `payments`, the `app_settings` table (UPI ID / payee / QR), the private **`payment-proofs`** storage bucket + policies, and a rebuilt `uq_appointment_slot` that frees `rejected`/`cancelled` slots. Drops the old Razorpay columns.

### Apply the migrations

**Option A — Supabase CLI (recommended):**
```bash
supabase link --project-ref <your-project-ref>
supabase db push          # applies the new migrations
```

**Option B — Dashboard:** open the SQL editor and run the three files **in filename order**.

> If `uq_appointment_slot` fails to create, you have pre-existing duplicate bookings for the same slot — resolve those rows first, then re-run.

### Create the first admin

Supabase Auth uses **email + password**. Seed an admin with the service-role key:

```bash
node --env-file=.env.local scripts/seed-admin.mjs admin@rashi.studio 'StrongPass#123'
# staff/manager: node --env-file=.env.local scripts/seed-admin.mjs divya@rashi.studio 'Pass#123' staff 'Vile Parle' Divya
```

The `on_auth_user_created` trigger creates the matching `profiles` row from the metadata. After that, admins/managers can create more team logins from the dashboard **Team** tab.

> The old `app_users` table (sha256 + localStorage) is **deprecated** and unused. Existing staff passwords can’t be migrated — recreate logins via the seed script / Team tab.

### Regenerating types

`src/integrations/supabase/types.ts` is hand-maintained here (the new tables were added by hand). After applying migrations you can regenerate it:
```bash
supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts
```

---

## 💳 Manual UPI payments + verification

No payment gateway. The flow:

1. **Customer books** → the slot is held immediately as `pending_payment` (the booking row stores all form data, no details lost on refresh — they're mirrored to `sessionStorage`).
2. A **payment screen** shows the studio's **QR code** + **UPI ID** (with a copy button) + the exact **amount** and instructions. The customer pays in any UPI app and **uploads a screenshot** (validated client- and server-side: image only, ≤ 5 MB).
3. The screenshot is uploaded — via a **service-role server action** — to the private **`payment-proofs`** bucket, and the booking flips to `payment_uploaded` (awaiting verification). The slot stays held.
4. **Admin → Payments** lists everything awaiting verification (newest first) with client/branch/date/slot/service/amount and the screenshot (signed URL, full-size). Admin **Verifies** (→ `verified`, slot finalized, `notifyCustomer()` stub fired) or **Rejects** with a reason (→ `rejected`, slot released).
5. Memberships use the same flow; on verify the membership is created with the **10-day activation** rule.

**Slot hold rule:** `pending_payment`, `payment_uploaded` and `verified` all hold a slot; `rejected`/`cancelled` free it. An abandoned `pending_payment` (never uploaded a proof, older than 30 min) is reclaimed when someone else books that exact slot.

**Configuring UPI:** set the **UPI ID / payee name / QR image** in **Admin → Settings** (stored in `app_settings`, no redeploy). The placeholder QR is [`public/upi-qr.svg`](./public/upi-qr.svg) — replace it (e.g. with `/upi-qr.png`) or point the setting at a full URL.

**Security:** customers are anonymous, so uploads and reads go through service-role server actions and the bucket has **no public/anon policy** — proofs can't be listed or fetched directly; admin/manager view them via short-lived signed URLs. The unguessable appointment/payment UUID is the customer's upload capability.

**Notifications** are a stub: [`src/lib/notify.ts`](./src/lib/notify.ts) `notifyCustomer()` logs intent — wire a real SMS/WhatsApp provider where marked `TODO(notify)`.

---

## ▲ Deploy to Vercel

1. Push the branch and import the repo in Vercel (Next.js is auto-detected — no `vercel.json` needed).
2. Add **all** environment variables (above) in Project → Settings → Environment Variables.
3. Apply the migrations (incl. the `payment-proofs` bucket), set `NEXT_PUBLIC_SITE_URL` to your domain, then set your real UPI ID / QR in **Admin → Settings**.

---

## 🔐 Roles, auth & RLS

- Roles: **`admin` · `manager` · `staff`** (in `profiles.role`). Customers are **not** users — bookings are guest/phone-based.
- Reads of public catalogs (services/time-slots/branches/staff) are open to `anon` for the booking form; **appointments/memberships/payments are restricted** to internal roles and scoped by branch.
- Privileged writes (create booking, upload proof, verify/reject, membership, team) run through **service-role server actions** that first verify the caller’s role server-side; RLS is defense-in-depth. The `payment-proofs` bucket is private — only admin/manager read it, via signed URLs.

---

## 📁 Project structure

```
src/
  app/                  # App Router: landing (/), /login, /admin, /manager, /staff
  components/
    ui/                 # shadcn/ui
    booking/            # booking form + membership dialog + payment screen (QR/UPI/upload)
    admin/              # dashboard panels (overview, payments, bookings, members, manage, settings, team, staff)
    landing/            # reveal (motion), faq
  lib/
    supabase/           # browser / server / admin clients + middleware
    actions/            # server actions: auth, booking, membership, admin
    validations/        # zod schemas
    auth.ts catalog.ts payment-proofs.ts payments-core.ts notify.ts salon-data.ts export-csv.ts utils.ts
  integrations/supabase/types.ts
supabase/migrations/    # SQL (apply via CLI/dashboard)
scripts/seed-admin.mjs  # create the first internal user
middleware.ts           # session refresh + route protection
```

---

## 📝 Notes

- `npm run build` is clean (TypeScript strict + ESLint).
- This is a migration from TanStack Start → Next.js; the original server logic is preserved for reference in `.migration-reference/` (gitignored).
- Payments are **manual UPI + admin-verified screenshot** (the earlier Razorpay gateway was removed). The ₹50 fee gates booking confirmation and the 10-day membership activation is enforced after verification. Slot capacity is a hard **1 per slot** (the old peak-season “capacity 2” was dropped).
