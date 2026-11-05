import { z } from "zod";
import { newId } from "@/lib/invoice-factory";
import { computeTotals, summarize } from "@/lib/invoice-calc";
import {
  BACKUP_FILE_FORMAT,
  INVOICE_FILE_FORMAT,
  INVOICE_SCHEMA_VERSION,
  backupFileSchema,
  invoiceFileSchema,
  settingsSchema,
  type BackupFile,
  type Invoice,
} from "@/lib/schema";
import { downloadBlob, safeFileName } from "@/lib/utils";
import { getDb } from "./db";
import { resetMarker } from "./health";
import { loadSettings, updateSettings } from "./settings";
import { guardedWrite } from "./write";

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
export const BACKUP_SCHEMA_VERSION = 1;

export class ImportError extends Error {}

function parseJson(text: string): unknown {
  if (text.length > MAX_IMPORT_BYTES) throw new ImportError("This file is too large to import.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ImportError("This file isn't valid JSON.");
  }
}

function describeZodError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "The file has an unexpected structure.";
  const path = issue.path.join(".");
  return `The file has unexpected data${path ? ` at “${path}”` : ""}: ${issue.message}`;
}

/** Older file versions are migrated here, step by step, before validation. */
function migrate(
  raw: Record<string, unknown>,
  current: number,
  kind: string,
): Record<string, unknown> {
  const version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 1;
  if (version > current) {
    throw new ImportError(
      `This ${kind} was created by a newer version of the app. Please update and try again.`,
    );
  }
  // v1 is the first version — future migrations go here: if (version < 2) { … }
  return raw;
}

/* ---------------- Single invoice files ---------------- */

export function invoiceFileName(invoice: Invoice) {
  const who = invoice.customer.name.trim() || invoice.customer.company.trim();
  return `${safeFileName(`${invoice.number || "document"}${who ? ` - ${who}` : ""}`)}.invoice.json`;
}

export function exportInvoiceFile(invoice: Invoice) {
  const file = {
    format: INVOICE_FILE_FORMAT,
    schemaVersion: INVOICE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    invoice,
  };
  downloadBlob(
    new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }),
    invoiceFileName(invoice),
  );
}

/** Validate an invoice file and return a fresh record ready to save (new id). */
export function parseInvoiceFile(text: string): Invoice {
  const raw = parseJson(text);
  if (!raw || typeof raw !== "object") throw new ImportError("This file isn't an invoice file.");
  const obj = raw as Record<string, unknown>;
  if (obj.format === BACKUP_FILE_FORMAT)
    throw new ImportError("This is a full backup. Restore it from Settings → Data & backup.");
  if (obj.format !== INVOICE_FILE_FORMAT)
    throw new ImportError("This file isn't an invoice file from this app.");
  const parsed = invoiceFileSchema.safeParse(migrate(obj, INVOICE_SCHEMA_VERSION, "invoice file"));
  if (!parsed.success) throw new ImportError(describeZodError(parsed.error));
  const invoice = parsed.data.invoice;
  const now = new Date().toISOString();
  const fresh: Invoice = {
    ...invoice,
    id: newId(),
    lines: invoice.lines.map((l) => ({ ...l, id: newId() })),
    autoNumber: null,
    seqCommitted: true,
    createdAt: invoice.createdAt || now,
    updatedAt: now,
  };
  // Totals are always recomputed — never trusted from a file.
  return { ...fresh, summary: summarize(computeTotals(fresh)) };
}

/* ---------------- Full backups ---------------- */

export async function buildBackup(): Promise<BackupFile> {
  const db = getDb();
  const [settings, customers, items, invoices, designs, counters] = await Promise.all([
    loadSettings(),
    db.customers.toArray(),
    db.items.toArray(),
    db.invoices.toArray(),
    db.designs.toArray(),
    db.counters.toArray(),
  ]);
  return {
    format: BACKUP_FILE_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: { settings, customers, items, invoices, designs, counters },
  };
}

export async function downloadBackup() {
  const backup = await buildBackup();
  const stamp = backup.exportedAt.slice(0, 10);
  downloadBlob(
    new Blob([JSON.stringify(backup)], { type: "application/json" }),
    `invoice-generator-backup-${stamp}.json`,
  );
  await updateSettings((s) => ({ ...s, backup: { ...s.backup, lastBackupAt: backup.exportedAt } }));
  return backup;
}

