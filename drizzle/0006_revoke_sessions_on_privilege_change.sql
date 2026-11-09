-- P0-06 (SECURITY §2): sessions rotate on privilege change. Whenever a user's shop_staff or admin_members rows
-- are added, removed, or change role / active / shop, every session of that user ends, so they sign in again
-- (staff and admins with password + second factor). Done in the database so no role writer can forget it.
-- Roles are also read fresh on every request (authz/principal.ts); this covers the session itself, e.g. a
-- customer's magic-link session that would otherwise live on after the account becomes staff.
-- contract: the DELETEs run inside the trigger function at row-change time, not during the migration; this
-- migration only adds a function and triggers (expand-only, no data removed when it runs).
CREATE OR REPLACE FUNCTION revoke_sessions_on_privilege_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    DELETE FROM sessions WHERE user_id = OLD.user_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    DELETE FROM sessions WHERE user_id = NEW.user_id;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER shop_staff_grant_revoke_sessions
  AFTER INSERT OR DELETE ON shop_staff
  FOR EACH ROW EXECUTE FUNCTION revoke_sessions_on_privilege_change();--> statement-breakpoint
CREATE TRIGGER shop_staff_change_revoke_sessions
  AFTER UPDATE OF role, active, shop_id, user_id ON shop_staff
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role OR OLD.active IS DISTINCT FROM NEW.active
        OR OLD.shop_id IS DISTINCT FROM NEW.shop_id OR OLD.user_id IS DISTINCT FROM NEW.user_id)
  EXECUTE FUNCTION revoke_sessions_on_privilege_change();--> statement-breakpoint
CREATE TRIGGER admin_members_grant_revoke_sessions
  AFTER INSERT OR DELETE ON admin_members
  FOR EACH ROW EXECUTE FUNCTION revoke_sessions_on_privilege_change();--> statement-breakpoint
CREATE TRIGGER admin_members_change_revoke_sessions
  AFTER UPDATE OF role, active, user_id ON admin_members
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role OR OLD.active IS DISTINCT FROM NEW.active
        OR OLD.user_id IS DISTINCT FROM NEW.user_id)
  EXECUTE FUNCTION revoke_sessions_on_privilege_change();
