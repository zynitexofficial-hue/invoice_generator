import Dexie, { type EntityTable } from "dexie";
import type {
  AppSettings,
  AuditEntry,
  CatalogItem,
  Counter,
  Customer,
  Expense,
  Filing,
  Income,
  Invoice,
  ReturnSnapshot,
  SavedDesign,
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

/** Tables counted by the data-loss marker (see health.ts). */
export type TableName =
  "customers" | "items" | "invoices" | "designs" | "expenses" | "incomes" | "filings";
export const COUNTED_TABLES: TableName[] = [
  "customers",
  "items",
  "invoices",
  "designs",
  "expenses",
  "incomes",
  "filings",
];
