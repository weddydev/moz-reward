"use server";

import { z } from "zod";
import { defineAction } from "@/server/actionTemplate";
import { requireOwnAccount } from "@/server/authz";
import { signOutDevice, signOutEverywhere } from "@/server/services/sessions";

/** Signed-in devices → "Sign out" on another device (any signed-in user, own sessions only). */
export const signOutOtherDevice = defineAction({
  input: z.object({ sessionId: z.uuid() }).strict(),
  authorize: () => requireOwnAccount(),
  handler: ({ sessionId }, { scope, sessionId: current }) =>
    signOutDevice(scope, current, sessionId),
});

/** Signed-in devices → "Sign out everywhere": every session of the caller, this device included. */
export const signOutAllDevices = defineAction({
  input: z.object({}).strict(),
  authorize: () => requireOwnAccount(),
  handler: async (_input, { scope }) => ({ ended: await signOutEverywhere(scope) }),
});
