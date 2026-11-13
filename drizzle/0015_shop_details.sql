-- P1-01: shop opening hours, special closures and NFC tags (ARCHITECTURE §4, PRODUCT §3, §14), and an E.164 check
-- on shops.phone (the Call button). New, empty tables; the phone CHECK goes in NOT VALID (existing rows are checked
-- by a later VALIDATE, follow-up in PROGRESS) but applies to every insert and update from now on.
-- RLS: hours and closures are visible exactly when the shop row is (public for non-pending shops, the team, admins)
-- and written by the shop owner or an admin owner/support; NFC tags are seen by the shop team and admins and written
-- by admin owner/support only (tags are issued and replaced centrally), never deleted.
-- contract: one CHECK added NOT VALID on shops (brief lock, fail fast); everything else is new.
SET lock_timeout = '5s';--> statement-breakpoint
CREATE TYPE "public"."nfc_tag_status" AS ENUM('active', 'replacement_requested', 'replacement_sent', 'replaced');--> statement-breakpoint
CREATE TABLE "nfc_tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"tag_uid" text NOT NULL,
	"status" "nfc_tag_status" DEFAULT 'active' NOT NULL,
	"replaced_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfc_tags_tag_uid_format" CHECK ("nfc_tags"."tag_uid" ~ '^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$'),
	CONSTRAINT "nfc_tags_replaced_iff_pointer" CHECK (("nfc_tags"."status" = 'replaced') = ("nfc_tags"."replaced_by" IS NOT NULL)),
	CONSTRAINT "nfc_tags_not_self" CHECK ("nfc_tags"."replaced_by" <> "nfc_tags"."id")
);
--> statement-breakpoint
CREATE TABLE "shop_closures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_closures_note_length" CHECK (char_length("shop_closures"."note") <= 120)
);
--> statement-breakpoint
CREATE TABLE "shop_hours" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"opens" time NOT NULL,
	"closes" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_hours_weekday_iso" CHECK ("shop_hours"."weekday" BETWEEN 1 AND 7),
	CONSTRAINT "shop_hours_not_empty" CHECK ("shop_hours"."opens" <> "shop_hours"."closes"),
	CONSTRAINT "shop_hours_opens_in_day" CHECK ("shop_hours"."opens" < '24:00')
);
--> statement-breakpoint
ALTER TABLE "nfc_tags" ADD CONSTRAINT "nfc_tags_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfc_tags" ADD CONSTRAINT "nfc_tags_replaced_by_nfc_tags_id_fk" FOREIGN KEY ("replaced_by") REFERENCES "public"."nfc_tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_closures" ADD CONSTRAINT "shop_closures_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_hours" ADD CONSTRAINT "shop_hours_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nfc_tags_tag_uid_uq" ON "nfc_tags" USING btree ("tag_uid");--> statement-breakpoint
CREATE INDEX "nfc_tags_shop_id_idx" ON "nfc_tags" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "nfc_tags_replaced_by_idx" ON "nfc_tags" USING btree ("replaced_by");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_closures_shop_date_uq" ON "shop_closures" USING btree ("shop_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_hours_shop_weekday_opens_uq" ON "shop_hours" USING btree ("shop_id","weekday","opens");--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_phone_e164" CHECK ("shops"."phone" ~ '^\+[1-9][0-9]{6,14}$') NOT VALID;--> statement-breakpoint

-- set_updated_at() (0003) on every new table with updated_at.
CREATE TRIGGER shop_hours_set_updated_at BEFORE UPDATE ON shop_hours
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER shop_closures_set_updated_at BEFORE UPDATE ON shop_closures
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER nfc_tags_set_updated_at BEFORE UPDATE ON nfc_tags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint

-- A replaced tag points straight at the shop's current tag: never at a tag of another shop, never at a tag
-- that is itself replaced, and nothing points at a replaced tag (no chain longer than one hop). Deferred to
-- commit, so a replacement can insert the new tag, retire the old one and re-point earlier ones in any order;
-- it re-reads each row at commit rather than trusting the queued NEW (a row changed twice is judged once, as it ends).
CREATE OR REPLACE FUNCTION public.nfc_tags_one_hop() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  cur public.nfc_tags%ROWTYPE;
BEGIN
  SELECT * INTO cur FROM public.nfc_tags WHERE id = NEW.id;
  IF NOT FOUND OR cur.replaced_by IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.nfc_tags t
                 WHERE t.id = cur.replaced_by AND t.shop_id = cur.shop_id AND t.replaced_by IS NULL) THEN
    RAISE EXCEPTION 'nfc_tags: a replaced tag must point at a current tag of the same shop'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.nfc_tags t WHERE t.replaced_by = cur.id) THEN
    RAISE EXCEPTION 'nfc_tags: tags replaced by a tag that is itself replaced must be re-pointed'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.nfc_tags_one_hop() FROM PUBLIC;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER nfc_tags_one_hop AFTER INSERT OR UPDATE ON nfc_tags
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.nfc_tags_one_hop();--> statement-breakpoint

-- Tags are history (the kit shows replacements): no DELETE from the web role.
REVOKE DELETE ON nfc_tags FROM moz_app;--> statement-breakpoint

ALTER TABLE shop_hours ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shop_hours FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shop_closures ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shop_closures FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE nfc_tags ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE nfc_tags FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Hours and closures: visible whenever the shop row is visible under the shops policies (the sub-select runs
-- under RLS too), so a pending shop's hours stay with its team and the admins.
CREATE POLICY shop_hours_visible ON shop_hours AS PERMISSIVE FOR SELECT TO moz_app
  USING (EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_hours.shop_id));--> statement-breakpoint
CREATE POLICY shop_hours_owner_write ON shop_hours AS PERMISSIVE FOR ALL TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_shop_role()) = 'owner')
  WITH CHECK (shop_id = (SELECT app_shop_id()) AND (SELECT app_shop_role()) = 'owner');--> statement-breakpoint
CREATE POLICY shop_hours_admin_write ON shop_hours AS PERMISSIVE FOR ALL TO moz_app
  USING ((SELECT app_admin_role()) IN ('owner', 'support'))
  WITH CHECK ((SELECT app_admin_role()) IN ('owner', 'support'));--> statement-breakpoint
CREATE POLICY shop_closures_visible ON shop_closures AS PERMISSIVE FOR SELECT TO moz_app
  USING (EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_closures.shop_id));--> statement-breakpoint
CREATE POLICY shop_closures_owner_write ON shop_closures AS PERMISSIVE FOR ALL TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_shop_role()) = 'owner')
  WITH CHECK (shop_id = (SELECT app_shop_id()) AND (SELECT app_shop_role()) = 'owner');--> statement-breakpoint
CREATE POLICY shop_closures_admin_write ON shop_closures AS PERMISSIVE FOR ALL TO moz_app
  USING ((SELECT app_admin_role()) IN ('owner', 'support'))
  WITH CHECK ((SELECT app_admin_role()) IN ('owner', 'support'));--> statement-breakpoint

-- NFC tags: the shop's team reads its own; admins read all; admin owner/support issue and replace them.
CREATE POLICY nfc_tags_shop ON nfc_tags AS PERMISSIVE FOR SELECT TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint
CREATE POLICY nfc_tags_admin_read ON nfc_tags AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_is_admin()));--> statement-breakpoint
CREATE POLICY nfc_tags_admin_write ON nfc_tags AS PERMISSIVE FOR ALL TO moz_app
  USING ((SELECT app_admin_role()) IN ('owner', 'support'))
  WITH CHECK ((SELECT app_admin_role()) IN ('owner', 'support'));
