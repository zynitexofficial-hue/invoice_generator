import { currencyPrecision } from "@/lib/currency";
import { DOC_TYPE_META } from "@/lib/documents";
import { Dec, ZERO, roundTo, toDec } from "@/lib/money";
import {
  byDate,
  groupByInvoice,
  invoiceLedgerView,
  netReceived,
  nextReceiptNo,
  openingEntry,
  planAllocation,
  type AllocationPlan,
} from "@/lib/payments/ledger";
import type { Invoice, PaymentEntry, PaymentMode } from "@/lib/schema";
import { defineCrud, type DeepPartial } from "./crud";
import { getDb } from "./db";
import { getInvoice, saveInvoice } from "./invoices";
import { parseRows, TABLE_SCHEMAS } from "./read";
import { loadSettings } from "./settings";

/**
 * [A] Payment ledger — owner: feature A.
 *
 * The ledger (this table) is the source of truth for what an invoice has
 * received. After every change `syncInvoiceFromLedger` writes the net total
 * back to `Invoice.payment.amountReceived` (date/mode of the latest payment),
 * so the PDF, History status, Dashboard and receivables keep working from the
 * invoice alone. Payments are not part of the GST return hash, so syncing
 * never marks a filed period as changed.
 *
 * Migration of the old single "amount received": an invoice with no ledger row
 * and amountReceived > 0 counts as having one opening payment. The first time
 * the ledger is used for that invoice the opening payment is stored under the
 * deterministic id `opening-<invoiceId>` (idempotent), keeping the old date,
 * mode and note. No data is lost; nothing is rewritten until the user acts.
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
export const listPayments = paymentsCrud.list;

/** Thrown for payments the ledger refuses (over the balance, more than held…). */
export class PaymentError extends Error {
  constructor(
    message: string,
    readonly code: "invalid" | "excess" | "refund_too_large" | "not_found",
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

/** Valid payments recorded against one invoice, oldest first. */
export async function listPaymentsForInvoice(invoiceId: string): Promise<PaymentEntry[]> {
  const rows = await getDb().payments.where("invoiceId").equals(invoiceId).toArray();
  return parseRows(rows, TABLE_SCHEMAS.payments).rows.sort(byDate);
}

async function allPaymentRows(): Promise<PaymentEntry[]> {
  return parseRows(await getDb().payments.toArray(), TABLE_SCHEMAS.payments).rows;
}

const precisionOf = (invoice: Invoice) => currencyPrecision(invoice.currency);
const fixed = (v: Dec, dp: number) => roundTo(v, dp).toFixed(dp);

function customerOf(invoice: Invoice) {
  return {
    customerId: invoice.customer.customerId || "",
    customerName: (invoice.customer.company || invoice.customer.name).trim(),
  };
}

/** Store the legacy single payment as the opening ledger row. Idempotent. */
export async function ensureOpeningPayment(invoice: Invoice): Promise<PaymentEntry | null> {
  if ((await listPaymentsForInvoice(invoice.id)).length) return null;
  const opening = openingEntry(invoice);
  if (!opening) return null;
  return paymentsCrud.save({ ...opening, createdAt: invoice.updatedAt || undefined });
}

/**
 * Make the invoice's own payment fields match its ledger. Without ledger rows
 * the invoice is left alone (legacy) unless `force` (the last row was deleted).
 * Returns true when the invoice was rewritten.
 */
export async function syncInvoiceFromLedger(
  invoiceId: string,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  const invoice = await getInvoice(invoiceId);
  if (!invoice || !DOC_TYPE_META[invoice.docType].hasPayment) return false;
  const rows = await listPaymentsForInvoice(invoiceId);
  if (!rows.length && !opts.force) return false;
  const view = invoiceLedgerView(invoice, rows);
  const dp = precisionOf(invoice);
  const received = rows.length ? toDec(view.received) : ZERO; // force + no rows = everything deleted
  const latest = rows.filter((r) => r.kind !== "refund").at(-1);
  const next = {
    amountReceived: received.isZero() ? "" : fixed(received, dp),
    date: received.isZero() ? "" : (latest?.date ?? ""),
    mode: received.isZero() ? ("" as PaymentMode) : (latest?.mode ?? ("" as PaymentMode)),
    note: received.isZero() ? "" : (latest?.reference ?? ""),
  };
  const cur = invoice.payment;
  if (
    toDec(cur.amountReceived).equals(received) &&
    cur.date === next.date &&
    cur.mode === next.mode
  )
    return false;
  await saveInvoice({ ...invoice, payment: next });
  return true;
}

/** Re-sync every invoice that has ledger rows (e.g. after restoring a backup). Returns how many changed. */
export async function repairLedgerSync(): Promise<number> {
  const groups = groupByInvoice(await allPaymentRows());
  let changed = 0;
  for (const id of groups.keys()) {
    if (id && (await syncInvoiceFromLedger(id))) changed++;
  }
  return changed;
}

async function receiptFor(kind: PaymentEntry["kind"], existing?: string): Promise<string> {
  if (existing) return existing;
  if (kind === "refund") return "";
  const settings = await loadSettings();
  return nextReceiptNo(settings.payments.receiptPrefix, await allPaymentRows());
}

export interface RecordPaymentInput {
  invoice: Invoice;
  amount: string;
  date: string;
  mode: PaymentMode;
  reference?: string;
  notes?: string;
  /**
   * What to do with money above the balance. "advance" stores the excess as an
   * unallocated advance for the customer; "reject" throws PaymentError("excess").
   */
  excess: "advance" | "reject";
}

export interface RecordPaymentResult {
  applied?: PaymentEntry;
  advance?: PaymentEntry;
  plan: AllocationPlan;
}

/** Record money received against an invoice (and optionally the excess as an advance). */
export async function recordInvoicePayment(
  input: RecordPaymentInput,
): Promise<RecordPaymentResult> {
  const amount = toDec(input.amount);
  if (amount.lessThanOrEqualTo(0)) throw new PaymentError("Enter an amount above zero.", "invalid");
  const invoice = (await getInvoice(input.invoice.id)) ?? input.invoice;
  if (!DOC_TYPE_META[invoice.docType].hasPayment)
    throw new PaymentError("This document type doesn't take payments.", "invalid");
  await ensureOpeningPayment(invoice);
  const rows = await listPaymentsForInvoice(invoice.id);
  const view = invoiceLedgerView(invoice, rows);
  const dp = precisionOf(invoice);
  const plan = planAllocation({
    total: view.total,
    received: fixed(netReceived(rows), dp),
    amount: fixed(amount, dp),
    currency: invoice.currency,
  });
  const excess = toDec(plan.excess);
  if (excess.greaterThan(0) && input.excess === "reject")
    throw new PaymentError(
      `That is ${plan.excess} more than the balance. Record the excess as an advance or lower the amount.`,
      "excess",
    );

  const who = customerOf(invoice);
  const receiptNo = await receiptFor("payment");
  const base = {
    ...who,
    date: input.date,
    mode: input.mode,
    reference: input.reference ?? "",
    notes: input.notes ?? "",
    receiptNo,
  };
  const result: RecordPaymentResult = { plan };
  if (toDec(plan.applied).greaterThan(0))
    result.applied = await paymentsCrud.save({
      ...base,
      kind: "payment",
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      amount: plan.applied,
      currency: invoice.currency === "INR" ? "" : invoice.currency,
    });
  if (excess.greaterThan(0))
    result.advance = await paymentsCrud.save({
      ...base,
      kind: "advance",
      invoiceId: "",
      invoiceNumber: "",
      amount: plan.excess,
      currency: invoice.currency === "INR" ? "" : invoice.currency,
      exchangeRate: invoice.currency === "INR" ? "" : invoice.exportDetails.exchangeRate,
      notes: [`Excess received on ${invoice.number}`, input.notes].filter(Boolean).join(" · "),
    });
  await syncInvoiceFromLedger(invoice.id);
  return result;
}

export interface RecordAdvanceInput {
  customerId?: string;
  customerName: string;
  amount: string;
  date: string;
  mode: PaymentMode;
  reference?: string;
  notes?: string;
}

/** Money received from a customer before (or without) an invoice. */
export async function recordAdvance(input: RecordAdvanceInput): Promise<PaymentEntry> {
  if (toDec(input.amount).lessThanOrEqualTo(0))
    throw new PaymentError("Enter an amount above zero.", "invalid");
  if (!input.customerId && !input.customerName.trim())
    throw new PaymentError("Choose which customer paid.", "invalid");
  return paymentsCrud.save({
    kind: "advance",
    invoiceId: "",
    customerId: input.customerId ?? "",
    customerName: input.customerName.trim(),
    date: input.date,
    amount: toDec(input.amount).toString(),
    mode: input.mode,
    reference: input.reference ?? "",
    notes: input.notes ?? "",
    receiptNo: await receiptFor("advance"),
  });
}

/** Apply (part of) an advance to an invoice: splits the advance row. */
export async function allocateAdvance(
  advanceId: string,
  invoice: Invoice,
  amount: string,
): Promise<PaymentEntry> {
  const advance = await getPayment(advanceId);
  if (!advance || advance.invoiceId || advance.kind === "refund")
    throw new PaymentError("That advance can no longer be found.", "not_found");
  const fresh = (await getInvoice(invoice.id)) ?? invoice;
  await ensureOpeningPayment(fresh);
  const rows = await listPaymentsForInvoice(fresh.id);
  const dp = precisionOf(fresh);
  const want = toDec(amount);
  if (want.lessThanOrEqualTo(0) || want.greaterThan(toDec(advance.amount)))
    throw new PaymentError("Use an amount between zero and the advance.", "invalid");
  const plan = planAllocation({
    total: invoiceLedgerView(fresh, rows).total,
    received: fixed(netReceived(rows), dp),
    amount: fixed(want, dp),
    currency: fresh.currency,
  });
  if (toDec(plan.excess).greaterThan(0))
    throw new PaymentError(`The invoice only has ${plan.applied} left to pay.`, "excess");
  const remaining = toDec(advance.amount).minus(want);
  const common = {
    customerId: advance.customerId || fresh.customer.customerId || "",
    customerName: advance.customerName || customerOf(fresh).customerName,
    invoiceNumber: fresh.number,
    date: advance.date,
    mode: advance.mode,
    reference: advance.reference,
    receiptNo: advance.receiptNo,
    notes: [advance.notes, "Advance applied"].filter(Boolean).join(" · "),
  };
  let created: PaymentEntry;
  if (remaining.isZero()) {
    created = await paymentsCrud.save({
      ...advance,
      ...common,
      kind: "payment",
      invoiceId: fresh.id,
      amount: advance.amount,
    });
  } else {
    await paymentsCrud.save({ ...advance, amount: remaining.toString() });
    created = await paymentsCrud.save({
      ...common,
      kind: "payment",
      invoiceId: fresh.id,
      amount: want.toString(),
      splitFromId: advance.id,
    });
  }
  await syncInvoiceFromLedger(fresh.id);
  return created;
}

/** Money paid back to a customer: against an invoice's received amount, or out of an advance. */
export async function recordRefund(input: {
  invoice?: Invoice;
  customerId?: string;
  customerName?: string;
  amount: string;
  date: string;
  mode: PaymentMode;
  reference?: string;
  notes?: string;
}): Promise<PaymentEntry> {
  const amount = toDec(input.amount);
  if (amount.lessThanOrEqualTo(0)) throw new PaymentError("Enter an amount above zero.", "invalid");
  const invoice = input.invoice
    ? ((await getInvoice(input.invoice.id)) ?? input.invoice)
    : undefined;
  if (invoice) {
    await ensureOpeningPayment(invoice);
    const held = netReceived(await listPaymentsForInvoice(invoice.id));
    if (amount.greaterThan(held))
      throw new PaymentError(
        `Only ${fixed(held, precisionOf(invoice))} has been received on this invoice.`,
        "refund_too_large",
      );
  } else {
    const rows = (await allPaymentRows()).filter(
      (r) =>
        !r.invoiceId &&
        ((input.customerId && r.customerId === input.customerId) ||
          (!input.customerId && r.customerName === input.customerName)),
    );
    const held = netReceived(rows);
    if (amount.greaterThan(held))
      throw new PaymentError(`Only ${fixed(held, 2)} is held as an advance.`, "refund_too_large");
  }
  const saved = await paymentsCrud.save({
    kind: "refund",
    invoiceId: invoice?.id ?? "",
    invoiceNumber: invoice?.number ?? "",
    ...(invoice
      ? customerOf(invoice)
      : { customerId: input.customerId ?? "", customerName: input.customerName ?? "" }),
    date: input.date,
    amount: amount.toString(),
    currency: invoice && invoice.currency !== "INR" ? invoice.currency : "",
    exchangeRate: invoice && invoice.currency !== "INR" ? invoice.exportDetails.exchangeRate : "",
    mode: input.mode,
    reference: input.reference ?? "",
    notes: input.notes ?? "",
  });
  if (invoice) await syncInvoiceFromLedger(invoice.id);
  return saved;
}

/** Edit a payment's date, amount, mode, reference or notes (invoice allocation is kept). */
export async function updatePayment(
  id: string,
  patch: Partial<Pick<PaymentEntry, "date" | "amount" | "mode" | "reference" | "notes">>,
): Promise<PaymentEntry> {
  const existing = await getPayment(id);
  if (!existing) throw new PaymentError("That payment no longer exists.", "not_found");
  const next = { ...existing, ...patch };
  const amount = toDec(next.amount);
  if (amount.lessThanOrEqualTo(0)) throw new PaymentError("Enter an amount above zero.", "invalid");
  if (existing.invoiceId) {
    const invoice = await getInvoice(existing.invoiceId);
    if (invoice) {
      const rows = (await listPaymentsForInvoice(invoice.id)).map((r) => (r.id === id ? next : r));
      const total = toDec(invoiceLedgerView(invoice, rows).total);
      const net = rows.reduce(
        (a, r) => a.plus(r.kind === "refund" ? toDec(r.amount).negated() : toDec(r.amount)),
        ZERO,
      );
      if (net.greaterThan(total))
        throw new PaymentError(
          `That would be ${fixed(net.minus(total), precisionOf(invoice))} more than the invoice total.`,
          "excess",
        );
      if (net.isNegative())
        throw new PaymentError("Refunds can't exceed what was received.", "refund_too_large");
    }
  }
  const saved = await paymentsCrud.save(next);
  if (existing.invoiceId) await syncInvoiceFromLedger(existing.invoiceId);
  return saved;
}

/** Delete a payment and re-derive the invoice's paid amount and status. */
export async function deletePayment(id: string): Promise<void> {
  const existing = await getPayment(id);
  await paymentsCrud.remove(id);
  if (existing?.invoiceId) await syncInvoiceFromLedger(existing.invoiceId, { force: true });
}

/** Receipt: every row that shares the payment's receipt number (or just the row). */
export async function paymentsForReceipt(payment: PaymentEntry): Promise<PaymentEntry[]> {
  if (!payment.receiptNo) return [payment];
  const rows = (await allPaymentRows()).filter(
    (r) => r.receiptNo === payment.receiptNo && r.kind !== "refund",
  );
  return rows.length ? rows.sort(byDate) : [payment];
}
