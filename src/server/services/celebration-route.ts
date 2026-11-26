import "server-only";
import { z } from "zod";
import type { Celebration } from "@/lib/celebration";
import { defineRoute } from "@/server/actionTemplate";
import { requireCustomer } from "@/server/authz";
import { claimCelebration } from "./celebrations";

/**
 * Claims per user per hour (P1-15): the app claims once when it opens, on each `points_credited` /
 * `reward_unlocked` hint, when its stream reconnects and on each 15 s poll while the stream is down. Fails open:
 * a refused or failed claim only delays a moment the Wallet already reflects (no money moves here).
 */
export const CLAIM_CALLS = { max: 300, windowSec: 60 * 60 } as const;

/**
 * `POST /api/me/celebration` (P1-15, DESIGN §8.2): "is there an approval to celebrate?". A route, not a server
 * action: the app calls it on every open, and Next.js runs a page's server actions one at a time, so a customer's
 * first tap (Request points, Mute) would wait behind it. Same-origin, JSON `{}` only; the member is the session
 * user, never the input. Marks the caller's unseen approvals seen and answers `{ data: Celebration | null }`; a
 * second call (another tab, a reload) gets null for the same approval. No audit row: reading one's own approval
 * is not an event (the approval itself was audited).
 */
export const claimCelebrationRoute = defineRoute({
  name: "celebration.claim",
  input: z.object({}).strict(),
  authorize: (_input, p) => requireCustomer(p),
  rateLimit: { ...CLAIM_CALLS, failMode: "open" },
  maxBodyBytes: 64,
  handler: async (_input, scope): Promise<Celebration | null> => claimCelebration(scope),
});
