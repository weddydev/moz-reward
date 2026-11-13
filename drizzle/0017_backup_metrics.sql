-- P0-15 D2: some backup heartbeats carry a measurement. The nightly run records `backup:storage` (bytes the
-- environment's prefix holds in B2) and `backup:key-expiry` (the backup key's expiry, epoch seconds; 0 = none);
-- health.backup alerts at 70% of the storage budget and 30 days before the key expires. Same shape as 0016:
-- a SECURITY DEFINER function owned by moz_rls that accepts only these two names, called only by the superuser.
SET lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "job_heartbeats" ADD COLUMN "value" bigint;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.record_backup_metric(p_name text, p_value bigint) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF p_name IS NULL OR p_name NOT IN ('backup:storage', 'backup:key-expiry') THEN
    RAISE EXCEPTION 'record_backup_metric: not a backup metric name' USING ERRCODE = '22023';
  END IF;
  IF p_value IS NULL OR p_value < 0 THEN
    RAISE EXCEPTION 'record_backup_metric: value must be a non-negative number' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.job_heartbeats (name, last_run_at, value) VALUES (p_name, now(), p_value)
  ON CONFLICT (name) DO UPDATE SET last_run_at = excluded.last_run_at, value = excluded.value, updated_at = now();
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_backup_metric(text, bigint) FROM PUBLIC;--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO moz_rls;--> statement-breakpoint
ALTER FUNCTION public.record_backup_metric(text, bigint) OWNER TO moz_rls;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM moz_rls;
