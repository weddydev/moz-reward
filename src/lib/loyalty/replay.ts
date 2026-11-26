/**
 * The counters a membership's ledger implies (P1-17 data-integrity reconciliation; PRODUCT §6 progress model).
 * Pure: the same engine the approvals use (`applyAward`, `applyReversal`), applied in ledger order from an empty
 * ingot at the join. The nightly check compares the result with the membership's cached counters; it never
 * writes anything back.
 *
 * Row meanings: `earn` and the bonuses of one request are one award (the approval wrote them together);
 * `reversal` takes progress down (the rest becomes a shortfall); `expiry` empties the current ingot (rolling
 * expiry and the 30-day forfeit after leaving); `redeem` moves no gold; an `adjustment` with `reason: "opening"`
 * is an opening balance (the demo seed's counters: progress + `ingots` completed before the ledger began).
 */
import { points } from "@/lib/brand";
import {
  applyAward,
  applyReversal,
  type Award,
  initialMemberState,
  type MemberState,
} from "./engine";
import type { ProgrammeVersion } from "./programme";

export type LedgerRowForReplay = {
  type: string;
  points: number;
  requestId: string | null;
  createdAt: Date;
  ref: Record<string, unknown>;
};

export type ReplayResult = { progress: number; ingotsCompleted: number; shortfall: number };

const AWARD_TYPES = new Set(["earn", "bonus_streak", "bonus_referral", "bonus_game"]);

/** One award of `gold` (the replay needs the total only; the streak is not compared). */
const awardOf = (gold: number, state: MemberState): Award => ({
  version: 0,
  base: points(gold),
  multipliers: [],
  earned: points(gold),
  streakBonus: points(0),
  total: points(gold),
  streak: state.streak,
});

export function replayLedger(input: {
  joinedAt: Date;
  versions: readonly ProgrammeVersion[];
  /** The membership's ledger rows, oldest first. */
  rows: readonly LedgerRowForReplay[];
}): ReplayResult {
  let state = initialMemberState(input.joinedAt);
  const rows = input.rows;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    if (AWARD_TYPES.has(row.type)) {
      // The rows of one request (earn + its streak bonus) are one award, as the approval applied them.
      let gold = row.points;
      while (
        row.requestId !== null &&
        rows[i + 1]?.requestId === row.requestId &&
        AWARD_TYPES.has(rows[i + 1]?.type ?? "")
      ) {
        i++;
        gold += rows[i]?.points ?? 0;
      }
      state = applyAward(state, awardOf(gold, state), input.versions, row.createdAt).state;
    } else if (row.type === "reversal") {
      state = applyReversal(state, points(-row.points)).state;
    } else if (row.type === "expiry") {
      state = { ...state, progress: points(Math.max(0, state.progress + row.points)) };
    } else if (row.type === "adjustment" && row.ref["reason"] === "opening") {
      const ingots = typeof row.ref["ingots"] === "number" ? row.ref["ingots"] : 0;
      state = {
        ...state,
        progress: points(state.progress + row.points),
        ingotsCompleted: state.ingotsCompleted + ingots,
      };
    }
    // redeem: no gold moves.
  }
  return {
    progress: state.progress,
    ingotsCompleted: state.ingotsCompleted,
    shortfall: state.shortfall,
  };
}
