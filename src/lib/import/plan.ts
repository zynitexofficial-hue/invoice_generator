/**
 * Turns validated rows into an import plan: which rows are new, which clash
 * with something already saved (or with an earlier row in the same file),
 * and which have errors. Pure; the database write is in apply.ts.
 */

import { toCsv } from "@/lib/csv";
import { Dec } from "@/lib/money";
import type { CatalogItem, Customer, Expense } from "@/lib/schema";
import { ENTITY_DEFS, templateRows, type ImportEntity } from "./fields";
import type { AnyValue, CustomerValue, ExpenseValue, ItemValue, RowResult } from "./validate";

export type DuplicatePolicy = "skip" | "merge" | "add";
export type RowStatus = "new" | "duplicate" | "duplicate_in_file" | "error";

export interface PlanRow {
  line: number;
  raw: Record<string, string>;
  status: RowStatus;
  errors: string[];
  warnings: string[];
  value?: AnyValue;
  /** Id of the saved record this row clashes with (status "duplicate"). */
  matchId?: string;
  /** Short description of what it clashes with. */
  matchLabel?: string;
}

export interface ExistingData {
  customers: Customer[];
  items: CatalogItem[];
  expenses: Expense[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/* ---------------- Duplicate keys ---------------- */

export function customerKey(v: Pick<CustomerValue, "gstin" | "name">): string {
  return v.gstin ? `g:${v.gstin.toUpperCase()}` : `n:${norm(v.name)}`;
}
export function itemKey(v: Pick<ItemValue, "name" | "hsnSac">): string {
  return `${norm(v.name)}|${v.hsnSac.replace(/\s+/g, "")}`;
}
export function expenseKey(v: Pick<ExpenseValue, "date" | "amount" | "vendorName">): string {
  let amount = v.amount ?? "";
  try {
    amount = new Dec(v.amount || "0").toFixed(2);
  } catch {
    /* keep raw */
  }
  return `${v.date}|${amount}|${norm(v.vendorName ?? "")}`;
}

interface Match {
  id: string;
  label: string;
}

function indexExisting(entity: ImportEntity, data: ExistingData) {
  const byKey = new Map<string, Match>();
  const byName = new Map<string, Match>(); // customers: name-only fallback for records without a GSTIN
  if (entity === "customers") {
    for (const c of data.customers) {
      const label = c.company || c.name;
      if (c.gstin) byKey.set(`g:${c.gstin.toUpperCase()}`, { id: c.id, label });
      else byKey.set(`n:${norm(c.name)}`, { id: c.id, label });
      if (!c.gstin) byName.set(norm(c.name), { id: c.id, label });
    }
  } else if (entity === "items") {
    for (const i of data.items) byKey.set(itemKey(i), { id: i.id, label: i.name });
  } else {
    for (const e of data.expenses)
      byKey.set(expenseKey({ date: e.date, amount: e.amount, vendorName: e.vendorName }), {
        id: e.id,
        label: [e.vendorName || e.description, e.date].filter(Boolean).join(" · "),
      });
  }
  return { byKey, byName };
}

function keyOf(entity: ImportEntity, value: AnyValue): string {
  if (entity === "customers") return customerKey(value as CustomerValue);
  if (entity === "items") return itemKey(value as ItemValue);
  return expenseKey(value as ExpenseValue);
}

export function buildPlan(
  entity: ImportEntity,
  results: RowResult<AnyValue>[],
  existing: ExistingData,
): PlanRow[] {
  const { byKey, byName } = indexExisting(entity, existing);
  const seenInFile = new Map<string, number>();
  return results.map((r): PlanRow => {
    const base = { line: r.line, raw: r.raw, errors: r.errors, warnings: [...r.warnings] };
    if (r.errors.length || !r.value) return { ...base, status: "error" };
    const key = keyOf(entity, r.value);
    const earlier = seenInFile.get(key);
    if (earlier !== undefined) {
      return {
        ...base,
        value: r.value,
        status: "duplicate_in_file",
        matchLabel: `Same as line ${earlier}`,
      };
    }
    seenInFile.set(key, r.line);
    let match = byKey.get(key);
    if (!match && entity === "customers") match = byName.get(norm((r.value as CustomerValue).name));
    if (match) {
      return {
        ...base,
        value: r.value,
        status: "duplicate",
        matchId: match.id,
        matchLabel: `Already saved: ${match.label}`,
      };
    }
    return { ...base, value: r.value, status: "new" };
  });
}

export interface PlanCounts {
  total: number;
  new: number;
  duplicate: number;
  duplicateInFile: number;
  error: number;
}

export function countPlan(rows: PlanRow[]): PlanCounts {
  const c: PlanCounts = { total: rows.length, new: 0, duplicate: 0, duplicateInFile: 0, error: 0 };
  for (const r of rows) {
    if (r.status === "new") c.new++;
    else if (r.status === "duplicate") c.duplicate++;
    else if (r.status === "duplicate_in_file") c.duplicateInFile++;
    else c.error++;
  }
  return c;
}

/** How many records the chosen policy will create or update. */
export function importableCount(rows: PlanRow[], policy: DuplicatePolicy): number {
  const c = countPlan(rows);
  return c.new + (policy === "skip" ? 0 : c.duplicate);
}

/* ---------------- CSV outputs ---------------- */

/** Rows with errors, with the reasons in the first column, in the same layout as the uploaded file. */
export function errorReportCsv(headers: string[], rows: string[][], plan: PlanRow[]): string {
  const bad = plan.filter((p) => p.status === "error");
  return toCsv(
    ["Line", "Problems", ...headers],
    bad.map((p) => [p.line, p.errors.join(" "), ...(rows[p.line - 2] ?? [])]),
  );
}

export function templateCsv(entity: ImportEntity): string {
  const { headers, rows } = templateRows(entity);
  return toCsv(headers, rows);
}

export function entityTemplateName(entity: ImportEntity): string {
  return ENTITY_DEFS[entity].fileName;
}
