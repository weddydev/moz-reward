-- P0-06 (audit SEC-M5b): emails are stored in lower case. Normalise any raw-inserted rows first; the existing
-- users_email_lower_uq index already guarantees this cannot create duplicates.
UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"));
