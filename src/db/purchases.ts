import { newId } from "@/lib/invoice-factory";
import { preparePurchase } from "@/lib/purchases/calc";
import type { Purchase, PurchasePayment } from "@/lib/schema";
import { deleteAttachmentsFor } from "./attachments";
import { defineCrud, type DeepPartial } from "./crud";

/**
 * [D] Purchase bills — owner: feature D.
 * `summary`, `paymentStatus` and the ITC flag are recomputed on every save
 * (see preparePurchase in src/lib/purchases/calc.ts).
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
    reverseCharge: (p) => String(p.reverseCharge),
    itcEligible: (p) => String(p.itcEligible),
    paymentStatus: (p) => p.paymentStatus,
    "summary.total": (p) => p.summary.total,
    "summary.paid": (p) => p.summary.paid,
  },
  prepare: preparePurchase,
});

export const savePurchase = purchasesCrud.save;
export const getPurchase = purchasesCrud.get;
export const listPurchases = purchasesCrud.list;

/** Delete a bill together with its attached files. */
export async function deletePurchase(id: string): Promise<void> {
  await purchasesCrud.remove(id);
  await deleteAttachmentsFor("purchase", id);
}

export type NewPurchasePayment = Partial<Omit<PurchasePayment, "id">> &
  Pick<PurchasePayment, "date" | "amount">;

/** Record a payment against a bill; status and balance are recomputed. */
export async function addPurchasePayment(
  purchaseId: string,
  payment: NewPurchasePayment,
): Promise<Purchase> {
  const bill = await getPurchase(purchaseId);
  if (!bill) throw new Error("This bill no longer exists.");
  return savePurchase({
    ...bill,
    payments: [...bill.payments, { mode: "", reference: "", notes: "", ...payment, id: newId() }],
  });
}

/** Remove one payment from a bill. */
export async function removePurchasePayment(
  purchaseId: string,
  paymentId: string,
): Promise<Purchase> {
  const bill = await getPurchase(purchaseId);
  if (!bill) throw new Error("This bill no longer exists.");
  return savePurchase({ ...bill, payments: bill.payments.filter((p) => p.id !== paymentId) });
}

/** Bills of one vendor (by id), newest first. */
export async function listPurchasesForVendor(vendorId: string): Promise<Purchase[]> {
  const { rows } = await purchasesCrud.list();
  return rows
    .filter((p) => p.vendorId === vendorId)
    .sort((a, b) => b.billDate.localeCompare(a.billDate));
}
