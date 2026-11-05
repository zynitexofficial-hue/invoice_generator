import { nowISO } from "@/lib/dates";
import { newId } from "@/lib/invoice-factory";
import {
  catalogItemSchema,
  customerSchema,
  savedDesignSchema,
  type CatalogItem,
  type Customer,
  type SavedDesign,
} from "@/lib/schema";
import { getDb } from "./db";
import { updateSettings } from "./settings";
import { guardedWrite } from "./write";

/* ---------------- Customers ---------------- */

export async function saveCustomer(input: Partial<Customer> & { name: string }): Promise<Customer> {
  const now = nowISO();
  const record = customerSchema.parse({
    ...input,
    id: input.id || newId(),
    createdAt: input.createdAt || now,
    updatedAt: now,
  });
  await guardedWrite("the customer", () => getDb().customers.put(record));
  return record;
}

export async function deleteCustomer(id: string) {
  await guardedWrite("the change", () => getDb().customers.delete(id), { deletion: true });
}

/* ---------------- Items ---------------- */

export async function saveItem(
  input: Partial<CatalogItem> & { name: string },
): Promise<CatalogItem> {
  const now = nowISO();
  const record = catalogItemSchema.parse({
    ...input,
    id: input.id || newId(),
    createdAt: input.createdAt || now,
    updatedAt: now,
  });
  await guardedWrite("the item", () => getDb().items.put(record));
  return record;
}

export async function deleteItem(id: string) {
  await guardedWrite("the change", () => getDb().items.delete(id), { deletion: true });
}

/* ---------------- Saved designs ---------------- */

export async function saveDesign(
  input: Omit<SavedDesign, "id" | "createdAt" | "updatedAt"> & Partial<SavedDesign>,
) {
  const now = nowISO();
  const record = savedDesignSchema.parse({
    ...input,
    id: input.id || newId(),
    createdAt: input.createdAt || now,
    updatedAt: now,
  });
  await guardedWrite("the design", () => getDb().designs.put(record));
  return record;
}

export async function deleteDesign(id: string) {
  await guardedWrite("the change", () => getDb().designs.delete(id), { deletion: true });
  await updateSettings((s) =>
    s.design.defaultDesignId === id ? { ...s, design: { ...s.design, defaultDesignId: "" } } : s,
  );
}

export async function setDefaultDesign(id: string) {
  await updateSettings((s) => ({ ...s, design: { ...s.design, defaultDesignId: id } }));
}
