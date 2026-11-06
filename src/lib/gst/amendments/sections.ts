import { addHeads, fmt2, headsToValues, sumItems, zeroHeads } from "@/lib/gst/returns/internal";
import type { B2csRow, RateItem, TaxValues } from "@/lib/gst/returns/types";
import { monthKey } from "@/lib/period";
import type { Amendment, AmendDoc, AmendSection } from "@/lib/schema";
import { toDec } from "@/lib/money";

/**
 * GSTR-1 amendment sections, computed from amendment records. Pure.
 *
 * Mapping used (table numbers and JSON keys UNCONFIRMED: verify against the
 * current GSTR-1 / offline utility before filing):
 *   9A  amended B2B invoices (b2ba), B2CL invoices (b2cla), exports (expa)
 *   9C  amended credit/debit notes: registered (cdnra), unregistered (cdnura)
 *   10  amended B2CS (b2csa) - needs the revised totals of the whole original month
 * Notes issued in the current period (table 9B) are ordinary CDNR/CDNUR rows
 * and are already part of the normal GSTR-1 sections.
 *
 * A cancelled document is reported as an amendment of the same number with
 * zero values (no portal rule for this was confirmed: verify with your CA).
 */

export type AmendedKey = "b2ba" | "b2cla" | "expa" | "cdnra" | "cdnura";
export const AMENDED_KEYS: AmendedKey[] = ["b2ba", "b2cla", "expa", "cdnra", "cdnura"];

const KEY_OF: Partial<Record<AmendSection, AmendedKey>> = {
  b2b: "b2ba",
  b2cl: "b2cla",
  exp: "expa",
  cdnr: "cdnra",
  cdnur: "cdnura",
};

export const AMENDED_LABELS: Record<AmendedKey | "b2csa", { table: string; label: string }> = {
  b2ba: { table: "9A", label: "Amended B2B invoices" },
  b2cla: { table: "9A", label: "Amended B2CL invoices" },
  expa: { table: "9A", label: "Amended exports" },
  cdnra: { table: "9C", label: "Amended credit/debit notes (registered)" },
  cdnura: { table: "9C", label: "Amended credit/debit notes (unregistered)" },
  b2csa: { table: "10", label: "Amended B2CS (by state and rate)" },
};

export interface AmendedRow {
  amendmentId: string;
  key: AmendedKey;
  original: { number: string; date: string };
  /** The document as it should now read; zero values when cancelled. */
  revised: AmendDoc;
  cancelled: boolean;
  /** Signed change in taxable value and tax (revised minus original; credit notes count negative). */
  delta: TaxValues;
}

export interface B2csaRow extends TaxValues {
  /** Original month, "2026-10". */
  month: string;
  supplyType: "INTRA" | "INTER";
  pos: string;
  rate: string;
}

export interface AmendmentWarning {
  amendmentId: string;
  message: string;
}

export interface AmendmentSections {
  rows: Record<AmendedKey, AmendedRow[]>;
  b2csa: B2csaRow[];
  /** Net change per section (signed). */
  totals: Record<AmendedKey | "b2csa", TaxValues & { count: number }>;
  /** Net change over all sections. */
  net: TaxValues;
  count: number;
  warnings: AmendmentWarning[];
}

const sign = (d: AmendDoc | null) => (d?.noteType === "C" ? -1 : 1);

function docHeads(d: AmendDoc | null) {
  if (!d) return zeroHeads();
  return sumItems(d.items as RateItem[]);
}

const zeroed = (d: AmendDoc): AmendDoc => ({
  ...d,
  value: "0.00",
  items: d.items.map((i) => ({
    rate: i.rate,
    taxable: "0.00",
    igst: "0.00",
    cgst: "0.00",
    sgst: "0.00",
    cess: "0.00",
  })),
});

/** Months of the original B2CS documents; the caller supplies their current GSTR-1 B2CS rows. */
export function b2csMonthsNeeded(amendments: readonly Amendment[]): string[] {
  const out = new Set<string>();
  for (const a of amendments) {
    if (a.section !== "b2cs") continue;
    const date = a.beforeDoc?.date || a.originalDate;
    if (date) out.add(monthKey(date));
  }
  return [...out].sort();
}

export interface BuildAmendmentInput {
  /** Amendments to report (already filtered for the target period and status). */
  amendments: readonly Amendment[];
  /** Current B2CS rows of each original month (GSTR-1 of that month as it stands today). */
  b2csByMonth?: ReadonlyMap<string, readonly B2csRow[]>;
}

