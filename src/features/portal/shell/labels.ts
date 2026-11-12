import type { Portal } from "../routes";

/** The nav landmark's name per portal (two navs on a page share it: only one is visible at a time). */
export const NAV_LABEL: Record<Portal, string> = {
  customer: "Main",
  shop: "Shop dashboard",
  admin: "Admin",
};

/** Role names shown in the shell (never used for a decision). */
export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  staff: "Staff",
  support: "Support",
  moderator: "Moderator",
  finance: "Finance",
};
