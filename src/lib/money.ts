/** GBP formatting for customer and dashboard copy (CLAUDE.md §5: £, UK English): 840 → "£8.40". */
const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
export const formatPence = (p: number): string => gbp.format(p / 100);
