import "server-only";
import { sql } from "drizzle-orm";
import { systemScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { poolFor, transaction } from "@/server/repos/_base";
import { type Keyring, openField, sealField } from "@/server/security/field-crypto";
import { fieldKeyring, profilePhoneContext } from "@/server/security/field-keys";
import { audit } from "@/server/services/audit";

/**
 * Data-key rotation (P1-04, SECURITY §7, RUNBOOK §18): `pnpm keys:reencrypt` rewrites every encrypted field
 * still sealed under an old key id with the current key. Each batch is its own transaction: rows are taken in
 * primary-key order with a plain `FOR UPDATE` (a customer editing the same row waits; nothing is skipped), opened
 * with their own key, sealed with the current one, written back only where the key id is still the old one, and
 * recorded in one audit row. An interruption rolls back at most the batch in flight; running again picks up
 * whatever is still on an old key id, so a value is never sealed twice and a second run changes nothing.
 *
 * Before any write the job checks that (1) every `*_enc` column in the database is in `ENCRYPTED_FIELDS` and
 * (2) every key id in use is in the keyring. Either failing stops the run loudly with nothing changed: a column
 * nobody registered would silently stay on the old key, and an unknown key id would mean data the app can't open.
 */

/** One encrypted column: `<enc>` holds the sealed value, `<keyId>` the id of the key that sealed it. */
export type EncryptedField = {
  readonly table: string;
  readonly pk: string;
  /** Postgres type of the primary key (cast of the batch's VALUES list). */
  readonly pkType: "uuid";
  readonly enc: string;
  readonly keyId: string;
  /** The field-crypto AAD context of a row (must match what the writer used). */
  readonly context: (pk: string) => string;
};

export const ENCRYPTED_FIELDS: readonly EncryptedField[] = [
  {
    table: "customer_profiles",
    pk: "user_id",
    pkType: "uuid",
    enc: "phone_enc",
    keyId: "phone_key_id",
    context: profilePhoneContext,
  },
];

export const fieldName = (f: EncryptedField): string => `${f.table}.${f.enc}`;

export class ReencryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReencryptError";
  }
}

const SCOPE = systemScope("data-key rotation: re-seals encrypted fields of every customer");
const DEFAULT_BATCH = 500;
/** Rows left on an old key after a pass were written by a process still on the old keyring; try again. */
const MAX_PASSES = 3;

const id = (name: string) => sql.identifier(name);

