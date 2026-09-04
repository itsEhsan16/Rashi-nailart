-- ============================================================================
-- RETIRE THE MANUAL UPI SETTINGS (2026-09-04)
--
-- The manual "pay by UPI, upload a screenshot" flow was replaced by the Cashfree
-- gateway. Nothing customer-facing reads app_settings any more — the payment
-- screen is pure Cashfree — but three problems were left behind:
--
--   1. `upi_qr_url` still defaults to '/upi-qr.svg', and rows still hold
--      '/upi-qr.svg' or '/QR.png'. Both files have now been deleted from
--      public/, so those values point at a 404.
--   2. The stored UPI VPA is a live payment identifier belonging to a person.
--      With a direct-UPI path visible anywhere, a payment aggregator reviewing
--      the site can read it as collecting outside the gateway.
--   3. app_settings is readable by `anon`. The browser ships the anon key, so
--      anybody could read the studio's UPI ID straight out of the database.
--
-- Point 3 is a live data exposure, not cosmetics — it is the reason this
-- migration should be applied promptly rather than batched.
--
-- The columns are deliberately NOT dropped: dropping is irreversible, older
-- migrations reference them, and it would force a hand-edit of the generated
-- types in src/integrations/supabase/types.ts. Neutralising the defaults, the
-- stored values and the read policy achieves the same outcome safely.
--
-- Apply to the LIVE project (ref wvosbrierwuwjgiplksz) via the Supabase SQL
-- editor — NOT via the Supabase MCP, which points at a different project.
-- Idempotent: safe to re-run.
-- ============================================================================

-- ─────────────────── 1. stop handing out a dead asset path ──────────────────
alter table public.app_settings
  alter column upi_qr_url set default '';

update public.app_settings
set    upi_qr_url = '',
       updated_at = now()
where  upi_qr_url in ('/upi-qr.svg', '/QR.png');

-- ─────────────────── 2. clear the stored UPI identifiers ────────────────────
update public.app_settings
set    upi_id     = '',
       updated_at = now()
where  upi_id <> '';

-- ─────────────────── 3. close the anonymous read hole ───────────────────────
-- The only reader is getAppSettings(), an admin-gated server action using the
-- service-role client, which bypasses RLS entirely. No anonymous or ordinary
-- authenticated code path touches this table, so removing public read is safe.
drop policy if exists "app_settings_public_read" on public.app_settings;

do $$
begin
  if to_regprocedure('public.is_admin()') is not null then
    execute 'drop policy if exists "app_settings_admin_read" on public.app_settings';
    execute 'create policy "app_settings_admin_read" on public.app_settings
               for select to authenticated using (public.is_admin())';
  else
    raise notice 'public.is_admin() not found — app_settings left with no select policy (service-role access is unaffected).';
  end if;
end
$$;

-- ─────────────────── 4. record why these columns still exist ────────────────
comment on column public.app_settings.upi_id is
  'LEGACY, unused since the Cashfree migration. Must stay blank — a published UPI ID reads as collecting payments outside the payment aggregator.';
comment on column public.app_settings.upi_qr_url is
  'LEGACY, unused since the Cashfree migration. Must stay blank; the static QR assets it used to point at were deleted.';
comment on column public.app_settings.payee_name is
  'LEGACY, unused since the Cashfree migration. Retained so historical rows remain readable.';
