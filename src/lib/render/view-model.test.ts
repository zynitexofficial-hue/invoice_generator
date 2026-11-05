import { describe, expect, it } from "vitest";
import { computeTotals } from "@/lib/invoice-calc";
import { resolveDefaultDesign } from "@/lib/invoice-factory";
import { sampleInvoice } from "@/lib/sample";
import { DEFAULT_SETTINGS, normalizeSectionOrder, type Invoice } from "@/lib/schema";
import { buildViewModel } from "./view-model";

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
