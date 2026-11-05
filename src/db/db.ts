import Dexie, { type EntityTable } from "dexie";
import type {
  AppSettings,
  CatalogItem,
  Counter,
  Customer,
  Invoice,
  SavedDesign,
} from "@/lib/schema";

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

export type TableName = "customers" | "items" | "invoices" | "designs";
export const COUNTED_TABLES: TableName[] = ["customers", "items", "invoices", "designs"];
