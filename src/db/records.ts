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
import { diffFields, logAudit, type AuditFields } from "./audit";
import { getDb } from "./db";
import { updateSettings } from "./settings";
import { guardedWrite } from "./write";

/* ---------------- Customers ---------------- */

const CUSTOMER_AUDIT_FIELDS: AuditFields<Customer> = {
  name: (c) => c.name,
  company: (c) => c.company,
  gstin: (c) => c.gstin,
  stateCode: (c) => c.stateCode,
  email: (c) => c.email,
  phone: (c) => c.phone,
};

export async function saveCustomer(input: Partial<Customer> & { name: string }): Promise<Customer> {
  const now = nowISO();
  const record = customerSchema.parse({
    ...input,
    id: input.id || newId(),
    createdAt: input.createdAt || now,
    updatedAt: now,
  });
  const db = getDb();
  await guardedWrite("the customer", () =>
    db.transaction("rw", [db.customers, db.auditLog], async () => {
      const raw = await db.customers.get(record.id);
      const existing = raw ? customerSchema.safeParse(raw).data : undefined;
      await db.customers.put(record);
      const changes = diffFields(existing, record, CUSTOMER_AUDIT_FIELDS);
      if (!existing || changes.length)
        await logAudit({
          entity: "customer",
          entityId: record.id,
          action: existing ? "update" : "create",
          summary: `${existing ? "Edited" : "Added"} customer ${record.name}`,
          changes,
        });
    }),
  );
  return record;
}

export async function deleteCustomer(id: string) {
  const db = getDb();
  await guardedWrite(
    "the change",
    () =>
      db.transaction("rw", [db.customers, db.auditLog], async () => {
        const existing = await db.customers.get(id);
        await db.customers.delete(id);
        await logAudit({
          entity: "customer",
          entityId: id,
          action: "delete",
          summary: `Deleted customer ${existing?.name ?? ""}`.trim(),
        });
      }),
    { deletion: true },
  );
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
