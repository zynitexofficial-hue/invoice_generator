import { describe, expect, it } from "vitest";
import { checkGstin } from "@/lib/gst/gstin";
import { eligibleItcFromPurchases } from "@/lib/gst/purchase-itc";
import { checkAttachment, formatBytes, storageWarning } from "./attachment-utils";
import { bill, gstin } from "./fixtures.test-utils";
import { computePurchaseSummary, dueDateFrom, purchaseItc, purchasePaymentStatus } from "./calc";

describe("test GSTIN helper", () => {
  it("builds valid GSTINs", () => {
    expect(checkGstin(gstin("27")).valid).toBe(true);
    expect(checkGstin(gstin("29", "AAAPL1234C")).valid).toBe(true);
  });
});

describe("computePurchaseSummary", () => {
  it("splits intra-state GST into CGST + SGST", () => {
    const b = bill();
    expect(b.summary).toMatchObject({
      taxable: "1000.00",
      cgst: "90.00",
      sgst: "90.00",
      igst: "0.00",
      total: "1180.00",
      paid: "0.00",
      balance: "1180.00",
    });
    expect(b.paymentStatus).toBe("unpaid");
  });

  it("uses IGST for inter-state and sums several lines", () => {
    const b = bill({
      gstMode: "inter",
      lines: [
        { id: "a", description: "A", quantity: "3", unitPrice: "33.33", gstRate: "12" },
        { id: "b", description: "B", quantity: "1", unitPrice: "500", gstRate: "5" },
      ],
    });
    // A: 99.99 × 12% = 12.00 (11.9988); B: 25.00
    expect(b.summary.taxable).toBe("599.99");
    expect(b.summary.igst).toBe("37.00");
    expect(b.summary.cgst).toBe("0.00");
    expect(b.summary.total).toBe("636.99");
  });

  it("handles GST-inclusive prices so heads add back to the amount", () => {
    const b = bill({
      pricesIncludeGst: true,
      lines: [{ id: "a", description: "A", quantity: "1", unitPrice: "1180", gstRate: "18" }],
    });
    expect(b.summary).toMatchObject({
      taxable: "1000.00",
      cgst: "90.00",
      sgst: "90.00",
      total: "1180.00",
    });
    const odd = bill({
      pricesIncludeGst: true,
      lines: [{ id: "a", description: "A", quantity: "1", unitPrice: "100", gstRate: "5" }],
    });
    // GST = 4.76, intra split 2.38 + 2.38; total stays 100.00
    expect(odd.summary.total).toBe("100.00");
  });

  it("charges no GST when gstMode is none", () => {
    const b = bill({ gstMode: "none", itcEligible: true });
    expect(b.summary).toMatchObject({ taxable: "1000.00", total: "1000.00", cgst: "0.00" });
    expect(b.itcEligible).toBe(false);
  });

  it("reverse charge: payable total excludes GST, GST is the self-assessed liability", () => {
    const b = bill({ reverseCharge: true, pricesIncludeGst: true });
    expect(b.summary).toMatchObject({ taxable: "1000.00", cgst: "90.00", total: "1000.00" });
  });

  it("computes paid, balance and payment status", () => {
    const part = bill({ payments: [{ id: "p1", date: "2026-10-12", amount: "500" }] });
    expect(part.summary.paid).toBe("500.00");
    expect(part.summary.balance).toBe("680.00");
    expect(part.paymentStatus).toBe("partial");
    const full = bill({
      payments: [
        { id: "p1", date: "2026-10-12", amount: "500" },
        { id: "p2", date: "2026-10-20", amount: "680" },
      ],
    });
    expect(full.summary.balance).toBe("0.00");
    expect(full.paymentStatus).toBe("paid");
    expect(purchasePaymentStatus("100.00", "0.00")).toBe("unpaid");
  });

  it("is deterministic with Decimal (no float drift)", () => {
    const s = computePurchaseSummary({
      lines: Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        description: "",
        hsn: "",
        itemType: "goods" as const,
        quantity: "1",
        unit: "",
        unitPrice: "0.10",
        gstRate: "0",
      })),
      pricesIncludeGst: false,
      gstMode: "none",
      reverseCharge: false,
      payments: [],
    });
    expect(s.total).toBe("1.00");
  });
});

