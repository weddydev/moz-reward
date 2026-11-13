import "server-only";
import { eq } from "drizzle-orm";
import type { AdminScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { nfcTags } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { withScope } from "./_base";

/**
 * NFC tags (P1-01, PRODUCT §3, §14). Admin owner/support issue and replace them (RLS: nfc_tags_admin_write);
 * the action calling these writes the audit row in the same transaction.
 */
const TAG_UID = /^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/;

/** Hardware UID as stored (upper-case hex, 4/7/10 bytes), accepting `04:A2:…` or spaces; null if it can't be one. */
export function normaliseTagUid(input: string): string | null {
  if (input.length > 64) return null;
  const uid = input.replace(/[\s:-]/g, "").toUpperCase();
  return TAG_UID.test(uid) ? uid : null;
}

function uidOrThrow(input: string): string {
  const uid = normaliseTagUid(input);
  if (!uid) throw new AppError("VALIDATION", "That isn't an NFC tag ID.");
  return uid;
}

/** admin-scope: an audited admin write of one shop's tag, never a read of other shops' rows. */
export async function registerNfcTag(
  scope: AdminScope,
  input: { shopId: string; tagUid: string },
  tx?: Transaction,
): Promise<{ id: string }> {
  const tagUid = uidOrThrow(input.tagUid);
  const [row] = await withScope(
    scope,
    (q) => q.insert(nfcTags).values({ shopId: input.shopId, tagUid }).returning({ id: nfcTags.id }),
    tx,
  );
  if (!row) throw new AppError("FORBIDDEN");
  return row;
}

/**
 * Replaces a tag with a new one for the same shop. The old tag, and every tag it had replaced earlier, now
 * point straight at the new tag, so a scan of any old tag's record leads to the current one in one hop (the
 * deferred `nfc_tags_one_hop` trigger checks this at commit). Runs in a savepoint of the caller's transaction.
 * admin-scope: an audited admin write of one shop's tags, never a read of other shops' rows.
 */
export async function replaceNfcTag(
  scope: AdminScope,
  input: { tagId: string; newTagUid: string },
  tx?: Transaction,
): Promise<{ id: string }> {
  const tagUid = uidOrThrow(input.newTagUid);
  return withScope(
    scope,
    (q) =>
      q.transaction(async (sp) => {
        const [old] = await sp
          .select({ id: nfcTags.id, shopId: nfcTags.shopId, status: nfcTags.status })
          .from(nfcTags)
          .where(eq(nfcTags.id, input.tagId))
          .for("update");
        if (!old) throw new AppError("NOT_FOUND");
        if (old.status === "replaced")
          throw new AppError("CONFLICT", "That tag has already been replaced.");
        const [created] = await sp
          .insert(nfcTags)
          .values({ shopId: old.shopId, tagUid })
          .returning({ id: nfcTags.id });
        if (!created) throw new AppError("FORBIDDEN");
        await sp
          .update(nfcTags)
          .set({ replacedBy: created.id })
          .where(eq(nfcTags.replacedBy, old.id));
        await sp
          .update(nfcTags)
          .set({ status: "replaced", replacedBy: created.id })
          .where(eq(nfcTags.id, old.id));
        return created;
      }),
    tx,
  );
}
