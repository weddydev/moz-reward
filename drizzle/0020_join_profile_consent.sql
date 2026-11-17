-- P1-04: join flow. (1) customer_profiles gets the key id of its sealed phone and the 13+ declaration time, plus
-- checks (phone ciphertext, key id and blind index set together; name 1–80 chars), added NOT VALID (existing rows
-- are checked by a later VALIDATE, FOLLOWUPS) but enforced on every write from now on. (2) A guard trigger: member_id,
-- user_id, created_at and a set age_declared_at never change (any role); a customer (moz_app outside a shop scope)
-- may change only the profile fields, and may not set the 18+ columns (P4-03 sets them through its own path).
-- (3) marketing_consents: append-only consent history (COMPLIANCE §3); user_id / shop_id / created_at are filled
-- from the membership by a BEFORE trigger. (4) A deferred constraint trigger on memberships: a non-null
-- marketing_opt_in, on insert or change, needs a consent row with the same value written in the same transaction
-- (security design check HIGH 1, 17 Nov). (5) The memberships guard refuses a customer joining a shop that isn't
-- taking members (suspended, closed, pending).
-- contract: brief locks on customer_profiles and memberships (ADD COLUMN nullable, NOT VALID checks, CREATE TRIGGER);
-- fail fast. Old code never writes the new columns and only joins through P1-04's path.
SET lock_timeout = '5s';--> statement-breakpoint
CREATE TYPE "public"."consent_source" AS ENUM('join', 'rejoin', 'settings', 'leave');--> statement-breakpoint
CREATE TABLE "marketing_consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"membership_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"opted_in" boolean NOT NULL,
	"source" "consent_source" NOT NULL,
	"wording_version" text NOT NULL,
	"wording_hash" text NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_consents_wording_hash" CHECK ("marketing_consents"."wording_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "marketing_consents_wording_version" CHECK (char_length("marketing_consents"."wording_version") BETWEEN 1 AND 32)
);
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN "phone_key_id" text;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN "age_declared_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "marketing_consents_membership_idx" ON "marketing_consents" USING btree ("membership_id","created_at");--> statement-breakpoint
CREATE INDEX "marketing_consents_user_idx" ON "marketing_consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "marketing_consents_shop_idx" ON "marketing_consents" USING btree ("shop_id");--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_phone_sealed" CHECK (("customer_profiles"."phone_enc" IS NULL) = ("customer_profiles"."phone_key_id" IS NULL) AND ("customer_profiles"."phone_enc" IS NULL) = ("customer_profiles"."phone_hash" IS NULL)) NOT VALID;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_full_name_length" CHECK (char_length("customer_profiles"."full_name") BETWEEN 1 AND 80) NOT VALID;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.customer_profiles_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  -- What a customer may change on their own profile, plus the column the DB maintains itself. Everything else
  -- is protected by default, so a new column is too (tests/integration/profile-guard.test.ts classifies them).
  customer_writable CONSTANT text[] := ARRAY['full_name', 'phone_enc', 'phone_key_id', 'phone_hash',
    'birthday_day', 'birthday_month', 'sound_on', 'reduce_motion', 'updated_at'];
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.member_id IS DISTINCT FROM OLD.member_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR (OLD.age_declared_at IS NOT NULL AND NEW.age_declared_at IS DISTINCT FROM OLD.age_declared_at)) THEN
    RAISE EXCEPTION 'customer_profiles: user_id, member_id, created_at and age_declared_at never change'
      USING ERRCODE = 'restrict_violation';
  END IF;
  -- Only the web role is limited further; the worker (erasure) and migrations are not.
  IF current_user <> 'moz_app' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_adult_confirmed OR NEW.adult_confirmed_at IS NOT NULL
       OR NEW.age_declared_at IS DISTINCT FROM now()
       OR NEW.created_at <> now() OR NEW.updated_at <> now() THEN
      RAISE EXCEPTION 'customer_profiles: a customer may not set server-owned columns'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - customer_writable) IS DISTINCT FROM (to_jsonb(OLD) - customer_writable) THEN
    RAISE EXCEPTION 'customer_profiles: a customer may change only their name, phone, birthday and preferences'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.customer_profiles_guard() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER customer_profiles_guard BEFORE INSERT OR UPDATE ON customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.customer_profiles_guard();--> statement-breakpoint

-- Same function as 0014, plus: a customer can only join a shop that is taking members.
CREATE OR REPLACE FUNCTION public.memberships_customer_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  -- What a customer may change on their own membership, plus the column the DB maintains itself.
  customer_writable CONSTANT text[] := ARRAY['muted', 'marketing_opt_in', 'left_at', 'updated_at'];
