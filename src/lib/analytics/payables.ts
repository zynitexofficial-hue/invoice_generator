/**
 * Payables (what you owe vendors): ageing from the due date, MSME 45-day
 * alerts and vendor concentration. Pure and deterministic; money is Dec
 * internally and exposed as 2-dp strings.
 *
 * Like receivables, ageing is as of `todayISO`: the effective due date is the
 * bill's due date, else its bill date. Bills dated after today are left out.
 * Vendor opening balances have no due date, so they are reported on their own
 * (`openingBalances`) and not aged.
 */
import { Dec, ZERO, toDec } from "@/lib/money";
import type { Purchase, Vendor } from "@/lib/schema";
import { d2, addDays, daysBetween, resolveRange, type PeriodSelector } from "./base";
import { AGE_BUCKETS, ageBucket, type AgeBucketKey } from "./receivables";

/** Section 43B(h): MSME dues must be paid within 45 days of acceptance. */
export const MSME_DAYS = 45;
/** Start warning this many days before the MSME deadline. */
export const MSME_WARN_DAYS = 10;

export const vendorKeyOf = (p: Pick<Purchase, "vendorId" | "vendorName">): string =>
  p.vendorId || `name:${p.vendorName.trim().toLowerCase() || "unknown"}`;

export interface OpenBill {
  id: string;
  billNo: string;
  vendorKey: string;
  vendorId: string;
  vendorName: string;
  billDate: string;
  /** Effective due date (due date, else bill date). */
  dueDate: string;
  /** Days past the effective due date (negative = not yet due). */
  daysPastDue: number;
  bucket: AgeBucketKey;
  overdue: boolean;
  total: string;
  balance: string;
  msme: boolean;
}

export interface PayableBucket {
  key: AgeBucketKey;
  label: string;
  amount: string;
  count: number;
  billIds: string[];
}

export interface VendorPayable {
  key: string;
  vendorId: string;
  name: string;
  outstanding: string;
  overdue: string;
  count: number;
  maxDaysPastDue: number;
  msme: boolean;
  billIds: string[];
}

export type MsmeSeverity = "breached" | "soon";

export interface MsmeAlert {
  billId: string;
  billNo: string;
  vendorName: string;
  billDate: string;
  /** billDate + 45 days. */
  deadline: string;
  /** Days left to the deadline (negative = already past). */
  daysLeft: number;
  severity: MsmeSeverity;
  balance: string;
}

export interface PayablesReport {
  asOf: string;
  outstanding: string;
  overdue: string;
  notYetDue: string;
  overdueShare: string | null;
  buckets: PayableBucket[];
  byVendor: VendorPayable[];
  /** Open bills, most overdue first (ties: larger balance first). */
  open: OpenBill[];
  msmeAlerts: MsmeAlert[];
  /** Sum of vendor opening balances owed (positive); not part of the ageing. */
  openingBalances: string;
}

const msmeIds = (vendors: readonly Vendor[]) =>
  new Set(vendors.filter((v) => v.msme).map((v) => v.id));

/** Bills with a balance, dated on or before `todayISO`. */
export function openBills(
  purchases: readonly Purchase[],
  vendors: readonly Vendor[],
  todayISO: string,
): OpenBill[] {
  const msme = msmeIds(vendors);
  return purchases
    .filter((p) => p.billDate && p.billDate <= todayISO)
    .filter((p) => toDec(p.summary.balance).greaterThan(0))
    .map((p) => {
      const due = p.dueDate || p.billDate;
      const days = daysBetween(due, todayISO);
      return {
        id: p.id,
        billNo: p.billNo,
        vendorKey: vendorKeyOf(p),
        vendorId: p.vendorId,
        vendorName: p.vendorName.trim() || "Unnamed vendor",
        billDate: p.billDate,
        dueDate: due,
        daysPastDue: days,
        bucket: ageBucket(days),
        overdue: days > 0,
        total: p.summary.total,
        balance: p.summary.balance,
        msme: Boolean(p.vendorId) && msme.has(p.vendorId),
      };
    });
}

/** MSME vendors' unpaid bills that are past, or within 10 days of, the 45-day deadline. */
export function msmeAlerts(open: readonly OpenBill[], todayISO: string): MsmeAlert[] {
  const alerts: MsmeAlert[] = [];
  for (const b of open) {
    if (!b.msme) continue;
    const deadline = addDays(b.billDate, MSME_DAYS);
    const daysLeft = daysBetween(todayISO, deadline);
    if (daysLeft > MSME_WARN_DAYS) continue;
    alerts.push({
      billId: b.id,
      billNo: b.billNo,
      vendorName: b.vendorName,
      billDate: b.billDate,
      deadline,
      daysLeft,
      severity: daysLeft < 0 ? "breached" : "soon",
      balance: b.balance,
    });
  }
  return alerts.sort((a, b) => a.daysLeft - b.daysLeft || a.billId.localeCompare(b.billId));
}

