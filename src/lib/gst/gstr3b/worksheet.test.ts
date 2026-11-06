import { describe, expect, it } from "vitest";
import { buildGstr3b } from "@/lib/gst/returns";
import {
  PERIOD,
  fixtureExpenses,
  fixtureInvoices,
  fixtureSettings,
} from "@/lib/gst/returns/fixtures/october-2026";
import { expenseSchema, purchaseSchema } from "@/lib/schema";
import {
  combineItcSources,
  expensesItcSource,
  purchasesItcSource,
  withoutLinkedExpenses,
} from "./itc-source";
import { reconcile } from "@/lib/gst/gstr2b";
import type { Gstr2bRow } from "@/lib/schema";
import {
  buildGstr3bWorksheet,
  gstr2bAvailableHeads,
  gstr2bSuggestedInputs,
  inputKey,
  setOff,
  zeroHeadsText,
  type Heads,
} from "./worksheet";

const base = buildGstr3b({
  invoices: fixtureInvoices(),
  expenses: fixtureExpenses(),
  settings: fixtureSettings(),
  periodKey: PERIOD,
});
const lines = expensesItcSource(fixtureExpenses())(PERIOD);
const H = (igst: string, cgst: string, sgst: string, cess = "0.00"): Heads => ({
  igst,
  cgst,
  sgst,
  cess,
});

describe("expensesItcSource", () => {
  it("reproduces the Phase 1 ITC rows exactly", () => {
    const ws = buildGstr3bWorksheet({ base, itcLines: lines, input: null });
    const row = (id: string) => ws.itcRows.find((r) => r.id === id)!.heads;
    expect(row("4A(3)")).toEqual(H("0.00", "1800.00", "1800.00"));
    expect(row("4A(5)")).toEqual(H("1800.00", "4500.00", "4500.00"));
    expect(row("4C")).toEqual(H("1800.00", "6300.00", "6300.00"));
    expect(ws.netItc).toEqual(H("1800.00", "6300.00", "6300.00"));
    // ineligible GST (already left out of 4A) matches Phase 1 4B(2)
    expect(ws.ineligibleInBooks).toEqual(H("0.00", "180.00", "180.00"));
    expect(ws.table31d.taxable).toBe("20000.00");
    expect(ws.table31d.heads).toEqual(H("0.00", "1800.00", "1800.00"));
  });
  it("only returns expenses of the period", () => {
    expect(expensesItcSource(fixtureExpenses())("2026-09")).toEqual([]);
  });
});

describe("manual inputs", () => {
  it("adds 4A(1)/(2)/(4) and subtracts 4B reversals from 4C", () => {
    const ws = buildGstr3bWorksheet({
      base,
      itcLines: lines,
      input: {
        flags: {},
        setOffNotes: "",
        notes: "",
        values: {
          [inputKey("4A1", "igst")]: "5000",
          [inputKey("4A4", "cgst")]: "100.50",
          [inputKey("4B1", "cgst")]: "300",
          [inputKey("4B2", "igst")]: "200",
        },
      },
    });
    expect(ws.totalA).toEqual(H("6800.00", "6400.50", "6300.00"));
    expect(ws.totalB).toEqual(H("200.00", "300.00", "0.00"));
    expect(ws.netItc).toEqual(H("6600.00", "6100.50", "6300.00"));
  });
  it("warns when reversals exceed ITC", () => {
    const ws = buildGstr3bWorksheet({
      base,
      itcLines: [],
      input: { flags: {}, setOffNotes: "", notes: "", values: { [inputKey("4B1", "sgst")]: "50" } },
    });
    expect(ws.netItc.sgst).toBe("-50.00");
    expect(ws.warnings.join(" ")).toMatch(/SGST ITC is negative/);
  });
});

describe("setOff", () => {
  it("uses IGST credit first (IGST, then CGST, then SGST)", () => {
    const r = setOff(
      H("1000.00", "0.00", "0.00"),
      H("300.00", "400.00", "500.00"),
      zeroHeadsText(),
      zeroHeadsText(),
    );
    expect(r.steps).toEqual([
      { from: "igst", to: "igst", amount: "300.00" },
      { from: "igst", to: "cgst", amount: "400.00" },
      { from: "igst", to: "sgst", amount: "300.00" },
    ]);
    expect(r.payableCash).toEqual(H("0.00", "0.00", "200.00"));
    expect(r.creditLeft).toEqual(zeroHeadsText());
  });
  it("lets CGST/SGST credit pay IGST but never each other", () => {
    const r = setOff(
      H("0.00", "500.00", "200.00"),
      H("600.00", "100.00", "400.00"),
      zeroHeadsText(),
      zeroHeadsText(),
    );
    // CGST credit: 100 to CGST, 400 to IGST. SGST credit: 200 to SGST (not CGST), none left for IGST.
    expect(r.paidByItc).toEqual(H("400.00", "100.00", "200.00"));
    expect(r.payableCash).toEqual(H("200.00", "0.00", "200.00"));
    expect(r.creditLeft).toEqual(zeroHeadsText());
  });
  it("keeps unused credit per head and never uses cess credit on other heads", () => {
    const r = setOff(
      H("0.00", "100.00", "0.00", "50.00"),
      H("0.00", "40.00", "0.00", "0.00"),
      zeroHeadsText(),
      zeroHeadsText(),
    );
    expect(r.creditLeft).toEqual(H("0.00", "60.00", "0.00", "50.00"));
  });
  it("pays reverse charge only in cash and nets the cash ledger", () => {
    const r = setOff(
      H("0.00", "1000.00", "1000.00"),
      H("0.00", "100.00", "100.00"),
      H("0.00", "180.00", "180.00"),
      H("0.00", "200.00", "50.00"),
    );
    expect(r.payableCash).toEqual(H("0.00", "180.00", "180.00"));
    expect(r.cashShortfall).toEqual(H("0.00", "0.00", "130.00"));
    expect(r.cashLeft).toEqual(H("0.00", "20.00", "0.00"));
    expect(r.creditLeft).toEqual(H("0.00", "900.00", "900.00"));
  });
});

