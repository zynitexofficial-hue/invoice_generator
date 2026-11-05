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
import {
  BackupCryptoError,
  decryptBackup,
  encryptBackup,
  isEncryptedBackup,
} from "@/lib/backup-crypto";
import { computeExpenseSummary } from "@/lib/expense-calc";
import { logAudit } from "./audit";
import { getDb, type AppDatabase } from "./db";
import { resetMarker } from "./health";
import { loadSettings, updateSettings } from "./settings";
import { guardedWrite } from "./write";

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
export const BACKUP_SCHEMA_VERSION = 2;

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
  // Backup v1 → v2: the new tables (expenses, incomes, filings, returnSnapshots,
  // auditLog) default to empty arrays in the schema; settings.security is dropped
  // by the schema. Invoice rows are upgraded v1 → v2 by invoiceSchema itself.
  // Invoice files v1 → v2: handled by invoiceSchema (schemaVersion 1 is accepted).
  return { ...raw, schemaVersion: current };
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
  const [
    settings,
    customers,
    items,
    invoices,
    designs,
    counters,
    expenses,
    incomes,
    filings,
    returnSnapshots,
    auditLog,
  ] = await Promise.all([
    loadSettings(),
    db.customers.toArray(),
    db.items.toArray(),
    db.invoices.toArray(),
    db.designs.toArray(),
    db.counters.toArray(),
    db.expenses.toArray(),
    db.incomes.toArray(),
    db.filings.toArray(),
    db.returnSnapshots.toArray(),
    db.auditLog.toArray(),
  ]);
  // The PIN hash/salt never leave this browser (spec H3).
  const { security: _security, ...portableSettings } = settings;
  void _security;
  return {
    format: BACKUP_FILE_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      settings: portableSettings,
      customers,
      items,
      invoices,
      designs,
      counters,
      expenses,
      incomes,
      filings,
      returnSnapshots,
      auditLog,
    },
  };
}

/** Serialize a backup, encrypting it when a passphrase is given. */
export async function serializeBackup(backup: BackupFile, passphrase?: string): Promise<string> {
  const json = JSON.stringify(backup);
  return passphrase ? encryptBackup(json, passphrase) : json;
}

export function backupDownloadName(exportedAt: string, encrypted: boolean) {
  return `invoice-generator-backup-${exportedAt.slice(0, 10)}${encrypted ? "-encrypted" : ""}.json`;
}

/**
 * Download a full backup. With a passphrase the file is encrypted (spec H2);
 * the passphrase itself is never stored.
 */
export async function downloadBackup(opts: { passphrase?: string } = {}) {
  const backup = await buildBackup();
  const text = await serializeBackup(backup, opts.passphrase);
  downloadBlob(
    new Blob([text], { type: "application/json" }),
    backupDownloadName(backup.exportedAt, Boolean(opts.passphrase)),
  );
  await markBackedUp(backup.exportedAt);
  return backup;
}

/** Remember when the last successful backup was made (for reminders). */
export async function markBackedUp(at: string) {
  await updateSettings((s) => ({ ...s, backup: { ...s.backup, lastBackupAt: at } }), {
    bookkeeping: true,
  });
}

/** Parse a plain (unencrypted) backup file. Encrypted files: use parseBackupFile. */
export function parseBackup(text: string): BackupFile {
  return parseBackupObject(parseJson(text));
}

function parseBackupObject(raw: unknown): BackupFile {
  if (!raw || typeof raw !== "object") throw new ImportError("This file isn't a backup.");
  const obj = raw as Record<string, unknown>;
  if (obj.format === INVOICE_FILE_FORMAT)
    throw new ImportError("This is a single invoice file. Open it from the History page instead.");
  if (isEncryptedBackup(obj))
    throw new ImportError("This backup is encrypted. Enter its passphrase to open it.");
  if (obj.format !== BACKUP_FILE_FORMAT)
    throw new ImportError("This file isn't a backup from this app.");
  const parsed = backupFileSchema.safeParse(migrate(obj, BACKUP_SCHEMA_VERSION, "backup"));
  if (!parsed.success) throw new ImportError(describeZodError(parsed.error));
  return parsed.data;
}

/** True when the text is a passphrase-encrypted backup (no decryption is attempted). */
export function isEncryptedBackupText(text: string): boolean {
  if (text.length > MAX_IMPORT_BYTES) return false;
  try {
    return isEncryptedBackup(JSON.parse(text));
  } catch {
    return false;
  }
}

/** Thrown when the user cancels the passphrase prompt. */
export class RestoreCancelledError extends Error {
  constructor() {
    super("Restore cancelled.");
    this.name = "RestoreCancelledError";
  }
}

/**
 * Parse any backup file — plain or encrypted. For an encrypted file,
 * `getPassphrase` is asked for the passphrase (return null to cancel).
 * A wrong passphrase throws BackupCryptoError (code "wrong_passphrase"); the
 * caller decides whether to ask again.
 */
export async function parseBackupFile(
  text: string,
  getPassphrase: () => Promise<string | null> | string | null,
): Promise<{ backup: BackupFile; encrypted: boolean }> {
  const raw = parseJson(text);
  if (!isEncryptedBackup(raw)) return { backup: parseBackupObject(raw), encrypted: false };
  const passphrase = await getPassphrase();
  if (passphrase === null) throw new RestoreCancelledError();
  const plain = await decryptBackup(raw, passphrase);
  let inner: unknown;
  try {
    inner = JSON.parse(plain);
  } catch {
    throw new BackupCryptoError(
      "The decrypted backup isn't valid. The file may be damaged.",
      "corrupted",
    );
  }
  return { backup: parseBackupObject(inner), encrypted: true };
}

