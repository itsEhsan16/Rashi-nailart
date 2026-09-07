-- ============================================================================
-- THIRD STUDIO: 'Borivali W' — branches row (2026-09-08)
-- ----------------------------------------------------------------------------
-- On the live project (wvosbrierwuwjgiplksz) this is the ONLY step: branches.name
-- is plain text there, confirmed by 20260908120000 returning 42704 "type
-- public.branch does not exist". On a database that still has the enum, run
-- 20260908120000 first and let it COMMIT — see that file for why the ALTER TYPE
-- cannot share this transaction.
--
-- SEEDED ACTIVE. getCatalog() filters `active = true` (src/lib/catalog.ts), so
-- the studio is published to the landing page, /contact, /about and the customer
-- booking form as soon as this runs. Until artists are added AND given weekly
-- schedules, a customer who picks Borivali W sees "No artists are available on
-- this date" — that is the intended trade-off of announcing the studio early.
-- To hold it back instead, flip Active off in Admin -> Manage -> Branches; the
-- row is editable there immediately because listBranchesManage does not filter
-- on `active`.
--
-- address / map_url / phone are left NULL deliberately; the admin fills them in
-- via Admin -> Manage -> Branches. Every consumer already degrades gracefully:
-- catalog.ts BranchOption, contact/page.tsx branchAddress(), page.tsx's
-- `b.address ?? "Mumbai, Maharashtra"`.
--
-- sort_order is COMPUTED rather than hardcoded so the row lands last whether or
-- not the inactive Kandivali row (sort_order 3) exists on this project.
--
-- Idempotent — safe to re-run: `on conflict (name) do nothing` means a second run
-- neither duplicates the row nor resets the admin's address edits or a
-- deliberately-flipped `active`.
-- ============================================================================

insert into public.branches (name, address, map_url, phone, active, sort_order)
select 'Borivali W', null, null, null, true,
       coalesce((select max(sort_order) from public.branches), 0) + 1
on conflict (name) do nothing;

-- Sanity check: expect one active 'Borivali W' row, last by sort_order.
--   select name, active, sort_order from public.branches order by sort_order;
