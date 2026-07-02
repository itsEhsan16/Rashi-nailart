-- ============================================================================
-- Cashfree Payment Gateway — automatic confirmation, replaces manual UPI proof.
--
-- New flow: a booking/membership row is still created up-front (pending_payment)
-- to hold the slot, but instead of a screenshot + admin verification the customer
-- pays through Cashfree's hosted checkout. A signed webhook (and a server-side
-- Get Order re-check on return) flips the row straight to `verified` — no admin
-- action. See src/lib/cashfree.ts, src/app/api/webhooks/cashfree/route.ts.
--
-- This migration is ADDITIVE and IDEMPOTENT — it only adds gateway columns, an
-- audit/idempotency table and indexes. It deliberately does NOT touch the
-- existing payment_status / status CHECK constraints: `payment_uploaded` stays a
-- valid (now legacy/frozen) value so historical rows remain legal. New code never
-- writes it.
--
-- Apply with: supabase db push   (or paste into the Supabase SQL editor).
-- IMPORTANT: apply against the LIVE project (ref wvosbrierwuwjgiplksz), not via
-- the Supabase MCP (which points at a different project).
-- ============================================================================

-- ─────────────────────────── 1. appointments: gateway refs ──────────────────
-- `cashfree_order_id` is the order we created for the ₹50 booking fee.
-- `payment_method` is the ONLINE method Cashfree reports (e.g. 'upi', 'card') and
-- is distinct from `payment_mode` (how the in-store balance is settled).
alter table public.appointments
  add column if not exists cashfree_order_id text,
  add column if not exists cf_payment_id     text,
  add column if not exists paid_at           timestamptz,
  add column if not exists payment_method    text;

create index if not exists idx_appt_cf_order on public.appointments(cashfree_order_id);

-- ─────────────────────────── 2. payments (membership): gateway refs ─────────
alter table public.payments
  add column if not exists cashfree_order_id text,
  add column if not exists cf_payment_id     text,
  add column if not exists paid_at           timestamptz,
  add column if not exists payment_method    text;

create index if not exists idx_pay_cf_order on public.payments(cashfree_order_id);

-- ─────────────────────────── 3. payment_events (audit + idempotency) ────────
-- Every webhook (and the return-page re-check) is journaled here. The unique
-- index on cf_payment_id is the idempotency guard: a replayed success webhook
-- hits the constraint and is treated as already-processed. Service-role only
-- (RLS on, no policies) — it's written exclusively by the webhook/confirm code.
create table if not exists public.payment_events (
  id            uuid primary key default gen_random_uuid(),
  event_type    text not null,
  order_id      text,
  cf_payment_id text,
  kind          text,                              -- 'booking' | 'membership' | null
  raw           jsonb not null,
  source        text not null default 'webhook',   -- 'webhook' | 'return'
  processed     boolean not null default false,
  received_at   timestamptz not null default now()
);

create unique index if not exists uq_payment_events_cf_payment
  on public.payment_events(cf_payment_id) where cf_payment_id is not null;
create index if not exists idx_payment_events_order on public.payment_events(order_id);

alter table public.payment_events enable row level security;
-- No policies: only the service-role client (which bypasses RLS) reads/writes this.
