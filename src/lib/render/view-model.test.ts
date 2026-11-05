import { describe, expect, it } from "vitest";
import { computeTotals } from "@/lib/invoice-calc";
import { resolveDefaultDesign } from "@/lib/invoice-factory";
import { sampleInvoice } from "@/lib/sample";
import { DEFAULT_SETTINGS, normalizeSectionOrder, type Invoice } from "@/lib/schema";
import {
  buildViewModel,
  EXPORT_WITH_PAYMENT_DECLARATION,
  REVERSE_CHARGE_STATEMENT,
  SEZ_WITH_PAYMENT_DECLARATION,
} from "./view-model";

function vmOf(patch: Partial<Invoice>, show: Record<string, boolean> = {}) {
  const base = sampleInvoice(DEFAULT_SETTINGS, resolveDefaultDesign(DEFAULT_SETTINGS, []));
  const invoice: Invoice = { ...base, ...patch };
  const customization = {
    ...invoice.design.customization,
    show: { ...invoice.design.customization.show, ...show },
  };
  return buildViewModel(invoice, computeTotals(invoice), customization, {
    dateFormat: "dd/MM/yyyy",
    grouping: "indian",
    upiIncludeAmount: true,
  });
}

describe("compliance fields on the document", () => {
  it("prints the original invoice and the reason on credit notes", () => {
    const vm = vmOf({
      docType: "credit_note",
      docTitle: "Credit Note",
      number: "CN/26-27/001",
      note: {
        reason: "sales_return",
        originalInvoiceId: "a",
        originalInvoiceNumber: "INV/26-27/007",
        originalInvoiceDate: "2026-10-01",
      },
    });
    expect(vm.title).toBe("Credit Note");
    expect(vm.numberLabel).toBe("Credit Note No.");
    expect(vm.meta).toContainEqual({
      label: "Against invoice",
      value: "INV/26-27/007 dated 01/10/2026",
    });
    expect(vm.meta).toContainEqual({ label: "Reason", value: "Sales return" });
    expect(vm.noteReason).toBe("Sales return");
  });

  it("always stamps cancelled documents, even when status stamps are hidden", () => {
    const vm = vmOf(
      { status: "cancelled", cancelReason: "Wrong customer", cancelledAt: "2026-10-02T00:00:00Z" },
      { statusStamp: false },
    );
    expect(vm.stamp).toBe("CANCELLED");
    expect(vm.cancelled).toBe(true);
    expect(vm.cancelReason).toBe("Wrong customer");
  });

  it("keeps PAID stamps behind the design switch", () => {
    const base = sampleInvoice(DEFAULT_SETTINGS, resolveDefaultDesign(DEFAULT_SETTINGS, []));
    const total = computeTotals(base).grandTotal;
    const paid = { payment: { ...base.payment, amountReceived: total } };
    expect(vmOf(paid).stamp).toBe("PAID");
    expect(vmOf(paid, { statusStamp: false }).stamp).toBeNull();
    expect(vmOf(paid).cancelled).toBe(false);
  });

  it("prints the reverse charge statement", () => {
    expect(vmOf({ reverseCharge: true }).statements).toEqual([REVERSE_CHARGE_STATEMENT]);
    expect(vmOf({ reverseCharge: false }).statements).toEqual([]);
  });

  it("shows IGST and the payment declaration on exports with payment", () => {
    const base = sampleInvoice(DEFAULT_SETTINGS, resolveDefaultDesign(DEFAULT_SETTINGS, []));
    const vm = vmOf({
      docType: "export",
      currency: "USD",
      customer: { ...base.customer, country: "USA", stateCode: "", gstin: "" },
      declaration: DEFAULT_SETTINGS.declarations.exportText,
      exportDetails: { ...base.exportDetails, type: "wpay", exchangeRate: "83.25" },
    });
    expect(vm.taxKind).toBe("inter");
    expect(vm.totals.some((r) => r.label.startsWith("IGST"))).toBe(true);
    expect(vm.declaration).toBe(EXPORT_WITH_PAYMENT_DECLARATION);
    expect(vm.meta).toContainEqual({ label: "Exchange rate", value: "1 USD = ₹83.25" });
  });

  it("adds the LUT number to the declaration under LUT", () => {
    const base = sampleInvoice(DEFAULT_SETTINGS, resolveDefaultDesign(DEFAULT_SETTINGS, []));
    const vm = vmOf({
      docType: "export",
      currency: "USD",
      customer: { ...base.customer, country: "USA", stateCode: "", gstin: "" },
      declaration: DEFAULT_SETTINGS.declarations.exportText,
      exportDetails: { ...base.exportDetails, type: "wopay", lutNumber: "AD2705260001234" },
    });
    expect(vm.taxKind).toBe("none");
    expect(vm.declaration).toBe(
      `${DEFAULT_SETTINGS.declarations.exportText} LUT/Bond No: AD2705260001234`,
    );
  });

  it("charges IGST on SEZ supplies with payment", () => {
    const vm = vmOf({ sez: { enabled: true, withPayment: true }, declaration: "" });
    expect(vm.taxKind).toBe("inter");
    expect(vm.declaration).toBe(SEZ_WITH_PAYMENT_DECLARATION);
    expect(vmOf({ sez: { enabled: true, withPayment: false } }).taxKind).toBe("none");
  });

  it("prints city and PIN in addresses without repeating them", () => {
    const base = sampleInvoice(DEFAULT_SETTINGS, resolveDefaultDesign(DEFAULT_SETTINGS, []));
    const vm = vmOf({
      seller: {
        ...base.seller,
        address: "4th Floor\nAndheri East, Mumbai 400069",
        city: "Mumbai",
        pincode: "400069",
        udyam: "UDYAM-MH-19-0012345",
      },
      customer: { ...base.customer, billingAddress: "12 MG Road", city: "Pune", pincode: "411001" },
    });
    expect(vm.seller.addressLines).toEqual(["4th Floor", "Andheri East, Mumbai 400069"]);
    expect(vm.customer.addressLines).toContain("Pune - 411001");
    expect(vm.seller.tax).toContainEqual({ label: "Udyam", value: "UDYAM-MH-19-0012345" });
  });
});

