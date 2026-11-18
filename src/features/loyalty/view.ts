/**
 * What the loyalty settings page shows, from the version list (P1-05). Pure: the server page calls it, and the
 * unit test covers it. Dates go to the client as ISO strings.
 */
import {
  describeChanges,
  pendingRewardChanges,
  type ProgrammeRules,
  type ProgrammeVersion,
  rulesOf,
} from "@/lib/loyalty/programme";

/** The history shows the latest versions; older ones stay in the database (and the audit log). */
export const HISTORY_SHOWN = 20;

export type HistoryItem = {
  version: number;
  savedAt: string;
  /** Set when the rewards in this version apply later than its save (14 days' notice). */
  rewardsFrom: string | null;
  changes: string[];
};

export type LoyaltyView = {
  /** The latest version's rules, or null before the first save. */
  current: ProgrammeRules | null;
  version: number;
  savedAt: string | null;
  pending: Array<{ version: number; rewardsFrom: string }>;
  history: HistoryItem[];
  totalVersions: number;
};

export function historyView(versions: readonly ProgrammeVersion[], now: Date): LoyaltyView {
  const sorted = [...versions].sort((a, b) => a.version - b.version);
  const latest = sorted.at(-1) ?? null;
  const items = sorted.map((v, i): HistoryItem => ({
    version: v.version,
    savedAt: v.activeFrom.toISOString(),
    rewardsFrom:
      v.rewardsFrom.getTime() > v.activeFrom.getTime() ? v.rewardsFrom.toISOString() : null,
    changes: describeChanges(i === 0 ? null : (sorted[i - 1] ?? null), v),
  }));
  return {
    current: latest ? rulesOf(latest) : null,
    version: latest?.version ?? 0,
    savedAt: latest ? latest.activeFrom.toISOString() : null,
    pending: pendingRewardChanges(sorted, now).map((v) => ({
      version: v.version,
      rewardsFrom: v.rewardsFrom.toISOString(),
    })),
    history: items.reverse().slice(0, HISTORY_SHOWN),
    totalVersions: sorted.length,
  };
}
