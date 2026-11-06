/**
 * Payment ledger rules (feature A). Pure and deterministic; money is Dec.
 *
 * Model
 *  - `payments` rows are the source of truth once an invoice has any ledger row.
 *  - `Invoice.payment.amountReceived` is kept equal to the invoice's net ledger
 *    total (see syncInvoiceFromLedger in src/db/payments.ts), so the PDF, the
 *    receivables engine and the History status keep working unchanged.
 *  - An invoice with no ledger rows but a legacy `amountReceived` is treated as
 *    having one *opening payment* (virtual until the user touches the ledger,
 *    then stored under the deterministic id `opening-<invoiceId>`). Nothing is
 *    lost and migrating twice is a no-op.
 *  - Rows with `invoiceId` "" are unallocated advances (or refunds of them).
 *  - kind "payment"/"advance" = money in; "refund" = money out.
 */
import { DOC_TYPE_META } from "@/lib/documents";
import { computeTotals, isIssued } from "@/lib/invoice-calc";
import { Dec, ZERO, roundTo, toDec } from "@/lib/money";
import type { Invoice, PaymentEntry } from "@/lib/schema";

const ONE = new Dec(1);

export const OPENING_PREFIX = "opening-";

export const openingPaymentId = (invoiceId: string) => `${OPENING_PREFIX}${invoiceId}`;
export const isOpeningPayment = (p: Pick<PaymentEntry, "id">) => p.id.startsWith(OPENING_PREFIX);

/** +1 for money received, −1 for a refund. */
export const paymentSign = (p: Pick<PaymentEntry, "kind">): 1 | -1 =>
  p.kind === "refund" ? -1 : 1;

/** Signed amount in the row's own currency. */
export const signedAmount = (p: Pick<PaymentEntry, "kind" | "amount">): Dec =>
  toDec(p.amount).times(paymentSign(p));

const dp = (currency: string) => (currency === "JPY" || currency === "KRW" ? 0 : 2);

/** Net money held against an invoice (payments − refunds), never below zero. */
export function netReceived(rows: PaymentEntry[]): Dec {
  const net = rows.reduce((acc, r) => acc.plus(signedAmount(r)), ZERO);
  return net.isNegative() ? ZERO : net;
}

/** The opening payment for a legacy invoice, or null when nothing was recorded. */
export function openingEntry(invoice: Invoice, nowISO = ""): PaymentEntry | null {
  const amount = toDec(invoice.payment.amountReceived);
  if (!DOC_TYPE_META[invoice.docType].hasPayment || amount.lessThanOrEqualTo(0)) return null;
  return {
    id: openingPaymentId(invoice.id),
    schemaVersion: 1,
    kind: "payment",
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    customerId: invoice.customer.customerId || "",
    customerName: (invoice.customer.company || invoice.customer.name).trim(),
    date: invoice.payment.date || invoice.invoiceDate,
    amount: amount.toString(),
    currency: "",
    exchangeRate: "",
    mode: invoice.payment.mode,
    reference: "",
    receiptNo: "",
    splitFromId: "",
    notes: ["Recorded before the payment ledger", invoice.payment.note].filter(Boolean).join(" · "),
    createdAt: nowISO,
    updatedAt: nowISO,
  };
}

/**
 * Payments that count for an invoice: its stored ledger rows, or the virtual
 * opening payment when it has none. Oldest first (ties: money in before refunds).
 */
export function effectivePayments(invoice: Invoice, rows: PaymentEntry[]): PaymentEntry[] {
  const own = rows.filter((r) => r.invoiceId === invoice.id);
  const list = own.length ? own : [openingEntry(invoice, invoice.updatedAt)].filter(isEntry);
  return list.slice().sort(byDate);
}

const isEntry = (x: PaymentEntry | null): x is PaymentEntry => x !== null;

