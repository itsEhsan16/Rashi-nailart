-- ─────────────────────────── app-assets (public) ────────────────────────────
-- Public bucket for admin-managed brand assets shown to anonymous customers,
-- e.g. the UPI QR image on the payment screen. Uploads are performed by the
-- service-role server action (admins only); reads are public so the <img> on the
-- public payment screen resolves without a signed URL.
insert into storage.buckets (id, name, public)
values ('app-assets', 'app-assets', true)
on conflict (id) do update set public = true;

-- Public read for the bucket's objects.
drop policy if exists "app_assets_public_read" on storage.objects;
create policy "app_assets_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'app-assets');
