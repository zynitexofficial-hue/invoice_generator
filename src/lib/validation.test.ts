import { describe, expect, it } from "vitest";
import { computeTotals } from "./invoice-calc";
import { createInvoice } from "./invoice-factory";
import { DEFAULT_SETTINGS, type DocType, type Invoice, type LineItem } from "./schema";
import {
  allowedGstRates,
  creditNoteDeadline,
  fieldId,
  isAllowedGstRate,
  overpayment,
  validateInvoice,
  type ValidationContext,
} from "./validation";

const now = new Date(2026, 9, 22, 10, 0, 0);

function base(docType: DocType = "tax_invoice"): Invoice {
  const inv = createInvoice({
    settings: DEFAULT_SETTINGS,
    designs: [],
    docType,
    generated: { number: "INV/26-27/001", autoNumber: null },
    now,
  });
  return {
    ...inv,
    seller: { ...inv.seller, name: "Northwind", stateCode: "27" },
    customer: {
      ...inv.customer,
      name: "Acme",
      billingAddress: "1 Main Road",
      stateCode: "27",
    },
    lines: [
      { ...inv.lines[0], name: "Design", quantity: "1", unitPrice: "1000", hsnSac: "998314" },
    ],
  };
}

function line(inv: Invoice, patch: Partial<LineItem>): Invoice {
  return { ...inv, lines: [{ ...inv.lines[0], ...patch }] };
}

function check(inv: Invoice, ctx?: ValidationContext) {
  const result = validateInvoice(inv, computeTotals(inv), ctx);
  const errorAt = (field: string) => result.errors.find((i) => i.field === field)?.message;
  const warningAt = (field: string) => result.warnings.find((i) => i.field === field)?.message;
  return { ...result, errorAt, warningAt };
}

describe("validateInvoice baseline", () => {
  it("accepts a complete tax invoice", () => {
    expect(check(base()).errors).toEqual([]);
  });
});

describe("GST number rules (A4)", () => {
  it("blocks numbers over 16 characters on GST documents", () => {
    for (const docType of [
      "tax_invoice",
      "bill_of_supply",
      "export",
      "credit_note",
      "debit_note",
    ] as const) {
      const inv = { ...base(docType), number: "INV-20261022-143052" };
      expect(check(inv).errorAt(fieldId.number), docType).toMatch(/16 characters/);
    }
  });

  it("blocks characters outside letters, digits, - and /", () => {
    expect(check({ ...base(), number: "INV#1" }).errorAt(fieldId.number)).toMatch(/only contain/);
    expect(check({ ...base(), number: "INV 1" }).errorAt(fieldId.number)).toMatch(/only contain/);
  });

  it("leaves quotations and invoices without GST alone", () => {
    for (const docType of ["proforma", "invoice"] as const) {
      const inv = { ...base(docType), number: "QUOTE-2026-10-22-0001" };
      expect(check(inv).errorAt(fieldId.number)).toBeUndefined();
    }
  });
});

describe("customers without GSTIN (B9)", () => {
  const big = (inv: Invoice) => line(inv, { unitPrice: "50000", gstRate: "0" });

  it("needs address and state at ₹50,000 or more", () => {
    const inv = big(base());
    const r = check({
      ...inv,
      customer: { ...inv.customer, billingAddress: "", stateCode: "" },
      placeOfSupply: "27",
    });
    expect(r.errorAt(fieldId.customerAddress)).toMatch(/₹50,000/);
    expect(r.errorAt(fieldId.customerState)).toMatch(/₹50,000/);
  });

  it("doesn't apply below ₹50,000 or to registered customers", () => {
    const small = base();
    const smallR = check({
      ...small,
      customer: { ...small.customer, billingAddress: "", stateCode: "" },
      placeOfSupply: "27",
    });
    expect(smallR.errorAt(fieldId.customerAddress)).toBeUndefined();

    const inv = big(base());
    const registered = check({
      ...inv,
      customer: { ...inv.customer, billingAddress: "", gstin: "27AAPFU0939F1ZV" },
    });
    expect(registered.errorAt(fieldId.customerAddress)).toBeUndefined();
  });
});

