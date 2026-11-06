import { describe, expect, it } from "vitest";
import { reconcile, type BookDoc } from "@/lib/gst/gstr2b";
import type { Gstr2bRow } from "@/lib/schema";
import { itcReconReport } from "./itc-recon";

const row = (o: Partial<Gstr2bRow>): Gstr2bRow => ({
  id: "r1",
  supplierGstin: "27AABCU9603R1ZX",
  supplierName: "Ultra Steel",
  docType: "invoice",
  docNo: "A-1",
  docDate: "2026-10-05",
  section: "b2b",
  origDocNo: "",
  pos: "27",
  taxable: "1000.00",
  igst: "0.00",
  cgst: "90.00",
  sgst: "90.00",
  cess: "0.00",
  rcm: false,
  itcAvailable: true,
  itcReason: "",
  imsAction: "none",
  notes: "",
  ...o,
});
const book = (o: Partial<BookDoc>): BookDoc => ({
  key: "purchase:p1",
  targetType: "purchase",
  targetId: "p1",
  label: "",
  gstin: "27AABCU9603R1ZX",
  name: "Ultra Steel",
  docNo: "A-1",
  date: "2026-10-05",
  periodDate: "2026-10-05",
  taxable: "1000.00",
  igst: "0.00",
  cgst: "90.00",
  sgst: "90.00",
  cess: "0.00",
  rcm: false,
  itcEligible: true,
  ...o,
});

const rows: Gstr2bRow[] = [
  row({}), // matched
  row({ id: "r2", docNo: "B-2", cgst: "45.00", sgst: "45.00", taxable: "500.00" }), // mismatch vs book 180
  row({ id: "r3", docNo: "C-3", supplierGstin: "29AAACG5678B1Z2", supplierName: "Gamma" }), // missing in books
  row({
    id: "r4",
    docNo: "D-4",
    itcAvailable: false,
    itcReason: "Blocked 17(5)",
    supplierGstin: "33AAAAA1111A1Z1",
    supplierName: "Cars Ltd",
  }), // ineligible
  row({
    id: "r5",
    docNo: "CN-5",
    docType: "credit_note",
    section: "cdnr",
    cgst: "9.00",
    sgst: "9.00",
    taxable: "100.00",
  }), // credit note, missing in books
  row({
    id: "r6",
    docNo: "RC-6",
    rcm: true,
    itcAvailable: false,
    igst: "180.00",
    cgst: "0.00",
    sgst: "0.00",
  }), // rcm: not ITC
];
const books: BookDoc[] = [
  book({}),
  book({ key: "purchase:p2", targetId: "p2", docNo: "B-2" }),
  book({
    key: "expense:e3",
    targetType: "expense",
    targetId: "e3",
    docNo: "ONLY-BOOK",
    gstin: "24AAAAA2222A1Z2",
    name: "Delta",
    cgst: "50.00",
    sgst: "50.00",
  }),
];
const result = reconcile({
  rows,
  books,
  missingWindow: { start: "2026-10-01", end: "2026-10-31" },
});
const report = itcReconReport([{ importId: "i1", periodKey: "2026-10", result }], {
  ineligibleBooks: [book({ key: "expense:x", itcEligible: false, cgst: "20.00", sgst: "20.00" })],
});

describe("itcReconReport", () => {
  it("buckets documents", () => {
    expect(report.totals.matched).toEqual({ count: 1, itc: "180.00" });
    expect(report.totals.mismatched).toEqual({ count: 1, itc: "90.00", difference: "90.00" });
    expect(report.totals.missingIn2B).toEqual({ count: 1, itc: "100.00" });
    // r3 (+180) and the credit note r5 (-18)
    expect(report.totals.missingInBooks).toEqual({ count: 2, itc: "162.00" });
    expect(report.totals.ineligible2B).toEqual({ count: 1, itc: "180.00" });
    expect(report.totals.ineligibleBooks).toEqual({ count: 1, itc: "40.00" });
  });
  it("bridge adds up exactly to books claimed minus 2B available", () => {
    expect(report.booksClaimed).toBe("460.00");
    expect(report.available2B).toBe("432.00");
    expect(report.difference).toBe("28.00");
    const sum = report.bridge.reduce((a, b) => a + Number(b.amount), 0);
    expect(sum.toFixed(2)).toBe(report.difference);
  });
  it("groups by supplier and by period", () => {
    const delta = report.bySupplier.find((s) => s.name === "Delta")!;
    expect(delta).toMatchObject({ missingIn2B: "100.00", needsAttention: 1 });
    expect(report.bySupplier[0].needsAttention).toBeGreaterThanOrEqual(
      report.bySupplier[1].needsAttention,
    );
    expect(report.byPeriod).toEqual([
      {
        periodKey: "2026-10",
        matched: "180.00",
        mismatched: "90.00",
        missingIn2B: "100.00",
        missingInBooks: "162.00",
        ineligible2B: "180.00",
      },
    ]);
  });
  it("is empty and zero without imports", () => {
    const r = itcReconReport([]);
    expect(r.difference).toBe("0.00");
    expect(r.bySupplier).toEqual([]);
  });
});
