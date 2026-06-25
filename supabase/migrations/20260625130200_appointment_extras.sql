-- ============================================================================
-- APPOINTMENT EXTRAS (2026-06-25)
-- Staff-added line items (extra services / costs) on top of the booked service,
-- e.g. nail art added in-studio. The base appointments.service / price stay
-- immutable; extras are additive. Idempotent: safe to re-run.
-- ============================================================================
create table if not exists public.appointment_extras (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  label          text not null,
  amount         integer not null check (amount >= 0),  -- ₹, charged in-store
  created_by     uuid,                                   -- profiles.id of the staff who added it
  created_at     timestamptz not null default now()
);

comment on table public.appointment_extras is
  'Extra services/costs added by staff on top of the booked service. Additive; the base appointment price is unchanged.';

create index if not exists idx_appointment_extras_appt
  on public.appointment_extras (appointment_id);

-- ─────────────────────────────── Row Level Security ─────────────────────────
-- Reads scoped exactly like appointments_select (admin all / manager own branch /
-- staff own roster name), via an EXISTS subquery on the parent appointment — the
-- same pattern used elsewhere for child tables. Writes go through the service-role
-- admin client (which bypasses RLS), so no write policy is needed. Customers
-- (anon) never see extras.
alter table public.appointment_extras enable row level security;

drop policy if exists "appointment_extras_select" on public.appointment_extras;
create policy "appointment_extras_select" on public.appointment_extras
  for select to authenticated
  using (exists (
    select 1 from public.appointments a
    where a.id = appointment_extras.appointment_id and (
      public.is_admin()
      or (public.my_role() = 'manager' and a.branch = public.my_branch())
      or (public.my_role() = 'staff'   and lower(a.staff_name) = lower(coalesce(public.my_staff_name(), '')))
    )
  ));
