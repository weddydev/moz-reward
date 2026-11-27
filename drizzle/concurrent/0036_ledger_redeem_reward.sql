-- P1-D close review: a reward's redeem rows for the integrity check (0036_integrity_redeem_index).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ledger_entries_redeem_reward_idx" ON "ledger_entries" USING btree (("ref"->>'rewardId')) WHERE "ledger_entries"."type" = 'redeem';
