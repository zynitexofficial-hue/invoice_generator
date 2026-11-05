/**
 * Fixture month (October 2026) for the GST return engine tests.
 *
 * Seller: Maharashtra (27), regular monthly filer. Every case of GSTR-1
 * placement appears once; expected values are worked out in comments.
 */
import { gstinCheckChar } from "@/lib/gst/gstin";
import {
  DEFAULT_SETTINGS,
  expenseSchema,
  invoiceSchema,
  settingsSchema,
  type AppSettings,
  type Expense,
  type Invoice,
} from "@/lib/schema";

export const withCheck = (body14: string) => body14 + gstinCheckChar(body14);

export const SELLER_GSTIN = withCheck("27AAPFU0939F1Z");
export const B2B_MH_GSTIN = withCheck("27AABCU9603R1Z");
export const B2B_KA_GSTIN = withCheck("29AAGCB1286Q1Z");
export const SEZ_GJ_GSTIN = withCheck("24AAACS1234A1Z");
export const NIL_KA_GSTIN = withCheck("29ABCDE1234F1Z");
export const VENDOR_MH_GSTIN = withCheck("27AAACR5055K1Z");
export const VENDOR_KA_GSTIN = withCheck("29AAACI1681G1Z");

export const PERIOD = "2026-10";

export function fixtureSettings(overrides: Record<string, unknown> = {}): AppSettings {
  return settingsSchema.parse({
    ...structuredClone(DEFAULT_SETTINGS),
    profile: {
      ...DEFAULT_SETTINGS.profile,
      name: "Acme Traders",
      address: "1 MG Road, Pune",
      stateCode: "27",
      gstin: SELLER_GSTIN,
    },
    declarations: { ...DEFAULT_SETTINGS.declarations, lutNumber: "AD270326000123X" },
    ...overrides,
  });
}

let lineSeq = 0;
export function ln(
  name: string,
  hsnSac: string,
  quantity: string,
  unitPrice: string,
  gstRate: string,
  unit = "pcs",
  extra: Record<string, unknown> = {},
) {
  lineSeq += 1;
  return {
    id: `l${lineSeq}`,
    name,
    hsnSac,
    quantity,
    unitPrice,
    gstRate,
    unit,
    itemType: hsnSac.startsWith("99") ? "services" : "goods",
    ...extra,
  };
}

export function mkInvoice(input: Record<string, unknown>): Invoice {
  const settings = fixtureSettings();
  return invoiceSchema.parse({
    docType: "tax_invoice",
    invoiceDate: "2026-10-05",
    currency: "INR",
    seller: settings.profile,
    roundOff: false,
    issuedAt: "2026-10-05T10:00:00.000Z",
    ...input,
    customer: { country: "India", ...(input.customer as object) },
  });
}

const unregistered = (stateCode: string, extra: Record<string, unknown> = {}) => ({
  name: "Walk-in Customer",
  billingAddress: "Somewhere",
  stateCode,
  ...extra,
});

