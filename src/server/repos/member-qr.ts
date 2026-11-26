import "server-only";
import { sql } from "drizzle-orm";
import type { MemberId } from "@/lib/brand";
import type { ShopScope } from "@/server/authz/scope";
import { withScope } from "./_base";

/**
 * P1-14: whose member card a verified QR token is, for the scoped shop's active staff, and only when that customer
 * is a current member of the shop (`shop_member_by_member_id`, 0032: the shop comes from the session scope, RLS
 * context, never system scope). Null otherwise: a member of another shop, a former member or an unknown ID.
 */
export async function teamMemberByMemberId(
  scope: ShopScope,
  memberId: MemberId,
): Promise<{ userId: string; name: string; memberId: MemberId } | null> {
  const [row] = await withScope(scope, (q) =>
    q.execute<{ user_id: string; full_name: string; member_id: string }>(
      sql`SELECT user_id, full_name, member_id FROM public.shop_member_by_member_id(${memberId})`,
    ),
  );
  return row
    ? { userId: row.user_id, name: row.full_name, memberId: row.member_id as MemberId }
    : null;
}
