import type { Purchase } from "@/lib/schema";
import { defineCrud, type DeepPartial } from "./crud";

/**
 * [D] Purchase bills — owner: feature D.
 * Add a `prepare` that computes `summary` and `paymentStatus` (see
 * expenses.ts / computeExpenseSummary) and payment helpers in this file.
 */

export type PurchaseInput = DeepPartial<Purchase>;

export const purchasesCrud = defineCrud({
  table: "purchases",
  entity: "purchase",
  what: "the purchase bill",
  describe: (p) =>
    `bill ${[p.billNo, p.vendorName, p.billDate].filter(Boolean).join(" · ")}`.trim(),
  auditFields: {
    vendorId: (p) => p.vendorId,
    billNo: (p) => p.billNo,
    billDate: (p) => p.billDate,
    dueDate: (p) => p.dueDate,
    gstMode: (p) => p.gstMode,
    itcEligible: (p) => String(p.itcEligible),
    paymentStatus: (p) => p.paymentStatus,
    "summary.total": (p) => p.summary.total,
  },
});

export const savePurchase = purchasesCrud.save;
export const getPurchase = purchasesCrud.get;
export const deletePurchase = purchasesCrud.remove;
export const listPurchases = purchasesCrud.list;