export function parseBackup(text: string): BackupFile {
  const raw = parseJson(text);
  if (!raw || typeof raw !== "object") throw new ImportError("This file isn't a backup.");
  const obj = raw as Record<string, unknown>;
  if (obj.format === INVOICE_FILE_FORMAT)
    throw new ImportError("This is a single invoice file. Open it from the History page instead.");
  if (obj.format !== BACKUP_FILE_FORMAT)
    throw new ImportError("This file isn't a backup from this app.");
  const parsed = backupFileSchema.safeParse(migrate(obj, BACKUP_SCHEMA_VERSION, "backup"));
  if (!parsed.success) throw new ImportError(describeZodError(parsed.error));
  return parsed.data;
}

export interface BackupSummary {
  invoices: number;
  customers: number;
  items: number;
  designs: number;
  hasSettings: boolean;
  exportedAt: string;
}

export function summarizeBackup(b: BackupFile): BackupSummary {
  return {
    invoices: b.data.invoices.length,
    customers: b.data.customers.length,
    items: b.data.items.length,
    designs: b.data.designs.length,
    hasSettings: Boolean(b.data.settings),
    exportedAt: b.exportedAt,
  };
}

export type RestoreMode = "merge" | "replace";

/**
 * merge:   add new records and update existing ones when the backup copy is newer.
 *          Settings are kept — unless this browser has no business profile yet,
 *          in which case the backup's profile and settings are used.
 *          Counters keep the higher value.
 * replace: wipe everything, then load the backup (including settings).
 */
export async function restoreBackup(backup: BackupFile, mode: RestoreMode) {
  const db = getDb();
  const d = backup.data;
  const invoices = d.invoices.map((inv) => ({ ...inv, summary: summarize(computeTotals(inv)) }));

  await guardedWrite(
    "the restored data",
    () =>
      db.transaction(
        "rw",
        [db.settings, db.customers, db.items, db.invoices, db.designs, db.counters],
        async () => {
          if (mode === "replace") {
            await Promise.all([
              db.customers.clear(),
              db.items.clear(),
              db.invoices.clear(),
              db.designs.clear(),
              db.counters.clear(),
            ]);
            await db.settings.put(settingsSchema.parse({ ...(d.settings ?? {}), id: "app" }));
            await db.customers.bulkPut(d.customers);
            await db.items.bulkPut(d.items);
            await db.invoices.bulkPut(invoices);
            await db.designs.bulkPut(d.designs);
            await db.counters.bulkPut(d.counters);
            return;
          }
          const currentSettings = await db.settings.get("app");
          if (d.settings && !currentSettings?.profile?.name?.trim()) {
            await db.settings.put(settingsSchema.parse({ ...d.settings, id: "app" }));
          }
          const mergeNewer = async <T extends { id: string; updatedAt: string }>(
            rows: T[],
            get: (id: string) => Promise<T | undefined>,
            put: (row: T) => Promise<unknown>,
          ) => {
            for (const row of rows) {
              const existing = await get(row.id);
              if (!existing || (row.updatedAt || "") > (existing.updatedAt || "")) await put(row);
            }
          };
          await mergeNewer(
            d.customers,
            (id) => db.customers.get(id),
            (r) => db.customers.put(r),
          );
          await mergeNewer(
            d.items,
            (id) => db.items.get(id),
            (r) => db.items.put(r),
          );
          await mergeNewer(
            invoices,
            (id) => db.invoices.get(id),
            (r) => db.invoices.put(r),
          );
          await mergeNewer(
            d.designs,
            (id) => db.designs.get(id),
            (r) => db.designs.put(r),
          );
          for (const c of d.counters) {
            const existing = await db.counters.get(c.key);
            if (!existing || c.value > existing.value) await db.counters.put(c);
          }
        },
      ),
    { deletion: mode === "replace" },
  );
  if (mode === "replace") await resetMarker();
}

/** Remove everything stored by the app in this browser. */
export async function clearAllData() {
  const db = getDb();
  await guardedWrite(
    "the change",
    () =>
      db.transaction(
        "rw",
        [db.settings, db.customers, db.items, db.invoices, db.designs, db.counters],
        async () => {
          await Promise.all([
            db.settings.clear(),
            db.customers.clear(),
            db.items.clear(),
            db.invoices.clear(),
            db.designs.clear(),
            db.counters.clear(),
          ]);
        },
      ),
    { deletion: true },
  );
  await resetMarker();
}
