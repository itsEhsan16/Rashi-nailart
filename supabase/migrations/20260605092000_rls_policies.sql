-- ============================================================================
-- Row Level Security for every public table, under Supabase Auth.
--
--  Reads:  public catalogs (services / time_slots / branches / staff) are open to
--          anon so the booking form works for guests. appointments / memberships /
--          payments are restricted to internal roles, scoped by role + branch.
--  Writes: privileged writes (create booking + payment, verify payment, create
--          membership, create staff auth users) run through service-role server
--          actions which BYPASS RLS. These policies are defense-in-depth and also
--          enable RLS-scoped dashboard reads via the user's session client.
-- ============================================================================

alter table public.services   enable row level security;
alter table public.time_slots enable row level security;
alter table public.branches   enable row level security;
-- appointments / memberships / payments / staff / app_users already have RLS on.

-- ---------------------------------------------------------------------------
-- Catalogs: anyone may read active rows; only admins manage them.
-- ---------------------------------------------------------------------------
drop policy if exists "services_public_read" on public.services;
create policy "services_public_read" on public.services
  for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "services_admin_write" on public.services;
create policy "services_admin_write" on public.services
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "time_slots_public_read" on public.time_slots;
create policy "time_slots_public_read" on public.time_slots
  for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "time_slots_admin_write" on public.time_slots;
create policy "time_slots_admin_write" on public.time_slots
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "branches_public_read" on public.branches;
create policy "branches_public_read" on public.branches
  for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "branches_admin_write" on public.branches;
create policy "branches_admin_write" on public.branches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Staff list: public read (booking form); admin or branch-manager manage.
-- ---------------------------------------------------------------------------
drop policy if exists "Anyone can read staff" on public.staff;
drop policy if exists "staff_public_read" on public.staff;
create policy "staff_public_read" on public.staff
  for select to anon, authenticated using (true);

drop policy if exists "staff_manage" on public.staff;
create policy "staff_manage" on public.staff
  for all to authenticated
  using (public.is_admin() or (public.my_role() = 'manager' and branch = public.my_branch()))
  with check (public.is_admin() or (public.my_role() = 'manager' and branch = public.my_branch()));

-- ---------------------------------------------------------------------------
-- Appointments: scoped reads/updates. Legacy anon INSERT removed — bookings now
-- go through the service-role server action. Inserts therefore need no policy.
-- ---------------------------------------------------------------------------
drop policy if exists "Anyone can book an appointment" on public.appointments;

drop policy if exists "appointments_select" on public.appointments;
create policy "appointments_select" on public.appointments
  for select to authenticated
  using (
    public.is_admin()
    or (public.my_role() = 'manager' and branch = public.my_branch())
    or (public.my_role() = 'staff'   and lower(staff_name) = lower(coalesce(public.my_staff_name(), '')))
  );

drop policy if exists "appointments_update" on public.appointments;
create policy "appointments_update" on public.appointments
  for update to authenticated
  using (
    public.is_admin()
    or (public.my_role() = 'manager' and branch = public.my_branch())
    or (public.my_role() = 'staff'   and lower(staff_name) = lower(coalesce(public.my_staff_name(), '')))
  )
  with check (
    public.is_admin()
    or (public.my_role() = 'manager' and branch = public.my_branch())
    or (public.my_role() = 'staff'   and lower(staff_name) = lower(coalesce(public.my_staff_name(), '')))
  );

drop policy if exists "appointments_delete" on public.appointments;
create policy "appointments_delete" on public.appointments
  for delete to authenticated
  using (public.is_admin() or (public.my_role() = 'manager' and branch = public.my_branch()));

-- ---------------------------------------------------------------------------
-- Memberships: any internal user may read (membership is phone-based, not
-- branch-bound). Writes go through the service-role server action.
-- ---------------------------------------------------------------------------
drop policy if exists "Anyone can read memberships" on public.memberships;
drop policy if exists "memberships_internal_read" on public.memberships;
create policy "memberships_internal_read" on public.memberships
  for select to authenticated using (public.is_internal_user());

-- ---------------------------------------------------------------------------
-- Payments: admins read; writes are service-role only (no write policy).
-- ---------------------------------------------------------------------------
drop policy if exists "payments_admin_read" on public.payments;
create policy "payments_admin_read" on public.payments
  for select to authenticated using (public.is_admin());

-- app_users (deprecated): intentionally has NO policies -> no client access.
-- Left in place for reference only; the application no longer reads it.
