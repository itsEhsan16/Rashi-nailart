-- ============================================================================
-- Migrate auth: custom app_users (sha256 + localStorage) -> Supabase Auth + profiles
-- Internal roles only: admin / manager / staff. Customers are NOT users
-- (bookings stay guest/phone-based). app_users is kept (deprecated) for reference.
-- ============================================================================

-- 1. profiles: one row per internal user, linked 1:1 to auth.users
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        public.user_role not null default 'staff',
  branch      public.branch,
  staff_name  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Internal users (admin/manager/staff), linked 1:1 to auth.users. Replaces deprecated app_users.';

create index if not exists idx_profiles_role   on public.profiles(role);
create index if not exists idx_profiles_branch on public.profiles(branch);

-- 2. SECURITY DEFINER helpers — read the caller''s role/branch WITHOUT triggering
--    profiles RLS, so RLS policies can call them without infinite recursion.
create or replace function public.my_role()
  returns public.user_role
  language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_branch()
  returns public.branch
  language sql stable security definer set search_path = public as $$
  select branch from public.profiles where id = auth.uid()
$$;

create or replace function public.my_staff_name()
  returns text
  language sql stable security definer set search_path = public as $$
  select staff_name from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
  returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.is_internal_user()
  returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid())
$$;

-- 3. Auto-create a profile when an auth user is created. The admin API sets
--    role/branch/staff_name/full_name in user_metadata when creating staff.
create or replace function public.handle_new_user()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, branch, staff_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''),
             nullif(new.raw_user_meta_data->>'staff_name', '')),
    coalesce(nullif(new.raw_user_meta_data->>'role', '')::public.user_role, 'staff'),
    nullif(new.raw_user_meta_data->>'branch', '')::public.branch,
    nullif(new.raw_user_meta_data->>'staff_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. keep updated_at fresh
create or replace function public.touch_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 5. RLS on profiles
alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or (public.my_role() = 'manager' and branch = public.my_branch())
  );

drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write" on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
