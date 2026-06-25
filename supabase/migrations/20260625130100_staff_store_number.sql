-- ============================================================================
-- STAFF STORE NUMBER (2026-06-25)
-- Per-stylist store/contact number, set by admin/manager and surfaced to the
-- customer once they pick that stylist on the booking form. Free text (numbers
-- may carry +, spaces, leading zeros). Idempotent: safe to re-run.
--
-- No RLS change: public.staff already has `staff_public_read` (using (true)) so
-- the anonymous booking catalog can read this column, and writes go through the
-- service-role admin client (or the staff_manage policy via the session client).
-- ============================================================================
alter table public.staff
  add column if not exists store_number text;

comment on column public.staff.store_number is
  'Per-stylist store/contact number surfaced to customers on the booking form.';
