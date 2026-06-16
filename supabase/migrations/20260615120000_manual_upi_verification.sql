-- ============================================================================
-- Manual UPI + screenshot verification — replaces the Razorpay gateway.
--
-- Booking lifecycle:  pending_payment → payment_uploaded → verified / rejected
--                     (+ `cancelled` kept for admins cancelling a confirmed booking)
--
-- A booking row is created immediately on submit (status pending_payment) so the
-- slot is held. The customer then pays over UPI and uploads a screenshot
-- (status payment_uploaded). An admin verifies (→ verified, slot finalized) or
-- rejects (→ rejected, slot released). Memberships follow the same flow via the
-- `payments` table.
--
-- This migration is SELF-CONTAINED and IDEMPOTENT: it creates the payments and
-- memberships tables (and the appointment columns) if a prior migration never
-- did, and it can be re-run safely. Policies that depend on the auth/profiles
-- role helpers (public.is_admin / public.is_internal_user) are only created when
-- those functions exist — otherwise they're skipped with a NOTICE (apply the
-- auth/profiles migration to get full RLS; service-role server actions work
-- regardless).
--
-- Apply with: supabase db push   (or paste into the Supabase SQL editor).
-- ============================================================================

-- ─────────────────────────── 1. memberships table ───────────────────────────
-- Created here in case the original payments migration was never applied.
create table if not exists public.memberships (
  id uuid not null default gen_random_uuid() primary key,
  client_name text not null,
  phone text not null,
  start_date date not null default current_date,
  activation_date date,
  expires_at date not null default (current_date + interval '1 year'),
  active boolean not null default true,
  amount_paid integer not null default 100,
  created_at timestamptz not null default now()
);
-- If it already existed in the old shape, make sure activation_date is present.
alter table public.memberships add column if not exists activation_date date;

create index if not exists idx_memberships_phone on public.memberships(phone);
create index if not exists idx_memberships_active_exp on public.memberships(active, expires_at);
alter table public.memberships enable row level security;

