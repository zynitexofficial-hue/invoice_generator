/**
 * Vendor statement: opening balance, bills and payments in a date range, with a
 * running balance of what you owe the vendor (positive = you owe them).
 *
 * The vendor's `openingBalance` counts from its `openingBalanceDate` (or from
 * the beginning when no date is set). Bill amounts are the payable total (on
 * reverse charge that excludes the GST you pay the government yourself).
 */
import { Dec, ZERO, toDec } from "@/lib/money";
import type { Purchase, Vendor } from "@/lib/schema";
import { d2, type DateRange } from "./base";

export type StatementKind = "opening" | "bill" | "payment";

export interface StatementRow {
  date: string;
  kind: StatementKind;
  /** Bill number or payment reference. */
  ref: string;
  description: string;
  /** Payments made (reduce what you owe). */
  debit: string;
  /** Bills and opening balance (increase what you owe). */
  credit: string;
  balance: string;
}

export interface VendorStatement {
  vendorId: string;
  vendorName: string;
  range: DateRange;
  opening: string;
  rows: StatementRow[];
  billed: string;
  paid: string;
  closing: string;
}

const KIND_ORDER: Record<StatementKind, number> = { opening: 0, bill: 1, payment: 2 };

export function vendorStatement(
  vendor: Pick<Vendor, "id" | "name" | "openingBalance" | "openingBalanceDate">,
  purchases: readonly Purchase[],
  range: DateRange,
): VendorStatement {
  const bills = purchases.filter((p) => p.vendorId === vendor.id && p.billDate);
  const before = (date: string) => Boolean(range.start) && date < range.start;
  const within = (date: string) =>
    (!range.start || date >= range.start) && (!range.end || date <= range.end);

  const openingBalance = toDec(vendor.openingBalance);
  const openDate = vendor.openingBalanceDate;
  let opening: Dec = ZERO;
  if (!openingBalance.isZero() && (!openDate || before(openDate))) opening = openingBalance;

  interface Raw {
    date: string;
    kind: StatementKind;
    ref: string;
    description: string;
    debit: Dec;
    credit: Dec;
  }
  const raw: Raw[] = [];
  if (!openingBalance.isZero() && openDate && within(openDate)) {
    raw.push({
      date: openDate,
      kind: "opening",
      ref: "",
      description: "Opening balance",
      debit: ZERO,
      credit: openingBalance,
    });
  }
  for (const b of bills) {
    const total = toDec(b.summary.total);
    if (before(b.billDate)) opening = opening.plus(total);
    else if (within(b.billDate))
      raw.push({
        date: b.billDate,
        kind: "bill",
        ref: b.billNo,
        description: b.billNo ? `Bill ${b.billNo}` : "Bill",
        debit: ZERO,
        credit: total,
      });
    for (const pay of b.payments) {
      if (!pay.date) continue;
      const amount = toDec(pay.amount);
      if (before(pay.date)) opening = opening.minus(amount);
      else if (within(pay.date))
        raw.push({
          date: pay.date,
          kind: "payment",
          ref: pay.reference,
          description: `Payment${b.billNo ? ` for bill ${b.billNo}` : ""}`,
          debit: amount,
          credit: ZERO,
        });
    }
  }
  raw.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.ref.localeCompare(b.ref),
  );

  let running = opening;
  let billed = ZERO;
  let paid = ZERO;
  const rows: StatementRow[] = raw.map((r) => {
    running = running.plus(r.credit).minus(r.debit);
    billed = billed.plus(r.credit);
    paid = paid.plus(r.debit);
    return {
      date: r.date,
      kind: r.kind,
      ref: r.ref,
      description: r.description,
      debit: d2(r.debit),
      credit: d2(r.credit),
      balance: d2(running),
    };
  });

  return {
    vendorId: vendor.id,
    vendorName: vendor.name,
    range,
    opening: d2(opening),
    rows,
    billed: d2(billed),
    paid: d2(paid),
    closing: d2(running),
  };
}
