-- ============================================================================
-- FULL APP SETUP — auth/profiles + role helpers + catalogs + RLS.
--
-- Run this ONCE on the live project (Supabase SQL editor or `supabase db push`)
-- AFTER 20260615120000_manual_upi_verification.sql. It brings a project that only
-- has the original base tables (app_users / staff / appointments) fully up:
--   • profiles (1:1 with auth.users) + role helpers + auto-profile trigger
--   • services / time_slots / branches catalogs (seeded)
--   • Row Level Security on every table, scoped by role + branch
--
-- ENUM-AGNOSTIC ON PURPOSE: this project's base schema uses different enum type
-- names than the repo's early migrations, so role/branch are modelled as TEXT
-- (with CHECK constraints) and the existing branch enum columns are converted to
-- TEXT. This makes the script safe regardless of the original enum names and
-- removes the need for fragile ALTER TYPE ... ADD VALUE calls.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ─────────────────────── 0. normalize branch columns to text ────────────────
-- Existing data is preserved; values like 'Vile Parle' are just text afterwards.
alter table public.appointments alter column branch type text using branch::text;
alter table public.staff        alter column branch type text using branch::text;

-- ─────────────────────────── 1. profiles ────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'staff' check (role in ('admin','manager','staff')),
  branch      text,
  staff_name  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is
  'Internal users (admin/manager/staff), 1:1 with auth.users. Customers are NOT users.';

create index if not exists idx_profiles_role   on public.profiles(role);
create index if not exists idx_profiles_branch on public.profiles(branch);

-- ─────────────────────────── 2. role helpers ────────────────────────────────
-- SECURITY DEFINER so RLS policies can call them without recursing on profiles.
create or replace function public.my_role()
  returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_branch()
  returns text language sql stable security definer set search_path = public as $$
  select branch from public.profiles where id = auth.uid()
$$;

create or replace function public.my_staff_name()
  returns text language sql stable security definer set search_path = public as $$
  select staff_name from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
  returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.is_internal_user()
  returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid())
$$;

