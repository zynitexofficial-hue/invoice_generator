/**
 * GSTR-4 / CMP-08 WORKSHEET for composition dealers. A DRAFT prepared from your
 * records; section order and names approximate the annual GSTR-4 (the portal
 * numbering may differ: verify). Composition rates used here are the usual
 * ones: 1% (manufacturers and traders), 5% (restaurants), 6% (other services),
 * split equally between CGST and SGST: verify the rate that applies to you.
 */
import { computeExpenseSummary } from "@/lib/expense-calc";
import { checkGstin } from "@/lib/gst/gstin";
import { dueDate, estimateLateFee, type LateFeeEstimate } from "@/lib/gst/returns";
import { Dec, ZERO, roundTo, toDec } from "@/lib/money";
import { inPeriod, monthsInPeriod, quarterKey } from "@/lib/period";
import type { AppSettings, Expense, Filing } from "@/lib/schema";
import { prepareAnalytics, sliceData, resolveRange, type AnalyticsData } from "@/lib/analytics";
import { fmt2, type DrillRef } from "./common";

export const COMPOSITION_RATES = [
  { rate: "1", label: "1% · manufacturers and traders (goods)" },
  { rate: "5", label: "5% · restaurants (not serving alcohol)" },
  { rate: "6", label: "6% · other service providers" },
] as const;

export interface Gstr4RateRow {
  rate: string;
  label: string;
  /** Turnover per records allocated to this rate (default rate only). */
  booksTurnover: string;
  turnover: string;
  overridden: boolean;
  cgst: string;
  sgst: string;
  tax: string;
}

export interface Gstr4InwardRow {
  id: "registered" | "unregistered" | "rcm";
  label: string;
  count: number;
  taxable: string;
  tax: string;
  drill: DrillRef[];
}

export interface Gstr4Quarter {
  key: string;
  label: string;
  turnover: string;
  /** Estimated tax at the default rate. */
  estimated: string;
  paid: string;
  difference: string;
}

export interface Gstr4Result {
  fyKey: string;
  defaultRate: string;
  rates: Gstr4RateRow[];
  /** Turnover per records, net of credit notes. */
  booksTurnover: string;
  turnoverDrill: DrillRef[];
  inward: Gstr4InwardRow[];
  /** Tax on outward supplies at composition rates. */
  outwardTax: string;
  /** Reverse-charge tax on inward supplies (paid in cash; no ITC for composition dealers). */
  rcmTax: string;
  totalPayable: string;
  cmp08Paid: string;
  /** totalPayable − cmp08Paid (negative = paid more than due). */
  balance: string;
  quarters: Gstr4Quarter[];
  dueDate: string | null;
  lateFee: LateFeeEstimate;
  warnings: string[];
}

export interface BuildGstr4Input {
  /** Prepared analytics data (invoices, expenses, incomes). */
  data: AnalyticsData;
  expenses: Expense[];
  settings: AppSettings;
  fyKey: string;
  values?: Record<string, string>;
  filings?: Filing[];
  today: string;
}

const num = (m: Record<string, string>, k: string): string | undefined => {
  const v = m[k];
  return v === undefined || v.trim() === "" ? undefined : v;
};

