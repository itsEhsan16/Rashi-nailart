# Rashi Nail Art Studio

A production-ready salon appointment-booking platform — **Next.js 14+ (App Router)**, **TypeScript (strict)**, **Tailwind v4 + shadcn/ui**, **Supabase** (Auth, Postgres, RLS) and **Razorpay** payments. Migrated from the original TanStack Start app (see [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md)).

Branches: **Vile Parle · Bandra · Kandivali** (Mumbai).

---

## ✨ Features

**Customers (no account needed — guest/phone-based)**
- Marketing landing page (hero, services, gallery, membership, branches, testimonials, FAQ) with subtle motion and SEO/JSON-LD.
- Smart booking form (react-hook-form + zod): cascading **branch → stylist → date → time-slot** with **live availability** (booked slots disabled, no double-booking).
- **₹50 booking fee** via Razorpay — the slot is only confirmed after **server-side signature verification**.
- **₹100 one-year membership** → **50% off nail-art services**. Benefits **activate 10 days** after purchase; members are auto-detected by phone and the discount is applied automatically.

**Staff / Manager / Admin (Supabase Auth)**
- **Admin**: revenue analytics (recharts), bookings table (filter by date/branch/staff/status, complete/cancel/delete, **CSV export**), members list (activation/expiry), manage **services, time slots, branches, stylists**, and **team logins**.
- **Manager**: branch-scoped bookings, members, stylists and team.
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
| Payments | Razorpay (REST orders + HMAC verification + webhook) |
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
| `SUPABASE_SERVICE_ROLE_KEY` | **server, secret** | Service-role key — used by server actions/webhook for trusted writes. Bypasses RLS. |
| `RAZORPAY_KEY_ID` | server | Razorpay key id (also returned to the client to open checkout) |
| `RAZORPAY_KEY_SECRET` | **server, secret** | Razorpay key secret — signs/verifies payments |
| `RAZORPAY_WEBHOOK_SECRET` | **server, secret** | Secret set when creating the Razorpay webhook |
| `NEXT_PUBLIC_SITE_URL` | public | Public base URL (SEO/canonical) |

> ⚠️ **Rotate the old anon key.** The original project committed an anon key to git history. Generate a fresh one in Supabase → Project Settings → API and update `.env.local` / Vercel.

---

## 🗄️ Supabase setup

The app reuses the existing project. Three new migrations live in [`supabase/migrations/`](./supabase/migrations):

1. `…_auth_supabase_profiles.sql` — `profiles` table (1:1 with `auth.users`), role helpers (`my_role`, `is_admin`, …), a trigger that creates a profile from auth metadata, and profile RLS.
2. `…_management_tables_activation_guard.sql` — `services`, `time_slots`, `branches` (seeded), `memberships.activation_date` (purchase + 10 days), and the `uq_appointment_slot` unique index that guarantees **one non-cancelled booking per slot**.
3. `…_rls_policies.sql` — Row Level Security for every table.

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

## 💳 Razorpay setup

1. Get **Key ID** and **Key Secret** (use **test** keys in dev) → set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
2. Create a **webhook** pointing to `https://<your-domain>/api/webhooks/razorpay`, subscribe to `payment.captured`, `order.paid`, `payment.failed`, set a secret → put it in `RAZORPAY_WEBHOOK_SECRET`.

Payment flow: client opens checkout → on success the server **verifies the HMAC signature** (`/lib/actions/payments.ts`) and fulfils the order; the **webhook** is the source of truth and is idempotent. The client is never trusted.

---

## ▲ Deploy to Vercel

1. Push the branch and import the repo in Vercel (Next.js is auto-detected — no `vercel.json` needed).
2. Add **all** environment variables (above) in Project → Settings → Environment Variables.
3. Deploy. Then set the Razorpay webhook URL to `https://<your-vercel-domain>/api/webhooks/razorpay` and set `NEXT_PUBLIC_SITE_URL` to your domain.

The webhook route runs on the Node.js runtime (raw-body HMAC); everything else uses the default runtimes.

---

## 🔐 Roles, auth & RLS

- Roles: **`admin` · `manager` · `staff`** (in `profiles.role`). Customers are **not** users — bookings are guest/phone-based.
- Reads of public catalogs (services/time-slots/branches/staff) are open to `anon` for the booking form; **appointments/memberships/payments are restricted** to internal roles and scoped by branch.
- Privileged writes (create booking + payment, verify, membership, team) run through **service-role server actions** that first verify the caller’s role server-side; RLS is defense-in-depth.

---

## 📁 Project structure

```
src/
  app/                  # App Router: landing (/), /login, /admin, /manager, /staff, /api/webhooks/razorpay
  components/
    ui/                 # shadcn/ui
    booking/            # booking form + membership dialog
    admin/              # dashboard panels (overview, bookings, members, manage, team, staff)
    landing/            # reveal (motion), faq
  lib/
    supabase/           # browser / server / admin clients + middleware
    actions/            # server actions: auth, booking, payments, membership, admin
    razorpay/           # server-only Razorpay helpers
    validations/        # zod schemas
    auth.ts catalog.ts payments-core.ts salon-data.ts export-csv.ts utils.ts
  integrations/supabase/types.ts
supabase/migrations/    # SQL (apply via CLI/dashboard)
scripts/seed-admin.mjs  # create the first internal user
middleware.ts           # session refresh + route protection
```

---

## 📝 Notes

- `npm run build` is clean (TypeScript strict + ESLint).
- This is a migration from TanStack Start → Next.js; the original server logic is preserved for reference in `.migration-reference/` (gitignored).
- Two behavioural improvements over the original: the ₹50 fee now actually gates booking confirmation (was a free insert), and the 10-day membership activation is now enforced. Slot capacity is a hard **1 per slot** (the old peak-season “capacity 2” was dropped).
