import { displayStatus, isDraft } from "@/lib/invoice-calc";
import { todayISO } from "@/lib/dates";
import { customerSchema, invoiceSchema, type Customer, type Invoice } from "@/lib/schema";
import { logAudit } from "./audit";
import { getDb } from "./db";
import { saveInvoice } from "./invoices";
import { guardedWrite } from "./write";

/**
 * Per-customer data tools (spec H4): export everything held about one
 * customer, and erase their personal data where the law allows.
 */

export const CUSTOMER_DATA_FORMAT = "invoice-generator/customer-data";

export interface CustomerDataExport {
  format: typeof CUSTOMER_DATA_FORMAT;
  exportedAt: string;
  customer: Customer;
  invoices: {
    number: string;
    docType: string;
    date: string;
    currency: string;
    total: string;
    status: string;
  }[];
}

async function invoicesForCustomer(customerId: string): Promise<Invoice[]> {
  const raw = await getDb().invoices.toArray();
  return raw.flatMap((r) => {
    const parsed = invoiceSchema.safeParse(r);
    return parsed.success && parsed.data.customer.customerId === customerId ? [parsed.data] : [];
  });
}

export async function buildCustomerExport(
  customerId: string,
  now = new Date(),
): Promise<CustomerDataExport | undefined> {
  const raw = await getDb().customers.get(customerId);
  const parsed = customerSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const today = todayISO(now);
  const invoices = (await invoicesForCustomer(customerId))
    .sort((a, b) => (a.invoiceDate < b.invoiceDate ? -1 : 1))
    .map((inv) => ({
      number: inv.number,
      docType: inv.docType,
      date: inv.invoiceDate,
      currency: inv.currency,
      total: inv.summary.grandTotal,
      status: displayStatus(inv, today),
    }));
  return {
    format: CUSTOMER_DATA_FORMAT,
    exportedAt: now.toISOString(),
    customer: parsed.data,
    invoices,
  };
}

export interface EraseResult {
  draftsCleared: number;
  issuedKept: number;
}

/**
 * Erase a customer's personal data:
 * - deletes the customer master record;
 * - clears email and phone on that customer's DRAFT documents;
 * - leaves issued documents untouched (GST law requires keeping them — the
 *   DPDP Act's erasure duty doesn't apply where another law requires retention).
 * The audit entry doesn't repeat the erased details.
 */
export async function eraseCustomerPersonalData(customerId: string): Promise<EraseResult> {
  const linked = await invoicesForCustomer(customerId);
  const drafts = linked.filter((inv) => isDraft(inv));
  let draftsCleared = 0;
  for (const inv of drafts) {
    if (!inv.customer.email && !inv.customer.phone) continue;
    await saveInvoice({ ...inv, customer: { ...inv.customer, email: "", phone: "" } });
    draftsCleared++;
  }
  const issuedKept = linked.length - drafts.length;
  const db = getDb();
  await guardedWrite(
    "the change",
    () =>
      db.transaction("rw", [db.customers, db.auditLog], async () => {
        await db.customers.delete(customerId);
        await logAudit({
          entity: "customer",
          entityId: customerId,
          action: "delete",
          summary: `Erased a customer's personal data (${draftsCleared} draft${draftsCleared === 1 ? "" : "s"} cleared, ${issuedKept} issued document${issuedKept === 1 ? "" : "s"} kept as required by GST law)`,
        });
      }),
    { deletion: true },
  );
  return { draftsCleared, issuedKept };
}
