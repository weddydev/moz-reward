"use server";

import { z } from "zod";
import { defineAction } from "@/server/actionTemplate";
import { requireOwnAccount } from "@/server/authz";
import { signOutDevice, signOutEverywhere } from "@/server/services/sessions";

/** Signed-in devices → "Sign out" on another device (any signed-in user, own sessions only). */
export const signOutOtherDevice = defineAction({
  name: "sessions.signOutOther",
  input: z.object({ sessionId: z.uuid() }).strict(),
  authorize: (_input, p) => requireOwnAccount(p),
  handler: ({ sessionId }, { scope, sessionId: current }) =>
    signOutDevice(scope, current, sessionId),
});

/** Signed-in devices → "Sign out everywhere": every session of the caller, this device included. */
export const signOutAllDevices = defineAction({
  name: "sessions.signOutAll",
  input: z.object({}).strict(),
  authorize: (_input, p) => requireOwnAccount(p),
  handler: async (_input, { scope }) => ({ ended: await signOutEverywhere(scope) }),
});
