import { VT_DOWNGRADE_SCRIPT } from "./motion/route-transitions";
import { TIER_PREPAINT_SCRIPT } from "./motion/tier";
import { PREPAINT_SCRIPT } from "./preferences-prepaint";

/**
 * The one inline <head> script (with the CSP nonce): the stored display preference and reduced motion
 * (`<html class="rm">`), the effect tier (`<html class="lite">`) before first paint, and the View Transitions
 * downgrade. Joined with ";" — two IIFEs written back to back parse as a call.
 */
export const HEAD_SCRIPT = [PREPAINT_SCRIPT, TIER_PREPAINT_SCRIPT, VT_DOWNGRADE_SCRIPT].join(";");
