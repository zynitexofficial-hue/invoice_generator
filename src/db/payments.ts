import type { PaymentEntry } from "@/lib/schema";
import { defineCrud, type DeepPartial } from "./crud";
import { getDb } from "./db";
import { parseRows, TABLE_SCHEMAS } from "./read";

/**
 * [A] Payment ledger — owner: feature A.
 * Extend this file with allocation, receipt-number and statement helpers.
 */

export type PaymentInput = DeepPartial<PaymentEntry>;

export const paymentsCrud = defineCrud({
  table: "payments",
  entity: "payment",
  what: "the payment",
  describe: (p) =>
    `${p.kind} ${[p.amount, p.invoiceNumber || p.customerName, p.date].filter(Boolean).join(" · ")}`,
  auditFields: {
    kind: (p) => p.kind,
    invoiceId: (p) => p.invoiceId,
    date: (p) => p.date,
    amount: (p) => p.amount,
    mode: (p) => p.mode,
    reference: (p) => p.reference,
  },
});

export const savePayment = paymentsCrud.save;
export const getPayment = paymentsCrud.get;
export const deletePayment = paymentsCrud.remove;
export const listPayments = paymentsCrud.list;

/** Valid payments recorded against one invoice, oldest first. */
export async function listPaymentsForInvoice(invoiceId: string): Promise<PaymentEntry[]> {
  const rows = await getDb().payments.where("invoiceId").equals(invoiceId).sortBy("date");
  return parseRows(rows, TABLE_SCHEMAS.payments).rows;
}
