-- P0-08: sound_on becomes "no choice yet" by default (null), like reduce_motion, so a choice made on a device
-- before sign-in can be told apart from a profile that never chose (sounds are on by default in the app).
-- Metadata-only changes (no rewrite, no scan); rows written before this keep their value.
SET lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "customer_profiles" ALTER COLUMN "sound_on" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "customer_profiles" ALTER COLUMN "sound_on" DROP NOT NULL;
