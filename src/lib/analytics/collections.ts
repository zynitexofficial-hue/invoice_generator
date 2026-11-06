/**
 * Collection analytics (feature A): how fast customers pay.
 *
 * Built on the same sale facts as the receivables engine plus the payment
 * events from the ledger (src/lib/payments/ledger.ts), so ageing and totals
 * reconcile with Receivables, the Dashboard and the invoice register.
 * Payments never touch GST return figures; this is a management view only.
 */
import { Dec, ZERO, toDec } from "@/lib/money";
import { periodLabel, shiftPeriod } from "@/lib/period";
import type { PaymentEvent } from "@/lib/payments/ledger";
import { d2, daysBetween, inRange, type AnalyticsData, type DateRange } from "./base";
import { receivablesReport, type ReceivablesReport } from "./receivables";

export interface SettledInvoice {
  id: string;
  number: string;
  customerKey: string;
  customerName: string;
  date: string;
  dueDate: string;
  /** Day the balance reached zero. */
  paidOn: string;
  daysToPay: number;
  /** Days after the due date it was paid (≤ 0 = on time). */
  daysLate: number;
  onTime: boolean;
  total: string;
}

export interface SlowPayer {
  key: string;
  name: string;
  settledCount: number;
  avgDaysToPay: string;
  avgDaysLate: string;
  /** Share of settled invoices paid after the due date (%). */
  lateShare: string;
  outstanding: string;
  overdue: string;
}

export interface CollectionTrendPoint {
  month: string;
  label: string;
  shortLabel: string;
  collected: string;
  billed: string;
}

export interface CollectionsReport {
  range: DateRange;
  asOf: string;
  /** Money received in the period (payments + advances, minus refunds). */
  collected: string;
  moneyIn: string;
  refunds: string;
  /** Part of `collected` that was applied to invoices. */
  collectedOnInvoices: string;
  billed: string;
  /** Collected on invoices ÷ (receivables at the start + billed), %; null when there is nothing to collect. */
  efficiency: string | null;
  settled: SettledInvoice[];
  avgDaysToPay: string | null;
  medianDaysToPay: string | null;
  onTime: { count: number; amount: string };
  late: { count: number; amount: string };
  /** On-time ÷ settled invoices (%); null when none settled. */
  onTimeShare: string | null;
  trend: CollectionTrendPoint[];
  slowPayers: SlowPayer[];
  /** Advances received and not yet applied to an invoice, as of today. */
  advancesHeld: string;
  ageing: ReceivablesReport;
  reconciliation: {
    /** Outstanding per the receivables engine (invoice balances). */
    receivables: string;
    /** Outstanding recomputed from the payment ledger. */
    ledger: string;
    difference: string;
    /** Invoices whose stored balance differs from the ledger. */
    outOfStep: string[];
  };
}

const avg = (values: number[]): Dec =>
  values.length ? values.reduce((a, v) => a.plus(v), ZERO).dividedBy(values.length) : ZERO;

function median(values: number[]): string | null {
  if (!values.length) return null;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return String(Math.round(m * 10) / 10);
}

const one = (v: Dec) => v.toDecimalPlaces(1).toFixed(1);

/** Net allocated amount (payments − refunds) per invoice id, up to `until` inclusive. */
function allocatedByInvoice(events: PaymentEvent[], until = ""): Map<string, Dec> {
  const m = new Map<string, Dec>();
  for (const e of events) {
    if (!e.invoiceId || (until && e.date > until)) continue;
    m.set(e.invoiceId, (m.get(e.invoiceId) ?? ZERO).plus(toDec(e.amount).times(e.sign)));
  }
  return m;
}

/** Receivables per the ledger on `asOf` (invoice total − allocated payments, per invoice, floored at 0). */
export function ledgerOutstanding(data: AnalyticsData, events: PaymentEvent[], asOf: string): Dec {
  const paid = allocatedByInvoice(events, asOf);
  let out = ZERO;
  for (const f of data.facts) {
    if (f.kind !== "sale" || f.date > asOf) continue;
    const left = toDec(f.total).minus(paid.get(f.id) ?? ZERO);
    if (left.greaterThan(0)) out = out.plus(left);
  }
  return out;
}

/** The day each fully paid invoice reached a zero balance. */
export function settledInvoices(data: AnalyticsData, events: PaymentEvent[]): SettledInvoice[] {
  const byInvoice = new Map<string, PaymentEvent[]>();
  for (const e of events) {
    if (!e.invoiceId) continue;
    const list = byInvoice.get(e.invoiceId);
    if (list) list.push(e);
    else byInvoice.set(e.invoiceId, [e]);
  }
  const out: SettledInvoice[] = [];
  for (const f of data.facts) {
    if (f.kind !== "sale") continue;
    const total = toDec(f.total);
    if (total.lessThanOrEqualTo(0)) continue;
    const list = byInvoice.get(f.id);
    if (!list) continue;
    let cum = ZERO;
    let paidOn = "";
    for (const e of list) {
      cum = cum.plus(toDec(e.amount).times(e.sign));
      if (cum.greaterThanOrEqualTo(total)) paidOn ||= e.date;
      else paidOn = "";
    }
    if (!paidOn) continue;
    const due = f.dueDate || f.date;
    const daysLate = daysBetween(due, paidOn);
    out.push({
      id: f.id,
      number: f.number,
      customerKey: f.customerKey,
      customerName: f.customerName,
      date: f.date,
      dueDate: due,
      paidOn,
      daysToPay: Math.max(0, daysBetween(f.date, paidOn)),
      daysLate,
      onTime: daysLate <= 0,
      total: f.total,
    });
  }
  return out;
}

function trailingMonths(endISO: string, n: number): string[] {
  const end = endISO.slice(0, 7);
  return Array.from({ length: n }, (_, i) => shiftPeriod(end, i - n + 1));
}

