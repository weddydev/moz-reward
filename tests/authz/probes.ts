/**
 * Test-only probe actions: one per policy shape, so the matrix proves the policies against
 * real DB principals before most real actions exist. Not imported by app code.
 */
import { z } from "zod";
import { defineAction } from "@/server/actionTemplate";
import {
  ALL_ADMIN_ROLES,
  requireAdminRole,
  requireCustomer,
  requireShopRole,
} from "@/server/authz";

const shopInput = z.object({ shopId: z.uuid() }).strict();
const noInput = z.object({}).strict();

export const probeCustomer = defineAction({
  input: noInput,
  authorize: () => requireCustomer(),
  handler: async () => "ok",
});

export const probeShopStaff = defineAction({
  input: shopInput,
  authorize: ({ shopId }) => requireShopRole(shopId, ["owner", "staff"]),
  handler: async () => "ok",
});

export const probeShopOwner = defineAction({
  input: shopInput,
  authorize: ({ shopId }) => requireShopRole(shopId, ["owner"]),
  handler: async () => "ok",
});

export const probeAnyAdmin = defineAction({
  input: noInput,
  authorize: () => requireAdminRole(ALL_ADMIN_ROLES),
  handler: async () => "ok",
});

export const probeAdminFinance = defineAction({
  input: noInput,
  authorize: () => requireAdminRole(["owner", "finance"]),
  handler: async () => "ok",
});
