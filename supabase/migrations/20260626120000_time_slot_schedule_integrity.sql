-- ─────────────────────────────────────────────────────────────────────────────
-- Keep time_slots.label and staff_schedules.time_slot from drifting apart.
--
-- The booking form only offers a slot when its label exists in BOTH time_slots
-- and the chosen stylist's staff_schedules (exact string match). Editing slot
-- labels in the admin panel (deleting the range labels and adding short ones)
-- orphaned every stylist schedule, so customers saw an empty time dropdown.
--
-- This migration:
--   1) restores the canonical range labels (idempotent), then
--   2) adds a foreign key so a slot can't be deleted while a schedule uses it,
--      and any future label rename cascades to the schedules automatically.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Ensure time_slots holds the canonical range labels the schedules reference.
insert into public.time_slots (label, sort_order, active) values
  ('11:45 AM – 1:15 PM', 1, true),
  ('1:15 PM – 2:45 PM',  2, true),
  ('2:45 PM – 4:15 PM',  3, true),
  ('4:15 PM – 5:45 PM',  4, true),
  ('5:45 PM – 7:15 PM',  5, true),
  ('7:00 PM – 8:30 PM',  6, true)
on conflict (label) do update
  set active = true, sort_order = excluded.sort_order;

-- Drop the redundant short start-time labels (the ranges above replace them),
-- but only if no schedule still points at them so the FK below can't be violated.
-- NOTE: the half-added '10:30-11:45 AM' slot is intentionally left in place — no
-- stylist is scheduled on it (so customers never see it), and removing admin input
-- silently would be worse than leaving a harmless, easily-deletable row.
delete from public.time_slots ts
where ts.label in (
        '11:45 AM', '1:15 PM', '2:45 PM', '4:15 PM', '5:45 PM', '7:00 PM'
      )
  and not exists (
        select 1 from public.staff_schedules s where s.time_slot = ts.label
      );

-- 2) Enforce referential integrity from here on.
--    ON UPDATE CASCADE  -> renaming a slot updates every schedule that uses it.
--    ON DELETE RESTRICT -> a slot in use can't be deleted out from under a schedule.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'staff_schedules_time_slot_fkey'
  ) then
    alter table public.staff_schedules
      add constraint staff_schedules_time_slot_fkey
      foreign key (time_slot) references public.time_slots (label)
      on update cascade on delete restrict;
  end if;
end $$;
