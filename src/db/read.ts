import type { z } from "zod";
import {
  amendmentSchema,
  annualInputSchema,
  attachmentBlobSchema,
  attachmentSchema,
  auditEntrySchema,
  catalogItemSchema,
  customerSchema,
  expenseSchema,
  filingSchema,
  gstr2bImportSchema,
  gstr2bMatchSchema,
  incomeSchema,
  invoiceSchema,
  paymentEntrySchema,
  periodInputSchema,
  purchaseSchema,
  recurringSchema,
  returnSnapshotSchema,
  savedDesignSchema,
  vendorSchema,
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
  // v3 (Phase 2-4)
  payments: paymentEntrySchema,
  amendments: amendmentSchema,
  recurring: recurringSchema,
  vendors: vendorSchema,
  purchases: purchaseSchema,
  attachments: attachmentSchema,
  attachmentBlobs: attachmentBlobSchema,
  gstr2bImports: gstr2bImportSchema,
  gstr2bMatches: gstr2bMatchSchema,
  periodInputs: periodInputSchema,
  annualInputs: annualInputSchema,
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

/**
 * Number of rows in a table that fail validation. Streams rows with a cursor
 * so large tables (e.g. attachment contents) are never held in memory at once.
 */
export async function countInvalid(table: ValidatedTable): Promise<number> {
  const schema = TABLE_SCHEMAS[table];
  let invalid = 0;
  await getDb()
    .table(table)
    .each((row: unknown) => {
      if (!schema.safeParse(row).success) invalid++;
    });
  return invalid;
}

/** Invalid row counts per table. */
export async function readDataHealth(): Promise<DataHealth> {
  const entries = await Promise.all(
    VALIDATED_TABLES.map(async (t) => [t, await countInvalid(t)] as const),
  );
  return Object.fromEntries(entries) as DataHealth;
}