export function byDate(a: PaymentEntry, b: PaymentEntry): number {
  return (
    a.date.localeCompare(b.date) ||
    paymentSign(b) - paymentSign(a) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

export type LedgerStatus = "unpaid" | "partial" | "paid";

export interface InvoiceLedgerView {
  payments: PaymentEntry[];
  /** Net received, capped at the total (what the invoice shows as paid). */
  received: string;
  total: string;
  balance: string;
  status: LedgerStatus;
  /** Net money held beyond the total (an overpayment still sitting on the invoice). */
  overpaid: string;
  /** True when the invoice has no stored ledger rows (legacy or untouched). */
  legacy: boolean;
}

/** Paid / balance / status of an invoice from its ledger. `total` is in the invoice currency. */
export function invoiceLedgerView(invoice: Invoice, rows: PaymentEntry[]): InvoiceLedgerView {
  const payments = effectivePayments(invoice, rows);
  const total = toDec(computeTotals(invoice).grandTotal);
  const net = netReceived(payments);
  const applied = net.greaterThan(total) ? total : net;
  const balance = total.minus(applied);
  const precision = dp(invoice.currency);
  const status: LedgerStatus =
    applied.isZero() || total.isZero() ? "unpaid" : balance.isZero() ? "paid" : "partial";
  return {
    payments,
    received: roundTo(applied, precision).toFixed(precision),
    total: roundTo(total, precision).toFixed(precision),
    balance: roundTo(balance, precision).toFixed(precision),
    status,
    overpaid: roundTo(net.greaterThan(total) ? net.minus(total) : ZERO, precision).toFixed(
      precision,
    ),
    legacy: !rows.some((r) => r.invoiceId === invoice.id),
  };
}

export interface AllocationPlan {
  /** Part that settles the invoice. */
  applied: string;
  /** Part above the balance (spec B13): never clamped silently. */
  excess: string;
  /** Balance before this payment. */
  balanceBefore: string;
}

/** Split a new payment into the part the invoice can take and the excess. */
export function planAllocation(args: {
  total: string;
  received: string;
  amount: string;
  currency?: string;
}): AllocationPlan {
  const precision = dp(args.currency ?? "INR");
  const balance = Dec.max(toDec(args.total).minus(toDec(args.received)), ZERO);
  const amount = Dec.max(toDec(args.amount), ZERO);
  const applied = Dec.min(amount, balance);
  const fmt = (v: Dec) => roundTo(v, precision).toFixed(precision);
  return { applied: fmt(applied), excess: fmt(amount.minus(applied)), balanceBefore: fmt(balance) };
}

/** Next receipt number, e.g. "RCT-0007", one past the highest number with this prefix. */
export function nextReceiptNo(prefix: string, rows: Pick<PaymentEntry, "receiptNo">[]): string {
  const clean = prefix.trim() || "RCT";
  const re = new RegExp(`^${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  let max = 0;
  for (const r of rows) {
    const m = re.exec(r.receiptNo);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${clean}-${String(max + 1).padStart(4, "0")}`;
}

/** Rows grouped by invoice id ("" = unallocated). */
export function groupByInvoice(rows: PaymentEntry[]): Map<string, PaymentEntry[]> {
  const map = new Map<string, PaymentEntry[]>();
  for (const r of rows) {
    const list = map.get(r.invoiceId);
    if (list) list.push(r);
    else map.set(r.invoiceId, [r]);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Events in INR (statements and collection analytics)                 */
/* ------------------------------------------------------------------ */

export interface PaymentEvent {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  /** Same key the analytics facts use for the customer. */
  customerKey: string;
  customerId: string;
  customerName: string;
  date: string;
  kind: PaymentEntry["kind"];
  /** INR, unsigned. */
  amount: string;
  /** +1 money in, −1 refund. */
  sign: 1 | -1;
  mode: string;
  reference: string;
  receiptNo: string;
  notes: string;
  /** Recorded before the payment ledger existed. */
  opening: boolean;
  allocated: boolean;
}

/** Customer key used for payments that are not tied to an invoice. */
export function looseCustomerKey(p: Pick<PaymentEntry, "customerId" | "customerName">): string {
  const name = p.customerName.trim().toLowerCase();
  return p.customerId || (name ? `name:${name}` : "unknown");
}

/**
 * Every payment as an INR event: stored ledger rows plus the virtual opening
 * payment of legacy invoices (issued, active, non-quotation only).
 * `keyOf` gives an invoice's customer key (analytics' customerIdentity).
 */
export function buildPaymentEvents(
  invoices: Invoice[],
  ledger: PaymentEntry[],
  keyOf: (invoice: Invoice) => string,
): PaymentEvent[] {
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const withRows = new Set(ledger.filter((r) => r.invoiceId).map((r) => r.invoiceId));
  const entries: { entry: PaymentEntry; invoice?: Invoice }[] = ledger.map((entry) => ({
    entry,
    invoice: byId.get(entry.invoiceId),
  }));
  for (const inv of invoices) {
    if (withRows.has(inv.id) || inv.docType === "proforma") continue;
    if (inv.status === "cancelled" || !isIssued(inv) || !inv.invoiceDate) continue;
    const opening = openingEntry(inv, inv.updatedAt);
    if (opening) entries.push({ entry: opening, invoice: inv });
  }
  const events: PaymentEvent[] = [];
  for (const { entry, invoice } of entries) {
    let rate = ONE;
    if (invoice && invoice.currency !== "INR") {
      rate = toDec(invoice.exportDetails.exchangeRate);
    } else if (!invoice && entry.currency && entry.currency !== "INR") {
      rate = toDec(entry.exchangeRate);
    }
    if (rate.lessThanOrEqualTo(0)) continue;
    events.push({
      id: entry.id,
      invoiceId: entry.invoiceId,
      invoiceNumber: invoice?.number || entry.invoiceNumber,
      customerKey: invoice ? keyOf(invoice) : looseCustomerKey(entry),
      customerId: entry.customerId || invoice?.customer.customerId || "",
      customerName:
        entry.customerName ||
        (invoice ? (invoice.customer.company || invoice.customer.name).trim() : ""),
      date: entry.date,
      kind: entry.kind,
      amount: roundTo(toDec(entry.amount).times(rate), 2).toFixed(2),
      sign: paymentSign(entry),
      mode: entry.mode,
      reference: entry.reference,
      receiptNo: entry.receiptNo,
      notes: entry.notes,
      opening: isOpeningPayment(entry),
      allocated: Boolean(entry.invoiceId),
    });
  }
  return events.sort(
    (a, b) => a.date.localeCompare(b.date) || b.sign - a.sign || a.id.localeCompare(b.id),
  );
}
