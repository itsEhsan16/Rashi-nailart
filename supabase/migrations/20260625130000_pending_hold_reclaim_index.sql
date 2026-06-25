-- ============================================================================
-- PENDING-HOLD RECLAIM SUPPORT (2026-06-25)
-- A partial index so the "sweep abandoned pending_payment holds" query — run on
-- every booking-list load and every createBooking — stays cheap. No schema or
-- RLS change. Idempotent: safe to re-run.
-- ============================================================================
create index if not exists idx_appointments_pending_created
  on public.appointments (created_at)
  where payment_status = 'pending_payment';
