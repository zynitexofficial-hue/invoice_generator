/**
 * THE one seam for "money received from customers".
 *
 * `cashInFromLedger` reads the payment ledger: every payment on its own date,
 * refunds as negative entries, and advances not yet applied to an invoice.
 * `cashInFromInvoices` is the older single-"amount received" view, kept for
 * invoices viewed without ledger rows. The cash-flow report only depends on
 * the `CashInEntry` shape below.
 *
 * Amounts are INR. Receipts are taken from the same normalized invoice facts
 * as the receivables ageing (total − balance due), so cash in always agrees
 * with what receivables treat as collected.
 */
import { invoiceFacts } from "./base";
import { Dec, toDec } from "@/lib/money";
import { effectivePayments, signedAmount } from "@/lib/payments/ledger";
import type { Invoice, PaymentEntry } from "@/lib/schema";

export interface CashInEntry {
  /** Invoice id (or ledger payment id later). */
  id: string;
  invoiceId: string;
  /** Date the money was received (ISO). */
  date: string;
  /** INR, 2 dp. Positive for money received, negative for a refund. */
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

/** INR value of a ledger row on an invoice (foreign-currency invoices use their export rate). */
function toInr(amount: Dec, invoice: Invoice): Dec | null {
  if (invoice.currency === "INR") return amount;
  const rate = toDec(invoice.exportDetails.exchangeRate);
  return rate.greaterThan(0) ? amount.times(rate) : null;
}

/**
 * Receipts from the payment ledger. Invoices with no ledger rows count their
 * old "amount received" as one opening payment (see effectivePayments), and
 * advances that are not applied to any invoice count on the day received.
 */
export function cashInFromLedger(
  invoices: readonly Invoice[],
  payments: readonly PaymentEntry[],
  sellerState: string,
): CashInEntry[] {
  const out: CashInEntry[] = [];
  const rows = [...payments];
  for (const inv of invoices) {
    const r = invoiceFacts(inv, sellerState);
    if (!("fact" in r) || r.fact.kind !== "sale") continue;
    for (const p of effectivePayments(inv, rows)) {
      const inr = toInr(signedAmount(p), inv);
      if (!inr || inr.isZero()) continue;
      out.push({
        id: p.id,
        invoiceId: inv.id,
        date: p.date,
        amount: inr.toFixed(2),
        invoiceNumber: r.fact.number,
        customerName: r.fact.customerName,
      });
    }
  }
  for (const p of payments) {
    // Unapplied advances only: rows tied to an invoice were counted above (or the invoice is excluded).
    if (p.invoiceId) continue;
    let inr = signedAmount(p);
    if (p.currency && p.currency !== "INR") {
      const rate = toDec(p.exchangeRate || "1");
      if (!rate.greaterThan(0)) continue;
      inr = inr.times(rate);
    }
    if (inr.isZero()) continue;
    out.push({
      id: p.id,
      invoiceId: "",
      date: p.date,
      amount: inr.toFixed(2),
      invoiceNumber: "Advance",
      customerName: p.customerName,
    });
  }
  return out;
}
