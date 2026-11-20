import { describe, expect, it } from "vitest";
import type { VaultView } from "@/features/vault/view";
import { closureLabel, leaveRestoreBy, upcomingClosures, vaultCardText } from "./view";

const step = (percent: number, title: string, reached: boolean, main = false) => ({
  percent,
  gold: percent * 10,
  title,
  reached,
  main,
  mystery: false,
});

const card = (gold: number, steps: VaultView["steps"]): Pick<VaultView, "ingot" | "steps"> => ({
  ingot: { gold, size: 1_000, fraction: gold / 1_000, percent: Math.floor(gold / 10), label: "" },
  steps,
});

describe("[P1-09] shop page view", () => {
  it("vault card: percent, gold text and the next step not reached yet", () => {
    const text = vaultCardText(
      card(320, [
        step(25, "Free drink", true),
        step(50, "Mystery reward", false),
        step(100, "Free coffee & cake", false, true),
      ]),
    );
    expect(text).toEqual({
      percent: 32,
      gold: "320 / 1,000 gold",
      next: "Next: Mystery reward at 50%",
    });
  });

  it("vault card: a full ingot says the reward is ready; an empty one names the first step", () => {
    expect(vaultCardText(card(1_000, [step(100, "Free lunch", true, true)])).next).toBe(
      "Ingot full: Free lunch is ready",
    );
    expect(vaultCardText(card(0, [step(100, "Free lunch", false, true)])).next).toBe(
      "Next: Free lunch at 100%",
    );
  });

  it("closures: today and later only, in date order, labelled `Thu 20 Nov 2026`", () => {
    const rows = upcomingClosures(
      [
        { date: "2026-11-22", note: "Staff training" },
        { date: "2026-11-18", note: "Yesterday" },
        { date: "2026-11-19", note: null },
      ],
      "2026-11-19",
    );
    expect(rows).toEqual([
      { date: "2026-11-19", label: "Today", note: null },
      { date: "2026-11-22", label: "Sun 22 Nov 2026", note: "Staff training" },
    ]);
    expect(closureLabel("2026-12-25", "2026-11-19")).toBe("Fri 25 Dec 2026");
  });

  it("leave: the restore window ends 30 days after leaving, as a UK date (across the clock change)", () => {
    expect(leaveRestoreBy(new Date("2026-11-19T10:00:00Z"))).toBe("19 Dec 2026");
    // 23:30 on 1 Mar 2027 in London is still 1 Mar there; 30 days on is 31 Mar (BST from 28 Mar).
    expect(leaveRestoreBy(new Date("2027-03-01T23:30:00Z"))).toBe("31 Mar 2027");
  });
});