const opts = { dateFormat: "dd/MM/yyyy", grouping: "indian", upiIncludeAmount: true } as const;
const design = resolveDefaultDesign(DEFAULT_SETTINGS, []);

function viewModel(rates: string[]) {
  const base = sampleInvoice(DEFAULT_SETTINGS, design);
  const invoice: Invoice = {
    ...base,
    lines: base.lines.map((l, i) => ({ ...l, gstRate: rates[i] ?? rates[rates.length - 1] })),
  };
  // The tax summary block is off by default; turn it on so its visibility can be asserted.
  const customization = {
    ...invoice.design.customization,
    show: { ...invoice.design.customization.show, taxSummary: true },
  };
  return buildViewModel(invoice, computeTotals(invoice), customization, opts);
}

const hasTaxColumn = (vm: ReturnType<typeof viewModel>) => vm.columns.some((c) => c.key === "tax");

describe("GST column on the document", () => {
  it("shows the GST column and tax summary when lines are taxed", () => {
    const vm = viewModel(["18"]);
    expect(hasTaxColumn(vm)).toBe(true);
    expect(vm.taxSummary).not.toBeNull();
  });

  it("hides the GST column and tax summary when every line is 0%", () => {
    const vm = viewModel(["0"]);
    expect(hasTaxColumn(vm)).toBe(false);
    expect(vm.taxSummary).toBeNull();
  });

  it("keeps the column when only some lines are 0%", () => {
    const vm = viewModel(["0", "18"]);
    expect(hasTaxColumn(vm)).toBe(true);
    expect(vm.rows[0].taxRate).toBe("0%");
  });
});

describe("payment terms on the document", () => {
  const withPlan = (patch: Partial<Invoice>) => {
    const invoice: Invoice = { ...sampleInvoice(DEFAULT_SETTINGS, design), ...patch };
    return buildViewModel(invoice, computeTotals(invoice), invoice.design.customization, opts);
  };
  const plan: Invoice["paymentSchedule"] = [
    { id: "a", label: "Advance", due: "On order confirmation", kind: "percent", value: "50" },
    { id: "b", label: "", due: "", kind: "percent", value: "50" },
  ];

  it("is left out when no plan is set", () => {
    expect(withPlan({ paymentSchedule: [] }).schedule).toBeNull();
  });

  it("lists each instalment with its share, adding up to the total", () => {
    const base = sampleInvoice(DEFAULT_SETTINGS, design);
    const vm = withPlan({
      paymentSchedule: plan,
      payment: { ...base.payment, amountReceived: "" },
    });
    expect(vm.schedule?.rows.map((r) => [r.label, r.share])).toEqual([
      ["Advance", "50%"],
      ["Instalment 2", "50%"],
    ]);
    expect(vm.schedule?.total).toBe(vm.grandTotal);
    expect(vm.schedule?.hasStatus).toBe(false);
  });

  it("shows paid / due per instalment once money is received", () => {
    const base = sampleInvoice(DEFAULT_SETTINGS, design);
    const half = computeTotals(base).grandTotal;
    const vm = withPlan({
      docType: "tax_invoice",
      paymentSchedule: plan,
      payment: { ...base.payment, amountReceived: String(Number(half) / 2) },
    });
    expect(vm.schedule?.rows.map((r) => r.status)).toEqual(["Paid", "Due"]);
  });

  it("slots the section in after totals for designs saved before it existed", () => {
    expect(normalizeSectionOrder(["signature", "totals", "notes"])).toEqual([
      "signature",
      "totals",
      "schedule",
      "taxSummary",
      "payment",
      "notes",
      "terms",
    ]);
  });
});

describe("preferred payment method", () => {
  const vmFor = (seller: Partial<Invoice["seller"]>) => {
    const base = sampleInvoice(DEFAULT_SETTINGS, design);
    const invoice: Invoice = {
      ...base,
      docType: "tax_invoice",
      currency: "INR",
      payment: { ...base.payment, amountReceived: "" },
      seller: { ...base.seller, ...seller },
    };
    return buildViewModel(invoice, computeTotals(invoice), invoice.design.customization, opts);
  };
  const bank = { ...DEFAULT_SETTINGS.profile.bank, accountNumber: "50100123456789" };

  it("ranks the methods when both bank and UPI are shown", () => {
    const vm = vmFor({ bank, upiId: "shop@okhdfcbank", preferredPayment: "upi" });
    expect(vm.payment?.preferred).toBe("upi");
    expect(vm.payment?.upiUri).not.toBeNull();
    expect(vm.payment?.bank.length).toBeGreaterThan(0);
  });

  it("ignores the preference when only one method exists", () => {
    const vm = vmFor({ bank, upiId: "", preferredPayment: "upi" });
    expect(vm.payment?.preferred).toBe("");
  });
});
