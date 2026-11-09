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
  requireStaffAwardLimit,
} from "@/server/authz";

const shopInput = z.object({ shopId: z.uuid() }).strict();
const awardInput = z.object({ shopId: z.uuid(), points: z.int().positive() }).strict();
const noInput = z.object({}).strict();

export const probeCustomer = defineAction({
  name: "probe.customer",
  input: noInput,
  authorize: (_i, p) => requireCustomer(p),
  handler: async () => "ok",
});

export const probeShopStaff = defineAction({
  name: "probe.shopStaff",
  input: shopInput,
  authorize: ({ shopId }, p) => requireShopRole(shopId, ["owner", "staff"], p),
  handler: async () => "ok",
});

export const probeShopOwner = defineAction({
  name: "probe.shopOwner",
  input: shopInput,
  authorize: ({ shopId }, p) => requireShopRole(shopId, ["owner"], p),
  handler: async () => "ok",
});

export const probeStaffAward = defineAction({
  name: "probe.staffAward",
  input: awardInput,
  authorize: ({ shopId, points }, p) => requireStaffAwardLimit(shopId, points, p),
  handler: async () => "ok",
});

export const probeAnyAdmin = defineAction({
  name: "probe.anyAdmin",
  input: noInput,
  authorize: (_i, p) => requireAdminRole(ALL_ADMIN_ROLES, p),
  handler: async () => "ok",
});

export const probeAdminFinance = defineAction({
  name: "probe.adminFinance",
  input: noInput,
  authorize: (_i, p) => requireAdminRole(["owner", "finance"], p),
  handler: async () => "ok",
});
