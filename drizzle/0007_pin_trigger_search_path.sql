-- P0-19 (SEC-9): the session-revocation trigger function pins its search_path and names its table with the
-- schema, so a session that puts another schema first can't redirect the DELETE to an impostor `sessions`
-- table (seen in tests/integration/session-rotation.test.ts). Replaces the function body only; the triggers
-- from 0006 keep pointing at it.
-- contract: no table is altered or locked; CREATE OR REPLACE FUNCTION swaps the body atomically.
SET lock_timeout = '5s';--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.revoke_sessions_on_privilege_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    DELETE FROM public.sessions WHERE user_id = OLD.user_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    DELETE FROM public.sessions WHERE user_id = NEW.user_id;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;