export function fixtureInvoices(): Invoice[] {
  return [
    // 1. B2B intra: 10×1000 @18 + 1×5000 @18 → taxable 15000, CGST 1350, SGST 1350, value 17700.
    mkInvoice({
      id: "inv-b2b-intra",
      number: "INV/26-27/001",
      invoiceDate: "2026-10-01",
      customer: { company: "Mumbai Retail Pvt Ltd", gstin: B2B_MH_GSTIN, stateCode: "27" },
      lines: [
        ln("Laptop bag", "42021290", "10", "1000", "18"),
        ln("Installation", "998314", "1", "5000", "18", "job"),
      ],
    }),
    // 2. B2B inter: 2×25000 @5 → taxable 50000, IGST 2500, value 52500.
    mkInvoice({
      id: "inv-b2b-inter",
      number: "INV/26-27/002",
      invoiceDate: "2026-10-02",
      customer: { company: "Bengaluru Textiles", gstin: B2B_KA_GSTIN, stateCode: "29" },
      lines: [ln("Cotton T-shirts lot", "61091000", "2", "25000", "5", "box")],
    }),
    // 3. B2B reverse charge (GTA): 1×10000 @5 intra → CGST 250, SGST 250.
    mkInvoice({
      id: "inv-b2b-rcm",
      number: "INV/26-27/003",
      invoiceDate: "2026-10-03",
      reverseCharge: true,
      customer: { company: "Mumbai Retail Pvt Ltd", gstin: B2B_MH_GSTIN, stateCode: "27" },
      lines: [ln("Goods transport", "996511", "1", "10000", "5", "job")],
    }),
    // 4. SEZ without payment (LUT): 1×200000 @18, no tax → B2B SEWOP, taxable 200000.
    mkInvoice({
      id: "inv-sez-wop",
      number: "INV/26-27/004",
      invoiceDate: "2026-10-04",
      sez: { enabled: true, withPayment: false },
      supplyNature: "zero_rated",
      customer: { company: "Gujarat SEZ Unit", gstin: SEZ_GJ_GSTIN, stateCode: "24" },
      lines: [ln("Servers", "84714190", "1", "200000", "18", "nos")],
    }),
    // 5. B2CL: unregistered Karnataka, 1×150000 @18 → IGST 27000, value 177000 (> 1 lakh).
    mkInvoice({
      id: "inv-b2cl",
      number: "INV/26-27/005",
      invoiceDate: "2026-10-06",
      customer: unregistered("29", { name: "Ravi Kumar" }),
      lines: [ln("Workstation", "84714190", "1", "150000", "18", "nos")],
    }),
    // 6. B2CS intra: 2×500 @18 → taxable 1000, CGST 90, SGST 90.
    mkInvoice({
      id: "inv-b2cs-intra",
      number: "INV/26-27/006",
      invoiceDate: "2026-10-07",
      customer: unregistered("27"),
      lines: [ln("T-shirt", "61091000", "2", "500", "18")],
    }),
    // 7. B2CS inter (Delhi): 1×20000 @18 → IGST 3600.
    mkInvoice({
      id: "inv-b2cs-inter",
      number: "INV/26-27/007",
      invoiceDate: "2026-10-08",
      customer: unregistered("07"),
      lines: [ln("Monitor", "85285200", "1", "20000", "18", "nos")],
    }),
    // 8. Cancelled B2CS invoice → DOCS cancelled count only.
    mkInvoice({
      id: "inv-cancelled",
      number: "INV/26-27/008",
      invoiceDate: "2026-10-09",
      status: "cancelled",
      cancelledAt: "2026-10-09T12:00:00.000Z",
      cancelReason: "Wrong customer",
      customer: unregistered("27"),
      lines: [ln("T-shirt", "61091000", "1", "500", "18")],
    }),
    // 9. Single-mode GST, intra B2CS: 1×1001 @5 → GST 50.05 → CGST 25.03 (half-up), SGST 25.02.
    mkInvoice({
      id: "inv-single",
      number: "INV/26-27/009",
      invoiceDate: "2026-10-10",
      gstMode: "single",
      customer: unregistered("27"),
      lines: [ln("Notebook", "48201010", "1", "1001", "5")],
    }),
    // 10. Draft (not issued) → excluded.
    mkInvoice({
      id: "inv-draft",
      number: "INV/26-27/011",
      invoiceDate: "2026-10-11",
      issuedAt: "",
      customer: unregistered("27"),
      lines: [ln("T-shirt", "61091000", "1", "500", "18")],
    }),
    // 11. Proforma → excluded.
    mkInvoice({
      id: "qtn-1",
      docType: "proforma",
      number: "QTN/26-27/001",
      invoiceDate: "2026-10-12",
      customer: unregistered("27"),
      lines: [ln("T-shirt", "61091000", "1", "500", "18")],
    }),
    // 12. Dated outside the period → excluded.
    mkInvoice({
      id: "inv-september",
      number: "INV/26-27/000",
      invoiceDate: "2026-09-30",
      customer: unregistered("27"),
      lines: [ln("T-shirt", "61091000", "1", "500", "18")],
    }),
    // 13. Export WPAY in USD @ 83.25: 10×100 USD @18 IGST → taxable 83250, IGST 14985, value 98235.
    mkInvoice({
      id: "exp-wpay",
      docType: "export",
      number: "EXP/26-27/001",
      invoiceDate: "2026-10-13",
      currency: "USD",
      exportDetails: {
        type: "wpay",
        exchangeRate: "83.25",
        shippingBillNo: "1234567",
        shippingBillDate: "2026-10-14",
        portCode: "INNSA1",
      },
      customer: { company: "Acme Inc", country: "United States", billingAddress: "NY" },
      lines: [ln("Leather bags", "42021290", "10", "100", "18")],
    }),
    // 14. Export WOPAY (LUT) in USD @ 83.5: 1×1234.57 USD service → 103086.595 → 103086.60.
    mkInvoice({
      id: "exp-wopay",
      docType: "export",
      number: "EXP/26-27/002",
      invoiceDate: "2026-10-14",
      currency: "USD",
      exportDetails: { type: "wopay", exchangeRate: "83.5" },
      customer: { company: "Globex Ltd", country: "United Kingdom", billingAddress: "London" },
      lines: [ln("Software consulting", "998314", "1", "1234.57", "18", "hrs")],
    }),
    // 15. Bill of supply, exempt, unregistered intra: 3×1000 → exempt INTRAB2C 3000.
    mkInvoice({
      id: "bos-exempt",
      docType: "bill_of_supply",
      number: "BOS/26-27/001",
      invoiceDate: "2026-10-15",
      supplyNature: "exempt",
      customer: unregistered("27"),
      lines: [ln("Fresh milk", "0401", "3", "1000", "0", "ltr")],
    }),
    // 16. Nil-rated to a registered Karnataka customer: 1×4000 @0 → nil INTRB2B 4000.
    mkInvoice({
      id: "inv-nil-b2b",
      number: "INV/26-27/010",
      invoiceDate: "2026-10-16",
      supplyNature: "nil",
      customer: { company: "KA Grains", gstin: NIL_KA_GSTIN, stateCode: "29" },
      lines: [ln("Rice (unbranded)", "1006", "40", "100", "0", "kg")],
    }),
    // 17. Credit note against #2 (B2B inter) → CDNR C: 1×25000 @5 → IGST 1250, value 26250.
    mkInvoice({
      id: "cn-b2b",
      docType: "credit_note",
      number: "CN/26-27/001",
      invoiceDate: "2026-10-20",
      note: {
        reason: "sales_return",
        originalInvoiceId: "inv-b2b-inter",
        originalInvoiceNumber: "INV/26-27/002",
        originalInvoiceDate: "2026-10-02",
      },
      customer: { company: "Bengaluru Textiles", gstin: B2B_KA_GSTIN, stateCode: "29" },
      lines: [ln("Cotton T-shirts lot", "61091000", "1", "25000", "5", "box")],
    }),
    // 18. Credit note against #5 (B2CL) → CDNUR B2CL: 1×10000 @18 → IGST 1800, value 11800.
    mkInvoice({
      id: "cn-b2cl",
      docType: "credit_note",
      number: "CN/26-27/002",
      invoiceDate: "2026-10-21",
      note: {
        reason: "post_sale_discount",
        originalInvoiceId: "inv-b2cl",
        originalInvoiceNumber: "INV/26-27/005",
        originalInvoiceDate: "2026-10-06",
      },
      customer: unregistered("29", { name: "Ravi Kumar" }),
      lines: [ln("Discount on workstation", "84714190", "1", "10000", "18", "nos")],
    }),
    // 19. Credit note against #6 (B2CS) → nets into B2CS 27/18%: 1×200 → −200, CGST −18, SGST −18.
    mkInvoice({
      id: "cn-b2cs",
      docType: "credit_note",
      number: "CN/26-27/003",
      invoiceDate: "2026-10-22",
      note: {
        reason: "sales_return",
        originalInvoiceId: "inv-b2cs-intra",
        originalInvoiceNumber: "INV/26-27/006",
        originalInvoiceDate: "2026-10-07",
      },
      customer: unregistered("27"),
      lines: [ln("T-shirt", "61091000", "1", "200", "18")],
    }),
    // 20. Debit note against #1 (B2B intra) → CDNR D: 1×1000 @18 → CGST 90, SGST 90, value 1180.
    mkInvoice({
      id: "dn-b2b",
      docType: "debit_note",
      number: "DN/26-27/001",
      invoiceDate: "2026-10-23",
      note: {
        reason: "correction_in_invoice",
        originalInvoiceId: "inv-b2b-intra",
        originalInvoiceNumber: "INV/26-27/001",
        originalInvoiceDate: "2026-10-01",
      },
      customer: { company: "Mumbai Retail Pvt Ltd", gstin: B2B_MH_GSTIN, stateCode: "27" },
      lines: [ln("Freight charged short", "42021290", "1", "1000", "18")],
    }),
  ];
}

