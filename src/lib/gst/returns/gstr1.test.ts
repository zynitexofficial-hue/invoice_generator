import { describe, expect, it } from "vitest";
import { computeTotals } from "@/lib/invoice-calc";
import { Dec, roundTo, toDec } from "@/lib/money";
import { invoiceReturnHash } from "@/lib/return-hash";
import { buildGstr1 } from "./gstr1";
import { buildDocSeries, splitNumber } from "./docs";
import {
  B2B_KA_GSTIN,
  B2B_MH_GSTIN,
  PERIOD,
  fixtureInvoices,
  fixtureSettings,
  ln,
  mkInvoice,
} from "./fixtures/october-2026";

const settings = fixtureSettings();
const invoices = fixtureInvoices();
const result = buildGstr1({ invoices, settings, periodKey: PERIOD });
const s = result.sections;

describe("GSTR-1 placement (fixture month)", () => {
  it("has no blocking errors", () => {
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(result.hasErrors).toBe(false);
  });

  it("excludes drafts, quotations, cancelled and out-of-period documents", () => {
    const reasons = Object.fromEntries(result.excluded.map((e) => [e.invoiceId, e.reason]));
    expect(reasons).toEqual({
      "inv-cancelled": "cancelled",
      "inv-draft": "draft",
      "qtn-1": "proforma",
      "inv-september": "outside_period",
    });
  });

  it("B2B: intra, inter, reverse charge and SEZ without payment", () => {
    expect(s.b2b.map((r) => r.invoiceId)).toEqual([
      "inv-b2b-intra",
      "inv-b2b-inter",
      "inv-b2b-rcm",
      "inv-sez-wop",
    ]);
    const [intra, inter, rcm, sez] = s.b2b;
    expect(intra).toMatchObject({
      ctin: B2B_MH_GSTIN,
      pos: "27",
      value: "17700.00",
      interState: false,
      reverseCharge: false,
      invType: "R",
      items: [{ rate: "18", taxable: "15000.00", cgst: "1350.00", sgst: "1350.00", igst: "0.00" }],
    });
    expect(inter).toMatchObject({
      ctin: B2B_KA_GSTIN,
      pos: "29",
      value: "52500.00",
      interState: true,
      items: [{ rate: "5", taxable: "50000.00", igst: "2500.00", cgst: "0.00" }],
    });
    expect(rcm.reverseCharge).toBe(true);
    expect(rcm.items).toEqual([
      {
        rate: "5",
        taxable: "10000.00",
        igst: "0.00",
        cgst: "250.00",
        sgst: "250.00",
        cess: "0.00",
      },
    ]);
    expect(sez).toMatchObject({
      invType: "SEWOP",
      pos: "24",
      interState: true,
      items: [{ rate: "18", taxable: "200000.00", igst: "0.00" }],
    });
    expect(result.totals.b2b).toEqual({
      count: 4,
      taxable: "275000.00",
      igst: "2500.00",
      cgst: "1600.00",
      sgst: "1600.00",
      cess: "0.00",
    });
  });

  it("B2CL: unregistered inter-state above ₹1 lakh", () => {
    expect(s.b2cl).toHaveLength(1);
    expect(s.b2cl[0]).toMatchObject({
      invoiceId: "inv-b2cl",
      pos: "29",
      value: "177000.00",
      items: [{ rate: "18", taxable: "150000.00", igst: "27000.00" }],
    });
  });

  it("B2CS: aggregated by POS + rate + intra/inter, credit note netted, single-GST split", () => {
    expect(s.b2cs).toEqual([
      {
        supplyType: "INTER",
        pos: "07",
        rate: "18",
        taxable: "20000.00",
        igst: "3600.00",
        cgst: "0.00",
        sgst: "0.00",
        cess: "0.00",
      },
      // Single-GST mode: 50.05 → CGST 25.03 (half-up), SGST 25.02 (remainder).
      {
        supplyType: "INTRA",
        pos: "27",
        rate: "5",
        taxable: "1001.00",
        igst: "0.00",
        cgst: "25.03",
        sgst: "25.02",
        cess: "0.00",
      },
      // 1000 − 200 credit note
      {
        supplyType: "INTRA",
        pos: "27",
        rate: "18",
        taxable: "800.00",
        igst: "0.00",
        cgst: "72.00",
        sgst: "72.00",
        cess: "0.00",
      },
    ]);
    expect(result.totals.b2cs).toMatchObject({
      count: 3,
      taxable: "21801.00",
      cgst: "97.03",
      sgst: "97.02",
    });
  });

  it("EXP: WPAY in USD converted at the exchange rate, WOPAY rounded half-up", () => {
    expect(s.exp.map((r) => [r.invoiceId, r.exportType, r.value])).toEqual([
      ["exp-wpay", "WPAY", "98235.00"],
      ["exp-wopay", "WOPAY", "103086.60"],
    ]);
    expect(s.exp[0]).toMatchObject({
      pos: "96",
      portCode: "INNSA1",
      shippingBillNo: "1234567",
      shippingBillDate: "2026-10-14",
      items: [{ rate: "18", taxable: "83250.00", igst: "14985.00" }],
    });
    expect(s.exp[1].items).toEqual([
      { rate: "18", taxable: "103086.60", igst: "0.00", cgst: "0.00", sgst: "0.00", cess: "0.00" },
    ]);
  });

  it("CDNR: credit note against B2B and debit note", () => {
    expect(s.cdnr.map((n) => [n.invoiceId, n.noteType, n.value, n.originalInvoiceNumber])).toEqual([
      ["cn-b2b", "C", "26250.00", "INV/26-27/002"],
      ["dn-b2b", "D", "1180.00", "INV/26-27/001"],
    ]);
    expect(s.cdnr[0].items).toEqual([
      { rate: "5", taxable: "25000.00", igst: "1250.00", cgst: "0.00", sgst: "0.00", cess: "0.00" },
    ]);
    // Signed: credit notes subtract, debit notes add.
    expect(result.totals.cdnr).toEqual({
      count: 2,
      taxable: "-24000.00",
      igst: "-1250.00",
      cgst: "90.00",
      sgst: "90.00",
      cess: "0.00",
    });
  });

  it("CDNUR: only the credit note against the B2CL invoice", () => {
    expect(s.cdnur).toHaveLength(1);
    expect(s.cdnur[0]).toMatchObject({
      invoiceId: "cn-b2cl",
      urType: "B2CL",
      noteType: "C",
      pos: "29",
      value: "11800.00",
      items: [{ rate: "18", taxable: "10000.00", igst: "1800.00" }],
    });
    expect(result.totals.cdnur).toMatchObject({ count: 1, taxable: "-10000.00", igst: "-1800.00" });
  });

  it("NIL: split by nil/exempt and inter/intra, registered/unregistered", () => {
    expect(s.nil).toEqual([
      { supplyType: "INTRB2B", nil: "4000.00", exempt: "0.00", nonGst: "0.00" },
      { supplyType: "INTRAB2C", nil: "0.00", exempt: "3000.00", nonGst: "0.00" },
    ]);
    expect(result.totals.nil).toMatchObject({ count: 2, taxable: "7000.00" });
  });

  it("grand totals add up all supply sections", () => {
    expect(result.grandTotals).toEqual({
      count: 15,
      taxable: "606137.60",
      igst: "45035.00",
      cgst: "1787.03",
      sgst: "1787.02",
      cess: "0.00",
    });
  });

  it("record hashes cover issued documents of the period, cancelled included", () => {
    const ids = result.recordHashes.map((r) => r.id);
    expect(ids).toContain("inv-cancelled");
    expect(ids).not.toContain("inv-draft");
    expect(ids).not.toContain("inv-september");
    expect(ids).toHaveLength(17);
    const cn = invoices.find((i) => i.id === "cn-b2b")!;
    expect(result.recordHashes.find((r) => r.id === "cn-b2b")?.hash).toBe(invoiceReturnHash(cn));
  });
});

