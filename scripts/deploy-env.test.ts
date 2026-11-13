import { describe, expect, it } from "vitest";
import { ALL_SECRET_KEYS, ROLES, buildEnv, parseConfig } from "./deploy-env.mjs";

/**
 * P0-15 step C: the deploy job builds each role's env body (piped to `moz-deploy write-env <env> <role>`) from
 * the committed non-secret settings (infra/deploy/<env>.env) plus only that role's secrets.
 */
const CONFIG = parseConfig(
  [
    "# comment",
    "APP_URL=https://staging.example.com",
    "APP_HOST=staging.example.com",
    "REDIS_KEY_PREFIX=stg:",
    "EMAIL_FROM=Moz Rewards <hello@mail.example.com>",
    "BASIC_AUTH_USER=moz",
    "",
  ].join("\n"),
);

const fullSecrets = (): Record<string, string> =>
  Object.fromEntries(ALL_SECRET_KEYS.map((k) => [k, `value-of-${k}`]));

const keysOf = (body: string): string[] =>
  body
    .trim()
    .split("\n")
    .map((l) => l.slice(0, l.indexOf("=")));

describe("[P0-15] deploy env files", () => {
  it("parses KEY=value lines, skipping comments and blanks, and keeps everything after the first =", () => {
    expect(CONFIG.get("EMAIL_FROM")).toBe("Moz Rewards <hello@mail.example.com>");
    expect(parseConfig("A=b=c").get("A")).toBe("b=c");
    expect(() => parseConfig("lower=x")).toThrow(/line 1/);
    expect(() => parseConfig("A=1\nA=2")).toThrow(/twice/);
  });

  it("web gets the app settings and secrets, never the worker-only demo base or another role's secret", () => {
    const body = buildEnv("staging", "web", CONFIG, fullSecrets());
    const keys = keysOf(body);
    expect(keys).toEqual(
      expect.arrayContaining(["APP_URL", "REDIS_KEY_PREFIX", "AUTH_SECRET", "HEALTH_TOKEN"]),
    );
    for (const k of [
      "DEMO_EMAIL_BASE",
      "TUNNEL_TOKEN",
      "BASIC_AUTH_HASH",
      "APP_SECRET",
      "APP_HOST",
      "BASIC_AUTH_USER",
    ])
      expect(keys).not.toContain(k);
  });

  it("the staging worker also gets DEMO_EMAIL_BASE (the release seeds demo data); production never does", () => {
    expect(keysOf(buildEnv("staging", "worker", CONFIG, fullSecrets()))).toContain(
      "DEMO_EMAIL_BASE",
    );
    expect(keysOf(buildEnv("production", "worker", CONFIG, fullSecrets()))).not.toContain(
      "DEMO_EMAIL_BASE",
    );
  });

  it("caddy, cloudflared and umami get only their own keys", () => {
    expect(keysOf(buildEnv("staging", "caddy", CONFIG, fullSecrets())).sort()).toEqual(
      ["APP_HOST", "BASIC_AUTH_HASH", "BASIC_AUTH_USER"].sort(),
    );
    expect(keysOf(buildEnv("staging", "cloudflared", CONFIG, fullSecrets()))).toEqual([
      "TUNNEL_TOKEN",
    ]);
    expect(keysOf(buildEnv("production", "umami", CONFIG, fullSecrets()))).toEqual(["APP_SECRET"]);
  });

  it("[P0-15] backup gets exactly the B2 key pair, in both environments (D2)", () => {
    for (const env of ["staging", "production"] as const) {
      expect(ROLES[env]).toContain("backup");
      expect(keysOf(buildEnv(env, "backup", CONFIG, fullSecrets()))).toEqual([
        "B2_KEY_ID",
        "B2_APP_KEY",
      ]);
    }
    expect(() =>
      buildEnv("staging", "backup", CONFIG, { ...fullSecrets(), B2_APP_KEY: "" }),
    ).toThrow("B2_APP_KEY_STAGING is not set");
  });

  it("a missing or blank required secret fails, naming the key and not any value", () => {
    const s = fullSecrets();
    s.AUTH_SECRET = "";
    expect(() => buildEnv("staging", "web", CONFIG, s)).toThrow(/AUTH_SECRET_STAGING is not set/);
    delete s.AUTH_SECRET;
    const err = (() => {
      try {
        buildEnv("staging", "web", CONFIG, s);
      } catch (e) {
        return (e as Error).message;
      }
      return "";
    })();
    expect(err).toMatch(/AUTH_SECRET_STAGING/);
    expect(err).not.toMatch(/value-of/);
  });

  it("a blank optional secret is left out rather than written empty", () => {
    const s = fullSecrets();
    s.SENTRY_DSN = "";
    expect(keysOf(buildEnv("staging", "web", CONFIG, s))).not.toContain("SENTRY_DSN");
  });

  it("refuses values the root helper would refuse (newline, carriage return, single quote)", () => {
    for (const bad of ["a\nb", "a\rb", "it's"]) {
      const s = { ...fullSecrets(), AUTH_SECRET: bad };
      expect(() => buildEnv("staging", "web", CONFIG, s)).toThrow(/AUTH_SECRET_STAGING/);
    }
  });

  it("refuses an unknown environment or role and a role the environment doesn't run", () => {
    expect(() => buildEnv("dev", "web", CONFIG, fullSecrets())).toThrow(/environment/);
    expect(() => buildEnv("staging", "postgres", CONFIG, fullSecrets())).toThrow(/role/);
    expect(() => buildEnv("staging", "umami", CONFIG, fullSecrets())).toThrow(/production only/);
    expect(ROLES.staging).not.toContain("umami");
  });

  it("the committed settings files hold no secret key", async () => {
    const { readFileSync } = await import("node:fs");
    const secretNames = new Set(ALL_SECRET_KEYS);
    for (const env of ["staging", "production"]) {
      const cfg = parseConfig(readFileSync(`infra/deploy/${env}.env`, "utf8"));
      for (const key of cfg.keys()) expect(secretNames.has(key), `${env}: ${key}`).toBe(false);
      expect(() => {
        for (const role of ROLES[env as "staging" | "production"])
          buildEnv(env, role, cfg, fullSecrets());
      }).not.toThrow();
    }
  });
});
