import { describe, expect, it } from "vitest";
import { type ProgrammeRules, TEMPLATE_IDS, TEMPLATES } from "@/lib/loyalty/programme";
import { programmeRulesInput, saveProgrammeInput } from "./programme-input";

const BASE = TEMPLATES.cafe.rules;
/** RIGHT-TO-LEFT OVERRIDE, built at run time so the source has no bidi character (Semgrep). */
const RLO = String.fromCodePoint(0x202e);

function issues(input: unknown): Record<string, string> {
  const r = programmeRulesInput.safeParse(input);
  if (r.success) return {};
  return Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
}

const withRules = (patch: Partial<Record<keyof ProgrammeRules, unknown>>): unknown => ({
  ...BASE,
  ...patch,
});

describe("[P1-05] programme input validation", () => {
  it("accepts every template", () => {
    for (const id of TEMPLATE_IDS) expect(issues(TEMPLATES[id].rules)).toEqual({});
  });

  it("earn rate: whole numbers in range per mode", () => {
    expect(issues(withRules({ earnRate: 0 }))).toHaveProperty("earnRate");
    expect(issues(withRules({ earnRate: 501 }))).toHaveProperty("earnRate");
    expect(issues(withRules({ earnRate: 500 }))).toEqual({});
    expect(issues(withRules({ earnMode: "per_pound", earnRate: 101 }))["earnRate"]).toBe(
      "Gold per £1 must be between 1 and 100.",
    );
    expect(issues(withRules({ earnRate: 10.5 }))).toHaveProperty("earnRate");
    expect(issues(withRules({ earnMode: "per_spend" }))).toHaveProperty("earnMode");
  });

  it("ingot size bounds", () => {
    expect(issues(withRules({ ingotSize: 99 }))["ingotSize"]).toBe(
      "The ingot size must be at least 100.",
    );
    expect(issues(withRules({ ingotSize: 100_001 }))["ingotSize"]).toBe(
      "The ingot size can be at most 100,000.",
    );
    expect(issues(withRules({ ingotSize: Number.NaN }))).toHaveProperty("ingotSize");
  });

  it("reward text: trimmed, collapsed, 2–60 characters, no hidden characters", () => {
    const ok = programmeRulesInput.parse(withRules({ mainReward: { text: "  Free   coffee " } }));
    expect(ok.mainReward.text).toBe("Free coffee");
    expect(issues(withRules({ mainReward: { text: " " } }))["mainReward.text"]).toBe(
      "Please describe the main reward.",
    );
    expect(issues(withRules({ mainReward: { text: "x".repeat(61) } }))["mainReward.text"]).toBe(
      "Please keep the main reward to 60 characters.",
    );
    expect(
      issues(withRules({ mainReward: { text: `Free${RLO}eeffoc` } }))["mainReward.text"],
    ).toMatch(/hidden character/);
    expect(issues(withRules({ mainReward: { text: "£5" } }))).toEqual({});
    expect(issues(withRules({ mainReward: { text: "x".repeat(60) } }))).toEqual({});
  });

  it("milestones: at most 3, only 25/50/75, one per percent; sorted on output", () => {
    const m = (percent: number) => ({ percent, reward: "Treat", isMystery: false });
    expect(issues(withRules({ milestones: [m(30)] }))).toHaveProperty("milestones.0.percent");
    expect(issues(withRules({ milestones: [m(25), m(25)] }))["milestones.1.percent"]).toBe(
      "There is already a milestone at 25%.",
    );
    expect(issues(withRules({ milestones: [m(25), m(50), m(75), m(25)] }))).toHaveProperty(
      "milestones",
    );
    const out = programmeRulesInput.parse(withRules({ milestones: [m(75), m(25)] }));
    expect(out.milestones.map((x) => x.percent)).toEqual([25, 75]);
    expect(issues(withRules({ milestones: [] }))).toEqual({});
  });

  it("streak: off or a bonus of 1–500", () => {
    expect(issues(withRules({ streak: null }))).toEqual({});
    expect(issues(withRules({ streak: { bonusGold: 0 } }))).toHaveProperty("streak.bonusGold");
    expect(issues(withRules({ streak: { bonusGold: 501 } }))).toHaveProperty("streak.bonusGold");
  });

  it("tiers: Gold above Silver", () => {
    expect(issues(withRules({ tiers: { silver: 5, gold: 5 } }))["tiers.gold"]).toBe(
      "Gold needs more ingots than Silver.",
    );
    expect(issues(withRules({ tiers: { silver: 0, gold: 5 } }))).toHaveProperty("tiers.silver");
  });

  it("expiry: off, or 12 to 60 months", () => {
    expect(issues(withRules({ expiryMonths: null }))).toEqual({});
    expect(issues(withRules({ expiryMonths: 11 }))["expiryMonths"]).toBe(
      "The expiry period must be at least 12.",
    );
    expect(issues(withRules({ expiryMonths: 61 }))).toHaveProperty("expiryMonths");
  });

  it("unknown keys are refused (strict)", () => {
    expect(issues({ ...BASE, bonus: 1 })).toHaveProperty("");
    expect(issues(withRules({ mainReward: { text: "Cake", imageUrl: "x" } }))).toHaveProperty(
      "mainReward",
    );
  });

  it("save input: shop id and a non-negative base version", () => {
    const shopId = "0190c000-0000-7000-8000-000000000001";
    expect(saveProgrammeInput.safeParse({ shopId, baseVersion: 0, rules: BASE }).success).toBe(
      true,
    );
    expect(saveProgrammeInput.safeParse({ shopId, baseVersion: -1, rules: BASE }).success).toBe(
      false,
    );
    expect(saveProgrammeInput.safeParse({ shopId: "x", baseVersion: 0, rules: BASE }).success).toBe(
      false,
    );
  });
});
