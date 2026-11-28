-- P2-02: member-QR scan awards (PRODUCT §5 "Member QR scan": award directly, creating an already-approved request
-- for audit). The shop's team inserts a `source = 'scan'` request for a CURRENT member of the shop of its session
-- (never itself), and the same transaction decides it through the P1-12 approve path, so every award guard below
-- (staff limit → awaiting_owner, platform cap, self-award ban, ingot snapshot) applies unchanged. A customer may
-- still only insert `source = 'request'` (point_requests_own_insert); before this the guard refused every scan.
-- contract: none needed (a guard replaced with the same rules plus the scan insert, and one new policy).
SET lock_timeout = '5s';--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.point_requests_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  decision_cols CONSTANT text[] := ARRAY['status', 'decided_at', 'decided_by', 'amount_pence', 'items',
    'award_gold', 'reject_reason', 'reject_note', 'routed_by', 'routed_at', 'progress_before', 'progress_after',
    'ingot_size', 'updated_at'];
  role text;
  cap record;
  lim integer;
BEGIN
  IF current_user <> 'moz_app' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.requested_at <> now() OR NEW.decided_at IS NOT NULL
       OR NEW.reminded_at IS NOT NULL OR NEW.created_at <> now() OR NEW.updated_at <> now()
       OR NEW.decided_by IS NOT NULL OR NEW.amount_pence IS NOT NULL OR NEW.items IS NOT NULL
       OR NEW.award_gold IS NOT NULL OR NEW.reject_reason IS NOT NULL OR NEW.reject_note IS NOT NULL
       OR NEW.routed_by IS NOT NULL OR NEW.routed_at IS NOT NULL
       OR NEW.progress_before IS NOT NULL OR NEW.progress_after IS NOT NULL OR NEW.ingot_size IS NOT NULL
       OR NEW.seen_at IS NOT NULL THEN
      RAISE EXCEPTION 'point_requests: a request may not set server-owned columns'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- P2-02: a customer's tap is a 'request'; the shop's team scanning a member QR makes a 'scan', for a member
    -- other than themselves, in the shop of their session, with no client clock. Nobody else inserts.
    IF public.app_scope() = 'customer' AND NEW.source = 'request' THEN
      RETURN NEW;
    END IF;
    IF public.app_scope() = 'shop' AND NEW.source = 'scan' AND public.app_in_shop()
       AND NEW.shop_id = public.app_shop_id() AND NEW.user_id <> public.app_user_id()
       AND NEW.client_requested_at IS NULL THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'point_requests: this scope may not create a % request', NEW.source
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF public.app_scope() = 'customer' THEN
    -- The member cancelling their own open request (leave, C-68).
    IF OLD.user_id = public.app_user_id()
       AND OLD.status IN ('pending', 'awaiting_owner') AND NEW.status = 'cancelled'
       AND NEW.decided_at = now()
       AND (to_jsonb(NEW) - ARRAY['status', 'decided_at', 'updated_at'])
           IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'decided_at', 'updated_at']) THEN
      RETURN NEW;
    END IF;
    -- P1-15: the member's app claiming the celebration of their own approval, once.
    IF OLD.user_id = public.app_user_id()
       AND OLD.status = 'approved' AND OLD.seen_at IS NULL AND NEW.seen_at = now()
       AND (to_jsonb(NEW) - ARRAY['seen_at', 'updated_at'])
           IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['seen_at', 'updated_at']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'point_requests: only the member may cancel their own open request or mark its approval seen'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- The shop's team deciding (P1-12).
  IF public.app_scope() IS DISTINCT FROM 'shop' OR NOT public.app_in_shop()
     OR OLD.shop_id IS DISTINCT FROM public.app_shop_id() THEN
    RAISE EXCEPTION 'point_requests: not a request this scope may decide'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.user_id = public.app_user_id() THEN
    RAISE EXCEPTION 'point_requests: a team member may not decide their own request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status NOT IN ('pending', 'awaiting_owner') THEN
    RAISE EXCEPTION 'point_requests: this request is already decided'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.requested_at <= now() - interval '24 hours' THEN
    RAISE EXCEPTION 'point_requests: this request has expired'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (to_jsonb(NEW) - decision_cols) IS DISTINCT FROM (to_jsonb(OLD) - decision_cols) THEN
    RAISE EXCEPTION 'point_requests: a decision may change only %', array_to_string(decision_cols, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.items IS NOT NULL AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(NEW.items) e
       WHERE jsonb_typeof(e) <> 'string' OR char_length(e #>> '{}') NOT BETWEEN 1 AND 40) THEN
    RAISE EXCEPTION 'point_requests: items must be 1–40 character strings'
      USING ERRCODE = 'check_violation';
  END IF;
  -- P1-15: the ingot snapshot belongs to an approval, and only to one.
  IF (NEW.status = 'approved') <> (NEW.ingot_size IS NOT NULL) THEN
    RAISE EXCEPTION 'point_requests: an approval carries its ingot snapshot, and nothing else does'
      USING ERRCODE = 'check_violation';
  END IF;
  role := public.app_shop_role();
  lim := public.app_staff_award_limit();
  SELECT * INTO cap FROM public.award_cap();
  IF NEW.award_gold > cap.gold OR NEW.amount_pence > cap.pence THEN
    RAISE EXCEPTION 'point_requests: above the platform award cap'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'awaiting_owner' THEN
    IF OLD.status = 'pending' AND role = 'staff' AND lim IS NOT NULL AND NEW.award_gold > lim
       AND NEW.routed_by = public.app_user_id() AND NEW.routed_at = now()
       AND NEW.decided_at IS NULL AND NEW.decided_by IS NULL
       AND NEW.reject_reason IS NULL AND NEW.reject_note IS NULL THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.status = 'approved' THEN
    IF NEW.decided_by = public.app_user_id() AND NEW.decided_at = now() AND NEW.award_gold IS NOT NULL
       AND NEW.reject_reason IS NULL AND NEW.reject_note IS NULL
       AND NEW.routed_by IS NOT DISTINCT FROM OLD.routed_by AND NEW.routed_at IS NOT DISTINCT FROM OLD.routed_at
       AND (role = 'owner'
            OR (role = 'staff' AND OLD.status = 'pending' AND (lim IS NULL OR NEW.award_gold <= lim))) THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.status = 'rejected' THEN
    IF NEW.decided_by = public.app_user_id() AND NEW.decided_at = now() AND NEW.reject_reason IS NOT NULL
       AND NEW.routed_by IS NOT DISTINCT FROM OLD.routed_by AND NEW.routed_at IS NOT DISTINCT FROM OLD.routed_at
       AND (role = 'owner' OR (role = 'staff' AND OLD.status = 'pending')) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'point_requests: this decision is not allowed (% → % as %)', OLD.status, NEW.status, role
    USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint

-- The team's scan insert: the shop of the session, an active team member (app_in_shop), a current member of the
-- shop who is not the caller, at a shop taking awards (same statuses as a customer's request, 0028).
CREATE POLICY point_requests_team_scan_insert ON point_requests AS PERMISSIVE FOR INSERT TO moz_app
  WITH CHECK (
    (SELECT app_scope()) = 'shop' AND (SELECT app_in_shop()) AND shop_id = (SELECT app_shop_id())
    AND source = 'scan' AND user_id <> (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM memberships m
                WHERE m.id = point_requests.membership_id AND m.user_id = point_requests.user_id
                  AND m.shop_id = point_requests.shop_id AND m.left_at IS NULL)
    AND EXISTS (SELECT 1 FROM shops s WHERE s.id = point_requests.shop_id
                  AND s.status IN ('active', 'expiring', 'grace', 'restricted'))
  );