BEGIN
  -- Only the web role is limited; the worker (counters, expiry) and migrations are not.
  IF current_user <> 'moz_app' THEN
    RETURN NEW;
  END IF;
  -- The shop's own team, in its own shop, on a membership of that shop (RLS limits the rest).
  IF public.app_in_shop() AND NEW.shop_id = public.app_shop_id()
     AND (TG_OP = 'INSERT' OR OLD.shop_id = public.app_shop_id()) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.purchase_count <> 0 OR NEW.last_visit_at IS NOT NULL
       OR NEW.joined_at <> now() OR NEW.created_at <> now() OR NEW.updated_at <> now() THEN
      RAISE EXCEPTION 'memberships: a customer may not set server-owned columns'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- P1-04: suspended, closed and pending shops take no new members (restricted plans still do, PRODUCT §15).
    IF NOT EXISTS (SELECT 1 FROM public.shops s WHERE s.id = NEW.shop_id
                   AND s.status IN ('active', 'expiring', 'grace', 'restricted')) THEN
      RAISE EXCEPTION 'memberships: this shop is not taking new members'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - customer_writable) IS DISTINCT FROM (to_jsonb(OLD) - customer_writable) THEN
    RAISE EXCEPTION 'memberships: a customer may change only muted, marketing_opt_in and left_at'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.marketing_consents_fill() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  m record;
BEGIN
  -- Read as the caller: a customer sees only their own memberships, so a consent can't name someone else's.
  SELECT ms.user_id, ms.shop_id INTO m FROM public.memberships ms WHERE ms.id = NEW.membership_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'marketing_consents: unknown membership' USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.user_id := m.user_id;
  NEW.shop_id := m.shop_id;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.marketing_consents_fill() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER marketing_consents_fill BEFORE INSERT ON marketing_consents
  FOR EACH ROW EXECUTE FUNCTION public.marketing_consents_fill();--> statement-breakpoint
CREATE TRIGGER marketing_consents_append_only BEFORE UPDATE OR DELETE ON marketing_consents
  FOR EACH ROW EXECUTE FUNCTION public.reject_mutation();--> statement-breakpoint
CREATE TRIGGER marketing_consents_no_truncate BEFORE TRUNCATE ON marketing_consents
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_mutation();--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.memberships_consent_recorded() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_opt_in boolean;
  latest record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.marketing_opt_in IS NOT DISTINCT FROM OLD.marketing_opt_in THEN
    RETURN NULL;
  END IF;
  -- Deferred to commit: judge the row as it is now (it may have changed again since this event).
  SELECT ms.marketing_opt_in INTO current_opt_in FROM public.memberships ms WHERE ms.id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF current_opt_in IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      RETURN NULL; -- not asked yet (seeded and pre-P1-04 rows); senders treat NULL as "no"
    END IF;
    RAISE EXCEPTION 'memberships: marketing_opt_in can not go back to "not asked"'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT c.opted_in, c.created_at INTO latest FROM public.marketing_consents c
    WHERE c.membership_id = NEW.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1;
  IF NOT FOUND OR latest.created_at <> now() OR latest.opted_in <> current_opt_in THEN
    RAISE EXCEPTION 'memberships: marketing_opt_in changed without a consent record in the same transaction'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.memberships_consent_recorded() FROM PUBLIC;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER memberships_consent_recorded AFTER INSERT OR UPDATE OF marketing_opt_in ON memberships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.memberships_consent_recorded();--> statement-breakpoint

-- RLS: the customer reads and adds their own consent rows; the shop's team and admins read. Never updated or
-- deleted (no grant, and the append-only trigger for every role).
ALTER TABLE marketing_consents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE marketing_consents FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON marketing_consents FROM moz_app;--> statement-breakpoint
CREATE POLICY marketing_consents_own ON marketing_consents AS PERMISSIVE FOR SELECT TO moz_app
  USING (user_id = (SELECT app_user_id()));--> statement-breakpoint
CREATE POLICY marketing_consents_own_insert ON marketing_consents AS PERMISSIVE FOR INSERT TO moz_app
  WITH CHECK (user_id = (SELECT app_user_id()));--> statement-breakpoint
CREATE POLICY marketing_consents_shop ON marketing_consents AS PERMISSIVE FOR SELECT TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint
CREATE POLICY marketing_consents_admin ON marketing_consents AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_is_admin()));
