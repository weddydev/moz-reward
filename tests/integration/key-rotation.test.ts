import { randomBytes } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mintCustomerScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { auditLogs, customerProfiles } from "@/server/db/schema";
import { env } from "@/server/env";
import {
  ENCRYPTED_FIELDS,
  keyIdCounts,
  reencryptAll,
  unregisteredEncryptedColumns,
} from "@/server/jobs/reencrypt";
import { transaction } from "@/server/repos/_base";
import { createOwnProfile, readOwnProfile } from "@/server/repos/profiles";
import {
  FieldCryptoError,
  type Keyring,
  keyIdOf,
  openField,
  parseKeyring,
  sealField,
} from "@/server/security/field-crypto";
import {
  phoneBlindIndex,
  profilePhoneContext,
  setFieldKeyringForTests,
} from "@/server/security/field-keys";
import { makeUser } from "@/server/testing/factories";

/**
 * P1-04 key rotation: a new data key id becomes current for writes, old rows still open, `reencryptAll` moves
 * every row to the new key in keyset batches (audited, resumable, idempotent), and blind-index lookups are
 * untouched. Unknown key ids and values that don't open stop the run loudly.
 */

const OLD_ID = keyIdOf(env().DATA_ENCRYPTION_KEY);
const OLD_KEY = env().DATA_ENCRYPTION_KEY;
const NEW_KEY = randomBytes(32).toString("base64");
const NEW_ID = keyIdOf(NEW_KEY);
const rotated = (): Keyring => parseKeyring({ key: NEW_KEY, old: OLD_KEY });
const newOnly = (): Keyring => parseKeyring({ key: NEW_KEY });
const FIELD = "customer_profiles.phone_enc";

type Seeded = { userId: string; phone: string };

async function seed(n: number, start = 0): Promise<Seeded[]> {
  const out: Seeded[] = [];
  for (let i = start; i < start + n; i++) {
    const user = await makeUser();
    const scope = mintCustomerScope({ userId: user.id });
    const phone = `+4474000000${String(i).padStart(2, "0")}`;
    await transaction(scope, (tx) =>
      createOwnProfile(
        scope,
        { fullName: `Customer ${String(i)}`, phoneE164: phone, birthday: null },
        tx,
      ),
    );
    out.push({ userId: user.id, phone });
  }
  return out;
}

const rows = () =>
  db()
    .select({
      userId: customerProfiles.userId,
      enc: customerProfiles.phoneEnc,
      keyId: customerProfiles.phoneKeyId,
      hash: customerProfiles.phoneHash,
    })
    .from(customerProfiles)
    .orderBy(customerProfiles.userId);

const rotationAudits = (since: Date) =>
  db()
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "keys.reencrypt"), gte(auditLogs.at, since)));

const readAs = (userId: string) => readOwnProfile(mintCustomerScope({ userId }));

beforeEach(async () => {
  await db().delete(customerProfiles);
});
afterEach(() => {
  setFieldKeyringForTests(undefined);
});

