-- ============================================================================
-- STAFF WEEKLY AVAILABILITY (2026-06-22)
-- ----------------------------------------------------------------------------
-- Per-stylist weekly schedule as a (weekday x time-slot) matrix.
-- One row = "this stylist works that time slot on that weekday".
-- Row absence = unavailable. A stylist "works" a weekday if they have >= 1 row.
-- day_of_week uses JS getDay() semantics: 0=Sun .. 6=Sat.
-- time_slot stores the slot LABEL as text (same loose coupling as
-- appointments.time_slot / time_slots.label — no FK to time_slots).
-- NO SEED: stylists stay hidden from booking until an admin configures them.
-- Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.staff_schedules (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references public.staff(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  time_slot   text not null,
  created_at  timestamptz not null default now(),
  unique (staff_id, day_of_week, time_slot)
);

comment on table public.staff_schedules is
  'Weekly availability for bookable stylists (public.staff). Row presence = works that slot on that weekday. day_of_week: 0=Sun..6=Sat (JS getDay()).';

create index if not exists idx_staff_schedules_staff on public.staff_schedules(staff_id);

-- ─────────────────────────────── Row Level Security ─────────────────────────
alter table public.staff_schedules enable row level security;

-- Public read: the booking catalog runs as the anon role and must see these
-- rows (mirrors staff_public_read). Without this the embedded join returns
-- empty for anonymous visitors and every stylist disappears from booking.
drop policy if exists "staff_schedules_public_read" on public.staff_schedules;
create policy "staff_schedules_public_read" on public.staff_schedules
  for select to anon, authenticated using (true);

-- Manage: admin (any) or manager of the owning stylist's branch.
drop policy if exists "staff_schedules_manage" on public.staff_schedules;
create policy "staff_schedules_manage" on public.staff_schedules
  for all to authenticated
  using (
    public.is_admin()
    or (public.my_role() = 'manager' and exists (
      select 1 from public.staff st
      where st.id = staff_schedules.staff_id and st.branch = public.my_branch()))
  )
  with check (
    public.is_admin()
    or (public.my_role() = 'manager' and exists (
      select 1 from public.staff st
      where st.id = staff_schedules.staff_id and st.branch = public.my_branch()))
  );
