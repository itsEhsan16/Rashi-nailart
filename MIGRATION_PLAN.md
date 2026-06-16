# Migration Plan — Rashi Nail Art Studio → Next.js 14+ (App Router)

> **STEP 0 audit.** This documents the *actual* state of the existing app (not the
> description), what I'll port as-is, what I'll fix/build, the target architecture, and
> the open decisions I need from you before writing code.

---

## 0. TL;DR — the most important findings

1. **This is not a "Vite/React" app — it's a [TanStack Start](https://tanstack.com/start) app** (full-stack React framework on Vite). It already has SSR, file-based routes, and server functions (`createServerFn`) — which map cleanly onto Next.js App Router routes + Server Actions. The migration is framework→framework, not "add a backend."
2. **The ₹50 booking payment is NOT actually wired into the UI.** The booking form does a **free** direct insert. The Razorpay order/verify/webhook code exists server-side but **nothing calls it**. The membership "Buy" button is a stub toast. → These will be *built/wired*, not "preserved."
3. **Auth is a custom username/password system, not Supabase Auth.** Unsalted SHA‑256 hashes in an `app_users` table, session in `localStorage`. There's dead Supabase-Auth scaffolding that's never wired in. Roles are **`admin` / `manager` / `staff`** — there is **no `customer` role** and there **is a `manager` role** (the task lists `customer/staff/admin`). This is the biggest decision (see §7).
4. **The "10-day membership activation" is advertised in UI text but not enforced** anywhere in code. There's no `activation_date` column.
5. **Secrets are committed:** `.env` is tracked in git and holds the live Supabase URL + anon key. It's also **missing** `SUPABASE_SERVICE_ROLE_KEY` and all Razorpay keys, so the app can't actually run end-to-end locally today.
6. **Current deploy target is Cloudflare Workers** (`wrangler.jsonc`, `@cloudflare/vite-plugin`), not Vercel.

---

## 1. Current tech stack (actual)

| Area | Current | Notes |
|---|---|---|
| Framework | TanStack Start `1.167.x` + TanStack Router | Vite 7, React 19 |
| Language | TypeScript 5.8, `strict: true` | path alias `@/*` |
| Styling | Tailwind v4 (CSS-first `@theme`), tw-animate-css | tokens in `src/styles.css` |
| UI | shadcn/ui ("new-york"), Radix, lucide, sonner | ~50 components already present |
| Data | Supabase JS `2.104`, Postgres + RLS | project `humefyuqwdruowtgzyin` |
| Forms | react-hook-form + zod + @hookform/resolvers | **installed but the booking form uses manual `useState` + `schema.safeParse`, not RHF** |
| Charts | recharts `2.15` | installed, **not used yet** |
| Payments | Razorpay REST (server) + checkout.js (client) | **server code present, UI not wired** |
| Pkg mgr | Bun (`bun.lockb`, `bunfig.toml`) + npm lockfile | Node v22.19 available |
| Deploy | Cloudflare Workers (`nodejs_compat`) | task wants **Vercel** |

## 2. Current routes & components

| Route | File | What it does |
|---|---|---|
| `/` | `src/routes/index.tsx` | Hero + membership banner + **booking form** (free insert), member auto-detect by phone, membership dialog (stub) |
| `/login` | `src/routes/login.tsx` | Username/password → `loginFn` → localStorage session → redirect by role |
| `/admin` | `src/routes/admin.tsx` | Tabs: Appointments (filter/delete/complete) + Credentials. Exports `AppointmentsView` (reused by manager) |
| `/manager` | `src/routes/manager.tsx` | Branch-scoped appointments + credentials (reuses `AppointmentsView`) |
| `/staff` | `src/routes/staff.tsx` | Card list of that staff member's appointments; "Mark Complete" |
| `/api/public/razorpay-webhook` | `src/routes/api/public/razorpay-webhook.ts` | HMAC-verified webhook → marks payment paid, confirms booking / creates membership |
| `__root` | `src/routes/__root.tsx` | HTML shell, SEO meta, fonts, Toaster |

