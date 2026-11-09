import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPOSE_FILE, dockerProblem, portConflicts, SERVICE_PORTS } from "./services";

describe("[P0-02] services pre-flight", () => {
  it("explains a missing Docker CLI and a stopped Docker daemon in plain words", () => {
    expect(dockerProblem("ok")).toBeNull();
    expect(dockerProblem("no-cli")).toMatch(/not installed/);
    expect(dockerProblem("no-daemon")).toMatch(/not running.*Start Docker Desktop/);
  });

  it("reports a port held by another program, naming the port and service", () => {
    expect(portConflicts(new Set([5432]), new Set())).toEqual([
      "  - 5432 (Postgres) is already in use by another program",
    ]);
  });

  it("does not report ports held by our own running containers", () => {
    expect(
      portConflicts(new Set([5432, 6379, 1025, 8025]), new Set(["postgres", "redis", "mailpit"])),
    ).toEqual([]);
  });

  it("knows every host port the compose file publishes", () => {
    const compose = readFileSync(COMPOSE_FILE, "utf8");
    const published = [...compose.matchAll(/"127\.0\.0\.1:(\d+):\d+"/g)].map((m) => Number(m[1]));
    expect(published.length).toBeGreaterThan(0);
    expect(new Set(SERVICE_PORTS.map((p) => p.port))).toEqual(new Set(published));
  });
});

describe("[P0-14] services health checks", () => {
  it("Postgres is healthy only when the real server accepts TCP (not the init-time socket-only server)", () => {
    const compose = readFileSync(COMPOSE_FILE, "utf8");
    expect(compose).toMatch(/pg_isready -h 127\.0\.0\.1 /);
  });
});
