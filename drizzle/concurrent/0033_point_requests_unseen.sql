-- P1-15: the customer app's unseen-approval claim (0033_celebrations): their approved, unseen requests, newest first.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "point_requests_unseen_idx" ON "point_requests" USING btree ("user_id","decided_at" DESC NULLS LAST) WHERE "point_requests"."status" = 'approved' AND "point_requests"."seen_at" IS NULL;
