import { describe, expect, it } from "vitest";
import { computeExpenseSummary, suggestGstMode } from "./expense-calc";

const base = { amount: "1000", amountIncludesGst: false, gstRate: "18", gstMode: "intra" as const };

describe("computeExpenseSummary", () => {
  it("returns the amount as taxable when there is no GST", () => {
    expect(computeExpenseSummary({ ...base, gstMode: "none" })).toEqual({
      taxable: "1000.00",
      cgst: "0.00",
      sgst: "0.00",
      igst: "0.00",
      total: "1000.00",
    });
    expect(computeExpenseSummary({ ...base, gstRate: "0" }).total).toBe("1000.00");
  });

  it("splits exclusive intra-state GST into equal CGST and SGST", () => {
    expect(computeExpenseSummary(base)).toEqual({
      taxable: "1000.00",
      cgst: "90.00",
      sgst: "90.00",
      igst: "0.00",
      total: "1180.00",
    });
  });

  it("rounds each head half-up to 2 dp", () => {
    // 10.05 × 2.5% = 0.25125 → 0.25 each
    const s = computeExpenseSummary({ ...base, amount: "10.05", gstRate: "5" });
    expect(s).toMatchObject({ cgst: "0.25", sgst: "0.25", total: "10.55" });
    const t = computeExpenseSummary({ ...base, amount: "10.30", gstRate: "5" });
    // 10.30 × 2.5% = 0.2575 → 0.26
    expect(t).toMatchObject({ cgst: "0.26", sgst: "0.26", total: "10.82" });
  });

  it("charges IGST on inter-state purchases", () => {
    expect(computeExpenseSummary({ ...base, gstMode: "inter" })).toEqual({
      taxable: "1000.00",
      cgst: "0.00",
      sgst: "0.00",
      igst: "180.00",
      total: "1180.00",
    });
  });

  it("backs GST out of inclusive amounts so the heads add up to the amount paid", () => {
    expect(
      computeExpenseSummary({ ...base, amount: "1180", amountIncludesGst: true, gstMode: "inter" }),
    ).toEqual({ taxable: "1000.00", cgst: "0.00", sgst: "0.00", igst: "180.00", total: "1180.00" });

    // 100 incl. 5%: tax = 4.7619… → 4.76; CGST 2.38, SGST gets the remainder 2.38.
    const s = computeExpenseSummary({
      ...base,
      amount: "100",
      gstRate: "5",
      amountIncludesGst: true,
    });
    expect(s).toEqual({
      taxable: "95.24",
      cgst: "2.38",
      sgst: "2.38",
      igst: "0.00",
      total: "100.00",
    });

    // 100 incl. 18%: tax = 15.2542… → 15.25; CGST 7.63 (half-up), SGST remainder 7.62.
    const t = computeExpenseSummary({ ...base, amount: "100", amountIncludesGst: true });
    expect(t).toEqual({
      taxable: "84.75",
      cgst: "7.63",
      sgst: "7.62",
      igst: "0.00",
      total: "100.00",
    });
  });

  it("treats blank or junk amounts as zero", () => {
    expect(computeExpenseSummary({ ...base, amount: "" }).total).toBe("0.00");
  });
});

describe("suggestGstMode", () => {
  it("compares vendor and seller states", () => {
    expect(suggestGstMode("27", "27")).toBe("intra");
    expect(suggestGstMode("29", "27")).toBe("inter");
    expect(suggestGstMode("", "27")).toBe("intra");
  });
});
