-- ============================================================================
-- STAFF WEEKLY SCHEDULE SEED (2026-06-23)
-- ----------------------------------------------------------------------------
-- Each stylist's LISTED day = their weekly DAY OFF. They work EVERY OTHER day
-- across all active time slots. Row presence in public.staff_schedules = "works
-- that slot that weekday". day_of_week uses JS getDay(): 0=Sun .. 6=Sat.
--
-- Assumptions (adjust the roster below if any are wrong):
--   * Salon is open all 7 days; each stylist works 6 days (exactly one day off).
--   * Branch enum values are 'Vile Parle' and 'Bandra' (note spelling: "Parle").
--   * 'Manshi2' is the SECOND Vile Parle stylist also called Manshi — replace
--     with that stylist's EXACT public.staff.name (UNIQUE(name, branch) means
--     two literal "Manshi" rows can't coexist in one branch).
--   * Jinal (Bandra) works Mon–Sat fully + a Sunday HALF-DAY (first 3 slots).
--
-- Idempotent: wipes + re-inserts schedules for ONLY the listed stylists, so it
-- is safe to re-run after correcting names. Step 4 reports any unmatched names.
-- ============================================================================

begin;

-- Roster: (branch, stylist name, weekday OFF). Names must match public.staff exactly.
-- NOTE: staff.branch is TEXT in the live DB (the original enum was converted to
-- text in 20260615140000_full_app_setup.sql), so this column is text, not an enum.
create temporary table _roster (
  branch     text,
  staff_name text,
  off_day    smallint
) on commit drop;

insert into _roster (branch, staff_name, off_day) values
  -- ───────── Vile Parle ─────────
  ('Vile Parle', 'Fiza',    1),   -- Monday off
  ('Vile Parle', 'Shreya',  1),   -- Monday off
  ('Vile Parle', 'Manshi',  2),   -- Tuesday off
  ('Vile Parle', 'Ritika',  2),   -- Tuesday off
  ('Vile Parle', 'Kumkum',  2),   -- Tuesday off
  ('Vile Parle', 'Manshi2', 3),   -- Wednesday off  ← confirm exact name (2nd "Manshi")
  ('Vile Parle', 'Hemlata', 3),   -- Wednesday off
  ('Vile Parle', 'Bhagya',  4),   -- Thursday off
  ('Vile Parle', 'Asmita',  4),   -- Thursday off
  ('Vile Parle', 'Saira',   5),   -- Friday off
  ('Vile Parle', 'Divya',   0),   -- Sunday off
  ('Vile Parle', 'Teju',    0),   -- Sunday off
  -- ───────── Bandra ─────────
  ('Bandra',     'Sravani', 1),   -- Monday off
  ('Bandra',     'Bhavna',  4),   -- Thursday off
  ('Bandra',     'Karishma',6),   -- Saturday off
  ('Bandra',     'Aarzoo',  0),   -- Sunday off
  ('Bandra',     'Jinal',   0);   -- Sunday treated as OFF here; half-day added in step 3

-- 1) Clear existing schedules for just these stylists (clean, deterministic re-run).
delete from public.staff_schedules ss
using public.staff s, _roster r
where ss.staff_id = s.id
  and s.name = r.staff_name
  and s.branch = r.branch;

-- 2) Insert a full schedule for every WORKING day (all days except off_day),
--    across every active time slot.
insert into public.staff_schedules (staff_id, day_of_week, time_slot)
select s.id, d.day, ts.label
from _roster r
join public.staff s
  on s.name = r.staff_name and s.branch = r.branch
cross join generate_series(0, 6) as d(day)
join public.time_slots ts on ts.active
where d.day <> r.off_day
on conflict (staff_id, day_of_week, time_slot) do nothing;

-- 3) Jinal (Bandra): add the Sunday HALF-DAY — first 3 active slots by sort_order
--    (i.e. the morning block, up to 4:15 PM). Mon–Sat were already added in step 2.
insert into public.staff_schedules (staff_id, day_of_week, time_slot)
select s.id, 0, ts.label
from public.staff s
cross join (
  select label from public.time_slots where active order by sort_order limit 3
) ts
where s.name = 'Jinal' and s.branch = 'Bandra'
on conflict (staff_id, day_of_week, time_slot) do nothing;

-- 4) Diagnostic: roster names that matched NO staff row. If this returns rows,
--    fix the name(s) above and re-run — those stylists got no schedule.
select r.branch, r.staff_name as unmatched_name
from _roster r
left join public.staff s
  on s.name = r.staff_name and s.branch = r.branch
where s.id is null;

commit;

-- Optional sanity check (run separately after committing):
--   select s.branch, s.name, ss.day_of_week, count(*) slots
--   from public.staff_schedules ss
--   join public.staff s on s.id = ss.staff_id
--   group by 1,2,3 order by 1,2,3;
