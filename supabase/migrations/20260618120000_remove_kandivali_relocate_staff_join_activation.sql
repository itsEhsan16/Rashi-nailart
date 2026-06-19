-- ============================================================================
-- BRANCH + STAFF + MEMBERSHIP UPDATES (2026-06-18)
--
--   1. Relocate the Kandivali staff:
--        • Mansi    → Vile Parle
--        • Shravani → Bandra
--   2. Remove the Kandivali branch (deactivated, so it disappears from the
--      public booking catalog while history/foreign references stay intact).
--   3. Membership benefits now start ON JOIN (activation_date = start_date)
--      instead of 10 days after purchase — new default + backfill of existing
--      members.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ─────────────────────── 1. relocate Kandivali staff ────────────────────────
-- Scoped to branch = 'Kandivali' so same-named stylists in other branches are
-- untouched. (Both 'Shravani' / 'Sharvani' spellings are handled.)
update public.staff
  set branch = 'Vile Parle'
  where name = 'Mansi' and branch = 'Kandivali';

update public.staff
  set branch = 'Bandra'
  where name in ('Shravani', 'Sharvani') and branch = 'Kandivali';

-- ─────────────────────── 2. remove the Kandivali branch ─────────────────────
-- Deactivate so getCatalog() (filters active = true) stops offering it. This is
-- reversible and preserves any historical appointments tagged 'Kandivali'.
update public.branches set active = false where name = 'Kandivali';

-- If you want the row gone entirely (only safe once no staff/appointments
-- reference it), uncomment:
-- delete from public.branches where name = 'Kandivali';

-- ─────────────────── 3. membership benefits start on join ───────────────────
-- New members: activate the day they join.
alter table public.memberships
  alter column activation_date set default current_date;

-- Existing members: bring benefits forward to their join date.
update public.memberships
  set activation_date = start_date
  where activation_date is distinct from start_date;

comment on column public.memberships.activation_date is
  'Membership benefits (50% off nail art) apply from the join date (activation_date = start_date).';
