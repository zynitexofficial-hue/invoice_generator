import { describe, expect, it } from "vitest";
import { Dec } from "@/lib/money";
import { allocateProRata, calculateInvoice, type CalcInput, type CalcLineInput } from "./engine";

const line = (
  id: string,
  quantity: string,
  unitPrice: string,
  gstRate = "18",
  discount = "",
): CalcLineInput => ({
  id,
  quantity,
  unitPrice,
  gstRate,
  discount: { kind: "percent", value: discount },
});

const base = (overrides: Partial<CalcInput> = {}): CalcInput => ({
  currency: "INR",
  lines: [],
  invoiceDiscount: { kind: "percent", value: "" },
  pricesIncludeGst: false,
  taxKind: "intra",
  roundOff: true,
  amountReceived: "",
  ...overrides,
});

/** PRD §8.7 worked example. */
const prdExample = (overrides: Partial<CalcInput> = {}) =>
  base({
    lines: [line("a", "1", "15000"), line("b", "12", "500", "18", "10")],
    invoiceDiscount: { kind: "percent", value: "5" },
    amountReceived: "10000",
    ...overrides,
  });

describe("calculateInvoice — PRD §8.7 example", () => {
  it("matches every figure for intra-state split GST", () => {
    const t = calculateInvoice(prdExample());
    expect(t.lines.map((l) => l.amount)).toEqual(["15000.00", "5400.00"]);
    expect(t.lines.map((l) => l.lineDiscount)).toEqual(["0.00", "600.00"]);
    expect(t.lines.map((l) => l.allocatedDiscount)).toEqual(["750.00", "270.00"]);
    expect(t.lines.map((l) => l.taxable)).toEqual(["14250.00", "5130.00"]);
    expect(t.lines.map((l) => l.cgst)).toEqual(["1282.50", "461.70"]);
    expect(t.lines.map((l) => l.sgst)).toEqual(["1282.50", "461.70"]);
    expect(t.subtotal).toBe("20400.00");
    expect(t.invoiceDiscount).toBe("1020.00");
    expect(t.taxableTotal).toBe("19380.00");
    expect(t.cgstTotal).toBe("1744.20");
    expect(t.sgstTotal).toBe("1744.20");
    expect(t.taxTotal).toBe("3488.40");
    expect(t.totalBeforeRoundOff).toBe("22868.40");
    expect(t.roundOff).toBe("-0.40");
    expect(t.grandTotal).toBe("22868.00");
    expect(t.amountReceived).toBe("10000.00");
    expect(t.balanceDue).toBe("12868.00");
    expect(t.paymentStatus).toBe("partial");
  });

  it("gives the same total as IGST for inter-state supply", () => {
    const t = calculateInvoice(prdExample({ taxKind: "inter" }));
    expect(t.lines.map((l) => l.igst)).toEqual(["2565.00", "923.40"]);
    expect(t.igstTotal).toBe("3488.40");
    expect(t.cgstTotal).toBe("0.00");
    expect(t.grandTotal).toBe("22868.00");
  });

  it("gives the same total in single-GST mode", () => {
    const t = calculateInvoice(prdExample({ taxKind: "single" }));
    expect(t.gstTotal).toBe("3488.40");
    expect(t.grandTotal).toBe("22868.00");
  });

  it("is deterministic", () => {
    expect(calculateInvoice(prdExample())).toEqual(calculateInvoice(prdExample()));
  });
});

