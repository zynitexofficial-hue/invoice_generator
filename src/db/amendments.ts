import type { Amendment } from "@/lib/schema";
import { defineCrud, type DeepPartial } from "./crud";
import { getDb } from "./db";
import { parseRows, TABLE_SCHEMAS } from "./read";

/**
 * [B] Amendments — owner: feature B.
 * Extend with cross-period cancellation and GSTR-1A helpers.
 */

export type AmendmentInput = DeepPartial<Amendment>;

export const amendmentsCrud = defineCrud({
  table: "amendments",
  entity: "amendment",
  what: "the amendment",
  describe: (a) => `amendment ${[a.originalNumber, a.reason].filter(Boolean).join(" · ")}`.trim(),
  auditFields: {
    kind: (a) => a.kind,
    status: (a) => a.status,
    originalInvoiceId: (a) => a.originalInvoiceId,
    amendInPeriodKey: (a) => a.amendInPeriodKey,
    reason: (a) => a.reason,
  },
});

export const saveAmendment = amendmentsCrud.save;
export const getAmendment = amendmentsCrud.get;
export const deleteAmendment = amendmentsCrud.remove;
export const listAmendments = amendmentsCrud.list;

/** Valid amendments for one invoice. */
export async function listAmendmentsForInvoice(invoiceId: string): Promise<Amendment[]> {
  const rows = await getDb().amendments.where("originalInvoiceId").equals(invoiceId).toArray();
  return parseRows(rows, TABLE_SCHEMAS.amendments).rows;
}