export function payablesReport(
  purchases: readonly Purchase[],
  vendors: readonly Vendor[],
  todayISO: string,
): PayablesReport {
  const open = openBills(purchases, vendors, todayISO);
  const bucketMap = new Map(
    AGE_BUCKETS.map((b) => [b.key, { amount: ZERO as Dec, count: 0, ids: [] as string[] }]),
  );
  const byVendor = new Map<
    string,
    {
      vendorId: string;
      name: string;
      out: Dec;
      over: Dec;
      count: number;
      max: number;
      msme: boolean;
      ids: string[];
    }
  >();
  let outstanding = ZERO;
  let overdue = ZERO;
  for (const o of open) {
    const bal = toDec(o.balance);
    outstanding = outstanding.plus(bal);
    if (o.overdue) overdue = overdue.plus(bal);
    const bucket = bucketMap.get(o.bucket)!;
    bucket.amount = bucket.amount.plus(bal);
    bucket.count++;
    bucket.ids.push(o.id);
    const v = byVendor.get(o.vendorKey) ?? {
      vendorId: o.vendorId,
      name: o.vendorName,
      out: ZERO,
      over: ZERO,
      count: 0,
      max: -Infinity,
      msme: o.msme,
      ids: [],
    };
    v.out = v.out.plus(bal);
    if (o.overdue) v.over = v.over.plus(bal);
    v.count++;
    v.max = Math.max(v.max, o.daysPastDue);
    v.ids.push(o.id);
    byVendor.set(o.vendorKey, v);
  }

  const openingBalances = vendors.reduce((acc, v) => {
    const b = toDec(v.openingBalance);
    return b.greaterThan(0) && !v.archived ? acc.plus(b) : acc;
  }, ZERO);

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
        billIds: v.ids,
      };
    }),
    byVendor: [...byVendor.entries()]
      .map(([key, v]) => ({
        key,
        vendorId: v.vendorId,
        name: v.name,
        outstanding: d2(v.out),
        overdue: d2(v.over),
        count: v.count,
        maxDaysPastDue: v.max,
        msme: v.msme,
        billIds: v.ids,
      }))
      .sort((a, b) => toDec(b.outstanding).comparedTo(a.outstanding) || a.key.localeCompare(b.key)),
    open: [...open].sort(
      (a, b) =>
        b.daysPastDue - a.daysPastDue ||
        toDec(b.balance).comparedTo(a.balance) ||
        a.id.localeCompare(b.id),
    ),
    msmeAlerts: msmeAlerts(open, todayISO),
    openingBalances: d2(openingBalances),
  };
}

/* ------------------------------------------------------------------ */
/* Vendor concentration                                                */
/* ------------------------------------------------------------------ */

export interface VendorSpend {
  key: string;
  name: string;
  total: string;
  /** Share of all spend (%, 2 dp). */
  share: string;
  count: number;
}

export interface VendorConcentration {
  total: string;
  vendors: VendorSpend[];
  /** Share of the largest vendor (%), null with no spend. */
  topShare: string | null;
  /** Share of the three largest vendors (%), null with no spend. */
  top3Share: string | null;
  /** One vendor makes up more than 40% of spend, with at least two vendors. */
  concentrated: boolean;
}

export const CONCENTRATION_THRESHOLD = 40;

/** Spend per vendor (bill totals) for bills dated in `period`, largest first. */
export function vendorConcentration(
  purchases: readonly Purchase[],
  period: PeriodSelector,
  limit = 10,
): VendorConcentration {
  const range = resolveRange(period);
  const map = new Map<string, { name: string; total: Dec; count: number }>();
  let grand = ZERO;
  for (const p of purchases) {
    if (!p.billDate || p.billDate < range.start || p.billDate > range.end) continue;
    const amount = toDec(p.summary.total);
    const key = vendorKeyOf(p);
    const v = map.get(key) ?? {
      name: p.vendorName.trim() || "Unnamed vendor",
      total: ZERO,
      count: 0,
    };
    v.total = v.total.plus(amount);
    v.count++;
    map.set(key, v);
    grand = grand.plus(amount);
  }
  const share = (v: Dec) => (grand.isZero() ? ZERO : v.dividedBy(grand).times(100));
  const sorted = [...map.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.total.comparedTo(a.total) || a.key.localeCompare(b.key));
  const top = sorted[0];
  const top3 = sorted.slice(0, 3).reduce((acc, v) => acc.plus(v.total), ZERO);
  return {
    total: d2(grand),
    vendors: sorted.slice(0, limit).map((v) => ({
      key: v.key,
      name: v.name,
      total: d2(v.total),
      share: d2(share(v.total)),
      count: v.count,
    })),
    topShare: top ? d2(share(top.total)) : null,
    top3Share: top ? d2(share(top3)) : null,
    concentrated:
      sorted.length >= 2 && Boolean(top) && share(top.total).greaterThan(CONCENTRATION_THRESHOLD),
  };
}
