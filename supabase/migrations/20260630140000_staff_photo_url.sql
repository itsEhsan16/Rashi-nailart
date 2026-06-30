-- STAFF PHOTO URL (2026-06-30) — per-stylist profile photo the admin/manager can
-- upload from the Team → employee page. Stored as a public URL in the app-assets
-- bucket (with a ?v= cache-buster). When null, the app falls back to the bundled
-- photo in /public/stylist (src/lib/staff-photos.ts).
--
-- Idempotent and additive. No RLS change: staff_public_read (using true) already
-- exposes staff columns to the anon catalog, and uploads write via the service role.
alter table public.staff
  add column if not exists photo_url text;

comment on column public.staff.photo_url is
  'Public URL of the stylist''s uploaded profile photo (app-assets bucket); null = use bundled /public/stylist fallback.';
