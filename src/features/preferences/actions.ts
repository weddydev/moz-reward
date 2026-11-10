"use server";

import { z } from "zod";
import { defineAction } from "@/server/actionTemplate";
import { requireOwnAccount } from "@/server/authz";
import { updateOwnPreferences } from "@/server/repos/profiles";

/**
 * Saves the caller's display preferences (reduce motion, sounds) to their own customer profile; null clears a
 * choice. Any signed-in user may call it: an account without a customer profile (staff, admin) gets
 * `saved: false` and keeps the choice on the device only. The profile is found from the session, never from
 * the input.
 */
export const savePreferences = defineAction({
  name: "preferences.save",
  input: z
    .object({ reduceMotion: z.boolean().nullable(), soundOn: z.boolean().nullable() })
    .strict(),
  authorize: (_input, p) => requireOwnAccount(p),
  rateLimit: { max: 30, windowSec: 60, failMode: "open" },
  handler: async (input, { scope }) => ({ saved: await updateOwnPreferences(scope, input) }),
});
