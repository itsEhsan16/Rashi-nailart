-- ============================================================================
-- THIRD STUDIO: 'Borivali W' — enum label (2026-09-08)
-- ----------------------------------------------------------------------------
-- ON THE LIVE PROJECT (wvosbrierwuwjgiplksz) THIS IS A NO-OP. Running the bare
-- `alter type public.branch add value ...` there returned
--     ERROR 42704: type "public.branch" does not exist
-- which settles a question the migration history left ambiguous: the enum is
-- GONE, so 20260615140000_full_app_setup.sql really did land and every branch
-- column — appointments.branch, staff.branch, profiles.branch, branches.name —
-- is plain text. Adding a studio there needs no type surgery at all; the
-- branches row in 20260908120100 is the whole job.
--
-- The file stays, guarded, for the replay case: a database built from
-- 20260427112326 onwards DOES have public.branch, and 20260605091000:51 declares
-- branches.name with it, so the seed would fail with invalid_text_representation
-- without this label. The guard makes the file safe in both worlds instead of
-- hard-erroring in one of them.
--
-- STILL RUN THIS ALONE, ahead of 20260908120100, wherever the type does exist:
-- Postgres refuses to USE a value added by ALTER TYPE ... ADD VALUE inside the
-- transaction that added it (SQLSTATE 55P04), and the Supabase SQL editor runs a
-- pasted script as ONE transaction. Same split the repo used for Kandivali:
-- label in 20260501130420:3, branches row in 20260605091000:60.
--
-- ADD VALUE inside a DO block is fine on Postgres 12+ (Supabase is well past
-- that): the restriction there is on USING the new value in the same
-- transaction, which this does not do.
--
-- Idempotent — safe to re-run, and safe to run on a database with no branch enum.
-- ============================================================================

do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'branch' and t.typtype = 'e'
  ) then
    execute 'alter type public.branch add value if not exists ''Borivali W''';
    raise notice 'branch enum: added label ''Borivali W''';
  else
    raise notice 'branch enum: public.branch does not exist — nothing to do (branch columns are text)';
  end if;
end $$;

-- Where the type exists, verify AFTER this commits — a new label is invisible
-- inside its own transaction:
--   select enumsortorder, enumlabel from pg_enum
--   where enumtypid = 'public.branch'::regtype order by 1;