describe("reconciliation", () => {
  it("section taxable values equal computeTotals over included invoices (INR, notes signed)", () => {
    const excluded = new Set(result.excluded.map((e) => e.invoiceId));
    let expected = new Dec(0);
    for (const inv of invoices) {
      if (excluded.has(inv.id)) continue;
      const totals = computeTotals(inv);
      const rate = inv.currency === "INR" ? null : toDec(inv.exportDetails.exchangeRate);
      const sign = inv.docType === "credit_note" ? -1 : 1;
      for (const line of totals.lines) {
        const v = toDec(line.taxable);
        expected = expected.plus((rate ? roundTo(v.mul(rate), 2) : v).mul(sign));
      }
    }
    const sections = ["b2b", "b2cl", "b2cs", "exp", "cdnr", "cdnur", "nil"] as const;
    const sum = sections.reduce((acc, k) => acc.plus(result.totals[k].taxable), new Dec(0));
    expect(sum.toFixed(2)).toBe(expected.toFixed(2));
    expect(result.grandTotals.taxable).toBe(expected.toFixed(2));
  });

  it("HSN totals equal the supply sections (taxable and each tax head)", () => {
    for (const head of ["taxable", "igst", "cgst", "sgst"] as const) {
      const hsn = toDec(result.totals.hsnB2b[head]).plus(result.totals.hsnB2c[head]);
      expect(hsn.toFixed(2), head).toBe(result.grandTotals[head]);
    }
  });
});

