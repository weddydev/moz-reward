/**
 * `pnpm docker:tidy` (human, 21 Nov 2026): frees Docker disk space without slowing development or touching
 * anything another project owns. Dry run by default (prints what it would remove); `--apply` removes.
 *
 * Removes:
 * 1. anonymous volumes no container uses (test containers leave them; named volumes are never touched:
 *    `moz-rewards_pgdata`, other projects' data, caches);
 * 2. dangling images (`<none>` layers no tag points to);
 * 3. this repo's own local images (`moz-*`) that no file in the repo names any more (an old build tag);
 *    images the tests and scripts use (`moz-postgres:walg-test`, `moz-postgres:verify`) stay, since rebuilding
 *    them would slow the gate;
 * 4. build cache older than 7 days, then the least recently used layers until the cache is ≤ 5 GB (the
 *    layers the local image builds use are the most recent, so builds stay fast).
 * `--images`: also removes third-party images that neither this repo names nor any container (running or
 * stopped) uses. Only with the human's OK: another project on the machine may pull them again.
 * Never run during a gate or E2E run (a test container may be between steps).
 */
import { spawnSync } from "node:child_process";
import { isDirectRun } from "../src/lib/is-direct-run";

type Image = { ref: string; id: string; size: string; repo: string; tag: string };

function docker(args: string[]): string[] {
  const r = spawnSync("docker", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`docker ${args.join(" ")}: ${r.stderr}`);
  return r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Every `repo:tag` (or bare repo) written anywhere in the tracked files. */
function referencedInRepo(refs: string[]): Set<string> {
  const found = new Set<string>();
  for (const ref of refs) {
    // The tidy script and its test name sample images; they must not count as "used".
    const r = spawnSync(
      "git",
      ["grep", "-q", "-F", ref, "--", ":!progress", ":!docs", ":!scripts/docker-tidy*"],
      {
        encoding: "utf8",
      },
    );
    if (r.status === 0) found.add(ref);
  }
  return found;
}

/** Pure: which images go. `used` = image IDs any container uses; `named` = refs the repo names. */
export function selectImages(
  images: Image[],
  used: Set<string>,
  named: Set<string>,
  thirdParty: boolean,
): Image[] {
  return images.filter((img) => {
    if (img.tag === "<none>") return false; // dangling ones go through `image prune`
    if (used.has(img.id)) return false;
    if (named.has(img.ref)) return false;
    if (img.repo.startsWith("moz-")) return true;
    return thirdParty && !named.has(img.repo);
  });
}

/** Pure: anonymous volume names (64 hex), the only volumes this script ever removes. */
export const isAnonymousVolume = (name: string): boolean => /^[0-9a-f]{64}$/.test(name);

function main(): void {
  const apply = process.argv.includes("--apply");
  const thirdParty = process.argv.includes("--images");
  const say = (s: string): void => {
    console.warn(`[docker:tidy]${apply ? "" : " (dry run)"} ${s}`);
  };

  // 1. Anonymous, unused volumes.
  const volumes = docker(["volume", "ls", "-q", "--filter", "dangling=true"]).filter(
    isAnonymousVolume,
  );
  say(`${String(volumes.length)} unused anonymous volumes`);
  if (apply && volumes.length) docker(["volume", "rm", ...volumes]);

  // 2. Dangling images.
  const dangling = docker(["images", "-q", "--filter", "dangling=true"]);
  say(`${String(dangling.length)} dangling images`);
  if (apply && dangling.length) docker(["image", "prune", "-f"]);

  // 3. Unreferenced own images (+ third-party with --images).
  const images: Image[] = docker([
    "images",
    "--format",
    "{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}",
  ]).map((l) => {
    const [repo = "", tag = "", id = "", size = ""] = l.split("\t");
    return { repo, tag, id, size, ref: `${repo}:${tag}` };
  });
  const used = new Set(
    docker(["ps", "-a", "--format", "{{.Image}}"]).flatMap((ref) => {
      const hit = images.find((i) => i.ref === ref || i.id.startsWith(ref) || i.repo === ref);
      return hit ? [hit.id] : [];
    }),
  );
  const named = referencedInRepo([...images.map((i) => i.ref), ...images.map((i) => i.repo)]);
  const doomed = selectImages(images, used, named, thirdParty);
  for (const img of doomed) say(`image ${img.ref} (${img.size})`);
  if (!thirdParty) {
    const candidates = selectImages(images, used, named, true).filter((i) => !doomed.includes(i));
    if (candidates.length)
      say(
        `not touched (third-party, unused here; --images removes them): ${candidates.map((i) => `${i.ref} ${i.size}`).join(", ")}`,
      );
  }
  if (apply && doomed.length) docker(["rmi", ...doomed.map((i) => i.ref)]);

  // 4. Build cache older than 7 days.
  if (apply) {
    docker(["builder", "prune", "-f", "--filter", "until=168h"]);
    docker(["builder", "prune", "-f", "--max-used-space", "5gb"]);
  } else say("build cache: older than 7 days, then least recently used down to 5 GB");

  if (apply) console.warn(docker(["system", "df"]).join("\n"));
}

if (isDirectRun(import.meta.url)) main();
