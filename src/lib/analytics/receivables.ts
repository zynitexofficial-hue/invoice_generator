/**
 * Receivables ageing (spec C1): balance due on issued sales, aged from the due
 * date (invoice date when there is none) as of `todayISO`.
 *
 * Phase 1 has no payment ledger: credit notes are not allocated against
 * invoice balances here (they reduce revenue, not receivables).
 */
import { Dec, ZERO, toDec } from "@/lib/money";
import { d2, daysBetween, type AnalyticsData, type InvoiceFact } from "./base";

export type AgeBucketKey = "0-30" | "31-60" | "61-90" | "90+";

export const AGE_BUCKETS: { key: AgeBucketKey; label: string; maxDays: number }[] = [
  { key: "0-30", label: "0–30 days", maxDays: 30 },
  { key: "31-60", label: "31–60 days", maxDays: 60 },
  { key: "61-90", label: "61–90 days", maxDays: 90 },
  { key: "90+", label: "Over 90 days", maxDays: Infinity },
];

/** Bucket for a number of days past due. Not-yet-due (≤ 0) falls in 0–30. */
export function ageBucket(daysPastDue: number): AgeBucketKey {
  return AGE_BUCKETS.find((b) => daysPastDue <= b.maxDays)!.key;
}

export interface OpenInvoice {
  id: string;
  number: string;
  customerKey: string;
  customerName: string;
  date: string;
  /** Effective due date (due date, else invoice date). */
  dueDate: string;
  /** Days past the effective due date (negative = not yet due). */
  daysPastDue: number;
  bucket: AgeBucketKey;
  overdue: boolean;
  total: string;
  balance: string;
}

export interface AgeBucket {
  key: AgeBucketKey;
  label: string;
  amount: string;
  count: number;
  invoiceIds: string[];
}

export interface CustomerReceivable {
  key: string;
  name: string;
  outstanding: string;
  overdue: string;
  count: number;
  /** Largest days past due among this customer's open invoices. */
  maxDaysPastDue: number;
  invoiceIds: string[];
}

export interface ReceivablesReport {
  asOf: string;
  outstanding: string;
  overdue: string;
  notYetDue: string;
  /** Overdue ÷ outstanding (%), null when nothing is outstanding. */
  overdueShare: string | null;
  buckets: AgeBucket[];
  byCustomer: CustomerReceivable[];
  /** Overdue invoices, most overdue first (ties: larger balance first). */
  topOverdue: OpenInvoice[];
  open: OpenInvoice[];
}

/** Open (balance > 0) sales invoices dated on or before `todayISO`. */
export function openInvoices(data: AnalyticsData, todayISO: string): OpenInvoice[] {
  return data.facts
    .filter((f): f is InvoiceFact => f.kind === "sale" && f.date <= todayISO)
    .filter((f) => toDec(f.balanceDue).greaterThan(0))
    .map((f) => {
      const due = f.dueDate || f.date;
      const days = daysBetween(due, todayISO);
      return {
        id: f.id,
        number: f.number,
        customerKey: f.customerKey,
        customerName: f.customerName,
        date: f.date,
        dueDate: due,
        daysPastDue: days,
        bucket: ageBucket(days),
        overdue: days > 0,
        total: f.total,
        balance: f.balanceDue,
      };
    });
}

/** Totals only (used by metrics). */
export function receivablesSummary(data: AnalyticsData, todayISO: string) {
  let outstanding = ZERO;
  let overdue = ZERO;
  for (const o of openInvoices(data, todayISO)) {
    outstanding = outstanding.plus(toDec(o.balance));
    if (o.overdue) overdue = overdue.plus(toDec(o.balance));
  }
  return { outstanding: d2(outstanding), overdue: d2(overdue) };
}

export function receivablesReport(
  data: AnalyticsData,
  todayISO: string,
  topLimit = 5,
): ReceivablesReport {
  const open = openInvoices(data, todayISO);
  const bucketMap = new Map(
    AGE_BUCKETS.map((b) => [b.key, { amount: ZERO as Dec, count: 0, ids: [] as string[] }]),
  );
  const customers = new Map<
    string,
    { name: string; out: Dec; over: Dec; count: number; max: number; ids: string[] }
  >();
  let outstanding = ZERO;
  let overdue = ZERO;

  for (const o of open) {
    const bal = toDec(o.balance);
    outstanding = outstanding.plus(bal);
    if (o.overdue) overdue = overdue.plus(bal);
    const b = bucketMap.get(o.bucket)!;
    b.amount = b.amount.plus(bal);
    b.count++;
    b.ids.push(o.id);
    const c = customers.get(o.customerKey) ?? {
      name: o.customerName,
      out: ZERO,
      over: ZERO,
      count: 0,
      max: -Infinity,
      ids: [],
    };
    c.out = c.out.plus(bal);
    if (o.overdue) c.over = c.over.plus(bal);
    c.count++;
    c.max = Math.max(c.max, o.daysPastDue);
    c.ids.push(o.id);
    customers.set(o.customerKey, c);
  }

  const byCustomer = [...customers.entries()]
    .map(([key, c]) => ({
      key,
      name: c.name,
      outstanding: d2(c.out),
      overdue: d2(c.over),
      count: c.count,
      maxDaysPastDue: c.max,
      invoiceIds: c.ids,
    }))
    .sort(
      (a, b) =>
        toDec(b.overdue).comparedTo(toDec(a.overdue)) ||
        toDec(b.outstanding).comparedTo(toDec(a.outstanding)) ||
        a.name.localeCompare(b.name),
    );

  const topOverdue = open
    .filter((o) => o.overdue)
    .sort(
      (a, b) =>
        b.daysPastDue - a.daysPastDue ||
        toDec(b.balance).comparedTo(toDec(a.balance)) ||
        a.number.localeCompare(b.number),
    )
    .slice(0, topLimit);

  return {
    asOf: todayISO,
    outstanding: d2(outstanding),
    overdue: d2(overdue),
    notYetDue: d2(outstanding.minus(overdue)),
    overdueShare: outstanding.isZero() ? null : d2(overdue.dividedBy(outstanding).times(100)),
    buckets: AGE_BUCKETS.map((b) => {
      const v = bucketMap.get(b.key)!;
      return {
        key: b.key,
        label: b.label,
        amount: d2(v.amount),
        count: v.count,
        invoiceIds: v.ids,
      };
    }),
    byCustomer,
    topOverdue,
    open,
  };
}
