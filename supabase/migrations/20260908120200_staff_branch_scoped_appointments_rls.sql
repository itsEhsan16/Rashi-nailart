-- ============================================================================
-- SCOPE STAFF APPOINTMENT ACCESS BY BRANCH, NOT NAME ALONE (2026-09-08)
-- ----------------------------------------------------------------------------
-- 20260615140000:216-237 binds an artist to their bookings by NAME only:
--     public.my_role() = 'staff' and lower(staff_name) = lower(my_staff_name())
-- staff.name is UNIQUE(name, branch), NOT globally — so two artists in different
-- studios may legitimately share a name, and each would read (and update) the
-- other's bookings: client names, prices, extras, completion state.
--
-- It has been latent because no name currently repeats across Vile Parle and
-- Bandra. Opening a third studio (Borivali W, 20260908120000) makes a collision
-- a hiring accident away, so close it now.
--
-- The added predicate is the SAME expression the manager clause already uses on
-- this table — `branch = public.my_branch()` — deliberately, so it needs no cast
-- and cannot be wrong about whether these columns are enum or text: whatever
-- makes the manager clause work today makes this work too.
--
-- appointments_delete needs no change: it has no staff clause (admin/manager only).
--
-- BEFORE APPLYING, confirm no staff login has a branch that disagrees with their
-- roster row, or their dashboard will silently go empty:
--   select p.email, p.staff_name, p.branch as profile_branch, s.branch as roster_branch
--   from public.profiles p
--   left join public.staff s on lower(s.name) = lower(p.staff_name)
--   where p.role = 'staff' order by p.email;
--
-- Idempotent — safe to re-run.
-- ============================================================================

drop policy if exists "appointments_select" on public.appointments;
create policy "appointments_select" on public.appointments
  for select to authenticated
  using (
    public.is_admin()
    or (public.my_role() = 'manager' and branch = public.my_branch())
    or (public.my_role() = 'staff'
        and lower(staff_name) = lower(coalesce(public.my_staff_name(), ''))
        and branch = public.my_branch())
  );

drop policy if exists "appointments_update" on public.appointments;
create policy "appointments_update" on public.appointments
  for update to authenticated
  using (
    public.is_admin()
    or (public.my_role() = 'manager' and branch = public.my_branch())
    or (public.my_role() = 'staff'
        and lower(staff_name) = lower(coalesce(public.my_staff_name(), ''))
        and branch = public.my_branch())
  )
  with check (
    public.is_admin()
    or (public.my_role() = 'manager' and branch = public.my_branch())
    or (public.my_role() = 'staff'
        and lower(staff_name) = lower(coalesce(public.my_staff_name(), ''))
        and branch = public.my_branch())
  );
