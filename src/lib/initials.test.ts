import { describe, expect, it } from "vitest";
import { RECEIPT_INITIALS_MAX, receiptInitials } from "./initials";

describe("[P1-12] receipt staff initials", () => {
  it("[P1-12] takes the first letter of each word, upper case, at most three", () => {
    expect(receiptInitials("ada lovelace")).toBe("AL");
    expect(receiptInitials("Mary-Jane O'Neil Smith Jones")).toBe("MOS");
    expect(receiptInitials("Mary-Jane O'Neil Smith Jones")).toHaveLength(RECEIPT_INITIALS_MAX);
    expect(receiptInitials("  Zoë   Ölund ")).toBe("ZÖ");
  });

  it("[P1-12] skips leading punctuation and digits, and gives an empty string when there are no letters", () => {
    expect(receiptInitials("'ben (sam)")).toBe("BS");
    expect(receiptInitials("42 ")).toBe("");
    expect(receiptInitials("")).toBe("");
  });
});
