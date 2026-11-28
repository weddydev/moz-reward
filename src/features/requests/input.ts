import { z } from "zod";
import { AMOUNT_PENCE_MAX, REJECT_NOTE_MAX, REJECT_REASONS, REQUEST_ITEMS } from "@/lib/requests";
import { REVERSAL_REASONS } from "@/server/db/schema/ledger";

/**
 * Inputs of the shop's request decisions (P1-12): strict objects, so a membership, user, status or gold in the
 * input is refused. Gold is never an input: the server computes it from the programme. The platform cap is
 * checked by the service and the database; the bound here only stops absurd numbers (£100,000).
 */
const uuid = z.uuid().transform((id) => id.toLowerCase());
export { AMOUNT_PENCE_MAX };

const amountPence = z.number().int().min(1).max(AMOUNT_PENCE_MAX).nullable();
const items = z.array(z.string().trim().min(1).max(REQUEST_ITEMS.maxLength)).max(REQUEST_ITEMS.max);
const note = z.string().trim().max(REJECT_NOTE_MAX).nullable();

export const approveInput = z
  .object({
    shopId: uuid,
    requestId: uuid,
    amountPence: amountPence.optional(),
    items: items.optional(),
  })
  .strict();

export const ownerApproveInput = approveInput;

export const rejectInput = z
  .object({ shopId: uuid, requestId: uuid, reason: z.enum(REJECT_REASONS), note: note.optional() })
  .strict();

export const reverseInput = z
  .object({
    shopId: uuid,
    receiptId: uuid,
    // A reason only (PRODUCT §5): free text would land in the append-only audit log (code review M1, P1-C close).
    reason: z.enum(REVERSAL_REASONS),
  })
  .strict();

/**
 * P2-02 scan award: the scanned member-QR token or the member ID typed from an offline card (exactly one), the
 * client's key for this award, and the approve form's amount and items. The token's length bound is the verify
 * action's (P1-14); the member ID is normalised by the service (dash and case are forgiven).
 */
export const scanAwardInput = z
  .object({
    shopId: uuid,
    member: z.union([
      z.object({ token: z.string().min(1).max(128) }).strict(),
      z.object({ memberId: z.string().trim().min(1).max(16) }).strict(),
    ]),
    idempotencyKey: uuid,
    amountPence: amountPence.optional(),
    items: items.optional(),
  })
  .strict();
