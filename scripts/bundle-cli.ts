/**
 * `pnpm bundle:cli` (P0-15, C-21): bundles the worker and the host CLIs into `dist/cli/<name>.mjs`, so the
 * runtime image needs no tsx, no dev dependencies and no source tree. The web server is Next's standalone
 * output; these bundles sit beside it in /app and resolve their few externals from its traced node_modules.
 *   - `server-only` maps to the package's empty module, exactly like scripts/server-only-hook.mjs (the worker
 *     renders emails, which the react-server condition forbids).
 *   - Every module of a bundle shares the bundle's import.meta.url, so only the entry keeps its
 *     `isDirectRun(import.meta.url)` guard; any other guard becomes `false` (demo-credentials imports seed.ts,
 *     whose main() must not run). Proven in bundle-cli.test.ts and by running the bundles in the image.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { build, type Plugin } from "esbuild";
import { isDirectRun } from "../src/lib/is-direct-run";

export const CLI_ENTRIES = {
  worker: "src/worker/index.ts",
  relay: "scripts/relay.ts",
  migrate: "src/server/db/migrate.ts",
  seed: "src/server/db/seed.ts",
  "demo-credentials": "scripts/demo-credentials.ts",
} as const;

/**
 * Native packages stay external: they load a per-platform `.node` binary. Each is also used by the web
 * server, so Next's file tracing puts it in the standalone node_modules (checked by running the bundles).
 */
export const EXTERNAL = ["@node-rs/argon2"];

const GUARD = "isDirectRun(import.meta.url)";
const norm = (p: string): string => path.resolve(p).replaceAll("\\", "/").toLowerCase();

export function guardDirectRun(source: string, file: string, entry: string): string {
  return norm(file) === norm(entry)
    ? source
    : source.replaceAll(GUARD, "false /* bundled: not the entry */");
}

function cliPlugin(entry: string): Plugin {
  const empty = path.join(
    path.dirname(createRequire(import.meta.url).resolve("server-only")),
    "empty.js",
  );
  return {
    name: "moz-cli",
    setup(b) {
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: empty }));
      b.onLoad({ filter: /[\\/](src|scripts)[\\/].*\.tsx?$/ }, async (args) => {
        const source = await readFile(args.path, "utf8");
        return {
          contents: guardDirectRun(source, args.path, entry),
          loader: args.path.endsWith(".tsx") ? "tsx" : "ts",
        };
      });
    },
  };
}

// CommonJS dependencies inside an ESM bundle still call require/__dirname.
const BANNER = [
  'import { createRequire as __mozCreateRequire } from "node:module";',
  'import { fileURLToPath as __mozFileURLToPath } from "node:url";',
  "const require = __mozCreateRequire(import.meta.url);",
  "const __filename = __mozFileURLToPath(import.meta.url);",
  'const __dirname = __mozFileURLToPath(new URL(".", import.meta.url));',
].join("\n");

const count = (source: string, text: string): number => source.split(text).length - 1;
/** Calls only: the bundled definition (`function isDirectRun(`) is not a guard. */
const directRunCalls = (source: string): number =>
  count(source, "isDirectRun(") - count(source, "function isDirectRun(");

/**
 * A guard written differently from GUARD would survive the rewrite and run another CLI's main() (security
 * review P0-15): the bundle must hold exactly the entry's own direct-run calls.
 */
export function strayGuardProblem(entrySource: string, bundle: string): string | null {
  const expected = directRunCalls(entrySource);
  const found = directRunCalls(bundle);
  return found === expected
    ? null
    : `${String(found)} isDirectRun( calls in the bundle, expected ${String(expected)} (the entry's own)`;
}

export async function bundleCli(outDir = "dist/cli"): Promise<void> {
  for (const [name, entry] of Object.entries(CLI_ENTRIES)) {
    const outfile = path.join(outDir, `${name}.mjs`);
    await build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      tsconfig: "tsconfig.json",
      external: EXTERNAL,
      banner: { js: BANNER },
      plugins: [cliPlugin(path.resolve(entry))],
      logLevel: "warning",
      legalComments: "none",
    });
    const stray = strayGuardProblem(await readFile(entry, "utf8"), await readFile(outfile, "utf8"));
    if (stray) throw new Error(`${name}: ${stray}`);
  }
  console.warn(`[bundle:cli] ${String(Object.keys(CLI_ENTRIES).length)} bundles in ${outDir}`);
}

if (isDirectRun(import.meta.url)) {
  bundleCli().catch((err: unknown) => {
    console.error("[bundle:cli] failed:", err);
    process.exit(1);
  });
}
