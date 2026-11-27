-- P1-D close review (P1-17 integrity check "reward redeemed twice"): a partial expression index on the ledger's
-- redeem rows by `ref->>'rewardId'`, so the nightly check probes an index per reward instead of scanning the
-- whole ledger per reward. ledger_entries already exists, so the index is built CONCURRENTLY
-- (drizzle/concurrent/0036_ledger_redeem_reward.sql); this migration only records it in the snapshot.
-- contract: none needed (an index only).
SET lock_timeout = '5s';
