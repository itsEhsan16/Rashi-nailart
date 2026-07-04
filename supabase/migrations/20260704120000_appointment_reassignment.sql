-- ============================================================================
-- APPOINTMENT REASSIGNMENT (2026-07-04)
-- When a manager moves a walk-in to a different available artist (the booked
-- artist is busy/unavailable), we keep the ORIGINAL artist's name so every panel
-- can show "reassigned from X → Y". `staff_name` always holds the CURRENT
-- (serving) artist; `original_staff_name` holds who the customer first booked.
-- NULL = never reassigned. Idempotent: safe to re-run.
-- ============================================================================
alter table public.appointments
  add column if not exists original_staff_name text;

comment on column public.appointments.original_staff_name is
  'Artist the customer originally booked, set when a manager reassigns the booking to another artist. NULL = never reassigned. staff_name holds the current serving artist.';
