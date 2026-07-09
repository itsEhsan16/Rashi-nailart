# Rashi Nail Art Studio

A production-ready salon appointment-booking platform — **Next.js 14+ (App Router)**, **TypeScript (strict)**, **Tailwind v4 + shadcn/ui**, **Supabase** (Auth, Postgres, RLS, Storage) with **Cashfree online payments** (auto-confirmed via return page + webhook). Migrated from the original TanStack Start app (see [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md)).

Branches: **Vile Parle · Bandra** — in **Mumbai**.

---

## ✨ Features

**Customers (no account needed — guest/phone-based)**
- Marketing landing page (hero, services, gallery, membership, branches, testimonials, FAQ) with subtle motion and SEO/JSON-LD.
- Smart booking form (react-hook-form + zod): cascading **branch → stylist → date → time-slot** with **live availability** (booked slots disabled, no double-booking).
- **₹50 booking fee** paid online via **Cashfree hosted checkout**: the slot is held immediately, the customer pays, and the booking **auto-confirms** (Cashfree return page + webhook reconcile the payment — no manual verification). Form details survive a refresh / return from the payment page.
- **No cancellation facility** — once a slot is booked it's confirmed and locked in, and the ₹50 fee is non-refundable (surfaced in the FAQ + confirmation screen).
- **₹100 one-year membership** (same Cashfree flow). Members are auto-detected by phone at booking; the **member discount is settled in-store by staff**, not auto-applied online.

**Staff / Manager / Admin (Supabase Auth)**
- **Admin**: month-scoped revenue analytics (recharts — booking fees, in-store service + extras, memberships), bookings table (filter by date/branch/staff/status, complete/cancel/delete, **CSV export**), members list (activation/expiry), a **Settings** tab, and full management of **services, time slots, branches, stylists, team logins** and **staff salaries/payroll**.
- **Manager**: branch-scoped bookings and overview, members, stylists, team, and payroll for their branch.
- **Staff**: their own auto-sorting task list (what's next on top), **mark complete**, add **in-store extras**, record how the customer paid, and month-scoped **earnings + 10% commission** and **net salary**.
- **In-studio service change** (stylist/manager/admin): swap a confirmed booking's base service when the customer changes their mind on arrival — it re-prices automatically so earnings/revenue follow what was actually done.
- **Booking reassignment** (manager/admin): move a walk-in to another available artist; the original artist keeps a read-only "reassigned to…" trace and the revenue follows the new artist.
- **Cancel/free a slot** (manager/admin, any time) for no-shows and operational fixes.
- Routes protected by middleware; fine-grained role checks in each dashboard layout; **RLS on every table**.

---

## 🧱 Tech stack

| Area | Choice |
|---|---|
| Framework | Next.js 15 (App Router, RSC, Server Actions) |
| Language | TypeScript (`strict`, no `any`) |
| Styling | Tailwind v4 (`@tailwindcss/postcss`) + shadcn/ui |
| Data/Auth | Supabase (`@supabase/ssr`) — Postgres, RLS, Auth |
| Payments | Cashfree hosted checkout → auto-confirm (return page + webhook, HMAC-verified) |
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
| `SUPABASE_SERVICE_ROLE_KEY` | **server, secret** | Service-role key — used by server actions for trusted writes. Bypasses RLS. |
| `NEXT_PUBLIC_SITE_URL` | public | Public base URL (SEO/canonical + Cashfree return/webhook URL) |
| `CASHFREE_APP_ID` | **server, secret** | Cashfree app id (SANDBOX keys locally) |
| `CASHFREE_SECRET_KEY` | **server, secret** | Cashfree secret — also the webhook HMAC secret |
| `NEXT_PUBLIC_CASHFREE_MODE` | public | `sandbox` \| `production` |
| `CASHFREE_API_VERSION` | server, optional | Pin the Cashfree API version (defaults to `2025-01-01`) |

> 💳 **Cashfree** collects the ₹50 booking fee and ₹100 membership. Register the webhook at **`{NEXT_PUBLIC_SITE_URL}/api/webhooks/cashfree`** (locally, tunnel it with ngrok). See [`CASHFREE_SETUP.md`](./CASHFREE_SETUP.md) for the full setup.

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

## 💳 Cashfree payments (auto-confirm)

Payments go through **Cashfree hosted checkout** — no screenshots, no manual verification. The flow (see [`CASHFREE_SETUP.md`](./CASHFREE_SETUP.md) for the full guide):

1. **Customer books** → the slot is held immediately as `pending_payment` (all form data lives on the booking row, so nothing is lost on refresh or when leaving for the payment page).
2. A **Cashfree order** is created server-side and the customer is redirected to Cashfree's **hosted checkout** to pay the ₹50 fee.
3. On return, **`/booking/confirm`** reconciles the order and, once Cashfree reports success, flips the booking to **`verified`** automatically. The **webhook** at `/api/webhooks/cashfree` (HMAC-verified with the secret key) is the authoritative backstop if the customer never returns.
4. Memberships use the same flow and are created on confirmation.

**Slot hold rule:** `pending_payment` and `verified` (plus the legacy `payment_uploaded`) hold a slot; `rejected`/`cancelled` free it. An abandoned `pending_payment` (fee never paid) is reclaimed after a short hold when someone else books that exact slot.

> ℹ️ `payment_uploaded` is a **legacy** status from the earlier manual-UPI flow — no longer written, kept only so historical rows render. The old `payment-proofs` bucket and UPI settings are likewise legacy.

**Notifications** are a stub: [`src/lib/notify.ts`](./src/lib/notify.ts) `notifyCustomer()` logs intent — wire a real SMS/WhatsApp provider where marked `TODO(notify)`.

---

## ▲ Deploy to Vercel

1. Push the branch and import the repo in Vercel (Next.js is auto-detected — no `vercel.json` needed).
2. Add **all** environment variables (above, incl. the Cashfree keys) in Project → Settings → Environment Variables.
3. Apply the migrations, set `NEXT_PUBLIC_SITE_URL` to your domain, switch `NEXT_PUBLIC_CASHFREE_MODE` to `production`, and register the webhook `{NEXT_PUBLIC_SITE_URL}/api/webhooks/cashfree` in the Cashfree dashboard.

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
    booking/            # booking form + membership dialog + Cashfree pay screen + confirm
    dashboard/          # shared booking dialogs (extras, reassign, change-service) + widgets
    admin/              # dashboard panels (overview, bookings, members, manage, settings, team, staff)
    staff/              # staff dashboard: task list, earnings/commission, salary
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
- Payments are **Cashfree hosted checkout with auto-confirm** (the earlier manual-UPI screenshot flow, and before it Razorpay, were removed). The ₹50 fee gates booking confirmation; the member discount is settled in-store. Slot capacity is a hard **1 per slot**.
