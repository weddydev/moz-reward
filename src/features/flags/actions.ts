"use server";

import { z } from "zod";
import { defineAction } from "@/server/actionTemplate";
import { requireAdminRole } from "@/server/authz";
import { requestLogger } from "@/server/log";
import { FLAG_KEYS, setFlag } from "@/server/services/flags";

/**
 * Super admin → Content settings: toggle a feature flag. The reference action for the template
 * (P0-07): every step is used — session, strict schema, admin-owner policy, rate limit, transaction,
 * audit row in the same transaction, an after-commit side effect, typed Result.
 */
export const setFeatureFlag = defineAction({
  name: "flags.set",
  input: z.object({ key: z.enum(FLAG_KEYS), enabled: z.boolean() }).strict(),
  authorize: (_input, p) => requireAdminRole(["owner"], p),
  // Open: flags are kill switches, and an admin must be able to flip one during a Redis outage.
  rateLimit: { max: 30, windowSec: 60, failMode: "open" },
  audit: ({ key, enabled }) => ({
    action: "feature_flag.set",
    entity: "feature_flag",
    entityId: key,
    meta: { enabled },
  }),
  handler: async ({ key, enabled }, scope, { tx, afterCommit, requestId }) => {
    const result = await setFlag(scope, { key, enabled }, tx);
    afterCommit(() => {
      requestLogger(requestId, { action: "flags.set" }).info(
        { key, enabled },
        "feature flag changed",
      );
    });
    return result;
  },
});
