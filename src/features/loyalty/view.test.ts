import { describe, expect, it } from "vitest";
import { type ProgrammeVersion, TEMPLATES } from "@/lib/loyalty/programme";
import { HISTORY_SHOWN, historyView } from "./view";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-11-02T10:00:00Z");
const day = (n: number): Date => new Date(T0.getTime() + n * DAY);
const BASE = TEMPLATES.cafe.rules;

const v = (version: number, saved: Date, rewardsFrom: Date, patch = {}): ProgrammeVersion => ({
  ...BASE,
  ...patch,
  id: `v${String(version)}`,
  version,
  activeFrom: saved,
  rewardsFrom,
  createdAt: saved,
});

describe("[P1-05] loyalty settings view", () => {
  it("no programme yet", () => {
    expect(historyView([], T0)).toEqual({
      current: null,
      version: 0,
      savedAt: null,
      pending: [],
      history: [],
      totalVersions: 0,
    });
  });

  it("latest first, with change lines, the notice date and the pending change", () => {
    const view = historyView(
      [v(1, T0, T0), v(2, day(1), day(15), { mainReward: { text: "Cake" } })],
      day(2),
    );
    expect(view.version).toBe(2);
    expect(view.current?.mainReward.text).toBe("Cake");
    expect(view.pending).toEqual([{ version: 2, rewardsFrom: day(15).toISOString() }]);
    expect(view.history).toEqual([
      {
        version: 2,
        savedAt: day(1).toISOString(),
        rewardsFrom: day(15).toISOString(),
        changes: ["Main reward: “Free drink of your choice” → “Cake”"],
      },
      { version: 1, savedAt: T0.toISOString(), rewardsFrom: null, changes: ["Programme set up"] },
    ]);
  });

  it(`shows the latest ${String(HISTORY_SHOWN)} versions and counts them all`, () => {
    const versions = Array.from({ length: 25 }, (_, i) =>
      v(i + 1, day(i), day(i), { earnRate: 100 + i }),
    );
    const view = historyView(versions, day(30));
    expect(view.history).toHaveLength(HISTORY_SHOWN);
    expect(view.history[0]?.version).toBe(25);
    expect(view.totalVersions).toBe(25);
  });
});
