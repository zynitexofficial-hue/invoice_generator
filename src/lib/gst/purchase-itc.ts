/**
 * ITC from purchase bills, for GSTR-3B / ITC reconciliation (Feature E).
 *
 * `eligibleItcFromPurchases(purchases, period)` is pure: pass the rows from
 * `usePurchases()` / `listPurchases()` and a period key ("2026-10", "2026-Q3",
 * "FY2026-27") or an inclusive `{ start, end }` ISO range. A bill counts in the
 * period of its bill date. Only bills that claim ITC (valid vendor GSTIN, bill
 * number, GST charged, itcEligible, type not "ineligible") contribute.
 *
 * Bills on reverse charge are reported separately in `reverseCharge` (GSTR-3B
 * 4(A)(3)); everything else is in `regular` (4(A)(5)). `all` is the sum.
 * `byType` splits the same ITC by credit type for the 4(A) rows.
 */
import { resolveRange, type PeriodSelector } from "@/lib/analytics/base";
import { Dec, ZERO, roundTo, toDec } from "@/lib/money";
import { purchaseItc, purchaseGst } from "@/lib/purchases/calc";
import type { Purchase } from "@/lib/schema";

export interface ItcAmounts {
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
}

export type PurchaseItcType = "inputs" | "input_services" | "capital_goods";

export interface PurchaseItcRow {
  id: string;
  billNo: string;
  billDate: string;
  vendorName: string;
  vendorGstin: string;
  itcType: PurchaseItcType;
  reverseCharge: boolean;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
}

export interface PurchaseItcSummary {
  /** Inclusive range the figures cover. */
  start: string;
  end: string;
  /** Eligible ITC, all bills. */
  all: ItcAmounts;
  /** Eligible ITC on bills not under reverse charge. */
  regular: ItcAmounts;
  /** Eligible ITC on reverse-charge bills. */
  reverseCharge: ItcAmounts;
  byType: Record<PurchaseItcType, ItcAmounts>;
  /** One row per bill that claims ITC, oldest first. */
  rows: PurchaseItcRow[];
  /** Bills in the period that carry GST but do not claim ITC (needs a look). */
  notClaimed: { count: number; gst: string };
}

type Heads = { cgst: Dec; sgst: Dec; igst: Dec };
const zero = (): Heads => ({ cgst: ZERO, sgst: ZERO, igst: ZERO });
const d2 = (v: Dec) => roundTo(v, 2).toFixed(2);

function add(h: Heads, r: { cgst: string; sgst: string; igst: string }) {
  h.cgst = h.cgst.plus(r.cgst);
  h.sgst = h.sgst.plus(r.sgst);
  h.igst = h.igst.plus(r.igst);
}

function out(h: Heads): ItcAmounts {
  return {
    cgst: d2(h.cgst),
    sgst: d2(h.sgst),
    igst: d2(h.igst),
    total: d2(h.cgst.plus(h.sgst).plus(h.igst)),
  };
}

export function eligibleItcFromPurchases(
  purchases: readonly Purchase[],
  period: PeriodSelector,
): PurchaseItcSummary {
  const range = resolveRange(period);
  const all = zero();
  const regular = zero();
  const rcm = zero();
  const byType: Record<PurchaseItcType, Heads> = {
    inputs: zero(),
    input_services: zero(),
    capital_goods: zero(),
  };
  const rows: PurchaseItcRow[] = [];
  let notClaimedCount = 0;
  let notClaimedGst = ZERO;

  const inPeriod = purchases
    .filter((p) => p.billDate && p.billDate >= range.start && p.billDate <= range.end)
    .sort((a, b) => a.billDate.localeCompare(b.billDate) || a.id.localeCompare(b.id));

  for (const p of inPeriod) {
    const itc = purchaseItc(p);
    if (toDec(itc.total).isZero()) {
      const gst = toDec(purchaseGst(p));
      if (p.gstMode !== "none" && gst.greaterThan(0)) {
        notClaimedCount++;
        notClaimedGst = notClaimedGst.plus(gst);
      }
      continue;
    }
    // purchaseItc is non-zero only for itcType other than "ineligible".
    const type = p.itcType as PurchaseItcType;
    add(all, itc);
    add(p.reverseCharge ? rcm : regular, itc);
    add(byType[type], itc);
    rows.push({
      id: p.id,
      billNo: p.billNo,
      billDate: p.billDate,
      vendorName: p.vendorName,
      vendorGstin: p.vendorGstin,
      itcType: type,
      reverseCharge: p.reverseCharge,
      taxable: p.summary.taxable,
      ...itc,
    });
  }

  return {
    start: range.start,
    end: range.end,
    all: out(all),
    regular: out(regular),
    reverseCharge: out(rcm),
    byType: {
      inputs: out(byType.inputs),
      input_services: out(byType.input_services),
      capital_goods: out(byType.capital_goods),
    },
    rows,
    notClaimed: { count: notClaimedCount, gst: d2(notClaimedGst) },
  };
}
