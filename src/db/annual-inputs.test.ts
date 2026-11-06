import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAnnualInput, patchAnnualGroup, resetGstr9Row, setAnnualValue } from "./annual-inputs";
import { getDb } from "./db";

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
});

beforeEach(async () => {
  await Promise.all(getDb().tables.map((t) => t.clear()));
  memory.clear();
});

const FY = "FY2026-27";

describe("annual inputs", () => {
  it("sets and clears a GSTR-9 value without losing others", async () => {
    await setAnnualValue(FY, "gstr9", "4F.taxable", "100");
    await setAnnualValue(FY, "gstr9", "4F.igst", "18");
    await setAnnualValue(FY, "gstr9", "4F.taxable", "");
    expect((await getAnnualInput(FY))?.gstr9).toEqual({ "4F.igst": "18" });
  });

  it("keeps GSTR-4 values and notes together", async () => {
    await patchAnnualGroup(FY, "gstr4", { notes: "hello" });
    await setAnnualValue(FY, "gstr4", "defaultRate", "5");
    const row = await getAnnualInput(FY);
    expect(row?.gstr4.values.defaultRate).toBe("5");
    expect(row?.gstr4.notes).toBe("hello");
  });

  it("stores GSTR-9C values, checklist and the tax-pack fields", async () => {
    await setAnnualValue(FY, "gstr9cValues", "A2", "500");
    await patchAnnualGroup(FY, "gstr9c", { checklist: { cert: true } });
    await patchAnnualGroup(FY, "taxPack", {
      tdsDeductedByCustomers: "250",
      fixedAssetNote: "Laptop",
    });
    const row = await getAnnualInput(FY);
    expect(row?.gstr9c.values.A2).toBe("500");
    expect(row?.gstr9c.checklist.cert).toBe(true);
    expect(row?.taxPack.tdsDeductedByCustomers).toBe("250");
    expect(row?.taxPack.fixedAssetNote).toBe("Laptop");
  });

  it("resets all overrides of one row", async () => {
    await setAnnualValue(FY, "gstr9", "4B.taxable", "1");
    await setAnnualValue(FY, "gstr9", "4B.igst", "2");
    await setAnnualValue(FY, "gstr9", "4C.taxable", "3");
    await resetGstr9Row(FY, "4B");
    expect((await getAnnualInput(FY))?.gstr9).toEqual({ "4C.taxable": "3" });
  });
});