-- ─────────────────────── 3. auto-create profile on signup ───────────────────
create or replace function public.handle_new_user()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, branch, staff_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''),
             nullif(new.raw_user_meta_data->>'staff_name', '')),
    coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'staff'),
    nullif(new.raw_user_meta_data->>'branch', ''),
    nullif(new.raw_user_meta_data->>'staff_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ─────────────────────────── 4. catalogs (seeded) ───────────────────────────
create table if not exists public.services (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  price       integer not null check (price >= 0),
  description text,
  is_nail_art boolean not null default false,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
insert into public.services (name, price, is_nail_art, sort_order) values
  ('Stick On Extension Nails', 499, true,  1),
  ('Gel Polish Hand & Toe',    499, false, 2),
  ('Soft Gel Extension Nails', 499, true,  3),
  ('Acrylic Extension Nails',  799, true,  4)
on conflict (name) do nothing;

create table if not exists public.time_slots (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.time_slots (label, sort_order) values
  ('11:45 AM – 1:15 PM', 1),
  ('1:15 PM – 2:45 PM',  2),
  ('2:45 PM – 4:15 PM',  3),
  ('4:15 PM – 5:45 PM',  4),
  ('5:45 PM – 7:15 PM',  5),
  ('7:00 PM – 8:30 PM',  6)
on conflict (label) do nothing;

create table if not exists public.branches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  address    text,
  map_url    text,
  phone      text,
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.branches (name, address, sort_order) values
  ('Vile Parle', 'Vile Parle, Mumbai, Maharashtra', 1),
  ('Bandra',     'Bandra, Mumbai, Maharashtra',     2),
  ('Kandivali',  'Kandivali, Mumbai, Maharashtra',  3)
on conflict (name) do nothing;

-- Membership 10-day activation default + backfill (idempotent).
alter table public.memberships add column if not exists activation_date date;
update public.memberships set activation_date = start_date + interval '10 days'
  where activation_date is null;
alter table public.memberships
  alter column activation_date set default (current_date + interval '10 days');

-- ═══════════════════════════ 5. ROW LEVEL SECURITY ══════════════════════════
alter table public.profiles    enable row level security;
alter table public.services    enable row level security;
alter table public.time_slots  enable row level security;
alter table public.branches    enable row level security;
alter table public.staff       enable row level security;
alter table public.appointments enable row level security;
alter table public.memberships enable row level security;
alter table public.payments    enable row level security;

-- profiles: self + admin (all) + manager (own branch) read; admin writes.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin()
         or (public.my_role() = 'manager' and branch = public.my_branch()));
drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- catalogs: anyone reads active rows; admins manage.
drop policy if exists "services_public_read" on public.services;
create policy "services_public_read" on public.services
  for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "services_admin_write" on public.services;
create policy "services_admin_write" on public.services
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "time_slots_public_read" on public.time_slots;
create policy "time_slots_public_read" on public.time_slots
  for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "time_slots_admin_write" on public.time_slots;
create policy "time_slots_admin_write" on public.time_slots
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "branches_public_read" on public.branches;
create policy "branches_public_read" on public.branches
  for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "branches_admin_write" on public.branches;
create policy "branches_admin_write" on public.branches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- staff: public read (booking form); admin or branch-manager manage.
drop policy if exists "Anyone can read staff" on public.staff;
drop policy if exists "staff_public_read" on public.staff;
create policy "staff_public_read" on public.staff
  for select to anon, authenticated using (true);
drop policy if exists "staff_manage" on public.staff;
create policy "staff_manage" on public.staff
  for all to authenticated
  using (public.is_admin() or (public.my_role() = 'manager' and branch = public.my_branch()))
  with check (public.is_admin() or (public.my_role() = 'manager' and branch = public.my_branch()));

-- appointments: legacy anon INSERT removed (bookings go through service role).
drop policy if exists "Anyone can book an appointment" on public.appointments;
drop policy if exists "appointments_select" on public.appointments;
create policy "appointments_select" on public.appointments
  for select to authenticated
  using (
    public.is_admin()
    or (public.my_role() = 'manager' and branch = public.my_branch())
    or (public.my_role() = 'staff'   and lower(staff_name) = lower(coalesce(public.my_staff_name(), '')))
  );
drop policy if exists "appointments_update" on public.appointments;
create policy "appointments_update" on public.appointments
  for update to authenticated
  using (
    public.is_admin()
    or (public.my_role() = 'manager' and branch = public.my_branch())
    or (public.my_role() = 'staff'   and lower(staff_name) = lower(coalesce(public.my_staff_name(), '')))
  )
  with check (
    public.is_admin()
    or (public.my_role() = 'manager' and branch = public.my_branch())
    or (public.my_role() = 'staff'   and lower(staff_name) = lower(coalesce(public.my_staff_name(), '')))
  );
drop policy if exists "appointments_delete" on public.appointments;
create policy "appointments_delete" on public.appointments
  for delete to authenticated
  using (public.is_admin() or (public.my_role() = 'manager' and branch = public.my_branch()));

-- memberships: any internal user may read (phone-based, not branch-bound).
drop policy if exists "Anyone can read memberships" on public.memberships;
drop policy if exists "memberships_internal_read" on public.memberships;
create policy "memberships_internal_read" on public.memberships
  for select to authenticated using (public.is_internal_user());

-- payments: admins read; writes are service-role only.
drop policy if exists "payments_admin_read" on public.payments;
create policy "payments_admin_read" on public.payments
  for select to authenticated using (public.is_admin());

-- app_settings: public read; admin write.
drop policy if exists "app_settings_admin_write" on public.app_settings;
create policy "app_settings_admin_write" on public.app_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- storage payment-proofs: internal users read (proofs surfaced via signed URLs).
drop policy if exists "payment_proofs_internal_read" on storage.objects;
create policy "payment_proofs_internal_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-proofs' and public.is_internal_user());