describe("HSN summary (Table 12)", () => {
  it("B2B tab: registered recipients, notes adjusting", () => {
    expect(
      s.hsnB2b.map((r) => [r.hsn, r.uqc, r.rate, r.qty, r.taxable, r.igst, r.cgst, r.sgst]),
    ).toEqual([
      ["1006", "KGS", "0", "40.00", "4000.00", "0.00", "0.00", "0.00"],
      // invoice 10 pcs + debit note (value only)
      ["42021290", "PCS", "18", "10.00", "11000.00", "0.00", "990.00", "990.00"],
      // 2 boxes − 1 box returned
      ["61091000", "BOX", "5", "1.00", "25000.00", "1250.00", "0.00", "0.00"],
      ["84714190", "NOS", "18", "1.00", "200000.00", "0.00", "0.00", "0.00"],
      ["996511", "OTH", "5", "1.00", "10000.00", "0.00", "250.00", "250.00"],
      ["998314", "OTH", "18", "1.00", "5000.00", "0.00", "450.00", "450.00"],
    ]);
    expect(s.hsnB2b[1]).toMatchObject({ description: "Laptop bag", totalValue: "12980.00" });
  });

  it("B2C tab: unregistered, exports and nil", () => {
    expect(s.hsnB2c.map((r) => [r.hsn, r.uqc, r.rate, r.qty, r.taxable, r.igst, r.cgst])).toEqual([
      ["0401", "LTR", "0", "3.00", "3000.00", "0.00", "0.00"],
      ["42021290", "PCS", "18", "10.00", "83250.00", "14985.00", "0.00"],
      ["48201010", "PCS", "5", "1.00", "1001.00", "0.00", "25.03"],
      ["61091000", "PCS", "18", "1.00", "800.00", "0.00", "72.00"],
      // B2CL 150000 − discount note 10000 (quantity unchanged for a discount)
      ["84714190", "NOS", "18", "1.00", "140000.00", "25200.00", "0.00"],
      ["85285200", "NOS", "18", "1.00", "20000.00", "3600.00", "0.00"],
      ["998314", "OTH", "18", "1.00", "103086.60", "0.00", "0.00"],
    ]);
  });
});

