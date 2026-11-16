import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  baseFile,
  chooseBase,
  LiteralBody,
  oldestVersions,
  parseSentinel,
  pgTime,
  recoveryFailure,
  selectObjects,
  sentinelBase,
  stoppedAt,
  tarHeader,
  type Version,
  WAL_SLACK_MS,
  walFile,
} from "./backup-pitr";
import { parseArgs } from "./backup-verify";

const BASE = "base_000000010000000000000005";
const target = new Date("2026-11-16T08:30:24Z");
const at = (offsetMs: number) => new Date(target.getTime() + offsetMs);
const v = (key: string, lastModified = at(-60_000), size = 100): Version => ({
  key,
  size,
  lastModified,
});
const baseObjects = (env = "staging", base = BASE): Version[] => [
  v(`${env}/wal/basebackups_005/${base}_backup_stop_sentinel.json`),
  v(`${env}/wal/basebackups_005/${base}/metadata.json`),
  v(`${env}/wal/basebackups_005/${base}/files_metadata.json`),
  v(`${env}/wal/basebackups_005/${base}/tar_partitions/part_001.tar.zst`),
  v(`${env}/wal/basebackups_005/${base}/tar_partitions/backup_label.tar.zst`),
  v(`${env}/wal/basebackups_005/${base}/tar_partitions/pg_control.tar.zst`),
  v(`${env}/wal/wal_005/${base.slice(5)}.zst`),
];
const asMap = (list: Version[]) => new Map(list.map((x) => [x.key, x]));