/** `*_enc` columns in the database that `ENCRYPTED_FIELDS` doesn't cover (or covers without a key-id column). */
export async function unregisteredEncryptedColumns(
  fields: readonly EncryptedField[] = ENCRYPTED_FIELDS,
): Promise<string[]> {
  const rows = await poolFor(SCOPE).execute<{ table_name: string; column_name: string }>(sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND (column_name LIKE '%\_enc' OR column_name LIKE '%\_key\_id')`);
  const present = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  const problems: string[] = [];
  for (const r of rows) {
    if (!r.column_name.endsWith("_enc")) continue;
    const name = `${r.table_name}.${r.column_name}`;
    if (!fields.some((f) => fieldName(f) === name)) problems.push(`${name} is not registered`);
  }
  for (const f of fields)
    if (!present.has(fieldName(f)) || !present.has(`${f.table}.${f.keyId}`))
      problems.push(`${fieldName(f)} is registered but the column or its key-id column is missing`);
  return problems;
}

/** Rows per key id for each field (NULL = no value stored). The before/after evidence of a rotation. */
export async function keyIdCounts(
  fields: readonly EncryptedField[] = ENCRYPTED_FIELDS,
): Promise<Record<string, Record<string, number>>> {
  const out: Record<string, Record<string, number>> = {};
  for (const f of fields) {
    const rows = await poolFor(SCOPE).execute<{ key_id: string; n: number }>(sql`
      SELECT ${id(f.keyId)} AS key_id, count(*)::int AS n FROM ${id(f.table)}
      WHERE ${id(f.keyId)} IS NOT NULL GROUP BY 1 ORDER BY 1`);
    out[fieldName(f)] = Object.fromEntries(rows.map((r) => [r.key_id, r.n]));
  }
  return out;
}

export type FieldResult = { field: string; rewritten: number; batches: number; left: number };
export type ReencryptResult = { current: string; fields: FieldResult[]; left: number };

export type ReencryptOptions = {
  ring?: Keyring;
  batchSize?: number;
  fields?: readonly EncryptedField[];
  /** Tests only: runs inside each batch's transaction after its write; throwing rolls that batch back. */
  onBatch?: (field: string, batch: number) => Promise<void>;
};

async function preflight(fields: readonly EncryptedField[], ring: Keyring): Promise<void> {
  const unregistered = await unregisteredEncryptedColumns(fields);
  if (unregistered.length > 0)
    throw new ReencryptError(
      `encrypted columns not in ENCRYPTED_FIELDS (src/server/jobs/reencrypt.ts): ${unregistered.join("; ")}. Nothing was changed.`,
    );
  const counts = await keyIdCounts(fields);
  for (const [field, byKey] of Object.entries(counts))
    for (const [keyId, n] of Object.entries(byKey))
      if (!ring.keys.has(keyId))
        throw new ReencryptError(
          `${String(n)} row(s) of ${field} are sealed under key id "${keyId}", which is not in the keyring ` +
            `(DATA_ENCRYPTION_KEY + DATA_ENCRYPTION_OLD_KEYS). Add that key to DATA_ENCRYPTION_OLD_KEYS before rotating. Nothing was changed.`,
        );
}

async function reencryptBatch(
  tx: Transaction,
  f: EncryptedField,
  ring: Keyring,
  after: string | null,
  limit: number,
): Promise<{ last: string | null; rewritten: number; from: Record<string, number> }> {
  const rows = await tx.execute<{ pk: string; enc: string; key_id: string }>(sql`
    SELECT ${id(f.pk)}::text AS pk, ${id(f.enc)} AS enc, ${id(f.keyId)} AS key_id FROM ${id(f.table)}
    WHERE ${id(f.keyId)} IS NOT NULL AND ${id(f.keyId)} <> ${ring.current}
      ${after === null ? sql`` : sql`AND ${id(f.pk)} > ${after}::${sql.raw(f.pkType)}`}
    ORDER BY ${id(f.pk)} LIMIT ${limit} FOR UPDATE`);
  if (rows.length === 0) return { last: null, rewritten: 0, from: {} };
  const from: Record<string, number> = {};
  const values = rows.map((r) => {
    let plaintext: string;
    try {
      plaintext = openField(ring, { keyId: r.key_id, ciphertext: r.enc }, f.context(r.pk));
    } catch (err) {
      throw new ReencryptError(
        `${fieldName(f)} row ${r.pk} (key id "${r.key_id}") does not open: ${(err as Error).message}. This batch was rolled back.`,
      );
    }
    from[r.key_id] = (from[r.key_id] ?? 0) + 1;
    const sealed = sealField(ring, plaintext, f.context(r.pk));
    return sql`(${r.pk}::${sql.raw(f.pkType)}, ${sealed.ciphertext}, ${r.key_id})`;
  });
  const updated = await tx.execute(sql`
    UPDATE ${id(f.table)} AS t SET ${id(f.enc)} = v.enc, ${id(f.keyId)} = ${ring.current}
    FROM (VALUES ${sql.join(values, sql`, `)}) AS v(pk, enc, old)
    WHERE t.${id(f.pk)} = v.pk AND t.${id(f.keyId)} = v.old`);
  return { last: rows[rows.length - 1]?.pk ?? null, rewritten: updated.count, from };
}

async function reencryptField(
  f: EncryptedField,
  ring: Keyring,
  batchSize: number,
  onBatch: ReencryptOptions["onBatch"],
): Promise<FieldResult> {
  const field = fieldName(f);
  let rewritten = 0;
  let batches = 0;
  let left = 0;
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    let after: string | null = null;
    for (;;) {
      const from = after;
      const batch = await transaction(SCOPE, async (tx) => {
        const b = await reencryptBatch(tx, f, ring, from, batchSize);
        if (b.last === null) return b;
        await audit(tx, {
          actor: SCOPE,
          action: "keys.reencrypt",
          entity: f.table,
          meta: { column: f.enc, rows: b.rewritten, fromKeyIds: b.from, toKeyId: ring.current },
        });
        await onBatch?.(field, batches + 1);
        return b;
      });
      if (batch.last === null) break;
      rewritten += batch.rewritten;
      batches += 1;
      after = batch.last;
    }
    left = await remaining(f, ring.current);
    if (left === 0) break;
  }
  return { field, rewritten, batches, left };
}

async function remaining(f: EncryptedField, current: string): Promise<number> {
  const [row] = await poolFor(SCOPE).execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM ${id(f.table)}
    WHERE ${id(f.keyId)} IS NOT NULL AND ${id(f.keyId)} <> ${current}`);
  return row?.n ?? 0;
}

/**
 * Re-seals every registered encrypted field under the keyring's current key. Throws `ReencryptError` (nothing
 * or only the batch in flight rolled back) on an unregistered column, an unknown key id or a value that doesn't
 * open. `left` > 0 means rows still sit on an old key after the last pass: the caller must fail.
 */
export async function reencryptAll(opts: ReencryptOptions = {}): Promise<ReencryptResult> {
  const ring = opts.ring ?? fieldKeyring();
  const fields = opts.fields ?? ENCRYPTED_FIELDS;
  const batchSize = opts.batchSize ?? DEFAULT_BATCH;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000)
    throw new ReencryptError("batch size must be a whole number from 1 to 5000");
  await preflight(fields, ring);
  const results: FieldResult[] = [];
  for (const f of fields) results.push(await reencryptField(f, ring, batchSize, opts.onBatch));
  return {
    current: ring.current,
    fields: results,
    left: results.reduce((sum, r) => sum + r.left, 0),
  };
}
