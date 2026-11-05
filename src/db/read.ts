import type { z } from "zod";
import {
  auditEntrySchema,
  catalogItemSchema,
  customerSchema,
  expenseSchema,
  filingSchema,
  incomeSchema,
  invoiceSchema,
  returnSnapshotSchema,
  savedDesignSchema,
} from "@/lib/schema";
import { getDb } from "./db";

/**
 * Read helpers: every row is validated with zod; rows that fail are counted
 * (never silently dropped) so the UI can report them (spec A8).
 */

export interface ParsedRows<T> {
  rows: T[];
  /** Number of stored rows that failed validation. */
  invalid: number;
}

export function parseRows<S extends z.ZodType>(raw: unknown[], schema: S): ParsedRows<z.infer<S>> {
  const rows: z.infer<S>[] = [];
  let invalid = 0;
  for (const r of raw) {
    const parsed = schema.safeParse(r);
    if (parsed.success) rows.push(parsed.data);
    else invalid++;
  }
  return { rows, invalid };
}

/** Schemas for every validated table (settings/counters/meta are handled separately). */
export const TABLE_SCHEMAS = {
  customers: customerSchema,
  items: catalogItemSchema,
  invoices: invoiceSchema,
  designs: savedDesignSchema,
  expenses: expenseSchema,
  incomes: incomeSchema,
  filings: filingSchema,
  returnSnapshots: returnSnapshotSchema,
  auditLog: auditEntrySchema,
} as const;
export type ValidatedTable = keyof typeof TABLE_SCHEMAS;
export const VALIDATED_TABLES = Object.keys(TABLE_SCHEMAS) as ValidatedTable[];

/** Read and validate a whole table. */
export async function readTable<K extends ValidatedTable>(
  table: K,
): Promise<ParsedRows<z.infer<(typeof TABLE_SCHEMAS)[K]>>> {
  const raw = (await getDb().table(table).toArray()) as unknown[];
  return parseRows(raw, TABLE_SCHEMAS[table]) as ParsedRows<z.infer<(typeof TABLE_SCHEMAS)[K]>>;
}

/** Raw rows that fail validation (for "Download raw rows" in Settings → Data). */
export async function invalidRows(table: ValidatedTable): Promise<unknown[]> {
  const raw = (await getDb().table(table).toArray()) as unknown[];
  return raw.filter((r) => !TABLE_SCHEMAS[table].safeParse(r).success);
}

export type DataHealth = Record<ValidatedTable, number>;

/** Invalid row counts per table. */
export async function readDataHealth(): Promise<DataHealth> {
  const entries = await Promise.all(
    VALIDATED_TABLES.map(async (t) => [t, (await readTable(t)).invalid] as const),
  );
  return Object.fromEntries(entries) as DataHealth;
}
