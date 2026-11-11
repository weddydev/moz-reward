import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { savePreferences } from "@/features/preferences/actions";
import { requireOwnAccount } from "@/server/authz";
import { runAsPrincipal } from "@/server/authz/principal";
import { testOwnerDb as db } from "@/server/db/client";
import { customerProfiles } from "@/server/db/schema";
import { ownPreferences } from "@/server/repos/profiles";
import { makeCustomerProfile, makeUser } from "@/server/testing/factories";
import { authzMatrix, type Role, world } from "./harness";

// Any signed-in user may call it (it can only touch the caller's own profile; an account without a customer
// profile gets `saved: false`). Anonymous is denied.
const SIGNED_IN: Role[] = [
  "customer",
  "staff_other_shop",
  "owner_other_shop",
  "staff_own_shop",
  "owner_own_shop",
  "owner_own_shop_no_mfa",
  "staff_own_shop_inactive",
  "admin_owner",
  "admin_support",
  "admin_moderator",
  "admin_finance",
  "admin_owner_no_mfa",
];

authzMatrix("savePreferences", {
  allow: SIGNED_IN,
  run: () => savePreferences({ reduceMotion: true, soundOn: false }),
});

const prefsOf = async (userId: string) => {
  const [row] = await db()
    .select({ reduceMotion: customerProfiles.reduceMotion, soundOn: customerProfiles.soundOn })
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, userId));
  return row;
};

it("[P0-08] savePreferences writes the caller's own profile and no one else's", async () => {
  const w = await world();
  const me = w.principals.customer;
  if (!me) throw new Error("world has no customer");
  if (!(await prefsOf(me.userId))) await makeCustomerProfile(me.userId);
  const other = await makeUser();
  await makeCustomerProfile(other.id, { reduceMotion: false, soundOn: true });

  const res = await runAsPrincipal(me, () =>
    savePreferences({ reduceMotion: true, soundOn: false }),
  );

  expect(res).toEqual({ ok: true, data: { saved: true } });
  expect(await prefsOf(me.userId)).toEqual({ reduceMotion: true, soundOn: false });
  expect(await prefsOf(other.id)).toEqual({ reduceMotion: false, soundOn: true });

  // Read back through the repo as the caller; null clears a choice.
  const { scope } = await requireOwnAccount(me);
  expect(await ownPreferences(scope)).toEqual({ reduceMotion: true, soundOn: false });
  await runAsPrincipal(me, () => savePreferences({ reduceMotion: null, soundOn: null }));
  expect(await ownPreferences(scope)).toEqual({ reduceMotion: null, soundOn: null });
});

it("[P0-08] savePreferences cannot name another user: a userId in the input is rejected", async () => {
  const w = await world();
  const victim = await makeUser();
  await makeCustomerProfile(victim.id, { reduceMotion: false, soundOn: true });

  const res = await runAsPrincipal(w.principals.customer, () =>
    // The input type has no userId; a forged one must fail validation (strict schema).
    savePreferences({ reduceMotion: true, soundOn: false, userId: victim.id }),
  );

  expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  expect(await prefsOf(victim.id)).toEqual({ reduceMotion: false, soundOn: true });
});

it("[P0-08] an account without a customer profile is told so and nothing is written", async () => {
  const w = await world();
  const staff = w.principals.staff_own_shop;
  if (!staff) throw new Error("world has no staff");
  expect(await prefsOf(staff.userId)).toBeUndefined(); // the world's staff user has no customer profile
  const before = await db().select().from(customerProfiles);

  const res = await runAsPrincipal(staff, () =>
    savePreferences({ reduceMotion: true, soundOn: null }),
  );

  expect(res).toEqual({ ok: true, data: { saved: false } });
  expect(await db().select().from(customerProfiles)).toEqual(before);
  const { scope } = await requireOwnAccount(staff);
  expect(await ownPreferences(scope)).toBeNull();
});

it("[P0-08] savePreferences rejects values that are not true, false or null", async () => {
  const w = await world();
  const res = await runAsPrincipal(w.principals.customer, () =>
    savePreferences({ reduceMotion: "true", soundOn: null }),
  );
  expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
});

it("[P0-08] a new profile has no choice for either preference", async () => {
  const user = await makeUser();
  const profile = await makeCustomerProfile(user.id);
  expect(profile).toMatchObject({ reduceMotion: null, soundOn: null });
});
