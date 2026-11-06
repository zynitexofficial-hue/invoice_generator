/**
 * THE one seam for "money received from customers".
 *
 * Today receipts come from the single payment recorded on each invoice
 * (`invoice.payment.amountReceived` on `invoice.payment.date`). When the
 * payment ledger (Feature A) lands, the integrator re-points
 * `cashInFromInvoices` (and only this function) at the ledger; the cash-flow
 * report only depends on the `CashInEntry` shape below.
 *
 * Amounts are INR. Receipts are taken from the same normalized invoice facts
 * as the receivables ageing (total − balance due), so cash in always agrees
 * with what receivables treat as collected.
 */
import { invoiceFacts } from "./base";
import { Dec, toDec } from "@/lib/money";
import type { Invoice } from "@/lib/schema";

export interface CashInEntry {
  /** Invoice id (or ledger payment id later). */
  id: string;
  invoiceId: string;
  /** Date the money was received (ISO). */
  date: string;
  /** INR, 2 dp, positive. */
  amount: string;
  invoiceNumber: string;
  customerName: string;
}

export function cashInFromInvoices(
  invoices: readonly Invoice[],
  sellerState: string,
): CashInEntry[] {
  const out: CashInEntry[] = [];
  for (const inv of invoices) {
    const r = invoiceFacts(inv, sellerState);
    if (!("fact" in r) || r.fact.kind !== "sale") continue;
    const received: Dec = toDec(r.fact.total).minus(toDec(r.fact.balanceDue));
    if (received.lessThanOrEqualTo(0)) continue;
    out.push({
      id: inv.id,
      invoiceId: inv.id,
      date: inv.payment.date || inv.invoiceDate,
      amount: received.toFixed(2),
      invoiceNumber: r.fact.number,
      customerName: r.fact.customerName,
    });
  }
  return out;
}
