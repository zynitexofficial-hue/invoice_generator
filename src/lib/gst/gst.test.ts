import { describe, expect, it } from "vitest";
import { checkGstin, gstinCheckChar, stateFromGstin } from "./gstin";
import { determineTaxKind, gstinStateMismatch, sanitizeHsnSac, stateTaxLabel } from "./tax";
import { stateWithCode } from "./states";

/** Build a GSTIN with a correct check character from its first 14 characters. */
const withCheck = (body: string) => body + gstinCheckChar(body);

describe("GSTIN", () => {
  it("accepts a GSTIN with a correct check character", () => {
    const gstin = withCheck("27AAPFU0939F1Z");
    expect(checkGstin(gstin)).toEqual({ valid: true, stateCode: "27" });
    expect(checkGstin(gstin.toLowerCase()).valid).toBe(true);
  });

  it("detects a wrong check character", () => {
    const good = withCheck("29ABCDE1234F1Z");
    const wrongChar = good[14] === "A" ? "B" : "A";
    expect(checkGstin(good.slice(0, 14) + wrongChar).problem).toBe("checksum");
  });

  it("detects single-character typos via the checksum", () => {
    const good = withCheck("07AAACB2894G1Z");
    // Change one digit in the PAN portion.
    const typo = good.slice(0, 7) + (good[7] === "1" ? "2" : "1") + good.slice(8);
    expect(checkGstin(typo).valid).toBe(false);
  });

  it("reports format, length and state problems", () => {
    expect(checkGstin("").problem).toBe("empty");
    expect(checkGstin("27AAPFU0939F1Z").problem).toBe("length");
    expect(checkGstin("27AAPFU0939F1XV").problem).toBe("format");
    expect(checkGstin(withCheck("99AAPFU0939F1Z")).problem).toBe("state");
  });

  it("derives the state from a GSTIN", () => {
    expect(stateFromGstin("33ABCDE1234F1Z5")).toBe("33");
    expect(stateFromGstin("XX")).toBeUndefined();
  });
});

describe("determineTaxKind", () => {
  const base = {
    docType: "tax_invoice" as const,
    gstMode: "split" as const,
    supplyType: "auto" as const,
    sellerState: "27",
    placeOfSupply: "27",
  };

  it("uses CGST+SGST within the same state and IGST across states", () => {
    expect(determineTaxKind(base)).toBe("intra");
    expect(determineTaxKind({ ...base, placeOfSupply: "29" })).toBe("inter");
    expect(determineTaxKind({ ...base, placeOfSupply: "96" })).toBe("inter");
  });

  it("respects single mode, overrides and tax-free documents", () => {
    expect(determineTaxKind({ ...base, gstMode: "single" })).toBe("single");
    expect(determineTaxKind({ ...base, supplyType: "inter" })).toBe("inter");
    expect(determineTaxKind({ ...base, docType: "bill_of_supply" })).toBe("none");
    expect(determineTaxKind({ ...base, docType: "export" })).toBe("none");
    expect(determineTaxKind({ ...base, docType: "proforma", placeOfSupply: "29" })).toBe("inter");
  });

  it("assumes intra-state when a state is unknown", () => {
    expect(determineTaxKind({ ...base, sellerState: "" })).toBe("intra");
  });

  it("labels UTGST for union territories without legislature", () => {
    expect(stateTaxLabel("04")).toBe("UTGST");
    expect(stateTaxLabel("07")).toBe("SGST");
    expect(stateTaxLabel("38")).toBe("UTGST");
  });
});

describe("sanitizeHsnSac", () => {
  it("keeps digits and letters, drops everything else", () => {
    expect(sanitizeHsnSac("9983 14")).toBe("998314");
    expect(sanitizeHsnSac("HSN-8471.30")).toBe("HSN847130");
    expect(sanitizeHsnSac("1234567890123456")).toBe("123456789012");
  });
});

describe("state labels and GSTIN/state checks", () => {
  it("prints the state with its GST code", () => {
    expect(stateWithCode("19")).toBe("West Bengal (Code 19)");
    expect(stateWithCode("96")).toBe("Outside India (Code 96)");
    expect(stateWithCode("")).toBe("");
  });

  it("explains a GSTIN that belongs to another state", () => {
    expect(gstinStateMismatch("29AAACH7409R1ZX", "19")).toBe(
      "This GSTIN starts with 29 (Karnataka), but the state is West Bengal (19). Check the GSTIN or the state.",
    );
    expect(gstinStateMismatch("19AAACH7409R1ZX", "19")).toBeNull();
    expect(gstinStateMismatch("", "19")).toBeNull();
  });
});
