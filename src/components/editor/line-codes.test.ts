import { describe, expect, it } from "vitest";
import { lineItemSchema, type LineItem } from "@/lib/schema";
import { itemTypeForHsn, uqcForUnit, withAutoCodes, withFreshCodes } from "./line-codes";

const line = (patch: Partial<LineItem> = {}): LineItem =>
  lineItemSchema.parse({ id: "a", ...patch });

describe("line codes", () => {
  it("maps common units to UQC", () => {
    expect(uqcForUnit("pcs")).toBe("PCS");
    expect(uqcForUnit("Kg")).toBe("KGS");
    expect(uqcForUnit("sq.ft")).toBe("SQF");
    expect(uqcForUnit("hrs")).toBe("OTH");
    expect(uqcForUnit("job")).toBe("OTH");
    expect(uqcForUnit("bundle")).toBe("");
  });

  it("treats SAC 99xx as services", () => {
    expect(itemTypeForHsn("998314")).toBe("services");
    expect(itemTypeForHsn("8471")).toBe("goods");
    expect(itemTypeForHsn("9")).toBeNull();
  });

  it("follows HSN and unit changes until the user overrides them", () => {
    const a = line();
    const b = withAutoCodes(a, { ...a, hsnSac: "998314", unit: "hrs" });
    expect(b).toMatchObject({ itemType: "services", uqc: "OTH" });
    // A manual choice sticks when the unit changes again.
    const manual = { ...b, uqc: "NOS" };
    expect(withAutoCodes(manual, { ...manual, unit: "days" }).uqc).toBe("NOS");
    const goods = { ...b, itemType: "goods" as const };
    expect(withAutoCodes(goods, { ...goods, hsnSac: "998315" }).itemType).toBe("goods");
  });

  it("fills codes for a fresh line", () => {
    expect(withFreshCodes(line({ hsnSac: "6109", unit: "pcs" }))).toMatchObject({
      itemType: "goods",
      uqc: "PCS",
    });
  });
});
