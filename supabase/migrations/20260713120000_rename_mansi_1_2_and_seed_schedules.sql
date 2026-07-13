-- ============================================================================
-- TWO MANSIS → "Mansi 1" / "Mansi 2", BOTH VISIBLE IN BOOKING (2026-07-13)
-- ----------------------------------------------------------------------------
-- There are two distinct Vile Parle stylists both called "Mansi":
--     • 'Mansi'               (Studio 24)  → renamed to 'Mansi 1'
--     • 'Mansi Manoj mathal'  (Studio 78)  → renamed to 'Mansi 2'
-- The admin Employees list shows both, but the customer BOOKING form only shows
-- stylists who have a weekly schedule (public.staff_schedules) for the chosen
-- weekday. Whichever Mansi had no schedule rows silently vanished once a date was
-- picked. This migration:
--   1. Renames both rows to the friendly, distinct 'Mansi 1' / 'Mansi 2'.
--   2. Cascades the rename to every place the name is used as an identity key
--      (appointment history, reassignment history, staff logins) so bookings,
--      earnings, and the staff dashboard stay attached.
--   3. Seeds a full weekly schedule for whichever Mansi currently has NONE, so
--      BOTH appear in booking. An existing hand-built schedule is left untouched.
--
-- Day off used only when seeding a from-scratch schedule (admin can change it in
-- Manage → Artists later): Mansi 1 → Tuesday off, Mansi 2 → Wednesday off.
--
-- Idempotent — safe to re-run.
-- APPLY TO PROJECT wvosbrierwuwjgiplksz (Supabase dashboard SQL editor / CLI),
-- NOT via the MCP (which points at a different project).
-- ============================================================================

begin;

-- ─────────────────────────── 1. rename the staff rows ───────────────────────
-- Targets differ from each other and from any existing name, so UNIQUE(name,
-- branch) is never transiently violated.
update public.staff
  set name = 'Mansi 1'
  where branch = 'Vile Parle' and name = 'Mansi';

update public.staff
  set name = 'Mansi 2'
  where branch = 'Vile Parle' and name = 'Mansi Manoj mathal';

-- ───────────────── 2. cascade the rename to name-keyed columns ──────────────
-- Appointment history + earnings (staff_name), and reassignment history
-- (original_staff_name). Scoped to Vile Parle for the generic old name 'Mansi'
-- so no same-named history in another branch is touched.
update public.appointments
  set staff_name = 'Mansi 1'
  where branch = 'Vile Parle' and staff_name = 'Mansi';
update public.appointments
  set staff_name = 'Mansi 2'
  where branch = 'Vile Parle' and staff_name = 'Mansi Manoj mathal';

update public.appointments
  set original_staff_name = 'Mansi 1'
  where branch = 'Vile Parle' and original_staff_name = 'Mansi';
update public.appointments
  set original_staff_name = 'Mansi 2'
  where branch = 'Vile Parle' and original_staff_name = 'Mansi Manoj mathal';

-- Staff login → roster-name match (profiles.staff_name; matched case-insensitively
-- by RLS, but keep the stored value exact). Only the Vile Parle Mansis use these
-- names, so no branch scope is needed.
update public.profiles
  set staff_name = 'Mansi 1'
  where staff_name = 'Mansi';
update public.profiles
  set staff_name = 'Mansi 2'
  where staff_name = 'Mansi Manoj mathal';

-- Legacy auth table, if it still exists in this project.
do $$
begin
  if to_regclass('public.app_users') is not null then
    update public.app_users set staff_name = 'Mansi 1' where staff_name = 'Mansi';
    update public.app_users set staff_name = 'Mansi 2' where staff_name = 'Mansi Manoj mathal';
  end if;
end $$;

-- ─────────── 3. ensure BOTH have a schedule (so both show in booking) ────────
-- Seed a full 6-day week ONLY for a Mansi that currently has zero schedule rows.
-- `not exists` preserves any already-configured schedule; `on conflict do
-- nothing` makes re-runs safe.
insert into public.staff_schedules (staff_id, day_of_week, time_slot)
select s.id, d.day, ts.label
from public.staff s
cross join generate_series(0, 6) as d(day)
join public.time_slots ts on ts.active
where s.branch = 'Vile Parle'
  and s.name in ('Mansi 1', 'Mansi 2')
  and not exists (
    select 1 from public.staff_schedules ss where ss.staff_id = s.id
  )
  and d.day <> case s.name when 'Mansi 1' then 2   -- Tuesday off
                           when 'Mansi 2' then 3   -- Wednesday off
                    end
on conflict (staff_id, day_of_week, time_slot) do nothing;

-- Sanity check (returns after commit): both should list ≥ 1 scheduled day.
--   select s.name, count(distinct ss.day_of_week) as days_scheduled
--   from public.staff s
--   left join public.staff_schedules ss on ss.staff_id = s.id
--   where s.branch = 'Vile Parle' and s.name in ('Mansi 1','Mansi 2')
--   group by s.name;

commit;
