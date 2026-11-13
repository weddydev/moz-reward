import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { rlsState } from "./check-migrations";
import { findBash } from "./lib/find-bash";

/**
 * P0-15 D1: `infra/host/moz-backup` (root, run by systemd). These tests source it in bash and drive its pure
 * functions: argument validation, the OpenPGP check before upload, the S3 listing parsers and the check that
 * what B2 stored is what was sent. The end-to-end run against MinIO is tests/integration/backup-pipeline.test.ts.
 */
const root = path.resolve(import.meta.dirname, "..");
const script = path.join(root, "infra", "host", "moz-backup").replaceAll("\\", "/");
const bash = findBash();
const tmp = mkdtempSync(path.join(tmpdir(), "moz-backup-unit-"));
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

type Run = { status: number | null; stdout: string; stderr: string };
function run(body: string, args: string[] = [], input = ""): Run {
  const result = spawnSync(bash, ["-c", `source "$1"; shift; ${body}`, "_", script, ...args], {
    input,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const KEY = "staging/dumps/2026-11-14/moz-20261114T023001Z.dump.gpg";
const MD5 = "9e107d9d372bb6826bd81d3542a419d6";

const listXml = (entries: { key: string; size: number; etag: string }[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>b</Name><Prefix>${KEY}</Prefix>
<KeyCount>${String(entries.length)}</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>
${entries
  .map(
    (e) =>
      `<Contents><Key>${e.key}</Key><LastModified>2026-11-14T02:30:05.000Z</LastModified><ETag>&quot;${e.etag}&quot;</ETag><Size>${String(e.size)}</Size><StorageClass>STANDARD</StorageClass></Contents>`,
  )
  .join("\n")}
</ListBucketResult>`;

const versionsXml = (
  entries: { kind: "Version" | "DeleteMarker"; key: string; id: string }[],
): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<ListVersionsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>b</Name><Prefix>${KEY}</Prefix>
${entries
  .map(
    (e) =>
      `<${e.kind}><Key>${e.key}</Key><VersionId>${e.id}</VersionId><IsLatest>true</IsLatest><LastModified>2026-11-14T02:30:05.000Z</LastModified>${
        e.kind === "Version" ? `<ETag>"${MD5}"</ETag><Size>100</Size>` : ""
      }</${e.kind}>`,
  )
  .join("\n")}
</ListVersionsResult>`;

describe("[P0-15] moz-backup arguments", () => {
  it.each([
    ["run", "staging"],
    ["run", "production"],
    ["drill", "staging"],
    ["drill", "production"],
  ])("[P0-15] accepts %s %s", (cmd, env) => {
    const r = run('check_args "$@"; printf "%s\\n" "${REQ[@]}"', [cmd, env]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split("\n")).toEqual([cmd, env]);
  });

  it.each([
    [[]],
    [["run"]],
    [["run", "dev"]],
    [["dump", "staging"]],
    [["run", "staging", "extra"]],
    [["run", "Staging"]],
  ])("[P0-15] refuses %j with exit 64", (args) => {
    const r = run('check_args "$@"', args);
    expect(r.status).toBe(64);
    expect(r.stderr).toMatch(/^moz-backup: refused: /);
  });

  it("[P0-15] backs up both databases in production and the app database on staging", () => {
    expect(run("databases production; databases staging").stdout).toBe("moz umami\nmoz\n");
  });
});

describe("[P0-15] moz-backup refuses to upload anything that is not an OpenPGP message", () => {
  const file = (name: string, bytes: number[]): string => {
    const p = path.join(tmp, name);
    writeFileSync(p, Buffer.from(bytes));
    return p.replaceAll("\\", "/");
  };

  it.each([
    ["old-format PKESK (0x85)", [0x85, 0x01, 0x0c]],
    ["old-format PKESK (0x84)", [0x84, 0x5e]],
    ["new-format PKESK (0xC1)", [0xc1, 0x5e, 0x03]],
  ])("[P0-15] accepts %s", (name, bytes) => {
    expect(run('is_openpgp "$1"', [file(name, bytes)]).status).toBe(0);
  });

  it.each([
    ["a pg_dump custom archive (PGDMP)", [...Buffer.from("PGDMP")]],
    ["plain SQL", [...Buffer.from("-- PostgreSQL database dump")]],
    ["an OpenPGP literal-data packet (unencrypted)", [0xcb, 0x10]],
    ["an empty file", []],
  ])("[P0-15] refuses %s", (name, bytes) => {
    expect(run('is_openpgp "$1"', [file(name, bytes)]).status).not.toBe(0);
  });
});

describe("[P0-15] moz-backup object keys and listings", () => {
  it("[P0-15] names dumps <env>/dumps/<date>/<db>-<stamp>.dump.gpg", () => {
    expect(run("object_key staging 2026-11-14 moz 20261114T023001Z").stdout.trim()).toBe(KEY);
  });

  it("[P0-15] percent-encodes the prefix and refuses unexpected characters", () => {
    expect(run('query_encode "$1"', [KEY]).stdout).toBe(KEY.replaceAll("/", "%2F"));
    expect(run('query_encode "$1"', ["a&b=c"]).status).not.toBe(0);
  });

  it("[P0-15] reads size and ETag of exactly the uploaded key (quotes removed)", () => {
    const xml = listXml([
      { key: `${KEY}.other`, size: 1, etag: "0".repeat(32) },
      { key: KEY, size: 123456, etag: MD5 },
    ]);
    const r = run('xml_object "$1"', [KEY], xml);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`123456 ${MD5}\n`);
  });

  it("[P0-15] reads the ETag whichever way the quotes are encoded (&#34; is MinIO's)", () => {
    for (const quote of ["&#34;", '"']) {
      const xml = listXml([{ key: KEY, size: 1, etag: MD5 }]).replaceAll("&quot;", quote);
      expect(run('xml_object "$1"', [KEY], xml).stdout).toBe(`1 ${MD5}\n`);
    }
  });

  it("[P0-15] fails when the key is not listed", () => {
    expect(run('xml_object "$1"', [KEY], listXml([])).status).not.toBe(0);
  });

  it("[P0-15] lists versions and delete markers of exactly that key", () => {
    const xml = versionsXml([
      { kind: "Version", key: KEY, id: "4_z27c88f1d_v1" },
      { kind: "DeleteMarker", key: KEY, id: "4_z27c88f1d_dm" },
      { kind: "Version", key: `${KEY}.x`, id: "other" },
    ]);
    const r = run('xml_versions "$1"', [KEY], xml);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("version 4_z27c88f1d_v1\ndelete-marker 4_z27c88f1d_dm\n");
  });
});

describe("[P0-15] moz-backup checks what B2 stored against what was sent", () => {
  const stored = (size: number, md5: string, version = "", versions = ""): Run =>
    run('check_stored "$1" "$2" "$3" "$4" "$5" "$6"', [
      KEY,
      String(size),
      md5,
      version,
      listXml([{ key: KEY, size: 100, etag: MD5 }]),
      versions,
    ]);

  it("[P0-15] passes when size and MD5 match (unversioned)", () => {
    expect(stored(100, MD5).status).toBe(0);
  });

  it("[P0-15] passes when the upload is the key's only version", () => {
    const versions = versionsXml([{ kind: "Version", key: KEY, id: "v1" }]);
    expect(stored(100, MD5, "v1", versions).status).toBe(0);
  });

  it.each([
    ["the size differs", 99, MD5, "", "", /stored size 100 differs/],
    ["the MD5 differs", 100, "f".repeat(32), "", "", /ETag differs/],
    [
      "another version exists (an overwrite)",
      100,
      MD5,
      "v2",
      versionsXml([
        { kind: "Version", key: KEY, id: "v2" },
        { kind: "Version", key: KEY, id: "v1" },
      ]),
      /other versions or delete markers: 2 entries/,
    ],
    [
      "a delete marker hides it",
      100,
      MD5,
      "v1",
      versionsXml([
        { kind: "DeleteMarker", key: KEY, id: "dm" },
        { kind: "Version", key: KEY, id: "v1" },
      ]),
      /other versions or delete markers/,
    ],
    [
      "the listed version is not the one uploaded",
      100,
      MD5,
      "v1",
      versionsXml([{ kind: "Version", key: KEY, id: "v0" }]),
      /other versions/,
    ],
  ])("[P0-15] fails when %s", (_name, size, md5, version, versions, message) => {
    const r = stored(size, md5, version, versions);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(message);
  });

  it("[P0-15] fails on a multipart upload (its ETag is not an MD5)", () => {
    const r = run('check_stored "$1" 100 "$2" "" "$3"', [
      KEY,
      MD5,
      listXml([{ key: KEY, size: 100, etag: `${MD5}-2` }]),
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/multipart/);
  });
});

describe("[P0-15] moz-backup credentials file", () => {
  const creds = (body: string): Run => {
    const etc = path.join(tmp, `etc-${String(Math.random()).slice(2)}`);
    mkdirSync(path.join(etc, "staging", "env"), { recursive: true });
    writeFileSync(path.join(etc, "staging", "env", "backup.env"), body);
    return run(
      'MOZ_ETC_ROOT="$1"; load_creds staging; printf "%s|%s" "${#S3_KEY_ID}" "${#S3_SECRET}"',
      [etc.replaceAll("\\", "/")],
    );
  };

  it("[P0-15] reads the two keys moz-deploy wrote", () => {
    const r = creds(
      "# Written by moz-deploy write-env (staging/backup). Do not edit by hand.\nB2_KEY_ID='003a1b2c3d4e5f60000000009'\nB2_APP_KEY='K003abcdefghijklmnopqrstuvwxyzABCD'\n",
    );
    expect(r.stderr).toBe("");
    expect(r.stdout).toBe("25|34");
  });

  it.each([
    ["a missing secret", "B2_KEY_ID='003a1b2c3d4e5f60000000009'\n", /B2_APP_KEY missing/],
    ["an unquoted line", "B2_KEY_ID=003a1b2c3d4e5f60000000009\n", /unexpected line/],
    [
      "a malformed key id",
      "B2_KEY_ID='bad id'\nB2_APP_KEY='K003abcdefghijklmnopqrstuvwxyzABCD'\n",
      /B2_KEY_ID missing or malformed/,
    ],
  ])("[P0-15] refuses %s", (_name, body, message) => {
    const r = creds(body);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(message);
  });

  it("[P0-15] fails clearly when the file does not exist yet (before H-42)", () => {
    const r = run('MOZ_ETC_ROOT="$1"; load_creds staging', [tmp.replaceAll("\\", "/")]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no B2 credentials.*H-42/);
  });
});

describe("[P0-15] restore checks stay in step with the migrations", () => {
  it("[P0-15] checks.sql exempts from RLS exactly the tables migrations declare global (plus PostGIS)", () => {
    const sql = readFileSync(path.join(root, "infra", "backup", "checks.sql"), "utf8");
    const listed = /relname NOT IN \(([^)]*)\)/.exec(sql)?.[1] ?? "";
    const exempt = [...listed.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
    const files = readdirSync(path.join(root, "drizzle"))
      .filter((f) => f.endsWith(".sql"))
      .map((name) => ({ name, sql: readFileSync(path.join(root, "drizzle", name), "utf8") }));
    const globals = [...rlsState(files).global.keys()];
    expect(exempt).toEqual([...globals, "spatial_ref_sys"].sort());
  });
});

describe("[P0-15] systemd units", () => {
  const unit = (name: string): string =>
    readFileSync(path.join(root, "infra", "host", "files", "systemd", name), "utf8");

  it("[P0-15] the service runs moz-backup with a private /tmp, a read-only system and umask 077", () => {
    const s = unit("moz-backup@.service");
    expect(s).toMatch(/^ExecStart=\/usr\/local\/sbin\/moz-backup run %i$/m);
    for (const line of [
      "Type=oneshot",
      "UMask=0077",
      "PrivateTmp=yes",
      "ProtectSystem=strict",
      "ReadWritePaths=/var/lib/moz /run/lock",
      "NoNewPrivileges=yes",
    ]) {
      expect(s).toContain(`\n${line}\n`);
    }
  });

  it("[P0-15] the timer fires nightly at 02:30 London time and catches up after downtime", () => {
    const t = unit("moz-backup@.timer");
    expect(t).toMatch(/^OnCalendar=\*-\*-\* 02:30:00 Europe\/London$/m);
    expect(t).toMatch(/^Persistent=true$/m);
    expect(t).toMatch(/^WantedBy=timers.target$/m);
  });
});