describe("DOCS (Table 13)", () => {
  it("groups by nature and series with from/to, cancelled and net", () => {
    expect(
      s.docs.map((d) => [d.nature, d.prefix, d.from, d.to, d.total, d.cancelled, d.net]),
    ).toEqual([
      [1, "BOS/26-27/", "BOS/26-27/001", "BOS/26-27/001", 1, 0, 1],
      [1, "EXP/26-27/", "EXP/26-27/001", "EXP/26-27/002", 2, 0, 2],
      [1, "INV/26-27/", "INV/26-27/001", "INV/26-27/010", 10, 1, 9],
      [4, "DN/26-27/", "DN/26-27/001", "DN/26-27/001", 1, 0, 1],
      [5, "CN/26-27/", "CN/26-27/001", "CN/26-27/003", 3, 0, 3],
    ]);
    expect(result.totals.docs.count).toBe(17);
  });

  it("splits numbers and orders numerically, not lexically", () => {
    expect(splitNumber("INV/26-27/012")).toEqual({ prefix: "INV/26-27/", serial: 12n });
    expect(splitNumber("ABC")).toEqual({ prefix: "", serial: null });
    const docs = buildDocSeries([
      mkInvoice({ id: "a", number: "A9" }),
      mkInvoice({ id: "b", number: "A10" }),
      mkInvoice({ id: "c", number: "A12" }),
      mkInvoice({ id: "d", number: "MANUAL" }),
      mkInvoice({ id: "e", number: "CASH-SALE" }),
      mkInvoice({ id: "f", number: "ZZ", issuedAt: "" }),
    ]);
    expect(docs.map((d) => [d.prefix, d.from, d.to, d.total, d.gaps])).toEqual([
      ["", "CASH-SALE", "MANUAL", 2, 0],
      ["A", "A9", "A12", 3, 1],
    ]);
  });

  it("warns about gaps in a series", () => {
    const r = buildGstr1({
      invoices: [
        mkInvoice({
          id: "x1",
          number: "S/1",
          customer: { stateCode: "27" },
          lines: [ln("A", "6109", "1", "10", "5")],
        }),
        mkInvoice({
          id: "x3",
          number: "S/3",
          customer: { stateCode: "27" },
          lines: [ln("A", "6109", "1", "10", "5")],
        }),
      ],
      settings,
      periodKey: PERIOD,
    });
    expect(r.issues.map((i) => i.code)).toContain("DOCS_GAP");
  });
});

