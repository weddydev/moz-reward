-- P2-02: the shop's approvals by decision time, newest first (Requests "Approved today" tab, keyset pages) (0039_p2_02_requests_page).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "point_requests_shop_approved_idx" ON "point_requests" USING btree ("shop_id","decided_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "point_requests"."status" = 'approved';
