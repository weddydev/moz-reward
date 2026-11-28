import "server-only";
import { sql } from "drizzle-orm";
import type { MemberId } from "@/lib/brand";
import type { ShopScope } from "@/server/authz/scope";
import { withScope } from "./_base";

/** What the scanner's award panel shows about a scanned member (P2-02): the Requests page's own fields. */
export type ScanMemberCard = {
  userId: string;
  name: string;
  memberId: MemberId;
  purchaseCount: number;
  lastVisitAt: Date | null;
  streak: { weeks: number; lastWeekStart: string | null };
  /** The member's request already waiting in this shop (at most one), or null. */
  openRequest: { id: string; awaitingOwner: boolean } | null;
};

/**
 * Whose member card a verified QR token (or a typed member ID) is, for the scoped shop's active team (P1-14), and
 * only when that customer is a current member of the shop (`shop_member_by_member_id`, 0032: the shop comes from
 * the session scope, RLS context, never system scope). Null otherwise: a member of another shop, a former member
 * or an unknown ID.
 *
 * P2-02: the scanned member's CURRENT membership in the scoped shop, for the award panel (visits, streak for the
 * live gold preview, an open request to approve instead). Same wall as `teamMemberByMemberId`: whose card it is
 * comes from `shop_member_by_member_id` under the session's scope, and the membership row is read under RLS.
 * The award re-checks all of it (`scanAward`); this is display only.
 */
export async function scanMemberCard(
  scope: ShopScope,
  memberId: MemberId,
): Promise<ScanMemberCard | null> {
  const [row] = await withScope(scope, (q) =>
    q.execute<{
      user_id: string;
      full_name: string;
      member_id: string;
      purchase_count: number;
      last_visit_at: string | Date | null;
      streak_weeks: number;
      streak_last_week_start: string | null;
      open_request_id: string | null;
      open_request_status: string | null;
    }>(
      sql`SELECT f.user_id, f.full_name, f.member_id, m.purchase_count, m.last_visit_at, m.streak_weeks,
                 m.streak_last_week_start::text AS streak_last_week_start,
                 r.id AS open_request_id, r.status::text AS open_request_status
            FROM public.shop_member_by_member_id(${memberId}) f
            JOIN memberships m ON m.user_id = f.user_id
            LEFT JOIN LATERAL (
              SELECT r.id, r.status FROM point_requests r
               WHERE r.shop_id = m.shop_id AND r.membership_id = m.id
                 AND r.status IN ('pending', 'awaiting_owner')
               LIMIT 1) r ON true
           WHERE m.shop_id = ${scope.shopId} AND m.left_at IS NULL
           LIMIT 1`,
    ),
  );
  if (!row) return null;
  return {
    userId: row.user_id,
    name: row.full_name,
    memberId: row.member_id as MemberId,
    purchaseCount: row.purchase_count,
    lastVisitAt: row.last_visit_at === null ? null : new Date(row.last_visit_at),
    streak: { weeks: row.streak_weeks, lastWeekStart: row.streak_last_week_start },
    openRequest: row.open_request_id
      ? { id: row.open_request_id, awaitingOwner: row.open_request_status === "awaiting_owner" }
      : null,
  };
}
