import { describe, expect, it } from "vitest";
import { envOverride, FLAG_KEYS } from "./flags";

describe("[P0-14] feature flag env override (FLAG_<KEY> wins over the DB)", () => {
  it.each(["true", "1", "on", " TRUE ", "On"])("%j forces the flag on", (raw) => {
    expect(envOverride("game_rewards", { FLAG_GAME_REWARDS: raw })).toBe(true);
  });

  it.each(["false", "0", "off", " Off "])("%j forces the flag off", (raw) => {
    expect(envOverride("game_rewards", { FLAG_GAME_REWARDS: raw })).toBe(false);
  });

  it("leaves the DB in charge when unset, empty or unrecognised", () => {
    expect(envOverride("game_rewards", {})).toBeUndefined();
    expect(envOverride("game_rewards", { FLAG_GAME_REWARDS: "" })).toBeUndefined();
    expect(envOverride("game_rewards", { FLAG_GAME_REWARDS: "yes please" })).toBeUndefined();
  });

  it("reads only the variable for that key", () => {
    expect(envOverride("ai_review_help", { FLAG_GAME_REWARDS: "true" })).toBeUndefined();
    expect(FLAG_KEYS).toContain("ai_review_help");
  });
});
