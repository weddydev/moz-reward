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

const fullSecrets = (): Record<string, string> => ({
  ...Object.fromEntries(ALL_SECRET_KEYS.map((k) => [k, `value-of-${k}`])),
  // origin-tls is PEM (the root helper does the full validation).
  CLOUDFLARE_ORIGIN_CERT: "-----BEGIN CERTIFICATE-----\nvalue\n-----END CERTIFICATE-----",
  CLOUDFLARE_ORIGIN_KEY: "-----BEGIN PRIVATE KEY-----\nvalue\n-----END PRIVATE KEY-----",
});

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
    expect(keysOf(buildEnv("production", "cloudflared", CONFIG, fullSecrets()))).toEqual([
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

  it("[P0-15] origin-tls (staging) is the certificate then the key, CRs dropped, and refuses anything else", () => {
    const cert = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
    const key = "-----BEGIN PRIVATE KEY-----\nMIGH\n-----END PRIVATE KEY-----";
    // The key secret was pasted with CRLF endings (H-40).
    const secrets = {
      CLOUDFLARE_ORIGIN_CERT: `${cert}\n`,
      CLOUDFLARE_ORIGIN_KEY: key.replaceAll("\n", "\r\n"),
    };
    expect(ROLES.staging).toEqual(["web", "worker", "caddy", "origin-tls", "backup"]);
    expect(buildEnv("staging", "origin-tls", CONFIG, secrets)).toBe(`${cert}\n${key}\n`);
    expect(() =>
      buildEnv("staging", "origin-tls", CONFIG, { ...secrets, CLOUDFLARE_ORIGIN_KEY: "" }),
    ).toThrow("CLOUDFLARE_ORIGIN_KEY_STAGING is not set");
    expect(() =>
      buildEnv("staging", "origin-tls", CONFIG, { ...secrets, CLOUDFLARE_ORIGIN_CERT: key }),
    ).toThrow("CLOUDFLARE_ORIGIN_CERT_STAGING is not a PEM certificate");
    const encrypted = key.replaceAll("PRIVATE KEY", "ENCRYPTED PRIVATE KEY");
    let message = "";
    try {
      buildEnv("staging", "origin-tls", CONFIG, { ...secrets, CLOUDFLARE_ORIGIN_KEY: encrypted });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe("CLOUDFLARE_ORIGIN_KEY_STAGING is not an unencrypted PEM private key");
    expect(message).not.toContain("MIGH");
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
    expect(() => buildEnv("staging", "umami", CONFIG, fullSecrets())).toThrow(
      "umami does not run in staging",
    );
    expect(ROLES.staging).not.toContain("umami");
    // T-5: no Tunnel on staging until launch; production has no origin certificate of its own.
    expect(() => buildEnv("staging", "cloudflared", CONFIG, fullSecrets())).toThrow(
      "cloudflared does not run in staging",
    );
    expect(() => buildEnv("production", "origin-tls", CONFIG, fullSecrets())).toThrow(
      "origin-tls does not run in production",
    );
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
