import { describe, expect, it } from "vitest";
import { buildGstr3b, gstr3bRow } from "./gstr3b";
import {
  PERIOD,
  fixtureExpenses,
  fixtureInvoices,
  fixtureSettings,
  mkExpense,
} from "./fixtures/october-2026";

const result = buildGstr3b({
  invoices: fixtureInvoices(),
  expenses: fixtureExpenses(),
  settings: fixtureSettings(),
  periodKey: PERIOD,
});
const row = (id: Parameters<typeof gstr3bRow>[1]) => {
  const r = gstr3bRow(result, id);
  return [r.taxable, r.igst, r.cgst, r.sgst];
};

describe("GSTR-3B worksheet", () => {
  it("3.1(a) taxable outward, net of notes, excluding zero-rated/nil/RCM", () => {
    expect(row("3.1(a)")).toEqual(["202801.00", "30050.00", "1537.03", "1537.02"]);
  });

  it("3.1(b) zero-rated: exports and SEZ", () => {
    expect(row("3.1(b)")).toEqual(["386336.60", "14985.00", "0.00", "0.00"]);
  });

  it("3.1(c) nil/exempt and 3.1(e) non-GST", () => {
    expect(row("3.1(c)")).toEqual(["7000.00", "0.00", "0.00", "0.00"]);
    expect(row("3.1(e)")).toEqual(["0.00", "0.00", "0.00", "0.00"]);
  });

  it("outward supplies under reverse charge are shown for reference only", () => {
    expect(row("outward-rcm")).toEqual(["10000.00", "0.00", "0.00", "0.00"]);
    expect(gstr3bRow(result, "outward-rcm").informational).toBe(true);
  });

  it("3.1(d) inward reverse charge from expenses", () => {
    expect(row("3.1(d)")).toEqual(["20000.00", "0.00", "1800.00", "1800.00"]);
  });

  it("3.2 inter-state supplies to unregistered persons by POS", () => {
    expect(result.table32).toEqual([
      { pos: "07", posName: "Delhi", taxable: "20000.00", igst: "3600.00" },
      // B2CL 150000 − CDNUR 10000
      { pos: "29", posName: "Karnataka", taxable: "140000.00", igst: "25200.00" },
    ]);
  });

  it("ITC: 4A(3) RCM, 4A(5) others, 4B(2) not claimed, 4C net", () => {
    expect(row("4A(3)")).toEqual(["0.00", "0.00", "1800.00", "1800.00"]);
    expect(row("4A(5)")).toEqual(["0.00", "1800.00", "4500.00", "4500.00"]);
    expect(row("4B(2)")).toEqual(["0.00", "0.00", "180.00", "180.00"]);
    expect(gstr3bRow(result, "4B(2)").informational).toBe(true);
    expect(row("4C")).toEqual(["0.00", "1800.00", "6300.00", "6300.00"]);
  });

  it("estimated payable per head, no cross-utilisation, RCM in cash", () => {
    expect(result.payable.outputTax).toEqual({
      igst: "45035.00",
      cgst: "1537.03",
      sgst: "1537.02",
      cess: "0.00",
    });
    expect(result.payable.cashPayable).toEqual({
      igst: "43235.00",
      cgst: "1800.00",
      sgst: "1800.00",
      cess: "0.00",
    });
    expect(result.payable.itcBalance).toEqual({
      igst: "0.00",
      cgst: "4762.97",
      sgst: "4762.98",
      cess: "0.00",
    });
  });

  it("explains limitations and records hashes for invoices and expenses", () => {
    expect(result.notes.length).toBeGreaterThan(3);
    expect(result.hasErrors).toBe(false);
    const kinds = result.recordHashes.map((r) => `${r.kind}:${r.id}`);
    expect(kinds).toContain("expense:exp-rent");
    expect(kinds).not.toContain("expense:exp-november");
    expect(kinds).toContain("invoice:inv-b2b-intra");
  });

  it("warns about ITC without vendor GSTIN/invoice and RCM without GST", () => {
    const r = buildGstr3b({
      invoices: [],
      expenses: [
        mkExpense({ id: "e1", amount: "1000", gstRate: "18", gstMode: "intra", itcEligible: true }),
        mkExpense({ id: "e2", amount: "1000", reverseCharge: true }),
      ],
      settings: fixtureSettings(),
      periodKey: PERIOD,
    });
    expect(r.issues.map((i) => `${i.recordId}:${i.code}`)).toEqual([
      "e1:EXPENSE_ITC_NO_GSTIN",
      "e1:EXPENSE_ITC_NO_INVOICE",
      "e2:EXPENSE_RCM_NO_GST",
    ]);
    expect(r.notes.join(" ")).not.toContain("No expenses are recorded");
    const empty = buildGstr3b({
      invoices: [],
      expenses: [],
      settings: fixtureSettings(),
      periodKey: PERIOD,
    });
    expect(empty.notes.join(" ")).toContain("No expenses are recorded");
  });
});
