-- ============================================================================
-- STAFF SALARIES (2026-07-03)
-- Per-stylist, per-month payroll: a base salary, a per-absent-day deduction rate,
-- and the number of days the stylist was absent that month. Net pay is computed
-- (never stored) as max(0, base_salary - absent_days * per_day_deduction).
--   • Admin sets base_salary + per_day_deduction (and may set absences).
--   • Admin + manager set absent_days (the deduction follows from it).
--   • Staff read their own row (absent days + net pay).
-- Idempotent: safe to re-run.
-- ============================================================================
create table if not exists public.staff_salaries (
  id                uuid primary key default gen_random_uuid(),
  staff_id          uuid not null references public.staff(id) on delete cascade,
  month             text not null,                                    -- 'YYYY-MM'
  base_salary       integer not null default 0 check (base_salary >= 0),        -- ₹/month
  per_day_deduction integer not null default 0 check (per_day_deduction >= 0),  -- ₹ per absent day
  absent_days       integer not null default 0 check (absent_days >= 0),
  updated_by        uuid,                                             -- profiles.id who last edited
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (staff_id, month)
);

comment on table public.staff_salaries is
  'Per-stylist monthly payroll. Net pay = max(0, base_salary - absent_days * per_day_deduction), computed at read time.';

create index if not exists idx_staff_salaries_staff on public.staff_salaries (staff_id);

-- ─────────────────────────────── Row Level Security ─────────────────────────
-- Reads scoped like the rest of the app (admin all / manager own branch / staff
-- own roster name) via an EXISTS on the parent staff row. Writes go through the
-- service-role admin client (bypasses RLS), so no write policy is needed.
alter table public.staff_salaries enable row level security;

drop policy if exists "staff_salaries_select" on public.staff_salaries;
create policy "staff_salaries_select" on public.staff_salaries
  for select to authenticated
  using (exists (
    select 1 from public.staff s
    where s.id = staff_salaries.staff_id and (
      public.is_admin()
      or (public.my_role() = 'manager' and s.branch = public.my_branch())
      or (public.my_role() = 'staff'   and lower(s.name) = lower(coalesce(public.my_staff_name(), '')))
    )
  ));