describe("classification edge cases", () => {
  const build = (extra: ReturnType<typeof mkInvoice>[]) =>
    buildGstr1({ invoices: [...invoices, ...extra], settings, periodKey: PERIOD });

  it("single-GST mode inter-state goes to IGST", () => {
    const r = build([
      mkInvoice({
        id: "single-inter",
        number: "INV/26-27/050",
        gstMode: "single",
        customer: { name: "A", billingAddress: "x", stateCode: "09" },
        lines: [ln("Pen", "96081019", "1", "1000", "18")],
      }),
    ]);
    expect(r.sections.b2cs.find((row) => row.pos === "09")).toEqual({
      supplyType: "INTER",
      pos: "09",
      rate: "18",
      taxable: "1000.00",
      igst: "180.00",
      cgst: "0.00",
      sgst: "0.00",
      cess: "0.00",
    });
  });

  it("B2CL threshold is strictly above ₹1,00,000", () => {
    const r = build([
      mkInvoice({
        id: "at-limit",
        number: "INV/26-27/051",
        customer: { name: "A", billingAddress: "x", stateCode: "09" },
        lines: [ln("Pen", "96081019", "1", "100000", "0")],
      }),
      mkInvoice({
        id: "over-limit",
        number: "INV/26-27/052",
        customer: { name: "A", billingAddress: "x", stateCode: "09" },
        lines: [ln("Pen", "96081019", "1", "100000.01", "0")],
      }),
    ]);
    expect(r.sections.b2cl.map((x) => x.invoiceId)).toContain("over-limit");
    expect(r.sections.b2cl.map((x) => x.invoiceId)).not.toContain("at-limit");
    expect(r.issues.find((i) => i.recordId === "at-limit")?.code).toBe("B2CL_NEAR_THRESHOLD");
  });

  it("credit note against an export goes to CDNUR EXPWP", () => {
    const original = invoices.find((i) => i.id === "exp-wpay")!;
    const r = build([
      mkInvoice({
        id: "cn-exp",
        docType: "credit_note",
        number: "CN/26-27/004",
        currency: "USD",
        exportDetails: original.exportDetails,
        customer: original.customer,
        note: {
          reason: "sales_return",
          originalInvoiceId: "exp-wpay",
          originalInvoiceNumber: "EXP/26-27/001",
        },
        lines: [ln("Leather bags", "42021290", "1", "100", "18")],
      }),
    ]);
    const note = r.sections.cdnur.find((n) => n.invoiceId === "cn-exp");
    expect(note).toMatchObject({
      urType: "EXPWP",
      value: "9823.50",
      items: [{ rate: "18", taxable: "8325.00", igst: "1498.50" }],
    });
  });

  it("note whose original is not on record: placement inferred by value, with a warning", () => {
    const r = build([
      mkInvoice({
        id: "cn-orphan",
        docType: "credit_note",
        number: "CN/26-27/005",
        customer: { name: "B", billingAddress: "y", stateCode: "09" },
        note: {
          reason: "others",
          originalInvoiceNumber: "OLD/1",
          originalInvoiceDate: "2026-04-01",
        },
        lines: [ln("Pen", "96081019", "1", "120000", "18")],
      }),
      mkInvoice({
        id: "cn-small-orphan",
        docType: "credit_note",
        number: "CN/26-27/006",
        customer: { name: "B", billingAddress: "y", stateCode: "09" },
        note: { reason: "others", originalInvoiceNumber: "OLD/2" },
        lines: [ln("Pen", "96081019", "1", "100", "18")],
      }),
    ]);
    expect(r.sections.cdnur.find((n) => n.invoiceId === "cn-orphan")?.urType).toBe("B2CL");
    expect(r.sections.cdnur.find((n) => n.invoiceId === "cn-small-orphan")).toBeUndefined();
    expect(r.sections.b2cs.find((row) => row.pos === "09")?.taxable).toBe("-100.00");
    expect(r.issues.filter((i) => i.recordId === "cn-orphan").map((i) => i.code)).toContain(
      "NOTE_ORIGINAL_NOT_FOUND",
    );
    expect(r.issues.map((i) => i.code)).toContain("B2CS_NEGATIVE");
  });

  it("tax invoice to a customer outside India is an export", () => {
    const r = build([
      mkInvoice({
        id: "foreign-ti",
        number: "INV/26-27/053",
        customer: { company: "Foreign Co", country: "Singapore", billingAddress: "SG" },
        lines: [ln("Consulting", "998311", "1", "1000", "18", "hrs")],
      }),
    ]);
    const row = r.sections.exp.find((e) => e.invoiceId === "foreign-ti");
    expect(row).toMatchObject({ exportType: "WPAY", items: [{ igst: "180.00" }] });
    expect(r.issues.find((i) => i.recordId === "foreign-ti")?.code).toBe("EXPORT_TYPE_MISSING");
  });

  it("SEZ with payment is B2B SEWP with IGST", () => {
    const r = build([
      mkInvoice({
        id: "sez-wp",
        number: "INV/26-27/054",
        sez: { enabled: true, withPayment: true },
        customer: { company: "SEZ", gstin: B2B_MH_GSTIN, stateCode: "27" },
        lines: [ln("Servers", "84714190", "1", "1000", "18", "nos")],
      }),
    ]);
    expect(r.sections.b2b.find((x) => x.invoiceId === "sez-wp")).toMatchObject({
      invType: "SEWP",
      interState: true,
      items: [{ igst: "180.00", cgst: "0.00" }],
    });
  });

  it("a quarter period covers its three months", () => {
    const r = buildGstr1({ invoices, settings, periodKey: "2026-Q3" });
    expect(r.grandTotals).toEqual(result.grandTotals);
  });
});