describe("tax head (B7)", () => {
  it("blocks a tax invoice with unknown seller state", () => {
    const inv = base();
    const r = check({ ...inv, seller: { ...inv.seller, stateCode: "", gstin: "" } });
    expect(r.errorAt(fieldId.sellerState)).toBeDefined();
  });

  it("blocks a tax invoice with unknown place of supply", () => {
    const inv = base();
    const r = check({ ...inv, customer: { ...inv.customer, stateCode: "" }, placeOfSupply: "" });
    expect(r.errorAt(fieldId.placeOfSupply)).toBeDefined();
  });

  it("only hints for quotations", () => {
    const inv = base("proforma");
    const r = check({ ...inv, customer: { ...inv.customer, stateCode: "" } });
    expect(r.errorAt(fieldId.placeOfSupply)).toBeUndefined();
    expect(r.warnings.find((w) => w.field === fieldId.placeOfSupply)?.soft).toBe(true);
  });

  it("warns when a manual supply type contradicts the place of supply", () => {
    expect(check({ ...base(), supplyType: "inter" }).warningAt(fieldId.supplyType)).toMatch(
      /CGST \+ SGST/,
    );
    expect(
      check({ ...base(), supplyType: "intra", placeOfSupply: "29" }).warningAt(fieldId.supplyType),
    ).toMatch(/IGST/);
    expect(check({ ...base(), supplyType: "intra" }).warningAt(fieldId.supplyType)).toBeUndefined();
  });
});

describe("date-aware GST rates (B8)", () => {
  it("allows only the new slabs from 22 Sep 2025", () => {
    expect(allowedGstRates("2026-01-01")).toEqual(["0", "0.25", "3", "5", "18", "40"]);
    expect(isAllowedGstRate("12", "2025-09-22")).toBe(false);
    expect(isAllowedGstRate("12", "2025-09-21")).toBe(true);
    expect(isAllowedGstRate("28", "2024-04-01")).toBe(true);
    expect(isAllowedGstRate("", "2026-01-01")).toBe(true);
  });

  it("warns (not errors) about a rate not valid on the invoice date", () => {
    const inv = line(base(), { gstRate: "12" });
    const id = fieldId.line(inv.lines[0].id, "rate");
    expect(check(inv).warningAt(id)).toMatch(/12%/);
    expect(check(inv).errorAt(id)).toBeUndefined();
    expect(check({ ...inv, invoiceDate: "2025-06-01", dueDate: "" }).warningAt(id)).toBeUndefined();
  });

  it("checks rates on exports with IGST payment", () => {
    const inv = line(
      {
        ...base("export"),
        currency: "INR",
        exportDetails: { ...base("export").exportDetails, type: "wpay" },
      },
      { gstRate: "28" },
    );
    expect(check(inv).warningAt(fieldId.line(inv.lines[0].id, "rate"))).toBeDefined();
  });
});

describe("exports (B6)", () => {
  const exp = (patch: Partial<Invoice["exportDetails"]>, currency = "USD"): Invoice => {
    const inv = base("export");
    return {
      ...inv,
      currency,
      customer: { ...inv.customer, country: "USA", stateCode: "" },
      exportDetails: { ...inv.exportDetails, ...patch },
    };
  };

  it("needs an exchange rate for non-INR currency", () => {
    expect(check(exp({ type: "wpay" })).errorAt(fieldId.exchangeRate)).toMatch(/USD/);
    expect(check(exp({ type: "wpay", exchangeRate: "abc" })).errorAt(fieldId.exchangeRate)).toBe(
      "Enter a valid exchange rate.",
    );
    expect(
      check(exp({ type: "wpay", exchangeRate: "83.25" })).errorAt(fieldId.exchangeRate),
    ).toBeUndefined();
    expect(check(exp({ type: "wpay" }, "INR")).errorAt(fieldId.exchangeRate)).toBeUndefined();
  });

  it("needs an LUT number for exports without payment", () => {
    expect(check(exp({ type: "wopay", exchangeRate: "83" })).errorAt(fieldId.lutNumber)).toMatch(
      /LUT/,
    );
    expect(
      check(exp({ type: "wopay", exchangeRate: "83", lutNumber: "AD270526000123X" })).errorAt(
        fieldId.lutNumber,
      ),
    ).toBeUndefined();
    expect(check(exp({ type: "wpay", exchangeRate: "83" })).errorAt(fieldId.lutNumber)).toBe(
      undefined,
    );
  });
});

