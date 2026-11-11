import { VT_DOWNGRADE_SCRIPT } from "./motion/route-transitions";
import { PREPAINT_SCRIPT } from "./preferences-prepaint";

/**
 * The one inline <head> script (with the CSP nonce): the stored display preference before first paint and
 * the View Transitions downgrade. Joined with ";" — two IIFEs written back to back parse as a call.
 */
export const HEAD_SCRIPT = [PREPAINT_SCRIPT, VT_DOWNGRADE_SCRIPT].join(";");