describe("ITC guard", () => {
  it("needs a valid vendor GSTIN and a bill number", () => {
    expect(bill().itcEligible).toBe(true);
    expect(bill({ vendorGstin: "" }).itcEligible).toBe(false);
    const good = gstin("27");
    const badChar = good.endsWith("A") ? "B" : "A";
    expect(bill({ vendorGstin: good.slice(0, 14) + badChar }).itcEligible).toBe(false); // bad checksum
    expect(bill({ billNo: "  " }).itcEligible).toBe(false);
    expect(bill({ itcType: "ineligible" }).itcEligible).toBe(false);
  });

  it("purchaseItc is zero unless the bill qualifies", () => {
    expect(purchaseItc(bill()).total).toBe("180.00");
    expect(purchaseItc(bill({ itcEligible: false })).total).toBe("0.00");
    // Even a hand-edited row cannot claim without the guard.
    const forged = { ...bill({ billNo: "" }), itcEligible: true };
    expect(purchaseItc(forged).total).toBe("0.00");
  });
});

describe("eligibleItcFromPurchases", () => {
  const oct = (over: Record<string, unknown>) => bill({ billDate: "2026-10-15", ...over });

  it("sums eligible ITC for a period, split by head, type and reverse charge", () => {
    const rows = [
      oct({ id: "a" }),
      oct({ id: "b", gstMode: "inter", itcType: "capital_goods" }),
      oct({ id: "c", reverseCharge: true, itcType: "input_services" }),
      oct({ id: "d", itcEligible: false }), // not claimed
      oct({ id: "e", billNo: "" }), // fails guard
      bill({ id: "f", billDate: "2026-11-02" }), // other month
    ];
    const r = eligibleItcFromPurchases(rows, "2026-10");
    expect(r.rows.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(r.all).toEqual({ cgst: "180.00", sgst: "180.00", igst: "180.00", total: "540.00" });
    expect(r.regular.total).toBe("360.00");
    expect(r.reverseCharge.total).toBe("180.00");
    expect(r.byType.inputs.total).toBe("180.00");
    expect(r.byType.capital_goods.igst).toBe("180.00");
    expect(r.byType.input_services.total).toBe("180.00");
    expect(r.notClaimed).toEqual({ count: 2, gst: "360.00" });
  });

  it("accepts quarter, FY and custom ranges", () => {
    const rows = [oct({ id: "a" }), bill({ id: "b", billDate: "2027-02-01" })];
    expect(eligibleItcFromPurchases(rows, "2026-Q3").rows).toHaveLength(1);
    expect(eligibleItcFromPurchases(rows, "FY2026-27").rows).toHaveLength(2);
    expect(
      eligibleItcFromPurchases(rows, { start: "2027-01-01", end: "2027-03-31" }).all.total,
    ).toBe("180.00");
  });

  it("returns zeros for an empty period", () => {
    const r = eligibleItcFromPurchases([], "2026-10");
    expect(r.all.total).toBe("0.00");
    expect(r.rows).toEqual([]);
  });
});

describe("dueDateFrom", () => {
  it("adds credit days across month ends", () => {
    expect(dueDateFrom("2026-01-31", 30)).toBe("2026-03-02");
    expect(dueDateFrom("", 30)).toBe("");
  });
});

describe("attachment helpers", () => {
  it("validates type and size", () => {
    expect(checkAttachment({ type: "image/jpeg", size: 1000 }, 2048).ok).toBe(true);
    expect(checkAttachment({ type: "application/zip", size: 10 }, 2048)).toMatchObject({
      ok: false,
      problem: "type",
    });
    expect(checkAttachment({ type: "application/pdf", size: 3 * 1024 * 1024 }, 2048)).toMatchObject(
      {
        ok: false,
        problem: "size",
      },
    );
    expect(checkAttachment({ type: "application/pdf", size: 0 }, 2048)).toMatchObject({
      problem: "empty",
    });
  });

  it("formats sizes", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(48 * 1024)).toBe("48 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  it("warns near the configured size and near the browser quota", () => {
    const mb = 1024 * 1024;
    expect(storageWarning({ attachmentBytes: 10 * mb, warnTotalMb: 100 }).level).toBe("ok");
    const near = storageWarning({ attachmentBytes: 85 * mb, warnTotalMb: 100 });
    expect(near.level).toBe("warn");
    expect(near.attachmentPercent).toBe(85);
    expect(storageWarning({ attachmentBytes: 120 * mb, warnTotalMb: 100 }).messages[0]).toMatch(
      /over/,
    );
    const full = storageWarning({ attachmentBytes: 0, warnTotalMb: 100, quota: 100, usage: 96 });
    expect(full.level).toBe("full");
    expect(
      storageWarning({ attachmentBytes: 0, warnTotalMb: 100, quota: 100, usage: 85 }).level,
    ).toBe("warn");
    expect(storageWarning({ attachmentBytes: 0, warnTotalMb: 100, quota: 0, usage: 0 }).level).toBe(
      "ok",
    );
  });
});
