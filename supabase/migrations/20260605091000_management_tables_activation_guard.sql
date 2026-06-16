-- ============================================================================
-- Admin-managed catalogs (services / time slots / branches), the 10-day
-- membership activation rule, and a hard no-double-booking guarantee.
-- ============================================================================

-- 1. SERVICES catalog. `is_nail_art` drives the 50% member discount (replaces the
--    brittle /nail/i regex). Seeded to match the previous hardcoded list exactly:
--    only the "...Nails" services were discount-eligible; "Gel Polish" was not.
create table if not exists public.services (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  price       integer not null check (price >= 0),   -- whole rupees
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

-- 2. TIME SLOTS (appointments.time_slot stays the text label for history)
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

-- 3. BRANCHES directory (for landing/admin display + management). The
--    appointments.branch / staff.branch columns remain the `branch` enum so
--    existing data is untouched; adding a brand-new branch still needs an enum
--    migration, but address/phone/map/active are managed here.
create table if not exists public.branches (
  id         uuid primary key default gen_random_uuid(),
  name       public.branch not null unique,
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

-- 4. MEMBERSHIP 10-DAY ACTIVATION. Benefits apply only when
--    current_date >= activation_date (= purchase date + 10 days).
alter table public.memberships
  add column if not exists activation_date date;

update public.memberships
  set activation_date = start_date + interval '10 days'
  where activation_date is null;

alter table public.memberships
  alter column activation_date set default (current_date + interval '10 days');

comment on column public.memberships.activation_date is
  'Membership benefits (50% off nail art) apply only once current_date >= activation_date (purchase + 10 days).';

-- 5. NO DOUBLE-BOOKING. At most one non-cancelled appointment per
--    (branch, staff, date, slot). A pending payment hold also reserves the slot,
--    so concurrent bookings race-fail on this constraint (the server action
--    catches the unique violation and asks the user to pick another slot).
--    NOTE: replaces the old peak-season "capacity 2" behaviour with a hard 1/slot.
--    If this CREATE fails, pre-existing duplicate slots must be resolved first.
create unique index if not exists uq_appointment_slot
  on public.appointments (branch, staff_name, appointment_date, time_slot)
  where payment_status <> 'cancelled';