export function buildGstr4({
  data,
  expenses,
  settings,
  fyKey,
  values = {},
  filings = [],
  today,
}: BuildGstr4Input): Gstr4Result {
  const range = resolveRange(fyKey);
  const slice = sliceData(data, range);
  const defaultRate = ["1", "5", "6"].includes(values.defaultRate ?? "") ? values.defaultRate : "1";

  let turnover = ZERO;
  const drill: DrillRef[] = [];
  for (const f of slice.facts) {
    // Composition dealers do not charge tax; turnover is the value of supplies net of notes.
    const t = toDec(f.taxable).times(f.sign);
    turnover = turnover.plus(t);
    drill.push({
      kind: "invoice",
      id: f.id,
      number: f.number,
      date: f.date,
      party: f.customerName,
      taxable: fmt2(t),
      tax: "0.00",
    });
  }

  const rates: Gstr4RateRow[] = COMPOSITION_RATES.map(({ rate, label }) => {
    const books = rate === defaultRate ? turnover : ZERO;
    const manual = num(values, `turnover.${rate}`);
    const t = manual !== undefined ? toDec(manual) : books;
    const half = roundTo(t.times(rate).dividedBy(200), 2);
    return {
      rate,
      label,
      booksTurnover: fmt2(books),
      turnover: fmt2(t),
      overridden: manual !== undefined,
      cgst: fmt2(half),
      sgst: fmt2(half),
      tax: fmt2(half.times(2)),
    };
  });
  const outwardTax = rates.reduce((a, r) => a.plus(r.tax), ZERO);
  const ratedTurnover = rates.reduce((a, r) => a.plus(r.turnover), ZERO);

  /* Inward supplies */
  const fyExpenses = expenses.filter((e) => inPeriod(e.date, fyKey));
  const inward: Gstr4InwardRow[] = (
    [
      ["registered", "Inward supplies from registered persons (not reverse charge)"],
      ["unregistered", "Inward supplies from unregistered persons (not reverse charge)"],
      ["rcm", "Inward supplies on which you pay tax under reverse charge"],
    ] as const
  ).map(([id, label]) => ({ id, label, count: 0, taxable: "0.00", tax: "0.00", drill: [] }));
  const acc = { registered: [ZERO, ZERO], unregistered: [ZERO, ZERO], rcm: [ZERO, ZERO] };
  for (const e of fyExpenses) {
    const s = computeExpenseSummary(e);
    const tax = toDec(s.igst).plus(s.cgst).plus(s.sgst);
    const id: Gstr4InwardRow["id"] = e.reverseCharge
      ? "rcm"
      : e.vendorGstin.trim() && checkGstin(e.vendorGstin).valid
        ? "registered"
        : "unregistered";
    const row = inward.find((r) => r.id === id)!;
    row.count++;
    acc[id] = [acc[id][0].plus(s.taxable), acc[id][1].plus(tax)];
    row.drill.push({
      kind: "expense",
      id: e.id,
      number: e.invoiceNo,
      date: e.date,
      party: e.vendorName,
      taxable: s.taxable,
      tax: fmt2(tax),
    });
  }
  for (const row of inward) {
    row.taxable = fmt2(acc[row.id][0]);
    row.tax = fmt2(acc[row.id][1]);
  }
  const rcmTax = acc.rcm[1];

  /* Quarters (CMP-08) */
  const quarterKeys = [...new Set(monthsInPeriod(fyKey).map((m) => quarterKey(`${m}-01`)))];
  const rate = new Dec(defaultRate);
  const quarters: Gstr4Quarter[] = quarterKeys.map((key, i) => {
    let t = ZERO;
    for (const f of data.facts)
      if (inPeriod(f.date, key)) t = t.plus(toDec(f.taxable).times(f.sign));
    const est = roundTo(t.times(rate).dividedBy(100), 2);
    const paid = toDec(num(values, `cmp08.q${i + 1}`));
    return {
      key,
      label: `Q${i + 1}`,
      turnover: fmt2(t),
      estimated: fmt2(est),
      paid: fmt2(paid),
      difference: fmt2(est.minus(paid)),
    };
  });
  const cmp08Paid = quarters.reduce((a, q) => a.plus(q.paid), ZERO);
  const totalPayable = outwardTax.plus(rcmTax);
  const balance = totalPayable.minus(cmp08Paid);

  const due = dueDate("GSTR-4", fyKey, {
    frequency: settings.gst.filingFrequency,
    stateCode: settings.profile.stateCode,
  });
  const filed = filings.find((f) => f.id === `${fyKey}:GSTR-4`);
  const filedDate = filed?.status === "filed" && filed.filedAt ? filed.filedAt.slice(0, 10) : today;
  const lateFee = estimateLateFee({
    dueDate: due ?? "",
    filedDate,
    nil: totalPayable.isZero() && turnover.isZero(),
    // Composition dealers have turnover up to ₹1.5 crore; the ₹2,000 cap applies.
    aato: "10000000",
    netCashTax: balance.greaterThan(0) ? balance.toFixed(2) : "0",
  });

  const warnings: string[] = [];
  if (!roundTo(ratedTurnover.minus(turnover), 2).isZero())
    warnings.push(
      `Turnover by rate (${fmt2(ratedTurnover)}) differs from turnover in your records (${fmt2(turnover)}). Check the per-rate entries.`,
    );
  if (settings.gst.registrationType !== "composition")
    warnings.push(
      "Your registration type in Settings is not composition. GSTR-4 is only for composition dealers.",
    );
  if (rcmTax.greaterThan(0))
    warnings.push(
      "Reverse-charge tax is paid in cash; composition dealers cannot take input tax credit.",
    );

  return {
    fyKey,
    defaultRate,
    rates,
    booksTurnover: fmt2(turnover),
    turnoverDrill: drill,
    inward,
    outwardTax: fmt2(outwardTax),
    rcmTax: fmt2(rcmTax),
    totalPayable: fmt2(totalPayable),
    cmp08Paid: fmt2(cmp08Paid),
    balance: fmt2(balance),
    quarters,
    dueDate: due,
    lateFee,
    warnings,
  };
}

/** Convenience for tests and callers holding raw records. */
export function gstr4DataOf(
  invoices: Parameters<typeof prepareAnalytics>[0]["invoices"],
  expenses: Expense[],
  sellerState: string,
): AnalyticsData {
  return prepareAnalytics({ invoices, expenses, incomes: [], sellerState });
}