describe("full worksheet set-off", () => {
  it("adds the opening ledger balance and the amendments hook", () => {
    const ws = buildGstr3bWorksheet({
      base,
      itcLines: lines,
      amendmentsFromGstr1a: H("0.00", "10.00", "10.00"),
      input: {
        flags: {},
        setOffNotes: "Paid via PMT-06",
        notes: "",
        values: { [inputKey("open", "igst")]: "1000", [inputKey("cash", "cgst")]: "50" },
      },
    });
    expect(ws.amendments.label).toBe("Amendments (from GSTR-1A)");
    expect(ws.outputTax.cgst).toBe((Number(base.payable.outputTax.cgst) + 10).toFixed(2));
    expect(ws.setOff.creditAvailable.igst).toBe("2800.00");
    expect(ws.notes.at(-1)).toMatch(/Paid via PMT-06/);
    // reverse-charge tax always goes to cash
    expect(ws.setOff.liabilityCashOnly).toEqual(H("0.00", "1800.00", "1800.00"));
    expect(Number(ws.setOff.payableCash.cgst)).toBeGreaterThanOrEqual(1800);
  });
  it("amendments read zero by default and 2B comparison warns on excess claims", () => {
    const ws = buildGstr3bWorksheet({
      base,
      itcLines: lines,
      input: null,
      gstr2bAvailable: H("1800.00", "4000.00", "4500.00"),
    });
    expect(ws.amendments.heads).toEqual(zeroHeadsText());
    expect(ws.gstr2bDifference).toEqual(H("0.00", "500.00", "0.00"));
    expect(ws.warnings.join(" ")).toMatch(/more 'other ITC'/);
  });
});

describe("purchase source", () => {
  const purchase = purchaseSchema.parse({
    id: "p1",
    vendorGstin: "27AABCU9603R1ZX",
    billNo: "B-1",
    billDate: "2026-10-04",
    expenseId: "e-linked",
    itcEligible: true,
    summary: { taxable: "1000.00", cgst: "90.00", sgst: "90.00", igst: "0.00", total: "1180.00" },
  });
  const linked = expenseSchema.parse({
    id: "e-linked",
    date: "2026-10-04",
    amount: "1180",
    gstRate: "18",
    gstMode: "intra",
    itcEligible: true,
  });
  it("adapts purchase bills and drops the expense posted from them", () => {
    const all = combineItcSources(
      purchasesItcSource([purchase]),
      expensesItcSource([linked]),
    )("2026-10");
    expect(all).toHaveLength(2);
    const deduped = withoutLinkedExpenses(all, [purchase]);
    expect(deduped.map((l) => l.id)).toEqual(["purchase:p1"]);
    const ws = buildGstr3bWorksheet({ base, itcLines: deduped, input: null });
    expect(ws.itcRows.find((r) => r.id === "4A(5)")!.heads).toEqual(H("0.00", "90.00", "90.00"));
  });
});

describe("figures from GSTR-2B", () => {
  const r = (o: Partial<Gstr2bRow>): Gstr2bRow => ({
    id: "x",
    supplierGstin: "27AABCU9603R1ZX",
    supplierName: "S",
    docType: "invoice",
    docNo: "1",
    docDate: "2026-10-01",
    section: "b2b",
    origDocNo: "",
    pos: "27",
    taxable: "100.00",
    igst: "0.00",
    cgst: "9.00",
    sgst: "9.00",
    cess: "0.00",
    rcm: false,
    itcAvailable: true,
    itcReason: "",
    imsAction: "none",
    notes: "",
    ...o,
  });
  const result = reconcile({
    rows: [
      r({ id: "a", docNo: "A" }),
      r({
        id: "b",
        docNo: "B",
        docType: "credit_note",
        section: "cdnr",
        cgst: "4.50",
        sgst: "4.50",
      }),
      r({ id: "c", docNo: "C", itcAvailable: false }),
      r({ id: "d", docNo: "D", rcm: true }),
      r({ id: "e", docNo: "E" }),
      r({
        id: "i",
        section: "impg",
        supplierGstin: "",
        igst: "3600.00",
        cgst: "0.00",
        sgst: "0.00",
      }),
      r({ id: "s", section: "isd", igst: "50.00", cgst: "0.00", sgst: "0.00" }),
    ],
    books: [],
    overrides: [{ rowId: "e", status: "ignored", targetType: "", targetId: "" }],
  });
  it("sums available ITC (credit notes deducted; ineligible, RCM, ignored, imports and ISD left out)", () => {
    expect(gstr2bAvailableHeads([result])).toEqual(H("0.00", "4.50", "4.50"));
  });
  it("suggests 4A(1) and 4A(4)", () => {
    expect(gstr2bSuggestedInputs([result])).toEqual({
      "4A1": H("3600.00", "0.00", "0.00"),
      "4A4": H("50.00", "0.00", "0.00"),
    });
  });
});