describe("[P0-15] backup:verify --wal pure parts", () => {
  it("[P0-15] takes the oldest version of each key and names the keys that were overwritten", () => {
    const { objects, overwritten } = oldestVersions([
      { key: "a", versionId: "2", size: 9, lastModified: at(5_000) },
      { key: "a", versionId: "1", size: 7, lastModified: at(0) },
      { key: "b", versionId: "1", size: 3, lastModified: at(0) },
    ]);
    expect(objects.get("a")?.versionId).toBe("1");
    expect(overwritten).toEqual(["a"]);
  });

  it("[P0-15] recognises only this environment's stop sentinels", () => {
    expect(sentinelBase(`staging/wal/basebackups_005/${BASE}_backup_stop_sentinel.json`, "staging")).toBe(BASE); // prettier-ignore
    expect(sentinelBase(`production/wal/basebackups_005/${BASE}_backup_stop_sentinel.json`, "staging")).toBeNull(); // prettier-ignore
    expect(sentinelBase(`staging/wal/basebackups_005/base_../x_backup_stop_sentinel.json`, "staging")).toBeNull(); // prettier-ignore
  });

  it("[P0-15] reads FinishTime and UncompressedSize from a sentinel; anything else is not one", () => {
    expect(parseSentinel('{"FinishTime":"2026-11-16T08:30:21.56209Z","UncompressedSize":53955222}')).toEqual({ finish: new Date("2026-11-16T08:30:21.562Z"), uncompressedBytes: 53955222 }); // prettier-ignore
    expect(parseSentinel('{"FinishTime":"2026-11-16T08:30:21Z","UncompressedSize":-1}')?.uncompressedBytes).toBe(0); // prettier-ignore
    for (const bad of ["", "null", "[]", '{"FinishTime":5}', '{"FinishTime":"soon"}']) {
      expect(parseSentinel(bad)).toBeNull();
    }
  });

  it("[P0-15] chooses the newest base backup that finished and was uploaded before the target", () => {
    const c = (base: string, finish: number, uploaded: number | null) => ({
      base,
      finish: at(finish),
      uncompressedBytes: 0,
      lastModified: uploaded === null ? undefined : at(uploaded),
    });
    expect(chooseBase([c("old", -9e6, -9e6), c("new", -60_000, -59_000)], target)?.base).toBe("new"); // prettier-ignore
    // A sentinel claiming an early finish but uploaded after the target is not trusted.
    expect(chooseBase([c("old", -9e6, -9e6), c("liar", -60_000, 5_000)], target)?.base).toBe("old"); // prettier-ignore
    expect(chooseBase([c("after", 1_000, 2_000)], target)).toBeNull();
    expect(chooseBase([c("no-time", -60_000, null)], target)).toBeNull();
  });

  it("[P0-15] base backup files come from a fixed list; local names are built, never copied", () => {
    expect(baseFile("tar_partitions/part_001.tar.zst")).toEqual({ kind: "data", name: "tar_partitions/part_001.tar.zst" }); // prettier-ignore
    expect(baseFile("tar_partitions/pg_control.tar.zst")?.kind).toBe("data");
    expect(baseFile("metadata.json")?.kind).toBe("json");
    for (const bad of ["../../etc/passwd", "tar_partitions/part_1.tar.zst/..", "tar_partitions\\..\\x", "x.json", "tar_partitions/part_x.tar.zst"]) {
      expect(baseFile(bad), bad).toBeNull();
    } // prettier-ignore
    expect(walFile("000000010000000000000005.zst")).toEqual({ tli: "00000001", segno: "0000000000000005", name: "000000010000000000000005.zst" }); // prettier-ignore
    expect(walFile("000000010000000000000005.00000028.backup.zst")?.segno).toBe("0000000000000005");
    for (const bad of ["00000002.history.zst", "000000010000000000000005.partial.zst", "../000000010000000000000005.zst", "000000010000000000000005.zst.x"]) {
      expect(walFile(bad), bad).toBeNull();
    } // prettier-ignore
  });

  it("[P0-15] selects the base backup and its timeline's WAL from the start segment to 30 min after the target", () => {
    const list = [
      ...baseObjects(),
      v("staging/wal/wal_005/000000010000000000000004.zst"), // before the base: not needed
      v("staging/wal/wal_005/000000010000000000000006.zst", at(60_000)),
      v("staging/wal/wal_005/000000010000000000000007.zst", at(WAL_SLACK_MS + 1_000)), // too late
      v("staging/wal/wal_005/000000020000000000000006.zst"), // another timeline
      v("staging/wal/wal_005/00000002.history.zst"),
      v("staging/wal/wal_005/../evil.zst"),
      v(
        "staging/wal/basebackups_005/base_000000010000000000000003/tar_partitions/part_001.tar.zst",
      ),
      v("production/wal/wal_005/000000010000000000000006.zst"),
    ];
    const names = selectObjects(asMap(list), "staging", BASE, target).map((s) => s.name);
    expect(names).toEqual([
      `staging/wal/basebackups_005/${BASE}/files_metadata.json`,
      `staging/wal/basebackups_005/${BASE}/metadata.json`,
      `staging/wal/basebackups_005/${BASE}/tar_partitions/backup_label.tar.zst`,
      `staging/wal/basebackups_005/${BASE}/tar_partitions/part_001.tar.zst`,
      `staging/wal/basebackups_005/${BASE}/tar_partitions/pg_control.tar.zst`,
      `staging/wal/basebackups_005/${BASE}_backup_stop_sentinel.json`,
      "staging/wal/wal_005/000000010000000000000005.zst",
      "staging/wal/wal_005/000000010000000000000006.zst",
    ]);
  });

  it("[P0-15] fails on an unknown object inside the base backup, a missing start segment or pg_control, or too much", () => {
    const sel = (list: Version[]) => () => selectObjects(asMap(list), "staging", BASE, target);
    expect(sel([...baseObjects(), v(`staging/wal/basebackups_005/${BASE}/tar_partitions/../../x`)])).toThrow(/unexpected object in base backup/); // prettier-ignore
    expect(sel(baseObjects().filter((x) => !x.key.includes("wal_005")))).toThrow(/000000010000000000000005\.zst is missing/); // prettier-ignore
    expect(sel(baseObjects().filter((x) => !x.key.includes("pg_control")))).toThrow(/pg_control\.tar\.zst is missing/); // prettier-ignore
    expect(sel(baseObjects().filter((x) => !x.key.includes("part_")))).toThrow(/has no data partition/); // prettier-ignore
    expect(sel([...baseObjects(), { key: "staging/wal/wal_005/000000010000000000000006.zst", size: 1 }])).toThrow(/no upload time/); // prettier-ignore
    expect(sel([...baseObjects(), v("staging/wal/wal_005/000000010000000000000006.zst", at(0), 9 * 1024 ** 3)])).toThrow(/bytes to fetch, more than/); // prettier-ignore
    expect(() => selectObjects(asMap(baseObjects()), "staging", "base_../x", target)).toThrow(/not a base backup name/); // prettier-ignore
  });

  it("[P0-15] passes the target to Postgres re-formatted from the parsed instant", () => {
    expect(pgTime(new Date("2026-11-16T09:30:24.344+01:00"))).toBe("2026-11-16 08:30:24.344+00");
  });

  it("[P0-15] reads where recovery stopped and names only the two known failures", () => {
    const log = "LOG:  recovery stopping before commit of transaction 755, time 2026-11-16 08:30:26.371245+00\nLOG:  selected new timeline ID: 2"; // prettier-ignore
    expect(stoppedAt(log)?.toISOString()).toBe("2026-11-16T08:30:26.371Z");
    expect(stoppedAt("LOG:  redo done")).toBeNull();
    expect(recoveryFailure("FATAL:  recovery ended before configured recovery target was reached", target)).toMatch(/^the archived WAL ends before 2026-11-16T08:30:24\.000Z/); // prettier-ignore
    expect(recoveryFailure("ERROR: duplicate key (email)=(a@b.c)", target)).toBe("the point-in-time recovery stopped with an error (server log withheld: it can quote data)"); // prettier-ignore
  });

  it("[P0-15] writes ustar headers tar accepts, and refuses names that could leave the directory", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "moz-pitr-tar-"));
    try {
      const long = `production/wal/basebackups_005/${BASE}/tar_partitions/${"x".repeat(60)}.tar.zst`;
      const body = Buffer.from("hello");
      const pad = (b: Buffer) => Buffer.concat([b, Buffer.alloc((512 - (b.length % 512)) % 512)]);
      const tarball = Buffer.concat([
        tarHeader("staging/wal/wal_005/000000010000000000000005.zst", body.length, Date.now()),
        pad(body),
        tarHeader(long, 0, Date.now()),
        Buffer.alloc(1024),
      ]);
      writeFileSync(path.join(dir, "t.tar"), tarball);
      const listed = spawnSync("tar", ["-tf", "t.tar"], { cwd: dir, encoding: "utf8" });
      expect(listed.status, listed.stderr).toBe(0);
      expect(listed.stdout.trim().split("\n")).toEqual(["staging/wal/wal_005/000000010000000000000005.zst", long]); // prettier-ignore
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    for (const bad of ["../x", "a/../../x", "a\\b", "/abs", "a b"]) {
      expect(() => tarHeader(bad, 1, 0), bad).toThrow(/tar name not allowed/);
    }
  });

  it("[P0-15] takes the exact bytes out of a literal packet (any header form, any chunking, CR/LF untouched)", async () => {
    const data = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x0d, 0x0a, 0x0d, ...Array.from({ length: 9000 }, (_, i) => i % 256)]); // prettier-ignore
    const lit = (body: Buffer) => Buffer.concat([Buffer.from([0x75, 3]), Buffer.from("abc"), Buffer.alloc(4), body]); // prettier-ignore
    const body = lit(data);
    const run = async (packet: Buffer, chunk: number) => {
      const out: Buffer[] = [];
      const parser = new LiteralBody();
      parser.on("data", (b: Buffer) => out.push(b));
      const done = new Promise<void>((resolve, reject) => {
        parser.on("end", resolve);
        parser.on("error", reject);
      });
      for (let i = 0; i < packet.length; i += chunk) parser.write(packet.subarray(i, i + chunk));
      parser.end();
      await done;
      return Buffer.concat(out);
    };
    const five = Buffer.concat([Buffer.from([0xcb, 0xff]), Buffer.alloc(4), body]);
    five.writeUInt32BE(body.length, 2);
    // Partial lengths: 4096 + 4096 + the rest as a two-octet length (as wal-g/Go writes them).
    const rest = body.length - 8192;
    const partial = Buffer.concat([
      Buffer.from([0xcb, 0xec]), body.subarray(0, 4096), Buffer.from([0xec]), body.subarray(4096, 8192),
      Buffer.from([((rest - 192) >> 8) + 192, (rest - 192) & 0xff]), body.subarray(8192),
    ]); // prettier-ignore
    const small = lit(Buffer.from("hi\r\n"));
    const oldFixed = Buffer.concat([Buffer.from([0xad, 0, 0]), body]); // old format, two-octet length
    oldFixed.writeUInt16BE(body.length, 1);
    const oldOpen = Buffer.concat([Buffer.from([0xaf]), body]); // old format, indeterminate
    for (const chunk of [1, 7, 4096, 1 << 20]) {
      expect(await run(five, chunk)).toEqual(data);
      expect(await run(partial, chunk)).toEqual(data);
      expect(await run(oldFixed, chunk)).toEqual(data);
      expect(await run(oldOpen, chunk)).toEqual(data);
      expect(await run(Buffer.concat([Buffer.from([0xcb, small.length]), small]), chunk)).toEqual(Buffer.from("hi\r\n")); // prettier-ignore
    }
    await expect(run(Buffer.from([0xc8, 3, 1, 2, 3]), 4)).rejects.toThrow("OpenPGP packet 8 is not literal data"); // prettier-ignore
    await expect(run(Buffer.concat([five, Buffer.from([0])]), 64)).rejects.toThrow("data after the OpenPGP literal packet"); // prettier-ignore
    await expect(run(five.subarray(0, five.length - 1), 64)).rejects.toThrow("truncated OpenPGP literal packet"); // prettier-ignore
    await expect(run(Buffer.from("28b52ffd", "hex"), 4)).rejects.toThrow("not an OpenPGP packet");
    await expect(run(Buffer.from([0xcb, 7, 0x78, 0, 0, 0, 0, 0, 1]), 4)).rejects.toThrow("unknown literal data format"); // prettier-ignore
  });

  it("[P0-15] --wal needs --target-time with a zone, not in the future; --target-time needs --wal", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    const base = ["--key-file", "k.asc"];
    expect(parseArgs([...base, "--wal", "--target-time", "2026-11-16T08:30:00Z"], now).target).toEqual(new Date("2026-11-16T08:30:00Z")); // prettier-ignore
    expect(parseArgs(base, now).target).toBeUndefined();
    expect(() => parseArgs([...base, "--wal"], now)).toThrow("--target-time <ISO time with zone> is required"); // prettier-ignore
    expect(() => parseArgs([...base, "--wal", "--target-time", "2026-11-16T08:30:00"], now)).toThrow(/not an ISO time with a zone/); // prettier-ignore
    expect(() => parseArgs([...base, "--wal", "--target-time", "2026-11-17T08:30:00Z"], now)).toThrow(/in the future/); // prettier-ignore
    expect(() => parseArgs([...base, "--target-time", "2026-11-16T08:30:00Z"], now)).toThrow("--target-time needs --wal"); // prettier-ignore
    expect(() => parseArgs([...base, "--wal", "--target-time", "2026-11-16T08:30:00Z", "--max-age-hours", "5"], now)).toThrow(/not --wal/); // prettier-ignore
  });
});
