/**
 * Customer statement (spec C4): opening balance, invoices, notes and payments
 * for a date range, with a running balance. Pure; works on analytics facts
 * (INR, issued, active documents) and payment events (INR).
 *
 * Balance = what the customer owes: invoices and debit notes add, credit notes
 * and payments subtract, refunds add back. Unallocated advances therefore
 * reduce the balance, and credit notes reduce it too (the Receivables ageing
 * does not net credit notes, so the statement shows the difference separately).
 */
import { Dec, ZERO, roundTo, toDec } from "@/lib/money";
import type { Customer } from "@/lib/schema";
import type { InvoiceFact } from "@/lib/analytics/base";
import type { PaymentEvent } from "./ledger";

export type StatementLineKind =
  "invoice" | "debit_note" | "credit_note" | "payment" | "advance" | "refund";

export interface StatementLine {
  date: string;
  kind: StatementLineKind;
  /** Document number, or the receipt number / reference for payments. */
  ref: string;
  description: string;
  /** Amount that increases the balance ("" when none). */
  debit: string;
  /** Amount that decreases the balance ("" when none). */
  credit: string;
  /** Running balance after this line. */
  balance: string;
  invoiceId: string;
  /** Payment id for receipt printing ("" for documents and opening payments). */
  paymentId: string;
}

export interface StatementTotals {
  invoiced: string;
  debitNotes: string;
  creditNotes: string;
  received: string;
  refunded: string;
}

export interface Statement {
  from: string;
  to: string;
  opening: string;
  lines: StatementLine[];
  totals: StatementTotals;
  closing: string;
  /** Still due on the customer's invoices as of `to` (the Receivables view). */
  invoicesDue: string;
  /** closing − invoicesDue: credit notes, advances and other adjustments, net. */
  adjustments: string;
}

export interface CustomerMatch {
  keys: Set<string>;
  ids: Set<string>;
  gstin: string;
}

/** Every identity analytics might know this customer by. */
export function customerMatch(
  c: Pick<Customer, "id" | "gstin" | "name" | "company">,
): CustomerMatch {
  const keys = new Set<string>([c.id]);
  const gstin = c.gstin.trim().toUpperCase();
  if (gstin) keys.add(gstin);
  for (const n of [c.company, c.name]) {
    const t = n.trim().toLowerCase();
    if (t) keys.add(`name:${t}`);
  }
  return { keys, ids: new Set([c.id]), gstin };
}

const d2 = (v: Dec) => roundTo(v, 2).toFixed(2);

export const KIND_LABEL: Record<StatementLineKind, string> = {
  invoice: "Invoice",
  debit_note: "Debit note",
  credit_note: "Credit note",
  payment: "Payment",
  advance: "Advance",
  refund: "Refund",
};

const KIND_ORDER: Record<StatementLineKind, number> = {
  invoice: 0,
  debit_note: 1,
  credit_note: 2,
  payment: 3,
  advance: 3,
  refund: 4,
};

interface Raw {
  date: string;
  kind: StatementLineKind;
  ref: string;
  description: string;
  /** Signed effect on the balance. */
  delta: Dec;
  invoiceId: string;
  paymentId: string;
  order: string;
}

function factRaw(f: InvoiceFact): Raw {
  const kind: StatementLineKind =
    f.kind === "credit_note" ? "credit_note" : f.kind === "debit_note" ? "debit_note" : "invoice";
  const description =
    kind === "invoice"
      ? f.dueDate
        ? `Invoice, due ${f.dueDate}`
        : "Invoice"
      : `${kind === "credit_note" ? "Credit note" : "Debit note"}${
          f.originalInvoiceNumber ? ` against ${f.originalInvoiceNumber}` : ""
        }${f.noteReason ? `, ${f.noteReason}` : ""}`;
  return {
    date: f.date,
    kind,
    ref: f.number,
    description,
    delta: toDec(f.total).times(f.sign),
    invoiceId: f.id,
    paymentId: "",
    order: f.number,
  };
}

function eventRaw(e: PaymentEvent): Raw {
  const kind: StatementLineKind =
    e.kind === "refund" ? "refund" : e.allocated ? "payment" : "advance";
  const bits: string[] = [];
  if (kind === "refund") bits.push("Refund paid");
  else if (kind === "advance") bits.push("Advance received, not yet used");
  else bits.push(`Payment received${e.invoiceNumber ? ` for ${e.invoiceNumber}` : ""}`);
  if (e.mode) bits.push(e.mode.replace(/_/g, " "));
  if (e.reference) bits.push(`ref ${e.reference}`);
  return {
    date: e.date,
    kind,
    ref: e.receiptNo || e.reference,
    description: bits.join(", "),
    delta: toDec(e.amount).times(e.sign).negated(),
    invoiceId: e.invoiceId,
    paymentId: e.opening ? "" : e.id,
    order: e.id,
  };
}

