import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * P0-15 infra lint: the staging/production Compose stacks, Caddyfiles and Redis configs keep the security and
 * resource rules of SECURITY §11, ARCHITECTURE §9 and infra/RESOURCES.md (the P0-15 design check's "CI lint").
 */
const root = path.resolve(import.meta.dirname, "..");
const read = (file: string): string => readFileSync(path.join(root, file), "utf8");

type Service = Record<string, unknown> & {
  environment?: Record<string, string>;
  volumes?: string[];
  networks?: string[];
  command?: string[];
};
type ComposeFile = {
  services: Record<string, Service>;
  networks?: Record<string, { internal?: boolean }>;
};

const load = (file: string): ComposeFile => parse(read(file), { merge: true }) as ComposeFile;
const base = load("infra/compose/compose.yml");
const ENVS = ["staging", "production"] as const;
type Env = (typeof ENVS)[number];

/** Compose's merge for the keys these files use: maps merge, sequences of volumes append, the rest replaces. */
function stack(env: Env): Record<string, Service> {
  const override = load(`infra/compose/${env}.yml`).services;
  const names = new Set([...Object.keys(base.services), ...Object.keys(override)]);
  const out: Record<string, Service> = {};
  for (const name of names) {
    const b = base.services[name] ?? {};
    const o = override[name] ?? {};
    out[name] = {
      ...b,
      ...o,
      environment: { ...b.environment, ...o.environment },
      volumes: [...(b.volumes ?? []), ...(o.volumes ?? [])],
    };
  }
  return out;
}

const MIB = 1024 * 1024;
function bytes(limit: unknown): number {
  const m = /^(\d+(?:\.\d+)?)([mg])$/.exec(String(limit));
  if (!m?.[1] || !m[2]) throw new Error(`unparsable memory limit ${String(limit)}`);
  return Number(m[1]) * (m[2] === "g" ? 1024 : 1) * MIB;
}

/** `| Staging | web ×2 | 512 MB each (1 GB) |` → { "web-1": 512 MiB, "web-2": 512 MiB }. */
function budget(env: Env): Record<string, number> {
  const label = env === "staging" ? "Staging" : "Production";
  const out: Record<string, number> = {};
  for (const line of read("infra/RESOURCES.md").split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells[1] !== label || !cells[2] || !cells[3]) continue;
    const size = /^(\d+(?:\.\d+)?) (GB|MB)/.exec(cells[3]);
    if (!size?.[1] || !size[2]) continue;
    const value = Number(size[1]) * (size[2] === "GB" ? 1024 : 1) * MIB;
    const name = cells[2].split(" ")[0] ?? "";
    if (cells[2].startsWith("web ×2")) {
      out["web-1"] = value;
      out["web-2"] = value;
    } else out[name] = value;
  }
  return out;
}

