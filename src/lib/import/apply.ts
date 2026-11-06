/**
 * Writes an import plan to the local database in one transaction per
 * import. One audit entry (action "import") summarises the whole batch.
 */

import { logAudit } from "@/db/audit";
import { getDb } from "@/db/db";
import { guardedWrite } from "@/db/write";
import { nowISO } from "@/lib/dates";
import { computeExpenseSummary } from "@/lib/expense-calc";
import { newId } from "@/lib/invoice-factory";
import { catalogItemSchema, customerSchema, expenseSchema, type AuditEntity } from "@/lib/schema";
import { plural } from "@/lib/utils";
import { ENTITY_DEFS, type ImportEntity } from "./fields";
import type { DuplicatePolicy, PlanRow } from "./plan";
import type { CustomerValue, ExpenseValue, ItemValue } from "./validate";

export interface ImportSummary {
  created: number;
  merged: number;
  skipped: number;
  /** Rows with errors, left out. */
  failed: number;
}

/** Existing record with every non-empty text value from the file laid over it. */
export function mergeNonEmpty<T extends object>(existing: T, incoming: Partial<T>): T {
  const out = { ...existing } as Record<string, unknown>;
  for (const [k, v] of Object.entries(incoming)) {
    if (typeof v === "string" && v.trim() !== "") out[k] = v;
  }
  return out as T;
}

const AUDIT_ENTITY: Record<ImportEntity, AuditEntity> = {
  customers: "customer",
  items: "item",
  expenses: "expense",
};

export async function applyImport(
  entity: ImportEntity,
  plan: PlanRow[],
  policy: DuplicatePolicy,
  fileName: string,
): Promise<ImportSummary> {
  const db = getDb();
  const summary: ImportSummary = { created: 0, merged: 0, skipped: 0, failed: 0 };
  const now = nowISO();
  const batchId = newId();
  const table = db.table(entity === "expenses" ? "expenses" : entity);

  await guardedWrite(`the imported ${ENTITY_DEFS[entity].plural}`, () =>
    db.transaction("rw", [table, db.auditLog], async () => {
      const puts: unknown[] = [];
      for (const row of plan) {
        if (row.status === "error") {
          summary.failed++;
          continue;
        }
        if (row.status === "duplicate_in_file" || !row.value) {
          summary.skipped++;
          continue;
        }
        if (row.status === "duplicate" && policy === "skip") {
          summary.skipped++;
          continue;
        }
        const merging = row.status === "duplicate" && policy === "merge" && row.matchId;
        const existing = merging ? await table.get(row.matchId!) : undefined;
        if (merging && !existing) {
          // The saved record vanished since the preview; add it instead.
          summary.created++;
        }
        puts.push(buildRecord(entity, row.value, existing, now));
        if (existing) summary.merged++;
        else if (!merging) summary.created++;
      }
      if (puts.length) await table.bulkPut(puts);
      if (puts.length) {
        const parts = [
          summary.created ? `${summary.created} added` : "",
          summary.merged ? `${summary.merged} merged` : "",
          summary.skipped ? `${summary.skipped} skipped` : "",
          summary.failed ? `${summary.failed} with errors left out` : "",
        ].filter(Boolean);
        await logAudit({
          entity: AUDIT_ENTITY[entity],
          entityId: batchId,
          action: "import",
          summary: `Imported ${plural(puts.length, ENTITY_DEFS[entity].singular)} from ${fileName || "a CSV file"} (${parts.join(", ")})`,
        });
      }
    }),
  );
  return summary;
}

function buildRecord(
  entity: ImportEntity,
  value: CustomerValue | ItemValue | ExpenseValue,
  existingRaw: unknown,
  now: string,
) {
  if (entity === "customers") {
    const v = value as CustomerValue;
    if (existingRaw) {
      const old = customerSchema.parse(existingRaw);
      return customerSchema.parse({
        ...mergeNonEmpty(old, v),
        id: old.id,
        createdAt: old.createdAt,
        updatedAt: now,
      });
    }
    return customerSchema.parse({ ...v, id: newId(), createdAt: now, updatedAt: now });
  }
  if (entity === "items") {
    const v = value as ItemValue;
    if (existingRaw) {
      const old = catalogItemSchema.parse(existingRaw);
      return catalogItemSchema.parse({
        ...mergeNonEmpty(old, v),
        id: old.id,
        createdAt: old.createdAt,
        updatedAt: now,
      });
    }
    return catalogItemSchema.parse({ ...v, id: newId(), createdAt: now, updatedAt: now });
  }
  const v = value as ExpenseValue;
  const base = existingRaw
    ? (() => {
        const old = expenseSchema.parse(existingRaw);
        return { ...mergeNonEmpty(old, v), id: old.id, createdAt: old.createdAt };
      })()
    : { ...v, id: newId(), createdAt: now };
  const parsed = expenseSchema.parse({ ...base, updatedAt: now });
  return { ...parsed, summary: computeExpenseSummary(parsed) };
}
