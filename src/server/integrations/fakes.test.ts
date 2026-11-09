import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("[P0-17] fake push sink", () => {
  it("records every payload and clears on reset", async () => {
    const { sendPush, fakePushSink } = await import("./push");
    fakePushSink.reset();
    await sendPush(
      { endpoint: "https://push.example/abc" },
      { title: "Points credited", body: "+20 gold", url: "/wallet" },
    );
    expect(fakePushSink.list()).toEqual([
      {
        subscription: { endpoint: "https://push.example/abc" },
        payload: { title: "Points credited", body: "+20 gold", url: "/wallet" },
      },
    ]);
    fakePushSink.reset();
    expect(fakePushSink.list()).toEqual([]);
  });

  it("keeps one sink across module reloads (route handlers and actions share it)", async () => {
    const first = await import("./push");
    first.fakePushSink.reset();
    await first.sendPush({ endpoint: "e1" }, { title: "a", body: "b" });
    vi.resetModules();
    const second = await import("./push");
    expect(second.fakePushSink.list()).toHaveLength(1);
  });
});

describe("[P0-17] fake AI provider", () => {
  it("returns the scripted text", async () => {
    const { complete, fakeAi } = await import("./ai");
    fakeAi.script({ mode: "ok", text: "Lovely flat white." });
    await expect(complete({ purpose: "review-help", prompt: "x" })).resolves.toEqual({
      text: "Lovely flat white.",
    });
  });

  it("supports error, timeout and empty failure modes", async () => {
    const { complete, fakeAi, AiUnavailableError } = await import("./ai");
    fakeAi.script({ mode: "error" });
    await expect(complete({ purpose: "review-help", prompt: "x" })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    fakeAi.script({ mode: "timeout" });
    await expect(complete({ purpose: "review-help", prompt: "x" })).rejects.toThrow(/timed out/);
    fakeAi.script({ mode: "empty" });
    await expect(complete({ purpose: "review-help", prompt: "x" })).resolves.toEqual({ text: "" });
    fakeAi.reset();
  });
});

describe("[P0-17] fixture postcodes provider", () => {
  it("normalises spacing and case before lookup", async () => {
    const { lookupPostcode } = await import("./postcodes");
    const hit = await lookupPostcode(" nw17jr ");
    expect(hit).toMatchObject({ postcode: "NW1 7JR", district: "Camden" });
    expect(hit?.lat).toBeCloseTo(51.54, 1);
  });

  it("returns null for unknown or malformed postcodes", async () => {
    const { lookupPostcode } = await import("./postcodes");
    await expect(lookupPostcode("ZZ9 9ZZ")).resolves.toBeNull();
    await expect(lookupPostcode("not a postcode")).resolves.toBeNull();
  });
});

describe("[P0-17] fixture Places provider", () => {
  it("finds fixture places by case-insensitive name match", async () => {
    const { searchPlaces } = await import("./places");
    const results = await searchPlaces("brew & bloom");
    expect(results.map((p) => p.name)).toEqual(["Brew & Bloom Café"]);
    await expect(searchPlaces("nothing like this")).resolves.toEqual([]);
  });
});

describe("[P0-17] fakes fail closed outside local/test", () => {
  it.each(["push", "ai", "postcodes", "places"] as const)(
    "%s refuses to use a fake in staging",
    async (name) => {
      vi.stubEnv("NODE_ENV", "production"); // staging runs a production build (env cross-check)
      vi.stubEnv("APP_ENV", "staging");
      vi.stubEnv("APP_URL", "https://staging.mozrewards.co.uk");
      vi.stubEnv("EMAIL_PROVIDER", "resend");
      vi.stubEnv("EMAIL_API_KEY", "re_test_key");
      vi.stubEnv("TRUSTED_PROXY", "caddy");
      const calls = {
        push: async () =>
          (await import("./push")).sendPush({ endpoint: "e" }, { title: "t", body: "b" }),
        ai: async () => (await import("./ai")).complete({ purpose: "review-help", prompt: "x" }),
        postcodes: async () => (await import("./postcodes")).lookupPostcode("NW1 7JR"),
        places: async () => (await import("./places")).searchPlaces("brew"),
      };
      await expect(calls[name]()).rejects.toThrow(/not configured/);
    },
  );
});