describe("[P0-15] compose stacks", () => {
  it("[P0-15] publishes no host port and never uses host networking or privileged mode", () => {
    for (const file of ["compose.yml", "staging.yml", "production.yml"]) {
      const text = read(`infra/compose/${file}`);
      expect(text, file).not.toMatch(/^\s*(ports|network_mode|privileged|cap_add|devices):/m);
    }
  });

  for (const env of ENVS) {
    const services = stack(env);

    it(`[P0-15] ${env}: every container is hardened and has a memory limit with no swap`, () => {
      for (const [name, s] of Object.entries(services)) {
        expect(s.cap_drop, name).toEqual(["ALL"]);
        expect(s.security_opt, name).toContain("no-new-privileges:true");
        expect(s.read_only, name).toBe(true);
        expect(s.init, name).toBe(true);
        expect(s.restart, name).toBe("unless-stopped");
        expect(s.pids_limit, name).toBeGreaterThan(0);
        expect(s.user ?? "image default", name).not.toMatch(/^(0|root)(:|$)/);
        expect(bytes(s.memswap_limit), name).toBe(bytes(s.mem_limit));
      }
    });

    it(`[P0-15] ${env}: memory limits match infra/RESOURCES.md`, () => {
      const table = budget(env);
      const limits = Object.fromEntries(
        Object.entries(services).map(([name, s]) => [name, bytes(s.mem_limit)]),
      );
      expect(limits).toEqual(table);
    });

    it(`[P0-15] ${env}: third-party images are pinned by digest`, () => {
      for (const [name, s] of Object.entries(services)) {
        const image = String(s.image);
        if (image.startsWith("${MOZ_IMAGE") || image.startsWith("${MOZ_PG_IMAGE")) continue;
        expect(image, name).toMatch(/@sha256:[0-9a-f]{64}$/);
      }
    });

    it(`[P0-15] ${env}: data services sit only on internal networks (Postgres also on its wal-g egress)`, () => {
      const internal = (n: string): boolean => base.networks?.[n]?.internal === true;
      for (const name of ["redis-queue", "redis-cache"]) {
        expect(services[name]?.networks?.every(internal), name).toBe(true);
      }
      expect(services.postgres?.networks?.filter((n) => !internal(n))).toEqual(["pg_egress"]);
      expect(services.caddy?.networks?.every(internal)).toBe(true);
      for (const [name, s] of Object.entries(services)) {
        if (name !== "postgres") expect(s.networks, name).not.toContain("pg_egress");
      }
    });

    it(`[P0-15] ${env}: secrets come only from per-role env files, never inline`, () => {
      for (const [name, s] of Object.entries(services)) {
        for (const key of Object.keys(s.environment ?? {})) {
          expect(key, name).not.toMatch(/URL|SECRET|KEY|TOKEN|PASSWORD(?!_FILE)/);
        }
      }
      const envFile = (name: string): string =>
        JSON.stringify(services[name]?.env_file).replace(/.*env\/(\w+)\.env.*/, "$1");
      expect(envFile("web-1")).toBe("web");
      expect(envFile("web-2")).toBe("web");
      expect(envFile("worker")).toBe("worker");
    });

    it(`[P0-15] ${env}: the worker drains for 60 s before a kill (C-27) and skips the web healthcheck`, () => {
      const worker = services.worker;
      const grace = /^(\d+)s$/.exec(String(worker?.stop_grace_period));
      expect(Number(grace?.[1])).toBeGreaterThanOrEqual(75);
      expect(worker?.healthcheck).toEqual({ disable: true });
      expect(worker?.command).toEqual(["node", "cli/worker.mjs"]);
    });

    it(`[P0-15] ${env}: Postgres settings (scram, no statement logging, connection budget)`, () => {
      const flags = (services.postgres?.command ?? []).filter((_, i, all) => all[i - 1] === "-c");
      expect(flags).toContain("hba_file=/etc/postgresql/pg_hba.conf");
      expect(flags).toContain("password_encryption=scram-sha-256");
      expect(flags).toContain("log_statement=none");
      expect(flags).toContain(`max_connections=${env === "staging" ? "80" : "100"}`);
    });

    it(`[P0-15] ${env}: WAL is archived through moz-walg only, with its settings and the lever mounted read-only`, () => {
      const flags = (services.postgres?.command ?? []).filter((_, i, all) => all[i - 1] === "-c");
      expect(flags).toContain("archive_mode=on");
      expect(flags).toContain("archive_timeout=60");
      expect(flags).toContain("archive_command=/usr/local/bin/moz-walg wal-push %p");
      expect(flags.filter((f) => f.startsWith("archive_command="))).toHaveLength(1);
      expect(services.postgres?.volumes).toEqual(
        expect.arrayContaining([
          "${MOZ_ETC:?}/walg:/run/moz/walg:ro",
          "${MOZ_ETC:?}/backup-lever:/run/moz/backup-lever:ro",
        ]),
      );
      expect(services.worker?.volumes).toContain(
        "${MOZ_ETC:?}/backup-lever:/run/moz/backup-lever:ro",
      );
      // No other service sees the wal-g settings (they hold the B2 key pair).
      for (const [name, svc] of Object.entries(services)) {
        if (name === "postgres") continue;
        expect(JSON.stringify(svc.volumes ?? []), name).not.toContain("/walg");
      }
    });

    it(`[P0-15] ${env}: Redis maxmemory and Node heap stay inside the container limits`, () => {
      for (const name of ["redis-queue", "redis-cache"]) {
        const s = services[name];
        const command = s?.command ?? [];
        const max = command[command.indexOf("--maxmemory") + 1];
        expect(command, name).toContain("--maxmemory");
        expect(bytes(String(max).replace("mb", "m")), name).toBeLessThan(bytes(s?.mem_limit));
      }
      for (const name of ["web-1", "web-2", "worker"]) {
        const s = services[name];
        const heap = /--max-old-space-size=(\d+)/.exec(s?.environment?.NODE_OPTIONS ?? "");
        expect(Number(heap?.[1]) * MIB, name).toBeLessThanOrEqual(bytes(s?.mem_limit) * 0.8);
      }
    });
  }

  it("[P0-15] staging has CPU limits on every container, 1.5 in total; production has none", () => {
    const staging = Object.entries(stack("staging"));
    for (const [name, s] of staging) expect(typeof s.cpus, name).toBe("number");
    const total = staging.reduce((sum, [, s]) => sum + Number(s.cpus), 0);
    expect(total).toBeLessThanOrEqual(1.5 + 1e-9);
    for (const [name, s] of Object.entries(stack("production")))
      expect(s.cpus, name).toBeUndefined();
  });

  it("[P0-15] Umami runs in production only", () => {
    expect(stack("staging").umami).toBeUndefined();
    expect(stack("production").umami).toBeDefined();
  });
});

