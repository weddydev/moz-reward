"use server";

import { z } from "zod";
import { defineAction } from "@/server/actionTemplate";
import { requireAdminRole } from "@/server/authz";
import { FLAG_KEYS, setFlag } from "@/server/services/flags";

/** Super admin → Content settings: toggle a feature flag (admin owner only; audit-logged). */
export const setFeatureFlag = defineAction({
  input: z.object({ key: z.enum(FLAG_KEYS), enabled: z.boolean() }).strict(),
  authorize: () => requireAdminRole(["owner"]),
  handler: ({ key, enabled }, actor) =>
    setFlag({ key, enabled, actorId: actor.userId, actorRole: `admin:${actor.role}` }),
});
