-- ============================================================================
-- ADD-ON CATALOG + PER-UNIT EXTRAS (2026-07-31)
-- This is a nail studio: most in-studio add-ons are priced PER NAIL, so an extra
-- needs a rate and a count, not one flat rupee figure. Two parts:
--   1. public.service_addons — an admin-managed catalog of add-ons and their
--      per-unit rate, mirroring public.services.
--   2. appointment_extras gains quantity / unit_amount / unit_label / addon_id.
--      `amount` KEEPS its meaning — the line TOTAL — so every existing sum over
--      it (revenue, staff earnings, commission, overview charts) is unaffected.
-- Idempotent: safe to re-run.
-- ============================================================================

-- ─────────────────────────── 1. add-on catalog ──────────────────────────────
create table if not exists public.service_addons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  rate        integer not null check (rate >= 0),  -- ₹ per unit
  unit_label  text not null default 'nail',        -- rendered as "per nail"
  per_unit    boolean not null default true,       -- false = flat charge, qty locked to 1
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

comment on table public.service_addons is
  'Catalog of in-studio add-ons staff can charge on top of the booked service. `rate` is per `unit_label` when per_unit; a flat charge otherwise. Staff may override the rate on an individual booking — appointment_extras snapshots what was actually charged.';

-- Starter list. Real names/rates are maintained in the admin Manage → Add-ons
-- tab, so this only has to be a sane non-empty default.
insert into public.service_addons (name, rate, unit_label, per_unit, sort_order) values
  ('Nail Art',         120, 'nail', true,  1),
  ('Gel Polish',        80, 'nail', true,  2),
  ('Extension Repair', 100, 'nail', true,  3),
  ('Nail Removal',     200, 'set',  false, 4)
on conflict (name) do nothing;

-- Same shape as the services/time_slots catalogs: anyone reads active rows
-- (admins also see inactive ones), admins manage. Server actions use the
-- service-role client and bypass this either way.
alter table public.service_addons enable row level security;

drop policy if exists "service_addons_public_read" on public.service_addons;
create policy "service_addons_public_read" on public.service_addons
  for select to anon, authenticated using (active or public.is_admin());

drop policy if exists "service_addons_admin_write" on public.service_addons;
create policy "service_addons_admin_write" on public.service_addons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ──────────────────────── 2. per-unit appointment extras ────────────────────
-- unit_amount / unit_label are SNAPSHOTS of what was charged, so editing a
-- catalog rate later never rewrites history. addon_id is nullable: NULL means a
-- custom free-text extra (staff can still type anything).
alter table public.appointment_extras
  add column if not exists quantity    integer not null default 1 check (quantity > 0),
  add column if not exists unit_amount integer,
  add column if not exists unit_label  text,
  add column if not exists addon_id    uuid references public.service_addons(id) on delete set null;

-- Legacy rows are quantity 1, so the flat amount IS the unit amount.
update public.appointment_extras set unit_amount = amount where unit_amount is null;
alter table public.appointment_extras alter column unit_amount set not null;

comment on column public.appointment_extras.amount is
  'Line TOTAL in ₹ (= unit_amount * quantity). Kept as a stored column because every revenue/earnings aggregation sums it.';
comment on column public.appointment_extras.unit_amount is
  'Rate per unit actually charged — snapshot, may differ from the catalog rate if staff overrode it.';
comment on column public.appointment_extras.addon_id is
  'service_addons row this line came from. NULL = custom free-text extra.';

-- Guarantee the stored total can never drift from rate × count.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointment_extras_amount_matches'
  ) then
    alter table public.appointment_extras
      add constraint appointment_extras_amount_matches
      check (amount = unit_amount * quantity);
  end if;
end $$;

create index if not exists idx_appointment_extras_addon
  on public.appointment_extras (addon_id);