Custom components: `DashboardShell`, `CredentialsManager`. Plus `src/components/ui/*` (shadcn).

## 3. Current Supabase schema (3 migrations)

**Enums:** `user_role = (admin, manager, staff)` · `branch = (Vile Parle, Bandra, Kandivali)`

| Table | Key columns | RLS today |
|---|---|---|
| `app_users` | `username`, `password_hash` (sha256), `role`, `branch`, `staff_name` | RLS on, **no client policies** (server-only via service role) |
| `staff` | `name`, `branch` (unique together) | **SELECT public** (booking form needs it); seeded 17 staff |
| `appointments` | client_name, phone, branch, appointment_date, time_slot, service, price, staff_name, special_requests, `payment_status (pending/paid/cancelled)`, `razorpay_order_id`, `is_member`, `discount_applied`, `completed`, `completed_at` | **INSERT public** (`WITH CHECK true`), no SELECT (server-only reads) |
| `memberships` | client_name, phone, `start_date`, `expires_at (+1yr)`, `active`, `amount_paid` | **SELECT public** (auto-detect at booking). *No `activation_date`.* |
| `payments` | purpose (membership/booking), amount, currency, status (created/paid/failed), razorpay_order_id, razorpay_payment_id, appointment_id, membership_id→FK, metadata | RLS on, **no client policies** (server-only) |

**Hardcoded in code, not in DB** (`src/lib/salon-data.ts`): the 3 branches, 6 time slots, 4 services + prices, ₹100 membership, ₹50 booking fee.

## 4. Booking flow end-to-end (what *actually* happens today)

```
User fills form (name, phone, branch→staff→date→slot, service, notes)
  → member auto-detected by phone (debounced checkMembershipFn)
  → submit calls bookAppointmentFn  ← FREE direct insert, NO payment
      • capacity check: 1 per slot (2 during Aug–Dec "peak season")
      • inserts appointment row directly
  → toast "confirmed", form resets
```

**Dormant (built but unreachable) payment path:**
`createBookingOrderFn` (Razorpay ₹50 order + pending appointment + payment row, member discount applied) and `createMembershipOrderFn` (₹100) exist, and `verifyPaymentFn` does **server-side HMAC signature verification** then flips `payment_status→paid` / creates membership. The webhook does the same idempotently. **None of this is invoked by the UI.**

## 5. Server functions inventory (`src/lib/*.functions.ts`)

`loginFn`, `bookAppointmentFn` (free), `getBookedSlotsFn`, `listAppointmentsFn` (role-scoped), `listStaffFn`, `addStaffFn`, `removeStaffFn`, `deleteAppointmentFn`, `completeAppointmentFn`, `listCredentialsFn`, `createCredentialFn`, `bulkCreateCredentialsFn`, `resetCredentialPasswordFn`, `deleteCredentialFn` · `checkMembershipFn`, `createMembershipOrderFn`, `createBookingOrderFn`, `verifyPaymentFn`. **All authz is done by re-reading `app_users.role` with the service-role client** (good pattern — easy to port to Server Actions).

## 6. Issues / risks I found (the "ambiguous logic" callouts)