-- ─────────────────────────── 2. payments table (membership) ─────────────────
create table if not exists public.payments (
  id uuid not null default gen_random_uuid() primary key,
  purpose text not null check (purpose in ('membership','booking')),
  amount integer not null,
  currency text not null default 'INR',
  status text not null default 'pending_payment',
  client_name text,
  phone text,
  appointment_id uuid,
  membership_id uuid references public.memberships(id) on delete set null,
  metadata jsonb,
  upi_screenshot_url text,
  uploaded_at timestamptz,
  verified_by uuid,
  verified_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bring an older payments table up to the new shape.
alter table public.payments
  add column if not exists upi_screenshot_url text,
  add column if not exists uploaded_at timestamptz,
  add column if not exists verified_by uuid,
  add column if not exists verified_at timestamptz,
  add column if not exists rejection_reason text;

-- Razorpay columns no longer used.
alter table public.payments drop column if exists razorpay_order_id;
alter table public.payments drop column if exists razorpay_payment_id;
drop index if exists idx_payments_order;

-- Migrate any legacy status vocabulary, then enforce the new one.
alter table public.payments drop constraint if exists payments_status_check;
update public.payments set status = 'pending_payment' where status = 'created';
update public.payments set status = 'verified'        where status = 'paid';
update public.payments set status = 'rejected'        where status = 'failed';
alter table public.payments
  alter column status set default 'pending_payment',
  add constraint payments_status_check
    check (status in ('pending_payment','payment_uploaded','verified','rejected'));

create index if not exists idx_payments_appt on public.payments(appointment_id);
alter table public.payments enable row level security;

-- ─────────────────────────── 3. appointments columns ────────────────────────
-- Ensure every column the app/payment flow needs exists, regardless of which
-- prior migrations ran. (The base appointments table comes from migration 1.)
alter table public.appointments
  add column if not exists payment_status text not null default 'pending_payment',
  add column if not exists amount integer not null default 50,            -- booking fee paid (₹)
  add column if not exists is_member boolean not null default false,
  add column if not exists discount_applied integer not null default 0,
  add column if not exists completed boolean not null default false,
  add column if not exists completed_at timestamptz,
  add column if not exists upi_screenshot_url text,                       -- storage object path
  add column if not exists uploaded_at timestamptz,
  add column if not exists verified_by uuid,                             -- profile id of the verifier
  add column if not exists verified_at timestamptz,
  add column if not exists rejection_reason text;

-- Razorpay column no longer used.
alter table public.appointments drop column if exists razorpay_order_id;

-- Migrate legacy payment_status values onto the new vocabulary, then swap the
-- CHECK constraint (the column is guaranteed to exist by the block above).
alter table public.appointments drop constraint if exists appointments_payment_status_check;
update public.appointments set payment_status = 'pending_payment' where payment_status = 'pending';
update public.appointments set payment_status = 'verified'        where payment_status = 'paid';
-- 'cancelled' is unchanged.
alter table public.appointments
  alter column payment_status set default 'pending_payment',
  add constraint appointments_payment_status_check
    check (payment_status in ('pending_payment','payment_uploaded','verified','rejected','cancelled'));

-- ─────────────────────────── 4. no double-booking ───────────────────────────
-- A slot is held by any booking that is NOT cancelled/rejected (pending_payment,
-- payment_uploaded and verified all reserve it). Rejected/cancelled free it.
drop index if exists uq_appointment_slot;
create unique index uq_appointment_slot
  on public.appointments (branch, staff_name, appointment_date, time_slot)
  where payment_status not in ('cancelled','rejected');

-- ─────────────────────────── 5. app_settings (UPI) ──────────────────────────
-- Single editable row holding the studio's UPI id + QR image so they can be
-- changed without a redeploy. Public-readable (the booking form needs them);
-- admin-only writes.
create table if not exists public.app_settings (
  id text primary key default 'default' check (id = 'default'),
  upi_id text not null default '',
  payee_name text not null default 'Rashi Nail Art Studio',
  upi_qr_url text not null default '/upi-qr.svg',  -- public asset or storage URL
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values ('default')
  on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_public_read" on public.app_settings;
create policy "app_settings_public_read" on public.app_settings
  for select to anon, authenticated using (true);

-- ─────────────────────────── 6. storage: payment-proofs ─────────────────────
-- Private bucket. Uploads and reads are performed by service-role server actions
-- (customers are anonymous, so there is no per-user RLS to anchor to); proofs are
-- surfaced to admin/manager via short-lived signed URLs generated server-side.
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- ─────────────────────────── 7. role-helper-dependent policies ──────────────
-- Created only if the auth/profiles role helpers exist (apply that migration for
-- full RLS). These are defense-in-depth — privileged access is service-role.
do $$
begin
  if to_regprocedure('public.is_admin()') is not null then
    execute 'drop policy if exists "app_settings_admin_write" on public.app_settings';
    execute 'create policy "app_settings_admin_write" on public.app_settings
               for all to authenticated using (public.is_admin()) with check (public.is_admin())';
    execute 'drop policy if exists "payments_admin_read" on public.payments';
    execute 'create policy "payments_admin_read" on public.payments
               for select to authenticated using (public.is_admin())';
  else
    raise notice 'public.is_admin() not found — skipping admin policies on app_settings/payments. Apply the auth/profiles migration for full RLS.';
  end if;

  if to_regprocedure('public.is_internal_user()') is not null then
    execute 'drop policy if exists "memberships_internal_read" on public.memberships';
    execute 'create policy "memberships_internal_read" on public.memberships
               for select to authenticated using (public.is_internal_user())';
    execute 'drop policy if exists "payment_proofs_internal_read" on storage.objects';
    execute 'create policy "payment_proofs_internal_read" on storage.objects
               for select to authenticated
               using (bucket_id = ''payment-proofs'' and public.is_internal_user())';
  else
    raise notice 'public.is_internal_user() not found — skipping internal-read policies on memberships and storage. Apply the auth/profiles migration for full RLS.';
  end if;
end $$;
