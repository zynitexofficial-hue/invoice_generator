"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  settingsSchema,
  type AppSettings,
  type AuditEntity,
  type AuditEntry,
  type Expense,
  type Filing,
  type Income,
  type Invoice,
  type ReturnSnapshot,
} from "@/lib/schema";
import { auditFor } from "./audit";
import { getDb } from "./db";
import { parseRows, readDataHealth, readTable, TABLE_SCHEMAS, type DataHealth } from "./read";

/** Live settings with defaults applied. `undefined` while loading. */
export function useSettings(): AppSettings | undefined {
  return useLiveQuery(async () => {
    const raw = await getDb().settings.get("app");
    const parsed = settingsSchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : settingsSchema.parse({});
  }, []);
}

export function useCustomers() {
  return useLiveQuery(() => getDb().customers.orderBy("name").toArray(), []);
}

export function useItems() {
  return useLiveQuery(() => getDb().items.orderBy("name").toArray(), []);
}

export function useDesigns() {
  return useLiveQuery(() => getDb().designs.orderBy("updatedAt").reverse().toArray(), []);
}

/**
 * All valid invoices, most recently edited first. Rows that fail validation
 * are left out here and counted by useDataHealth().
 */
export function useInvoices(): Invoice[] | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().invoices.orderBy("updatedAt").reverse().toArray();
    return parseRows(rows, TABLE_SCHEMAS.invoices).rows;
  }, []);
}

/** Valid expenses, newest date first (invalid rows: see useDataHealth). */
export function useExpenses(): Expense[] | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().expenses.orderBy("date").reverse().toArray();
    return parseRows(rows, TABLE_SCHEMAS.expenses).rows;
  }, []);
}

/** Valid other-income entries, newest date first. */
export function useIncomes(): Income[] | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().incomes.orderBy("date").reverse().toArray();
    return parseRows(rows, TABLE_SCHEMAS.incomes).rows;
  }, []);
}

/** All filing tracker rows. */
export function useFilings(): Filing[] | undefined {
  return useLiveQuery(async () => (await readTable("filings")).rows, []);
}

/** Snapshots of one filing, newest first. */
export function useReturnSnapshots(filingId: string | undefined): ReturnSnapshot[] | undefined {
  return useLiveQuery(async () => {
    if (!filingId) return [];
    const rows = await getDb()
      .returnSnapshots.where("filingId")
      .equals(filingId)
      .sortBy("createdAt");
    return parseRows(rows, TABLE_SCHEMAS.returnSnapshots).rows.reverse();
  }, [filingId]);
}

/** Change history of one record, oldest first. */
export function useAudit(entity: AuditEntity, id: string | undefined): AuditEntry[] | undefined {
  return useLiveQuery(async () => (id ? auditFor(entity, id) : []), [entity, id]);
}

/** Number of stored rows per table that fail validation (spec A8). */
export function useDataHealth(): DataHealth | undefined {
  return useLiveQuery(() => readDataHealth(), []);
}

export function useMetaValue<T>(key: string): T | undefined {
  return useLiveQuery(async () => (await getDb().meta.get(key))?.value as T | undefined, [key]);
}
