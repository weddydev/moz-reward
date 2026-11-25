-- P1-11 points requests (PRODUCT §5, §19; SECURITY §6; ENGINEERING §7). A new, empty table.
--  * One open request (pending or awaiting_owner) per membership: partial unique index. One request per tap:
--    unique idempotency_key (a retry with the same key finds the first row).
--  * requested_at is the server's receipt time: the web role can't choose it (guard below: it must equal now()).
--    The client's clock is kept in client_requested_at, advisory only.
--  * Status `cancelled` (not in the task's list): a member leaving the shop with a request open (C-68,
--    DECISIONS 25 Nov). decided_at is set exactly when a request leaves the open states (CHECK).
-- Privileges and RLS: the member reads, inserts and cancels their own requests (insert only for a current
-- membership of a shop that takes requests, PRODUCT §15); the shop's team reads its shop's requests (decisions
-- arrive with P1-12, which adds its own update path); admins read. No DELETE or TRUNCATE for the web role.
-- Jobs (expiry, reminder) run as moz_worker. contract: none needed (new type, new table, new functions).
SET lock_timeout = '5s';--> statement-breakpoint
CREATE TYPE "public"."point_request_status" AS ENUM('pending', 'awaiting_owner', 'approved', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "point_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"membership_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"status" "point_request_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_requested_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_requests_decided_when_closed" CHECK (("point_requests"."status" IN ('pending', 'awaiting_owner')) = ("point_requests"."decided_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "point_requests" ADD CONSTRAINT "point_requests_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_requests" ADD CONSTRAINT "point_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_requests" ADD CONSTRAINT "point_requests_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "point_requests_idempotency_key_uq" ON "point_requests" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "point_requests_one_open_uq" ON "point_requests" USING btree ("membership_id") WHERE "point_requests"."status" IN ('pending', 'awaiting_owner');--> statement-breakpoint
CREATE INDEX "point_requests_membership_requested_idx" ON "point_requests" USING btree ("membership_id","requested_at");--> statement-breakpoint
CREATE INDEX "point_requests_shop_requested_idx" ON "point_requests" USING btree ("shop_id","requested_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "point_requests_user_id_idx" ON "point_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "point_requests_open_requested_idx" ON "point_requests" USING btree ("requested_at") WHERE "point_requests"."status" IN ('pending', 'awaiting_owner');
--> statement-breakpoint
CREATE TRIGGER point_requests_set_updated_at BEFORE UPDATE ON point_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint

-- What the web role may do to a request. Inserts: a new pending request stamped by the database. Updates: the
-- member cancelling their own open request (leave, C-68); nothing else until P1-12. The worker and migrations
-- are not limited.
CREATE OR REPLACE FUNCTION public.point_requests_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user <> 'moz_app' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.requested_at <> now() OR NEW.decided_at IS NOT NULL
       OR NEW.reminded_at IS NOT NULL OR NEW.created_at <> now() OR NEW.updated_at <> now() THEN
      RAISE EXCEPTION 'point_requests: a request may not set server-owned columns'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.user_id = public.app_user_id() AND public.app_scope() = 'customer'
     AND OLD.status IN ('pending', 'awaiting_owner') AND NEW.status = 'cancelled'
     AND NEW.decided_at = now()
     AND (to_jsonb(NEW) - ARRAY['status', 'decided_at', 'updated_at'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'decided_at', 'updated_at']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'point_requests: only the member may cancel their own open request'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.point_requests_guard() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER point_requests_guard BEFORE INSERT OR UPDATE ON point_requests
  FOR EACH ROW EXECUTE FUNCTION point_requests_guard();--> statement-breakpoint

REVOKE ALL ON point_requests FROM PUBLIC, moz_auth;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON point_requests FROM moz_app;--> statement-breakpoint
GRANT UPDATE (status, decided_at, updated_at) ON point_requests TO moz_app;--> statement-breakpoint

ALTER TABLE point_requests ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE point_requests FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY point_requests_own_read ON point_requests AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_scope()) = 'customer' AND user_id = (SELECT app_user_id()));--> statement-breakpoint
-- The member's own current membership (its user and shop must match the row), at a shop taking requests:
-- expiring and grace behave as active, restricted still takes them; suspended, closed and pending don't
-- (PRODUCT §15). The sub-selects run under memberships_own and shops_public, so they only see the caller's rows.
CREATE POLICY point_requests_own_insert ON point_requests AS PERMISSIVE FOR INSERT TO moz_app
  WITH CHECK (
    (SELECT app_scope()) = 'customer' AND user_id = (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM memberships m
                WHERE m.id = point_requests.membership_id AND m.user_id = point_requests.user_id
                  AND m.shop_id = point_requests.shop_id AND m.left_at IS NULL)
    AND EXISTS (SELECT 1 FROM shops s WHERE s.id = point_requests.shop_id
                  AND s.status IN ('active', 'expiring', 'grace', 'restricted'))
  );--> statement-breakpoint
CREATE POLICY point_requests_own_cancel ON point_requests AS PERMISSIVE FOR UPDATE TO moz_app
  USING ((SELECT app_scope()) = 'customer' AND user_id = (SELECT app_user_id())
         AND status IN ('pending', 'awaiting_owner'))
  WITH CHECK ((SELECT app_scope()) = 'customer' AND user_id = (SELECT app_user_id())
              AND status = 'cancelled');--> statement-breakpoint
CREATE POLICY point_requests_team_read ON point_requests AS PERMISSIVE FOR SELECT TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint
CREATE POLICY point_requests_admin_read ON point_requests AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_is_admin()));
