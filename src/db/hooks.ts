"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { invoiceSchema, settingsSchema, type AppSettings, type Invoice } from "@/lib/schema";
import { getDb } from "./db";

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

/** All invoices, most recently edited first; invalid records are skipped. */
export function useInvoices(): Invoice[] | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().invoices.orderBy("updatedAt").reverse().toArray();
    return rows.flatMap((r) => {
      const parsed = invoiceSchema.safeParse(r);
      return parsed.success ? [parsed.data] : [];
    });
  }, []);
}

export function useMetaValue<T>(key: string): T | undefined {
  return useLiveQuery(async () => (await getDb().meta.get(key))?.value as T | undefined, [key]);
}
