-- Checks a restored copy of the app database (P0-15 D). Run by infra/host/moz-backup's monthly restore drill in
-- a scratch container and by `pnpm backup:verify` against a scratch database on a laptop, always as a superuser:
--   psql -X -v ON_ERROR_STOP=1 [-v expected_migrations=<n>] -d <restored db> -f checks.sql
-- Each line printed is `check|result|detail`. A failed check raises, so psql exits non-zero and nothing after it
-- runs; the last line is `all|pass|...` only when every check passed. Read-only apart from one temporary function.
\set QUIET on
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
\pset footer off
SET client_min_messages = warning;
\if :{?expected_migrations}
\else
\set expected_migrations ''
\endif

CREATE FUNCTION pg_temp.backup_check(name text, ok boolean, detail text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS NOT TRUE THEN
    RAISE EXCEPTION 'backup check failed: % (%)', name, detail;
  END IF;
  RETURN name || '|pass|' || detail;
END;
$$;

-- 1. Migration head: every migration of the source is there (the drill passes the source's count).
SELECT pg_temp.backup_check('migrations',
         n > 0 AND (:'expected_migrations' = '' OR n = nullif(:'expected_migrations', '')::int),
         n || ' applied' || CASE WHEN :'expected_migrations' = '' THEN '' ELSE ', expected ' || :'expected_migrations' END)
  FROM (SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations) m;

-- 2. Row-Level Security: every table is ENABLE + FORCE with at least one policy, except the tables a migration
--    declared global (`-- rls: global`, kept in step by scripts/backup-checks.test.ts) and PostGIS's own.
SELECT pg_temp.backup_check('rls',
         count(*) = 0,
         coalesce('missing on ' || string_agg(c.relname, ', ' ORDER BY c.relname), 'every app table'))
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace
   AND c.relkind IN ('r', 'p')
   AND c.relname NOT IN ('failed_jobs', 'job_heartbeats', 'spatial_ref_sys')
   AND NOT (c.relrowsecurity AND c.relforcerowsecurity
            AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));

-- 3. Foreign keys: all restored as validated (pg_restore re-checks each one when it adds it).
SELECT pg_temp.backup_check('foreign-keys',
         count(*) FILTER (WHERE NOT convalidated) = 0,
         count(*) || ' foreign keys, ' || count(*) FILTER (WHERE NOT convalidated) || ' not validated')
  FROM pg_constraint
 WHERE contype = 'f' AND connamespace = 'public'::regnamespace;

-- 4. Grants and definer functions came back as they were (a restore without roles or ACLs would differ).
SELECT pg_temp.backup_check('grants',
         has_table_privilege('moz_app', 'public.users', 'SELECT')
         AND NOT has_table_privilege('moz_app', 'public.job_heartbeats', 'SELECT')
         AND NOT has_table_privilege('moz_app', 'public.failed_jobs', 'SELECT')
         AND NOT has_table_privilege('moz_app', 'public.outbox', 'DELETE')
         AND NOT has_function_privilege('moz_app', 'public.record_backup_heartbeat(text)', 'EXECUTE')
         AND NOT has_function_privilege('moz_worker', 'public.record_backup_heartbeat(text)', 'EXECUTE'),
         'app roles keep their grants and nothing more');
SELECT pg_temp.backup_check('definer-functions',
         count(*) > 0 AND count(*) FILTER (WHERE pg_get_userbyid(proowner) <> 'moz_rls') = 0,
         count(*) || ' SECURITY DEFINER functions, owners: ' || string_agg(DISTINCT pg_get_userbyid(proowner), ', '))
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace AND prosecdef;

-- 5. PostGIS is there (distance queries need it).
SELECT pg_temp.backup_check('postgis', count(*) = 1, coalesce(max(extversion), 'missing'))
  FROM pg_extension WHERE extname = 'postgis';

-- 6. Outbox reconciliation: counts by state, and no row in two final states at once.
SELECT pg_temp.backup_check('outbox',
         count(*) FILTER (WHERE completed_at IS NOT NULL AND failed_at IS NOT NULL) = 0,
         count(*) || ' rows: ' || count(*) FILTER (WHERE dispatched_at IS NULL AND completed_at IS NULL AND failed_at IS NULL)
           || ' pending, ' || count(*) FILTER (WHERE dispatched_at IS NOT NULL AND completed_at IS NULL AND failed_at IS NULL)
           || ' dispatched, ' || count(*) FILTER (WHERE completed_at IS NOT NULL) || ' completed, '
           || count(*) FILTER (WHERE failed_at IS NOT NULL) || ' failed')
  FROM public.outbox;

-- 7. Row counts per table (for the record; compare with the source when in doubt).
SELECT 'rows|' || c.relname || '|'
       || (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relname <> 'spatial_ref_sys'
 ORDER BY c.relname;

SELECT 'all|pass|every check passed';