describe("calculateInvoice — rules", () => {
  it("does not round off when disabled", () => {
    const t = calculateInvoice(prdExample({ roundOff: false }));
    expect(t.grandTotal).toBe("22868.40");
    expect(t.roundOff).toBe("0.00");
    expect(t.balanceDue).toBe("12868.40");
  });

  it("rounds half-up (away from zero) at the minor unit", () => {
    // 0.5 paise tax: 0.25 × 18% / 2 = 0.0225 → CGST rounds to 0.02
    const t = calculateInvoice(base({ lines: [line("a", "1", "0.25")], roundOff: false }));
    expect(t.lines[0].cgst).toBe("0.02");
    // 2.5 × 1% = 0.025 → 0.03 (half-up)
    const u = calculateInvoice(
      base({ lines: [line("a", "1", "2.5", "1")], taxKind: "inter", roundOff: false }),
    );
    expect(u.lines[0].igst).toBe("0.03");
  });

  it("rounds grand total half-up to the nearest whole unit", () => {
    const t = calculateInvoice(base({ lines: [line("a", "1", "100.50", "0")] }));
    expect(t.grandTotal).toBe("101.00");
    expect(t.roundOff).toBe("0.50");
  });

  it("handles tax-inclusive prices so the line total stays as entered", () => {
    const t = calculateInvoice(base({ lines: [line("a", "1", "1180")], pricesIncludeGst: true }));
    expect(t.lines[0].taxable).toBe("1000.00");
    expect(t.lines[0].cgst).toBe("90.00");
    expect(t.lines[0].sgst).toBe("90.00");
    expect(t.grandTotal).toBe("1180.00");
  });

  it("assigns the inclusive split remainder to SGST", () => {
    // 100 incl. 18%: taxable 84.75, tax 15.25 → CGST 7.63 (half-up), SGST 7.62
    const t = calculateInvoice(
      base({ lines: [line("a", "1", "100")], pricesIncludeGst: true, roundOff: false }),
    );
    expect(t.lines[0].taxable).toBe("84.75");
    expect(t.lines[0].tax).toBe("15.25");
    expect(t.lines[0].cgst).toBe("7.63");
    expect(t.lines[0].sgst).toBe("7.62");
    expect(t.grandTotal).toBe("100.00");
  });

  it("ignores inclusive pricing when there is no tax", () => {
    const t = calculateInvoice(
      base({ lines: [line("a", "2", "50")], pricesIncludeGst: true, taxKind: "none" }),
    );
    expect(t.pricesIncludeGst).toBe(false);
    expect(t.taxableTotal).toBe("100.00");
    expect(t.taxTotal).toBe("0.00");
    expect(t.taxSummary).toEqual([]);
  });

  it("supports flat line and invoice discounts, clamped to the amount", () => {
    const t = calculateInvoice(
      base({
        lines: [{ ...line("a", "1", "100", "0"), discount: { kind: "flat", value: "150" } }],
        taxKind: "none",
      }),
    );
    expect(t.lines[0].lineDiscount).toBe("100.00");
    expect(t.grandTotal).toBe("0.00");

    const u = calculateInvoice(
      base({
        lines: [line("a", "1", "100", "0"), line("b", "1", "200", "0")],
        invoiceDiscount: { kind: "flat", value: "30" },
        taxKind: "none",
      }),
    );
    expect(u.lines.map((l) => l.allocatedDiscount)).toEqual(["10.00", "20.00"]);
    expect(u.grandTotal).toBe("270.00");
  });

  it("clamps amount received to the grand total and reports status", () => {
    const paid = calculateInvoice(
      base({ lines: [line("a", "1", "100", "0")], amountReceived: "500" }),
    );
    expect(paid.amountReceived).toBe("100.00");
    expect(paid.balanceDue).toBe("0.00");
    expect(paid.paymentStatus).toBe("paid");
    const unpaid = calculateInvoice(base({ lines: [line("a", "1", "100", "0")] }));
    expect(unpaid.paymentStatus).toBe("unpaid");
  });

  it("treats invalid numbers as zero instead of throwing", () => {
    const t = calculateInvoice(base({ lines: [line("a", "abc", "1x0"), line("b", "-2", "10")] }));
    expect(t.grandTotal).toBe("0.00");
  });

  it("accepts thousands separators and fractional quantities", () => {
    const t = calculateInvoice(base({ lines: [line("a", "1.5", "1,000", "0")], taxKind: "none" }));
    expect(t.grandTotal).toBe("1500.00");
  });

  it("uses the currency precision (JPY 0, KWD 3)", () => {
    const jpy = calculateInvoice(
      base({ currency: "JPY", lines: [line("a", "3", "333.4", "0")], taxKind: "none" }),
    );
    expect(jpy.grandTotal).toBe("1000");
    const kwd = calculateInvoice(
      base({
        currency: "KWD",
        lines: [line("a", "1", "1.2345", "0")],
        taxKind: "none",
        roundOff: false,
      }),
    );
    expect(kwd.grandTotal).toBe("1.235");
  });

  it("groups the tax summary by rate", () => {
    const t = calculateInvoice(
      base({
        lines: [
          line("a", "1", "100", "18"),
          line("b", "1", "200", "5"),
          line("c", "1", "50", "18"),
        ],
      }),
    );
    expect(t.taxSummary.map((r) => r.rate)).toEqual(["5", "18"]);
    expect(t.taxSummary[1].taxable).toBe("150.00");
    expect(t.taxSummary[1].tax).toBe("27.00");
  });
});

describe("allocateProRata", () => {
  it("always sums exactly to the total", () => {
    const shares = allocateProRata(new Dec("100"), [new Dec("1"), new Dec("1"), new Dec("1")], 2);
    expect(shares.map((s) => s.toFixed(2))).toEqual(["33.34", "33.33", "33.33"]);
    expect(shares.reduce((a, b) => a.plus(b), new Dec(0)).toFixed(2)).toBe("100.00");
  });

  it("returns zeros when weights sum to zero", () => {
    const shares = allocateProRata(new Dec("10"), [new Dec("0"), new Dec("0")], 2);
    expect(shares.every((s) => s.isZero())).toBe(true);
  });
});
