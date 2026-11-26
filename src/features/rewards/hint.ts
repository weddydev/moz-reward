/**
 * The customer layout's realtime stream raises this window event after a `redemption_confirmed` hint or a
 * reconnect (P1-16): an open redeem code then asks the server whether it was the one confirmed. Its own tiny
 * module, so the layout doesn't load the redeem flow.
 */
export const REDEMPTION_HINT_EVENT = "moz:redemption-hint";