export interface BackupSummary {
  invoices: number;
  customers: number;
  items: number;
  designs: number;
  expenses: number;
  incomes: number;
  filings: number;
  hasSettings: boolean;
  exportedAt: string;
  encrypted: boolean;
}

export function summarizeBackup(b: BackupFile, encrypted = false): BackupSummary {
  return {
    invoices: b.data.invoices.length,
    customers: b.data.customers.length,
    items: b.data.items.length,
    designs: b.data.designs.length,
    expenses: b.data.expenses.length,
    incomes: b.data.incomes.length,
    filings: b.data.filings.length,
    hasSettings: Boolean(b.data.settings),
    exportedAt: b.exportedAt,
    encrypted,
  };
}

export type RestoreMode = "merge" | "replace";

/**
 * merge:   add new records and update existing ones when the backup copy is newer.
 *          Settings are kept — unless this browser has no business profile yet,
 *          in which case the backup's profile and settings are used.
 *          Counters keep the higher value; snapshots and audit entries are added.
 * replace: wipe everything, then load the backup (including settings).
 *
 * Either way this browser's security settings (PIN) are never overwritten.
 */
export async function restoreBackup(backup: BackupFile, mode: RestoreMode) {
  const db = getDb();
  const d = backup.data;
  const invoices = d.invoices.map((inv) => ({ ...inv, summary: summarize(computeTotals(inv)) }));
  const expenses = d.expenses.map((e) => ({ ...e, summary: computeExpenseSummary(e) }));

  await guardedWrite(
    "the restored data",
    () =>
      db.transaction("rw", ALL_TABLES(db), async () => {
        const current = settingsSchema.safeParse((await db.settings.get("app")) ?? {});
        const currentSettings = current.success ? current.data : settingsSchema.parse({});
        const withLocalSecurity = (s: NonNullable<BackupFile["data"]["settings"]>) =>
          settingsSchema.parse({ ...s, security: currentSettings.security, id: "app" });

        if (mode === "replace") {
          await Promise.all(DATA_TABLES(db).map((t) => t.clear()));
          await db.settings.clear();
          await db.settings.put(
            d.settings
              ? withLocalSecurity(d.settings)
              : settingsSchema.parse({ id: "app", security: currentSettings.security }),
          );
          await db.customers.bulkPut(d.customers);
          await db.items.bulkPut(d.items);
          await db.invoices.bulkPut(invoices);
          await db.designs.bulkPut(d.designs);
          await db.counters.bulkPut(d.counters);
          await db.expenses.bulkPut(expenses);
          await db.incomes.bulkPut(d.incomes);
          await db.filings.bulkPut(d.filings);
          await db.returnSnapshots.bulkPut(d.returnSnapshots);
          await db.auditLog.bulkPut(d.auditLog);
        } else {
          if (d.settings && !currentSettings.profile.name.trim()) {
            await db.settings.put(withLocalSecurity(d.settings));
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
          const addMissing = async <T extends { id: string }>(
            rows: T[],
            get: (id: string) => Promise<T | undefined>,
            put: (row: T) => Promise<unknown>,
          ) => {
            for (const row of rows) if (!(await get(row.id))) await put(row);
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
          await mergeNewer(
            expenses,
            (id) => db.expenses.get(id),
            (r) => db.expenses.put(r),
          );
          await mergeNewer(
            d.incomes,
            (id) => db.incomes.get(id),
            (r) => db.incomes.put(r),
          );
          await mergeNewer(
            d.filings,
            (id) => db.filings.get(id),
            (r) => db.filings.put(r),
          );
          await addMissing(
            d.returnSnapshots,
            (id) => db.returnSnapshots.get(id),
            (r) => db.returnSnapshots.put(r),
          );
          await addMissing(
            d.auditLog,
            (id) => db.auditLog.get(id),
            (r) => db.auditLog.put(r),
          );
          for (const c of d.counters) {
            const existing = await db.counters.get(c.key);
            if (!existing || c.value > existing.value) await db.counters.put(c);
          }
        }
        await logAudit({
          entity: "settings",
          entityId: "backup",
          action: "restore",
          summary: `Restored a backup from ${backup.exportedAt.slice(0, 10) || "an unknown date"} (${mode})`,
        });
      }),
    { deletion: mode === "replace" },
  );
  if (mode === "replace") await resetMarker();
}

/** Every table holding user records (not settings or meta). */
const DATA_TABLES = (db: AppDatabase) => [
  db.customers,
  db.items,
  db.invoices,
  db.designs,
  db.counters,
  db.expenses,
  db.incomes,
  db.filings,
  db.returnSnapshots,
  db.auditLog,
];
const ALL_TABLES = (db: AppDatabase) => [db.settings, ...DATA_TABLES(db)];

/** Remove everything stored by the app in this browser (the install marker in meta is kept). */
export async function clearAllData() {
  const db = getDb();
  await guardedWrite(
    "the change",
    () =>
      db.transaction("rw", ALL_TABLES(db), async () => {
        await Promise.all(ALL_TABLES(db).map((t) => t.clear()));
      }),
    { deletion: true },
  );
  await resetMarker();
}
