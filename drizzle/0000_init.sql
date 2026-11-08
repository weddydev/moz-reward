CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('owner', 'support', 'moderator', 'finance');--> statement-breakpoint
CREATE TYPE "public"."shop_staff_role" AS ENUM('owner', 'staff');--> statement-breakpoint
CREATE TYPE "public"."shop_status" AS ENUM('pending', 'active', 'expiring', 'grace', 'restricted', 'suspended', 'closed');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"aaguid" text,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"mfa_verified" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_members" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" "admin_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone_enc" text,
	"phone_hash" text,
	"birthday_day" smallint,
	"birthday_month" smallint,
	"member_id" text NOT NULL,
	"sound_on" boolean DEFAULT true NOT NULL,
	"reduce_motion" boolean,
	"is_adult_confirmed" boolean DEFAULT false NOT NULL,
	"adult_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_profiles_memberId_unique" UNIQUE("member_id"),
	CONSTRAINT "customer_profiles_member_id_format" CHECK ("customer_profiles"."member_id" ~ '^[2-9A-HJKMNP-TV-Z]{6}$'),
	CONSTRAINT "customer_profiles_birthday_valid" CHECK (("customer_profiles"."birthday_day" IS NULL AND "customer_profiles"."birthday_month" IS NULL) OR ("customer_profiles"."birthday_day" BETWEEN 1 AND 31 AND "customer_profiles"."birthday_month" BETWEEN 1 AND 12))
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"description" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"marketing_opt_in" boolean,
	"left_at" timestamp with time zone,
	"purchase_count" integer DEFAULT 0 NOT NULL,
	"last_visit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_purchase_count_non_negative" CHECK ("memberships"."purchase_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shop_staff" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "shop_staff_role" DEFAULT 'staff' NOT NULL,
	"per_award_limit" integer,
	"active" boolean DEFAULT true NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_staff_per_award_limit_positive" CHECK ("shop_staff"."per_award_limit" IS NULL OR "shop_staff"."per_award_limit" > 0)
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"shop_code" text NOT NULL,
	"name" text NOT NULL,
	"trading_name" text,
	"category" text NOT NULL,
	"description" text,
	"address_line1" text,
	"address_line2" text,
	"town" text,
	"postcode" text,
	"location" geometry(point, 4326),
	"google_place_id" text,
	"phone" text,
	"logo_url" text,
	"cover_url" text,
	"vat_number" text,
	"status" "shop_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shops_slug_unique" UNIQUE("slug"),
	CONSTRAINT "shops_shopCode_unique" UNIQUE("shop_code"),
	CONSTRAINT "shops_shop_code_format" CHECK ("shops"."shop_code" ~ '^[2-9A-HJKMNP-TV-Z]{6}$')
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_members" ADD CONSTRAINT "admin_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_members" ADD CONSTRAINT "admin_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_staff" ADD CONSTRAINT "shop_staff_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_staff" ADD CONSTRAINT "shop_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_staff" ADD CONSTRAINT "shop_staff_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkeys_user_id_idx" ON "passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkeys_credential_id_idx" ON "passkeys" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factors_secret_idx" ON "two_factors" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "two_factors_user_id_idx" ON "two_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id","at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action","at");--> statement-breakpoint
CREATE INDEX "customer_profiles_phone_hash_idx" ON "customer_profiles" USING btree ("phone_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_shop_uq" ON "memberships" USING btree ("user_id","shop_id");--> statement-breakpoint
CREATE INDEX "memberships_shop_id_idx" ON "memberships" USING btree ("shop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_staff_shop_user_uq" ON "shop_staff" USING btree ("shop_id","user_id");--> statement-breakpoint
CREATE INDEX "shop_staff_user_id_idx" ON "shop_staff" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shops_location_gist" ON "shops" USING gist ("location");--> statement-breakpoint
CREATE INDEX "shops_status_idx" ON "shops" USING btree ("status");