describe("[P1-04] data-key rotation and the re-encryption job", () => {
  it("every *_enc column in the database is registered, with its key-id column", async () => {
    expect(await unregisteredEncryptedColumns()).toEqual([]);
    expect(await unregisteredEncryptedColumns([])).toEqual([`${FIELD} is not registered`]);
    const ghost = { ...ENCRYPTED_FIELDS[0]!, table: "no_such_table" };
    expect(await unregisteredEncryptedColumns([...ENCRYPTED_FIELDS, ghost])).toEqual([
      "no_such_table.phone_enc is registered but the column or its key-id column is missing",
    ]);
  });

  it("rotates: new writes use the new key id, old rows still open, the job leaves none on the old id, a second run changes nothing, blind index still matches", async () => {
    const before = await seed(5);
    expect(await keyIdCounts()).toEqual({ [FIELD]: { [OLD_ID]: 5 } });
    const sealedBefore = new Map((await rows()).map((r) => [r.userId, r.enc]));

    setFieldKeyringForTests(rotated());
    const [fresh] = await seed(1, 5);
    const all = [...before, fresh!];
    expect(await keyIdCounts()).toEqual({ [FIELD]: { [OLD_ID]: 5, [NEW_ID]: 1 } });
    for (const c of all) expect((await readAs(c.userId))?.phoneE164).toBe(c.phone);

    const startedAt = new Date(Date.now() - 1000);
    const first = await reencryptAll({ ring: rotated(), batchSize: 2 });
    expect(first).toEqual({
      current: NEW_ID,
      left: 0,
      fields: [{ field: FIELD, rewritten: 5, batches: 3, left: 0 }],
    });
    expect(await keyIdCounts()).toEqual({ [FIELD]: { [NEW_ID]: 6 } });

    const after = await rows();
    for (const r of after) {
      const c = all.find((x) => x.userId === r.userId)!;
      if (sealedBefore.has(r.userId)) expect(r.enc).not.toBe(sealedBefore.get(r.userId));
      expect(r.enc).toMatch(/^v1\./);
      expect(r.enc).not.toContain(c.phone.slice(3));
      // Blind index untouched by a data-key rotation; lookups by the number still match.
      expect(r.hash).toBe(phoneBlindIndex(c.phone));
      expect(
        openField(
          newOnly(),
          { keyId: r.keyId!, ciphertext: r.enc! },
          profilePhoneContext(r.userId),
        ),
      ).toBe(c.phone);
    }

    // The old key can now be dropped: every profile opens with the new key alone.
    setFieldKeyringForTests(newOnly());
    for (const c of all) expect((await readAs(c.userId))?.phoneE164).toBe(c.phone);

    const audits = await rotationAudits(startedAt);
    expect(audits).toHaveLength(3);
    expect(audits.map((a) => a.meta.rows).reduce((s, n) => Number(s) + Number(n), 0)).toBe(5);
    for (const a of audits) {
      expect(a).toMatchObject({ actorRole: "system", entity: "customer_profiles", actorId: null });
      expect(a.meta).toMatchObject({ column: "phone_enc", toKeyId: NEW_ID });
      expect(JSON.stringify(a.meta)).not.toMatch(/\+44|7400/);
    }

    const second = await reencryptAll({ ring: rotated(), batchSize: 2 });
    expect(second.fields).toEqual([{ field: FIELD, rewritten: 0, batches: 0, left: 0 }]);
    expect(await rows()).toEqual(after);
    expect(await rotationAudits(startedAt)).toHaveLength(3);
  });

  it("an interruption mid-batch rolls back only that batch; the next run resumes without sealing anything twice", async () => {
    const seeded = await seed(5);
    await expect(
      reencryptAll({
        ring: rotated(),
        batchSize: 2,
        onBatch: (_field, batch) =>
          batch === 2 ? Promise.reject(new Error("killed mid-batch")) : Promise.resolve(),
      }),
    ).rejects.toThrow("killed mid-batch");
    expect(await keyIdCounts()).toEqual({ [FIELD]: { [OLD_ID]: 3, [NEW_ID]: 2 } });

    const resumed = await reencryptAll({ ring: rotated(), batchSize: 2 });
    expect(resumed.fields).toEqual([{ field: FIELD, rewritten: 3, batches: 2, left: 0 }]);
    setFieldKeyringForTests(newOnly());
    for (const c of seeded) expect((await readAs(c.userId))?.phoneE164).toBe(c.phone);
  });

  it("an unknown key id stops the run before any write, and reading that row fails loudly instead of returning garbage", async () => {
    const [known] = await seed(1);
    const [stray] = await seed(1, 1);
    const strayRing = parseKeyring({ key: randomBytes(32).toString("base64") });
    const sealed = sealField(strayRing, stray!.phone, profilePhoneContext(stray!.userId));
    await db()
      .update(customerProfiles)
      .set({ phoneEnc: sealed.ciphertext, phoneKeyId: sealed.keyId })
      .where(eq(customerProfiles.userId, stray!.userId));
    const snapshot = await rows();

    await expect(reencryptAll({ ring: rotated() })).rejects.toThrow(
      new RegExp(
        `1 row\\(s\\) of customer_profiles\\.phone_enc are sealed under key id "${strayRing.current}".*Nothing was changed`,
      ),
    );
    expect(await rows()).toEqual(snapshot);
    expect((await readAs(known!.userId))?.phoneE164).toBe(known!.phone);
    const err = await readAs(stray!.userId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FieldCryptoError);
    expect((err as FieldCryptoError).kind).toBe("unknown-key");
    expect((err as Error).message).not.toContain(stray!.phone);
  });

  it("a value that fails its integrity check (copied from another row) stops the run and rolls back its batch", async () => {
    const [a, b, c] = await seed(3);
    const [rowA] = (await rows()).filter((r) => r.userId === a!.userId);
    await db()
      .update(customerProfiles)
      .set({ phoneEnc: rowA!.enc })
      .where(eq(customerProfiles.userId, b!.userId));
    const snapshot = await rows();

    const err = await reencryptAll({ ring: rotated(), batchSize: 10 }).catch((e: unknown) => e);
    expect((err as Error).message).toMatch(
      new RegExp(
        `row ${b!.userId} \\(key id "${OLD_ID}"\\) does not open: integrity check failed.*rolled back`,
      ),
    );
    expect((err as Error).message).not.toContain(a!.phone);
    expect(await rows()).toEqual(snapshot);
    expect((await readAs(c!.userId))?.phoneE164).toBe(c!.phone);
  });

  it("refuses a batch size outside 1–5000", async () => {
    await expect(reencryptAll({ ring: rotated(), batchSize: 0 })).rejects.toThrow(/batch size/);
    await expect(reencryptAll({ ring: rotated(), batchSize: 1.5 })).rejects.toThrow(/batch size/);
  });
});