export function mkExpense(input: Record<string, unknown>): Expense {
  return expenseSchema.parse({ date: "2026-10-10", ...input });
}

export function fixtureExpenses(): Expense[] {
  return [
    // Rent: 50000 + 18% intra, eligible → 4A(5) CGST 4500, SGST 4500.
    mkExpense({
      id: "exp-rent",
      category: "Rent",
      vendorGstin: VENDOR_MH_GSTIN,
      invoiceNo: "R-10",
      amount: "50000",
      amountIncludesGst: false,
      gstRate: "18",
      gstMode: "intra",
      itcEligible: true,
      itcType: "input_services",
    }),
    // Purchase from Karnataka: 10000 + 18% inter, eligible → 4A(5) IGST 1800.
    mkExpense({
      id: "exp-purchase",
      category: "Purchases for resale",
      vendorGstin: VENDOR_KA_GSTIN,
      invoiceNo: "KA-77",
      amount: "10000",
      amountIncludesGst: false,
      gstRate: "18",
      gstMode: "inter",
      itcEligible: true,
      itcType: "inputs",
    }),
    // Legal fees under reverse charge: 20000 + 18% intra → 3.1(d) and 4A(3) CGST 1800, SGST 1800.
    mkExpense({
      id: "exp-rcm",
      category: "Professional fees",
      vendorName: "Advocate",
      amount: "20000",
      amountIncludesGst: false,
      gstRate: "18",
      gstMode: "intra",
      reverseCharge: true,
      itcEligible: true,
      itcType: "input_services",
    }),
    // Food: 2360 incl. 18% intra, ineligible → tax 360 → 4B(2) CGST 180, SGST 180.
    mkExpense({
      id: "exp-food",
      category: "Food & entertainment",
      amount: "2360",
      amountIncludesGst: true,
      gstRate: "18",
      gstMode: "intra",
      itcEligible: false,
      itcType: "ineligible",
    }),
    // Salaries: no GST.
    mkExpense({ id: "exp-salary", category: "Salaries & wages", amount: "80000" }),
    // Outside the period.
    mkExpense({
      id: "exp-november",
      date: "2026-11-01",
      category: "Rent",
      vendorGstin: VENDOR_MH_GSTIN,
      invoiceNo: "R-11",
      amount: "50000",
      amountIncludesGst: false,
      gstRate: "18",
      gstMode: "intra",
      itcEligible: true,
    }),
  ];
}