const isMine = (m: CustomerMatch, f: InvoiceFact) =>
  m.keys.has(f.customerKey) || Boolean(m.gstin && f.customerGstin === m.gstin);

export function buildStatement(args: {
  facts: InvoiceFact[];
  events: PaymentEvent[];
  match: CustomerMatch;
  /** Inclusive start ("" = from the beginning). */
  from: string;
  /** Inclusive end ("" = no end). */
  to: string;
}): Statement {
  const { match, from, to } = args;
  const raws: Raw[] = [];
  for (const f of args.facts) if (isMine(match, f)) raws.push(factRaw(f));
  for (const e of args.events) {
    if (match.keys.has(e.customerKey) || (e.customerId && match.ids.has(e.customerId)))
      raws.push(eventRaw(e));
  }
  raws.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.order.localeCompare(b.order),
  );

  let opening = ZERO;
  const inRange: Raw[] = [];
  for (const r of raws) {
    if (!r.date) continue;
    if (from && r.date < from) opening = opening.plus(r.delta);
    else if (!to || r.date <= to) inRange.push(r);
  }

  let running = opening;
  const sums = {
    invoiced: ZERO,
    debitNotes: ZERO,
    creditNotes: ZERO,
    received: ZERO,
    refunded: ZERO,
  };
  const lines: StatementLine[] = inRange.map((r) => {
    running = running.plus(r.delta);
    const abs = r.delta.abs();
    if (r.kind === "invoice") sums.invoiced = sums.invoiced.plus(abs);
    else if (r.kind === "debit_note") sums.debitNotes = sums.debitNotes.plus(abs);
    else if (r.kind === "credit_note") sums.creditNotes = sums.creditNotes.plus(abs);
    else if (r.kind === "refund") sums.refunded = sums.refunded.plus(abs);
    else sums.received = sums.received.plus(abs);
    const up = r.delta.greaterThan(0);
    return {
      date: r.date,
      kind: r.kind,
      ref: r.ref,
      description: r.description,
      debit: up ? d2(abs) : "",
      credit: up ? "" : d2(abs),
      balance: d2(running),
      invoiceId: r.invoiceId,
      paymentId: r.paymentId,
    };
  });

  const invoicesDue = invoicesStillDue(args.facts, args.events, match, to);
  return {
    from,
    to,
    opening: d2(opening),
    lines,
    totals: {
      invoiced: d2(sums.invoiced),
      debitNotes: d2(sums.debitNotes),
      creditNotes: d2(sums.creditNotes),
      received: d2(sums.received),
      refunded: d2(sums.refunded),
    },
    closing: d2(running),
    invoicesDue: d2(invoicesDue),
    adjustments: d2(running.minus(invoicesDue)),
  };
}

/** Σ (invoice total − payments allocated up to `to`), never below 0 per invoice. */
function invoicesStillDue(
  facts: InvoiceFact[],
  events: PaymentEvent[],
  match: CustomerMatch,
  to: string,
): Dec {
  const paid = new Map<string, Dec>();
  for (const e of events) {
    if (!e.invoiceId || (to && e.date > to)) continue;
    paid.set(e.invoiceId, (paid.get(e.invoiceId) ?? ZERO).plus(toDec(e.amount).times(e.sign)));
  }
  let due = ZERO;
  for (const f of facts) {
    if (f.kind !== "sale" || !isMine(match, f) || (to && f.date > to)) continue;
    const left = toDec(f.total).minus(paid.get(f.id) ?? ZERO);
    if (left.greaterThan(0)) due = due.plus(left);
  }
  return due;
}

/** Flat rows for CSV export. */
export function statementCsvRows(s: Statement): { headers: string[]; rows: string[][] } {
  const headers = ["Date", "Type", "Reference", "Details", "Debit", "Credit", "Balance"];
  const rows = [
    ["", "Opening balance", "", "", "", "", s.opening],
    ...s.lines.map((l) => [
      l.date,
      KIND_LABEL[l.kind],
      l.ref,
      l.description,
      l.debit,
      l.credit,
      l.balance,
    ]),
    ["", "Closing balance", "", "", "", "", s.closing],
  ];
  return { headers, rows };
}
