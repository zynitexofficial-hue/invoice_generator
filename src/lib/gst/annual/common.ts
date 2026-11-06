/**
 * Shared building blocks of the annual worksheets (GSTR-9, GSTR-9C, GSTR-4).
 * Pure: no React, no Dexie. Everything produced here is a DRAFT prepared from
 * the user's records; verify on the GST portal or with your CA.
 */
import { Dec, ZERO, roundTo, toDec } from "@/lib/money";

export const fmt2 = (d: Dec) => roundTo(d, 2).toFixed(2);

/** Column keys used by the worksheets. */
export const TAX_HEADS = ["igst", "cgst", "sgst", "cess"] as const;
export const VALUE_HEADS = ["taxable", ...TAX_HEADS] as const;

export const HEAD_LABELS: Record<string, string> = {
  taxable: "Taxable value",
  igst: "Integrated tax",
  cgst: "Central tax",
  sgst: "State/UT tax",
  cess: "Cess",
  interest: "Interest",
  penalty: "Penalty",
  other: "Other",
  payable: "Payable",
  cash: "Paid in cash",
  itc: "Paid by ITC",
  paid: "Paid",
  value: "Amount",
};

/** One document or expense behind a number (drill-down). */
export interface DrillRef {
  kind: "invoice" | "expense";
  id: string;
  /** Invoice/bill number ("" when none). */
  number: string;
  date: string;
  party: string;
  /** Signed taxable value as it enters the row (2 dp). */
  taxable: string;
  /** Signed GST as it enters the row (2 dp). */
  tax: string;
}

export type RowSource = "books" | "manual" | "derived";

export interface AnnualRow {
  /** "4B", "6B1", "9-igst" … also the prefix of the manual-input keys. */
  id: string;
  table: string;
  label: string;
  /** Columns that apply to this row. */
  heads: string[];
  /** Values computed from your records (null when the row is manual or derived). */
  books: Record<string, string> | null;
  /** Final values: manual entry where present, else books, else 0.00. */
  values: Record<string, string>;
  /** Heads whose value comes from a manual entry. */
  overridden: string[];
  source: RowSource;
  /** Records behind the books value. */
  drill: DrillRef[];
  note?: string;
  /** True when the official form's treatment of this row is unconfirmed here. */
  verify?: boolean;
  /** Shown in the label as "(−)" / "(+)" for rows that reduce / add. */
  sign?: "-" | "+";
  /** Sub-total / total rows. */
  total?: boolean;
}

/** Manual-input key of a cell. */
export const inputKey = (rowId: string, head: string) => `${rowId}.${head}`;

/** The manual value for a cell, if one is set (blank counts as unset). */
export function manualValue(
  inputs: Record<string, string> | undefined,
  rowId: string,
  head: string,
): string | undefined {
  const v = inputs?.[inputKey(rowId, head)];
  return v === undefined || v.trim() === "" ? undefined : v;
}

export interface RowDef {
  id: string;
  table: string;
  label: string;
  heads: string[];
  /** Computed-from-records values; omit for manual rows. */
  books?: object;
  drill?: DrillRef[];
  note?: string;
  verify?: boolean;
  sign?: "-" | "+";
}

/** Collects rows and resolves manual overrides / derived totals. */
export class Sheet {
  readonly rows: AnnualRow[] = [];
  private readonly byId = new Map<string, AnnualRow>();

  constructor(private readonly inputs: Record<string, string>) {}

  /** A row filled from records (or manual-only when `books` is omitted). */
  add(def: RowDef): AnnualRow {
    const src = def.books as Record<string, Dec | undefined> | undefined;
    const books = src ? Object.fromEntries(def.heads.map((h) => [h, fmt2(src[h] ?? ZERO)])) : null;
    const values: Record<string, string> = {};
    const overridden: string[] = [];
    for (const h of def.heads) {
      const m = manualValue(this.inputs, def.id, h);
      if (m !== undefined) {
        values[h] = fmt2(toDec(m));
        overridden.push(h);
      } else values[h] = books?.[h] ?? "0.00";
    }
    return this.push({
      id: def.id,
      table: def.table,
      label: def.label,
      heads: def.heads,
      books,
      values,
      overridden,
      source: def.books ? "books" : "manual",
      drill: def.drill ?? [],
      note: def.note,
      verify: def.verify,
      sign: def.sign,
    });
  }

  /** A calculated row: `parts` are summed with their signs per head. */
  derive(
    def: Omit<RowDef, "books" | "drill">,
    parts: { id: string; sign?: 1 | -1; heads?: Record<string, string> }[],
  ): AnnualRow {
    const values: Record<string, string> = {};
    for (const h of def.heads) {
      let acc = ZERO;
      for (const p of parts) {
        const src = this.get(p.id);
        const from = p.heads?.[h] ?? h;
        acc = acc.plus(toDec(src.values[from]).times(p.sign ?? 1));
      }
      values[h] = fmt2(acc);
    }
    return this.push({
      ...def,
      books: null,
      values,
      overridden: [],
      source: "derived",
      drill: [],
      total: true,
    });
  }

  get(id: string): AnnualRow {
    const r = this.byId.get(id);
    if (!r) throw new Error(`Unknown row ${id}`);
    return r;
  }

  val(id: string, head: string): Dec {
    return toDec(this.get(id).values[head]);
  }

  private push(row: AnnualRow): AnnualRow {
    this.rows.push(row);
    this.byId.set(row.id, row);
    return row;
  }
}

/** Sum of a head over rows (as Dec). */
export function sumHead(rows: AnnualRow[], head: string, field: "values" | "books" = "values") {
  return rows.reduce((acc, r) => acc.plus(toDec((r[field] ?? r.values)[head])), ZERO);
}

export interface WorksheetCheck {
  id: string;
  label: string;
  expected: string;
  actual: string;
  /** actual − expected (2 dp). */
  difference: string;
  ok: boolean;
  explanation?: string;
}

export function makeCheck(
  id: string,
  label: string,
  expected: Dec,
  actual: Dec,
  explanation?: string,
): WorksheetCheck {
  const diff = actual.minus(expected);
  return {
    id,
    label,
    expected: fmt2(expected),
    actual: fmt2(actual),
    difference: fmt2(diff),
    ok: roundTo(diff, 2).isZero(),
    explanation,
  };
}