| # | Issue | Plan |
|---|---|---|
| R1 | **Payment not wired** to booking/membership UI | Wire the existing `createBookingOrderFn`/`verifyPaymentFn` into the new flow; retire the free path (`bookAppointmentFn`) so bookings *require* the ₹50 payment |
| R2 | **10-day activation not enforced** | Add `memberships.activation_date = purchase + 10 days`; gate the 50% discount on `activation_date <= today AND expires_at >= today AND active` |
| R3 | **Double-booking race**: pending holds ignored by paid-only clash check; no DB constraint | Add a **partial unique index** on (branch, staff, date, slot) for non-cancelled bookings + transactional re-check; reconcile the two divergent capacity rules into one |
| R4 | **Committed live secrets** in tracked `.env` | Move to `.env.local` (gitignored), add `.env.example`, document **key rotation** in README. I will not commit any real key. |
| R5 | **Unsalted SHA-256** passwords, localStorage session | Depends on §7 auth decision (bcrypt + httpOnly cookie, or full Supabase Auth) |
| R6 | **Role mismatch** (manager exists; customer doesn't) | Needs your decision — §7 |
| R7 | Services/slots/branches **hardcoded**, but admin must "manage" them | Move to DB tables (seeded from constants) so admin CRUD is real — pending your §8 answer |
| R8 | Deploy = Cloudflare | Re-target Vercel (Node runtime; `crypto`/`Buffer` work natively) |

## 7. 🔑 Biggest decision — Auth & roles (need your call)

The task says "Proper Supabase Auth with roles `customer/staff/admin`," but the working app uses **custom auth** with roles **`admin/manager/staff`** and **anonymous (phone-based) bookings — no customer accounts exist**. These can't both be true; options in the question below.

## 8. What I'll port as-is vs. improve

**Port as-is (works & is good):** Supabase schema + enums; server-side Razorpay order creation + **HMAC verification** + webhook; role-scoped appointment listing; full credentials management (bulk/reset/delete with branch scoping); membership phone auto-detect + 50% nail discount; **design tokens** (rose + gold, Playfair Display + Inter); all shadcn/ui components; complete/cancel/delete appointment.

**Improve / build new:** real ₹50 + ₹100 Razorpay checkout in UI; enforce 10-day activation; robust no-double-booking; RHF+zod forms with inline errors; **professional landing page** (hero, services, branches+map, membership, gallery, testimonials, FAQ, footer, framer-motion, sticky nav); **admin dashboard** (revenue/bookings/membership charts via recharts, filters, CSV export, members list, manage services/staff/slots/branches); middleware route protection; per-page SEO; loading/empty/error states + toasts; secret hygiene; Vercel config.

## 9. Target folder structure (Next.js App Router)

```
app/
  layout.tsx · globals.css · page.tsx (landing+booking)
  login/page.tsx
  admin/{layout,page (overview+charts),bookings,members,staff,services}/...
  staff/page.tsx · manager/page.tsx (if kept)
  api/razorpay/{order,verify}/route.ts · api/webhooks/razorpay/route.ts
components/{ui, landing/*, booking/*, admin/*}
lib/{supabase/{client,server,admin,middleware}, actions/*, razorpay(server), razorpay-checkout(client), validations/*, salon-data, utils}
supabase/migrations/*.sql        # existing + new (activation_date, mgmt tables, RLS, constraints)
middleware.ts · .env.example · .env.local(gitignored) · next.config.mjs · tailwind/postcss · README.md
```

## 10. Phased delivery (one commit + one-line summary per phase)

0. **Audit + plan** (this file) — *resolve §7/§8 first*.
1. **Scaffold** Next.js 14 App Router + TS strict + Tailwind v4 + shadcn, port tokens/components, `.env.example`, gitignore fix. Builds clean.
2. **Schema/migrations**: `activation_date`, mgmt tables (services/time_slots/branches) + seed, no-double-book index, RLS policies written out.
3. **Auth + middleware** (per §7 decision).
4. **Booking flow**: RHF+zod, cascading dropdowns, live availability, **real ₹50 Razorpay** + server verify.
5. **Membership**: ₹100 Razorpay + 10-day activation + auto-discount.
6. **Admin/staff/manager** dashboards: charts, filters, CSV, management, members.
7. **Landing page** + motion + SEO + responsive.
8. **Polish**: a11y, states, README, `npm run build` green, Vercel config.

---
*Awaiting decisions in §7 / §8 before Phase 1.*
