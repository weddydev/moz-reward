-- P2-02 Requests page (PRODUCT §5, §14): the approve form's item quick-picks and the "Approved today" tab's index.
-- `shops.quick_picks` holds `[{ label, pricePence }]` (the owner edits it in Settings, P2-05; the team reads it with
-- the shop row it already reads). Adding a column with a constant default is metadata-only; the CHECK is added
-- NOT VALID (every existing row holds the default `[]`) and validated by a later migration (FOLLOWUPS).
-- The partial index for approvals by decision time is built CONCURRENTLY (drizzle/concurrent/0039_…).
-- contract: none needed (a new column with a default, a new constraint and a new index; nothing removed).
SET lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "quick_picks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_quick_picks_shape" CHECK (jsonb_typeof("shops"."quick_picks") = 'array' AND jsonb_array_length("shops"."quick_picks") <= 8) NOT VALID;