describe("credit and debit notes (B1, B2)", () => {
  const note = (patch: Partial<Invoice["note"]>, docType: DocType = "credit_note"): Invoice => ({
    ...base(docType),
    number: "CN/26-27/001",
    note: {
      reason: "sales_return",
      originalInvoiceId: "x",
      originalInvoiceNumber: "INV/26-27/001",
      originalInvoiceDate: "2026-05-01",
      ...patch,
    },
  });

  it("needs the original invoice and a reason", () => {
    const r = check(note({ originalInvoiceNumber: "", reason: "" }, "debit_note"));
    expect(r.errorAt(fieldId.noteOriginal)).toBeDefined();
    expect(r.errorAt(fieldId.noteReason)).toBeDefined();
    expect(check(note({})).errors).toEqual([]);
  });

  it("warns when a credit note is after 30 Nov following the invoice's FY", () => {
    expect(creditNoteDeadline("2026-05-01")).toBe("2027-11-30");
    expect(creditNoteDeadline("2026-03-31")).toBe("2026-11-30");
    const late = { ...note({ originalInvoiceDate: "2025-04-10" }), invoiceDate: "2026-12-01" };
    expect(check({ ...late, dueDate: "" }).warningAt(fieldId.invoiceDate)).toMatch(
      /FY 2025-26.*30 Nov 2026/,
    );
    const onTime = { ...note({ originalInvoiceDate: "2025-04-10" }), invoiceDate: "2026-11-30" };
    expect(check({ ...onTime, dueDate: "" }).warningAt(fieldId.invoiceDate)).toBeUndefined();
  });
});

describe("HSN digits (B11)", () => {
  it("warns when a taxed line's HSN is shorter than required", () => {
    const inv = line(base(), { hsnSac: "9983" });
    const id = fieldId.line(inv.lines[0].id, "hsn");
    expect(check(inv).warningAt(id)).toBeUndefined();
    expect(check(inv, { hsnDigits: 6 }).warningAt(id)).toMatch(/6 digits/);
    expect(check(line(inv, { hsnSac: "99" })).warningAt(id)).toMatch(/4 digits/);
  });

  it("ignores untaxed lines", () => {
    const inv = line(base(), { hsnSac: "99", gstRate: "0" });
    expect(check(inv).warningAt(fieldId.line(inv.lines[0].id, "hsn"))).toBeUndefined();
  });
});

describe("overpayment (B13)", () => {
  it("warns with the excess instead of blocking", () => {
    const inv = base();
    const total = computeTotals(inv).grandTotal; // 1180.00
    const paid = { ...inv, payment: { ...inv.payment, amountReceived: "1500" } };
    const r = check(paid);
    expect(r.errorAt(fieldId.amountReceived)).toBeUndefined();
    expect(r.warningAt(fieldId.amountReceived)).toBe(
      "₹320.00 more than the total — record the excess as an advance.",
    );
    expect(overpayment(paid, computeTotals(paid))).toBe("320.00");
    expect(
      overpayment(
        { ...inv, payment: { ...inv.payment, amountReceived: total } },
        computeTotals(inv),
      ),
    ).toBe("");
  });
});
