import Dexie, { type EntityTable } from "dexie";
import type {
  AnnualInput,
  Amendment,
  AppSettings,
  Attachment,
  AttachmentBlob,
  AuditEntry,
  CatalogItem,
  Counter,
  Customer,
  Expense,
  Filing,
  Gstr2bImport,
  Gstr2bMatch,
  Income,
  Invoice,
  PaymentEntry,
  PeriodInput,
  Purchase,
  Recurring,
  ReturnSnapshot,
  SavedDesign,
  Vendor,
} from "@/lib/schema";
import { useStorageStatus } from "@/stores/storage-status";

export interface MetaEntry {
  key: string;
  value: unknown;
}

export const DB_NAME = "invoice-generator";

export class AppDatabase extends Dexie {
  settings!: EntityTable<AppSettings, "id">;
  customers!: EntityTable<Customer, "id">;
  items!: EntityTable<CatalogItem, "id">;
  invoices!: EntityTable<Invoice, "id">;
  designs!: EntityTable<SavedDesign, "id">;
  counters!: EntityTable<Counter, "key">;
  meta!: EntityTable<MetaEntry, "key">;
  expenses!: EntityTable<Expense, "id">;
  incomes!: EntityTable<Income, "id">;
  filings!: EntityTable<Filing, "id">;
  returnSnapshots!: EntityTable<ReturnSnapshot, "id">;
  auditLog!: EntityTable<AuditEntry, "id">;
  // v3 (Phase 2-4)
  payments!: EntityTable<PaymentEntry, "id">;
  amendments!: EntityTable<Amendment, "id">;
  recurring!: EntityTable<Recurring, "id">;
  vendors!: EntityTable<Vendor, "id">;
  purchases!: EntityTable<Purchase, "id">;
  attachments!: EntityTable<Attachment, "id">;
  attachmentBlobs!: EntityTable<AttachmentBlob, "id">;
  gstr2bImports!: EntityTable<Gstr2bImport, "id">;
  gstr2bMatches!: EntityTable<Gstr2bMatch, "id">;
  periodInputs!: EntityTable<PeriodInput, "id">;
  annualInputs!: EntityTable<AnnualInput, "id">;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      settings: "id",
      customers: "id, name, updatedAt",
      items: "id, name, updatedAt",
      invoices: "id, number, docType, invoiceDate, updatedAt",
      designs: "id, name, updatedAt",
      counters: "key",
      meta: "key",
    });
    // v2: new tables only — existing rows are upgraded lazily by the zod schemas on read.
    this.version(2).stores({
      expenses: "id, date, category, vendorName, updatedAt",
      incomes: "id, date, category, updatedAt",
      filings: "id, periodKey, returnType, status, updatedAt",
      returnSnapshots: "id, filingId, createdAt",
      auditLog: "id, entity, entityId, at",
    });
    // v3: new tables only (payments, amendments, recurring, vendors, purchases,
    // attachments + their file contents, GSTR-2B imports/matches, period and
    // annual worksheet inputs). Nothing existing is touched, so the upgrade is
    // non-destructive; invoices stay on schema v2 and new settings fields
    // default when settings are read.
    this.version(3).stores({
      payments: "id, invoiceId, customerId, date, updatedAt",
      amendments: "id, originalInvoiceId, originalPeriodKey, amendInPeriodKey, status, updatedAt",
      recurring: "id, kind, active, nextRunDate, updatedAt",
      vendors: "id, name, gstin, updatedAt",
      purchases: "id, vendorId, billDate, dueDate, paymentStatus, updatedAt",
      attachments: "id, ownerId, ownerType, updatedAt",
      attachmentBlobs: "id",
      gstr2bImports: "id, periodKey, updatedAt",
      gstr2bMatches: "id, importId, rowId, targetId, status, updatedAt",
      periodInputs: "id, updatedAt",
      annualInputs: "id, updatedAt",
    });

    // Another tab opened a newer version of the app (or deleted the database):
    // close our connection so it can proceed, and ask the user to reload.
    this.on("versionchange", () => {
      this.close({ disableAutoOpen: true });
      useStorageStatus.getState().set({ versionChanged: true });
      return false;
    });
    // Our upgrade is waiting for an older tab to close.
    this.on("blocked", () => {
      useStorageStatus.getState().set({ upgradeBlocked: true });
    });
    this.on("ready", () => {
      if (useStorageStatus.getState().upgradeBlocked)
        useStorageStatus.getState().set({ upgradeBlocked: false });
    });
  }
}

let instance: AppDatabase | null = null;

/** Lazily open the database (browser only — never during static prerender). */
export function getDb(): AppDatabase {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this environment");
  }
  instance ??= new AppDatabase();
  return instance;
}

/**
 * Tables counted by the data-loss marker (see health.ts). Attachment file
 * contents are not counted separately (their metadata rows are).
 */
export const COUNTED_TABLES = [
  "customers",
  "items",
  "invoices",
  "designs",
  "expenses",
  "incomes",
  "filings",
  "payments",
  "amendments",
  "recurring",
  "vendors",
  "purchases",
  "attachments",
  "gstr2bImports",
  "gstr2bMatches",
  "periodInputs",
  "annualInputs",
] as const;
export type TableName = (typeof COUNTED_TABLES)[number];