export function buildAmendmentSections({
  amendments,
  b2csByMonth,
}: BuildAmendmentInput): AmendmentSections {
  const rows: Record<AmendedKey, AmendedRow[]> = {
    b2ba: [],
    b2cla: [],
    expa: [],
    cdnra: [],
    cdnura: [],
  };
  const warnings: AmendmentWarning[] = [];
  const b2csTouched = new Map<
    string,
    { month: string; supplyType: "INTRA" | "INTER"; pos: string; rate: string }
  >();
  let b2csDelta = zeroHeads();
  let b2csCount = 0;

  for (const a of amendments) {
    const warn = (message: string) => warnings.push({ amendmentId: a.id, message });
    const cancelled = !a.afterDoc;
    const before = a.beforeDoc;
    const base = a.afterDoc ?? (before ? zeroed(before) : null);
    if (!a.section) {
      warn(
        "This document is not in a GSTR-1 table that can be amended here (nil-rated or not reported).",
      );
      continue;
    }
    if (!before || !base) {
      warn("The original values are missing. Open the amendment and enter what you filed.");
      continue;
    }
    if (!a.beforeConfirmed)
      warn("The original values were not confirmed against what you filed. Check them first.");

    const delta = addHeads(
      addHeads(zeroHeads(), docHeads(base), sign(base)),
      docHeads(before),
      (sign(before) * -1) as 1 | -1,
    );

    if (a.section === "b2cs") {
      b2csDelta = addHeads(b2csDelta, delta);
      b2csCount++;
      const month = monthKey(before.date || a.originalDate);
      for (const it of [...before.items, ...base.items]) {
        const supplyType = (a.afterDoc ?? before).interState ? "INTER" : "INTRA";
        const pos = (a.afterDoc ?? before).pos;
        b2csTouched.set(`${month}|${supplyType}|${pos}|${it.rate}`, {
          month,
          supplyType,
          pos,
          rate: it.rate,
        });
      }
      // The pre-amendment side may sit in another place of supply.
      for (const it of before.items) {
        const supplyType = before.interState ? "INTER" : "INTRA";
        b2csTouched.set(`${month}|${supplyType}|${before.pos}|${it.rate}`, {
          month,
          supplyType,
          pos: before.pos,
          rate: it.rate,
        });
      }
      continue;
    }

    const key = KEY_OF[a.section];
    if (!key) continue;
    rows[key].push({
      amendmentId: a.id,
      key,
      original: { number: before.number || a.originalNumber, date: before.date || a.originalDate },
      revised: base,
      cancelled,
      delta: headsToValues(delta),
    });
  }

  // B2CS: report the CURRENT figures of every row touched, per original month.
  const b2csa: B2csaRow[] = [];
  for (const t of b2csTouched.values()) {
    const list = b2csByMonth?.get(t.month);
    if (!list) {
      warnings.push({
        amendmentId: "",
        message: `B2CS amendment for ${t.month}: the revised totals of that month are needed to fill this table.`,
      });
      continue;
    }
    const cur = list.find(
      (r) => r.supplyType === t.supplyType && r.pos === t.pos && r.rate === t.rate,
    );
    b2csa.push({
      ...t,
      ...(cur
        ? { taxable: cur.taxable, igst: cur.igst, cgst: cur.cgst, sgst: cur.sgst, cess: cur.cess }
        : headsToValues(zeroHeads())),
    });
  }
  b2csa.sort(
    (a, b) =>
      a.month.localeCompare(b.month) || a.pos.localeCompare(b.pos) || a.rate.localeCompare(b.rate),
  );

  const totals = {} as AmendmentSections["totals"];
  let net = zeroHeads();
  for (const key of AMENDED_KEYS) {
    let sum = zeroHeads();
    for (const r of rows[key])
      sum = addHeads(sum, {
        taxable: toDec(r.delta.taxable),
        igst: toDec(r.delta.igst),
        cgst: toDec(r.delta.cgst),
        sgst: toDec(r.delta.sgst),
        cess: toDec(r.delta.cess),
      });
    totals[key] = { count: rows[key].length, ...headsToValues(sum) };
    net = addHeads(net, sum);
  }
  totals.b2csa = { count: b2csCount, ...headsToValues(b2csDelta) };
  net = addHeads(net, b2csDelta);

  return {
    rows,
    b2csa,
    totals,
    net: headsToValues(net),
    count: AMENDED_KEYS.reduce((n, k) => n + rows[k].length, 0) + b2csCount,
    warnings,
  };
}

/** Amendments to report in `period`: matching target period and the given statuses. */
export function amendmentsForPeriod<T extends Pick<Amendment, "amendInPeriodKey" | "status">>(
  amendments: readonly T[],
  period: string,
  statuses: readonly Amendment["status"][] = ["ready"],
): T[] {
  return amendments.filter((a) => a.amendInPeriodKey === period && statuses.includes(a.status));
}

/** Pending = not yet reported (draft or ready). */
export function pendingAmendments<T extends Pick<Amendment, "status">>(
  amendments: readonly T[],
): T[] {
  return amendments.filter((a) => a.status !== "reported");
}

export const fmtDelta = (v: string) => fmt2(toDec(v));
