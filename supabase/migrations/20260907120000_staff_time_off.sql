-- ============================================================================
-- STAFF DAYS OFF (2026-09-07)
-- ----------------------------------------------------------------------------
-- Dated override on top of the weekly matrix in public.staff_schedules.
-- One row = "this artist does NOT work that calendar date at all" — a festival,
-- leave, a personal day. It overrides EVERY weekly slot for that date; absence
-- of a row simply means the weekly schedule applies as usual.
-- off_date is a calendar date ('YYYY-MM-DD'), never a timestamp — the app works
-- in local (IST) calendar days, so a date column keeps it timezone-free.
-- This is BOOKING availability only. It is deliberately NOT payroll: absences
-- that cost money live in staff_salaries.absent_days and are edited separately.
-- Blocking a date does NOT cancel bookings already taken that day — the admin
-- is warned and reassigns or cancels them by hand.
-- Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.staff_time_off (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.staff(id) on delete cascade,
  off_date   date not null,
  reason     text,                                   -- optional free note
  created_by uuid,                                   -- profiles.id who blocked it
  created_at timestamptz not null default now(),
  unique (staff_id, off_date)
);

comment on table public.staff_time_off is
  'Dated days off for bookable artists (public.staff). Row presence = that artist does not work that calendar date at all, overriding public.staff_schedules. Booking availability only — payroll absences live in public.staff_salaries.';

create index if not exists idx_staff_time_off_staff on public.staff_time_off(staff_id);

-- ─────────────────────────────── Row Level Security ─────────────────────────
alter table public.staff_time_off enable row level security;

-- Public read: the booking catalog runs as the anon role and must see these
-- rows (mirrors staff_schedules_public_read). Without this, anonymous visitors
-- read zero days off and a blocked artist still shows up as bookable.
drop policy if exists "staff_time_off_public_read" on public.staff_time_off;
create policy "staff_time_off_public_read" on public.staff_time_off
  for select to anon, authenticated using (true);

-- Manage: admin (any) or manager of the owning artist's branch.
drop policy if exists "staff_time_off_manage" on public.staff_time_off;
create policy "staff_time_off_manage" on public.staff_time_off
  for all to authenticated
  using (
    public.is_admin()
    or (public.my_role() = 'manager' and exists (
      select 1 from public.staff st
      where st.id = staff_time_off.staff_id and st.branch = public.my_branch()))
  )
  with check (
    public.is_admin()
    or (public.my_role() = 'manager' and exists (
      select 1 from public.staff st
      where st.id = staff_time_off.staff_id and st.branch = public.my_branch()))
  );
