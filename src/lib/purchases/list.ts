/** Pure helpers for the bills list: filtering, totals and CSV rows. */
import type { CsvCell } from "@/lib/csv";
import { ZERO, toDec } from "@/lib/money";
import type { Purchase, PurchasePaymentStatus } from "@/lib/schema";
import { purchaseGst, purchaseItc } from "./calc";

export interface BillFilters {
  /** Inclusive bounds on the bill date; "" = open-ended. */
  period: { start: string; end: string };
  /** "" = all vendors. */
  vendorKey: string;
  status: PurchasePaymentStatus | "all";
}

export const BILL_STATUS_LABELS: Record<PurchasePaymentStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partly paid",
  paid: "Paid",
};

export const billVendorKey = (p: Pick<Purchase, "vendorId" | "vendorName">) =>
  p.vendorId || `name:${p.vendorName.trim().toLowerCase()}`;

export function filterBills(bills: readonly Purchase[], f: BillFilters): Purchase[] {
  return bills.filter((p) => {
    if (f.period.start && (!p.billDate || p.billDate < f.period.start)) return false;
    if (f.period.end && (!p.billDate || p.billDate > f.period.end)) return false;
    if (f.vendorKey && billVendorKey(p) !== f.vendorKey) return false;
    if (f.status !== "all" && p.paymentStatus !== f.status) return false;
    return true;
  });
}

export interface BillTotals {
  count: number;
  taxable: string;
  gst: string;
  total: string;
  paid: string;
  balance: string;
  itc: string;
}

export function billTotals(bills: readonly Purchase[]): BillTotals {
  let taxable = ZERO;
  let gst = ZERO;
  let total = ZERO;
  let paid = ZERO;
  let balance = ZERO;
  let itc = ZERO;
  for (const p of bills) {
    taxable = taxable.plus(p.summary.taxable);
    gst = gst.plus(purchaseGst(p));
    total = total.plus(p.summary.total);
    paid = paid.plus(p.summary.paid);
    balance = balance.plus(p.summary.balance);
    itc = itc.plus(purchaseItc(p).total);
  }
  const f = (d: typeof ZERO) => d.toFixed(2);
  return {
    count: bills.length,
    taxable: f(taxable),
    gst: f(gst),
    total: f(total),
    paid: f(paid),
    balance: f(balance),
    itc: f(itc),
  };
}

export const BILL_CSV_HEADERS = [
  "Bill date",
  "Bill no.",
  "Vendor",
  "Vendor GSTIN",
  "Due date",
  "Taxable value",
  "CGST",
  "SGST",
  "IGST",
  "Bill total",
  "Reverse charge",
  "ITC claimed",
  "Paid",
  "Balance",
  "Status",
];

export function billCsvRow(p: Purchase): CsvCell[] {
  return [
    p.billDate,
    p.billNo,
    p.vendorName,
    p.vendorGstin,
    p.dueDate,
    p.summary.taxable,
    p.summary.cgst,
    p.summary.sgst,
    p.summary.igst,
    p.summary.total,
    p.reverseCharge ? "Yes" : "No",
    purchaseItc(p).total,
    p.summary.paid,
    p.summary.balance,
    BILL_STATUS_LABELS[p.paymentStatus],
  ];
}

/** Whether a stored payment amount is a positive number (guards the payment form). */
export const isPositiveAmount = (v: string) => toDec(v).greaterThan(0);