export function collectionsReport(
  data: AnalyticsData,
  events: PaymentEvent[],
  range: DateRange,
  todayISO: string,
  opts: { slowLimit?: number; trendMonths?: number } = {},
): CollectionsReport {
  const ageing = receivablesReport(data, todayISO, 10);

  let moneyIn = ZERO;
  let refunds = ZERO;
  let onInvoices = ZERO;
  for (const e of events) {
    if (!inRange(e.date, range)) continue;
    const amt = toDec(e.amount);
    if (e.sign > 0) moneyIn = moneyIn.plus(amt);
    else refunds = refunds.plus(amt);
    if (e.invoiceId) onInvoices = onInvoices.plus(amt.times(e.sign));
  }
  const collected = moneyIn.minus(refunds);

  let billed = ZERO;
  for (const f of data.facts)
    if (f.kind === "sale" && inRange(f.date, range)) billed = billed.plus(toDec(f.total));
  const hasStart = range.start >= "1970-01-01";
  const openingDue = hasStart ? ledgerOutstanding(data, events, shiftDay(range.start, -1)) : ZERO;
  const base = openingDue.plus(billed);
  const efficiency = base.greaterThan(0) ? d2(onInvoices.dividedBy(base).times(100)) : null;

  const settled = settledInvoices(data, events).filter((s) => inRange(s.paidOn, range));
  const onTime = settled.filter((s) => s.onTime);
  const late = settled.filter((s) => !s.onTime);
  const sumTotal = (xs: SettledInvoice[]) => xs.reduce((a, s) => a.plus(toDec(s.total)), ZERO);
  const days = settled.map((s) => s.daysToPay);

  const end = range.end < todayISO ? range.end : todayISO;
  const months = trailingMonths(end, opts.trendMonths ?? 12);
  const monthIdx = new Map(months.map((m, i) => [m, i]));
  const mCollected = months.map(() => ZERO);
  const mBilled = months.map(() => ZERO);
  for (const e of events) {
    const i = monthIdx.get(e.date.slice(0, 7));
    if (i !== undefined) mCollected[i] = mCollected[i].plus(toDec(e.amount).times(e.sign));
  }
  for (const f of data.facts) {
    const i = f.kind === "sale" ? monthIdx.get(f.date.slice(0, 7)) : undefined;
    if (i !== undefined) mBilled[i] = mBilled[i].plus(toDec(f.total));
  }
  const trend: CollectionTrendPoint[] = months.map((month, i) => {
    const label = periodLabel(month);
    return {
      month,
      label,
      shortLabel: label.slice(0, 3),
      collected: d2(mCollected[i]),
      billed: d2(mBilled[i]),
    };
  });

  const groups = new Map<string, { name: string; items: SettledInvoice[] }>();
  for (const s of settled) {
    const g = groups.get(s.customerKey) ?? { name: s.customerName, items: [] };
    g.items.push(s);
    groups.set(s.customerKey, g);
  }
  const owed = new Map(ageing.byCustomer.map((c) => [c.key, c]));
  const slowPayers: SlowPayer[] = [...groups.entries()]
    .map(([key, g]) => ({
      key,
      name: g.name,
      settledCount: g.items.length,
      avgDaysToPay: one(avg(g.items.map((s) => s.daysToPay))),
      avgDaysLate: one(avg(g.items.map((s) => s.daysLate))),
      lateShare: d2(
        new Dec(g.items.filter((s) => !s.onTime).length).dividedBy(g.items.length).times(100),
      ),
      outstanding: owed.get(key)?.outstanding ?? "0.00",
      overdue: owed.get(key)?.overdue ?? "0.00",
    }))
    .sort(
      (a, b) =>
        Number(b.avgDaysLate) - Number(a.avgDaysLate) ||
        Number(b.avgDaysToPay) - Number(a.avgDaysToPay) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, opts.slowLimit ?? 5);

  // Advances held: unallocated money in minus unallocated refunds, up to today.
  let advances = ZERO;
  for (const e of events) {
    if (!e.invoiceId && e.date <= todayISO) advances = advances.plus(toDec(e.amount).times(e.sign));
  }

  // Reconciliation with the receivables engine.
  const ledgerOut = ledgerOutstanding(data, events, todayISO);
  const paidNow = allocatedByInvoice(events, todayISO);
  const outOfStep: string[] = [];
  for (const f of data.facts) {
    if (f.kind !== "sale" || f.date > todayISO) continue;
    const expected = Dec.max(toDec(f.total).minus(paidNow.get(f.id) ?? ZERO), ZERO);
    if (!expected.minus(toDec(f.balanceDue)).abs().lessThan(0.01)) outOfStep.push(f.id);
  }

  return {
    range,
    asOf: todayISO,
    collected: d2(collected),
    moneyIn: d2(moneyIn),
    refunds: d2(refunds),
    collectedOnInvoices: d2(onInvoices),
    billed: d2(billed),
    efficiency,
    settled,
    avgDaysToPay: settled.length ? one(avg(days)) : null,
    medianDaysToPay: median(days),
    onTime: { count: onTime.length, amount: d2(sumTotal(onTime)) },
    late: { count: late.length, amount: d2(sumTotal(late)) },
    onTimeShare: settled.length
      ? d2(new Dec(onTime.length).dividedBy(settled.length).times(100))
      : null,
    trend,
    slowPayers,
    advancesHeld: d2(advances.isNegative() ? ZERO : advances),
    ageing,
    reconciliation: {
      receivables: ageing.outstanding,
      ledger: d2(ledgerOut),
      difference: d2(ledgerOut.minus(toDec(ageing.outstanding))),
      outOfStep,
    },
  };
}

function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}
