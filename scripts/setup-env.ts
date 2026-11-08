/**
 * `pnpm setup:env` (P0-02): creates `.env.local` from `.env.example` with freshly generated local secrets.
 * Never overwrites an existing `.env.local` and never prints a value: only the names it generated.
 * The generated secrets are for this machine's local stack only; staging/production secrets come from the
 * password manager and GitHub Environments (HUMAN_TASKS).
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isDirectRun } from "../src/lib/is-direct-run";

/** Variables that `.env.example` leaves empty and the local stack needs as random 32-byte base64 values. */
export const GENERATED_SECRETS = [
  "AUTH_SECRET",
  "DATA_ENCRYPTION_KEY",
  "BLIND_INDEX_KEY",
  "MEMBER_QR_SIGNING_KEY",
] as const;

export const randomSecret = (): string => randomBytes(32).toString("base64");

/**
 * Fills each GENERATED_SECRETS line (`NAME=` followed by optional spaces and a `#` comment) with a new value,
 * keeping the comment. Returns the new text and the names filled. Lines that already have a value are kept.
 */
export function fillSecrets(
  example: string,
  generate: () => string = randomSecret,
): { text: string; filled: string[] } {
  const filled: string[] = [];
  const text = example.replace(
    /^([A-Z0-9_]+)=([ \t]*)(#.*)?$/gm,
    (line, name: string, gap: string, comment?: string) => {
      if (!(GENERATED_SECRETS as readonly string[]).includes(name)) return line;
      filled.push(name);
      return `${name}=${generate()}${comment ? `${gap || " "}${comment}` : ""}`;
    },
  );
  return { text, filled };
}

function main(): void {
  if (existsSync(".env.local")) {
    console.error(
      "[setup:env] .env.local already exists; nothing changed. Delete it first if you really want a fresh one.",
    );
    process.exit(1);
  }
  const { text, filled } = fillSecrets(readFileSync(".env.example", "utf8"));
  writeFileSync(".env.local", text, { flag: "wx", mode: 0o600 });
  process.stdout.write(
    `[setup:env] created .env.local with generated values for: ${filled.join(", ")}\n`,
  );
}

if (isDirectRun(import.meta.url)) main();
