import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { databasesFor, isOpenPgp, newestDumps, readBackupConstants } from "./backup-verify";

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
      ? script.replace(new RegExp(`^${name}=.*$`, "m"), bad)
      : script.replace(/^S3_ENDPOINT=.*$/m, "");
    expect(() => readBackupConstants(text)).toThrow(new RegExp(name));
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
      ],
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
});
