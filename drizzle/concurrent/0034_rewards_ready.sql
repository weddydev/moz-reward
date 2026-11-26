-- P1-16: a member's unredeemed rewards by expiry (Wallet, Vault, the redeem flow) (0034_redemptions).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "rewards_membership_ready_idx" ON "rewards" USING btree ("membership_id","expires_at") WHERE "rewards"."redeemed_at" IS NULL;
