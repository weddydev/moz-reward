import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  databasesFor,
  dumpTimeProblem,
  failureReason,
  isOpenPgp,
  newestDumps,
  readBackupConstants,
} from "./backup-verify";

const script = readFileSync(
  path.resolve(import.meta.dirname, "..", "infra", "host", "moz-backup"),
  "utf8",
);

describe("[P0-15] backup:verify pure parts", () => {
  it("[P0-15] reads bucket, region, endpoint and the pinned fingerprint from infra/host/moz-backup", () => {
    expect(readBackupConstants(script)).toEqual({
      endpoint: "https://s3.eu-central-003.backblazeb2.com",
      region: "eu-central-003",
      bucket: "mozrewards-backups-dfd829",
      fingerprint: "1D1D1BF1F6FDA0F2EDA8FAA0D356B5CAA21C0F58",
    });
  });

  it.each([
    ["S3_ENDPOINT=http://evil.example", "S3_ENDPOINT"],
    ["PUBKEY_FPR=1D1D", "PUBKEY_FPR"],
    ["", "S3_ENDPOINT"],
  ])("[P0-15] refuses a missing or malformed constant: %s", (bad, name) => {
    const text = bad
      ? script
          .split("\n")
          .map((l) => (l.startsWith(`${name}=`) ? bad : l))
          .join("\n")
      : script.replace(/^S3_ENDPOINT=.*$/m, "");
    expect(() => readBackupConstants(text)).toThrow(name);
  });

  it("[P0-15] staging restores moz; production also umami (as moz-backup's databases)", () => {
    expect(databasesFor("staging")).toEqual(["moz"]);
    expect(databasesFor("production")).toEqual(["moz", "umami"]);
  });

  it("[P0-15] picks the newest dump per database and ignores other environments and stray keys", () => {
    const newest = newestDumps(
      [
        "staging/dumps/2026-11-14/moz-20261114T023001Z.dump.gpg",
        "staging/dumps/2026-11-15/moz-20261115T023005Z.dump.gpg",
        "staging/dumps/2026-11-15/moz-20261115T010000Z.dump.gpg",
        "production/dumps/2026-11-16/moz-20261116T023000Z.dump.gpg",
        "staging/dumps/2026-11-16/moz-20261116T023000Z.dump",
        "staging/dumps/2026-11-16/moz-20261399T023000Z.dump.gpg",
        "staging/wal/basebackups_005/x",
      ].map((key) => ({ key, lastModified: new Date("2026-11-15T02:31:00Z") })),
      "staging",
    );
    expect([...newest.keys()]).toEqual(["moz"]);
    expect(newest.get("moz")?.key).toBe("staging/dumps/2026-11-15/moz-20261115T023005Z.dump.gpg");
    expect(newest.get("moz")?.takenAt.toISOString()).toBe("2026-11-15T02:30:05.000Z");
  });

  it("[P0-15] recognises an OpenPGP message by its first packet, not a plain pg_dump archive", () => {
    for (const b of [0x84, 0x85, 0x86, 0x87, 0xc1]) expect(isOpenPgp(b)).toBe(true);
    for (const b of ["P".charCodeAt(0), 0x00, 0x83, 0xc2, undefined])
      expect(isOpenPgp(b)).toBe(false);
  });

  const dump = (name: string, uploaded?: string) => ({
    db: "moz",
    key: `staging/dumps/x/moz-${name}.dump.gpg`,
    takenAt: new Date(name),
    uploadedAt: uploaded ? new Date(uploaded) : undefined,
  });
  const NOW = new Date("2026-11-15T12:00:00Z");

  it("[P0-15] measures the age from the server's upload time and accepts a fresh dump", () => {
    expect(
      dumpTimeProblem(dump("2026-11-15T02:30:00Z", "2026-11-15T02:34:00Z"), NOW, 26),
    ).toBeNull();
    expect(dumpTimeProblem(dump("2026-11-14T08:00:00Z", "2026-11-14T08:05:00Z"), NOW, 26)).toMatch(
      /is 27\.9 h old, more than 26 h$/,
    );
  });

  it("[P0-15] refuses a dump named in the future (it would stay newest for ever) or far from its upload time", () => {
    expect(dumpTimeProblem(dump("2099-01-01T00:00:00Z", "2026-11-15T11:00:00Z"), NOW, 26)).toMatch(
      /named after a time in the future$/,
    );
    expect(dumpTimeProblem(dump("2026-11-15T11:00:00Z", "2026-11-15T09:30:00Z"), NOW, 26)).toMatch(
      /more than 1 h from the time in its name$/,
    );
    expect(dumpTimeProblem(dump("2026-11-15T11:00:00Z"), NOW, 26)).toMatch(/no upload time/);
    // Within the 10-minute clock slack.
    expect(
      dumpTimeProblem(dump("2026-11-15T12:05:00Z", "2026-11-15T12:05:30Z"), NOW, 26),
    ).toBeNull();
  });

  it("[P0-15] a failed restore reports only our own messages, never row values from Postgres", () => {
    const pg = [
      'pg_restore: error: COPY failed for table "users": ERROR:  duplicate key value violates unique constraint',
      "DETAIL:  Key (email)=(jane@example.com) already exists.",
      'CONTEXT:  COPY users, line 3, column phone: "+447700900123"',
    ].join("\n");
    const failed = `${pg}\nmoz-backup: pg_restore of moz failed (exit 1)\n`;
    expect(failureReason(failed, 1)).toBe("pg_restore of moz failed (exit 1)");
    expect(failureReason(pg, 1)).toBe("the restore failed (exit 1)");
    expect(
      failureReason(
        "psql:<stdin>:40: ERROR:  backup check failed: rls (missing on shops)\nCONTEXT: PL/pgSQL",
        3,
      ),
    ).toBe("backup check failed: rls (missing on shops)");
    for (const out of [failureReason(failed, 1), failureReason(pg, 1)]) {
      expect(out).not.toMatch(/jane|447700/);
    }
  });
});