describe("[P0-15] Caddy", () => {
  const common = read("infra/caddy/common.caddy");
  const staging = read("infra/caddy/Caddyfile.staging");
  const production = read("infra/caddy/Caddyfile.production");

  it("[P0-15] overwrites any client X-Request-Id (C-23) and hides the server", () => {
    expect(common).toContain("request_header X-Request-Id {http.request.uuid}");
    expect(common).toContain("header -Server");
  });

  it("[P0-15] access logs drop query strings, headers and client IPs", () => {
    for (const rule of [
      'request>uri regexp "\\?.*$" ""',
      "request>headers delete",
      "resp_headers delete",
      "request>remote_ip delete",
      "request>client_ip delete",
    ]) {
      expect(common).toContain(rule);
    }
  });

  it("[P0-15] both envs: admin API and automatic HTTPS off, unknown hosts get 404", () => {
    for (const file of [staging, production]) {
      expect(file).toContain("admin off");
      expect(file).toContain("auto_https off");
      expect(file).toMatch(/^http:\/\/ \{\n\trespond 404\n\}/m);
    }
  });

  it("[P0-15] staging: basic auth, noindex, credentials stripped before the app, no Umami", () => {
    expect(staging).toContain("basic_auth {");
    expect(staging).toContain('header X-Robots-Tag "noindex, nofollow"');
    expect(staging).toContain("request_header -Authorization");
    expect(staging).not.toContain("umami:3000");
  });

  it("[P0-15] production: Umami on the app origin for two exact paths only, without cookies (C-36)", () => {
    const handled = [...production.matchAll(/handle (\/u\/\S*) \{/g)].map((m) => m[1]);
    expect(handled).toEqual(["/u/script.js", "/u/api/send"]);
    expect(production.match(/header_up -Cookie/g)).toHaveLength(2);
    expect(production.match(/header_down -Set-Cookie/g)).toHaveLength(2);
    expect(common).toContain("handle /u/* {\n\t\trespond 404");
  });
});

describe("[P0-15] Redis configs", () => {
  for (const [file, policy] of [
    ["queue.conf", "noeviction"],
    ["cache.conf", "allkeys-lru"],
  ] as const) {
    it(`[P0-15] ${file}: TLS only, ACL users, ${policy}`, () => {
      const conf = read(`infra/redis/${file}`);
      expect(conf).toMatch(/^port 0$/m);
      expect(conf).toMatch(/^tls-port 6379$/m);
      expect(conf).toMatch(/^aclfile \/acl\/users\.acl$/m);
      expect(conf).toMatch(new RegExp(`^maxmemory-policy ${policy}$`, "m"));
    });
  }
  it("[P0-15] the queue persists (AOF everysec); the cache keeps nothing on disk", () => {
    expect(read("infra/redis/queue.conf")).toMatch(/^appendonly yes\nappendfsync everysec$/m);
    expect(read("infra/redis/cache.conf")).toMatch(/^save ""\nappendonly no$/m);
  });
});
