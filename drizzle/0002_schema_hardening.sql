-- P0-03: content_settings, FK indexes, NOT NULL flags (backfilled first), case-insensitive email, geography location.
-- contract: pre-launch, nothing deployed. NOT NULL on two boolean flags (NULLs backfilled to false first) and shops.location geometry -> geography (no locations stored yet).
CREATE TABLE "content_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_settings_key_format" CHECK ("content_settings"."key" ~ '^[a-z][a-z0-9_]{1,62}$')
);
--> statement-breakpoint
UPDATE "sessions" SET "mfa_verified" = false WHERE "mfa_verified" IS NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "mfa_verified" SET NOT NULL;--> statement-breakpoint
UPDATE "users" SET "two_factor_enabled" = false WHERE "two_factor_enabled" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "two_factor_enabled" SET NOT NULL;--> statement-breakpoint
-- Hand-fixed: drizzle-kit emits "undefined"."geography(...)" for custom types and no USING cast.
ALTER TABLE "shops" ALTER COLUMN "location" SET DATA TYPE geography(Point,4326) USING "location"::geography;--> statement-breakpoint
ALTER TABLE "content_settings" ADD CONSTRAINT "content_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_settings_updated_by_idx" ON "content_settings" USING btree ("updated_by");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "admin_members_invited_by_idx" ON "admin_members" USING btree ("invited_by");--> statement-breakpoint
CREATE INDEX "feature_flags_updated_by_idx" ON "feature_flags" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX "shop_staff_invited_by_idx" ON "shop_staff" USING btree ("invited_by");