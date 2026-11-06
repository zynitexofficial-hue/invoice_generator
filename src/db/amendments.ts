import { draftAmendment } from "@/lib/gst/amendments/draft";
import { currentPeriod } from "@/lib/period";
import type { Amendment, AppSettings, Invoice } from "@/lib/schema";
import { defineCrud, type DeepPartial } from "./crud";
import { getDb } from "./db";
import { listInvoices } from "./invoices";
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

/* ---------------- Cross-period helpers (feature B) ---------------- */

/** The not-yet-reported amendment for a document in a filed period, if one exists. */
export async function findPendingAmendment(
  invoiceId: string,
  originalPeriodKey: string,
): Promise<Amendment | undefined> {
  const rows = await listAmendmentsForInvoice(invoiceId);
  return rows.find((a) => a.originalPeriodKey === originalPeriodKey && a.status !== "reported");
}

/**
 * After a document in an already-filed period is cancelled, remember that the
 * cancellation still has to be reported in a later return. Creates a draft
 * "cancellation" amendment (once per document and period) targeting the
 * current open period.
 */
export async function recordCancellationAmendment(input: {
  cancelled: Invoice;
  settings: AppSettings;
  originalPeriodKey: string;
  today: string;
}): Promise<Amendment | undefined> {
  const { cancelled, settings, originalPeriodKey, today } = input;
  if (await findPendingAmendment(cancelled.id, originalPeriodKey)) return undefined;
  const { rows: invoices } = await listInvoices();
  const kind = settings.gst.filingFrequency === "qrmp" ? "quarter" : "month";
  const draft = draftAmendment({
    invoice: cancelled,
    invoices,
    settings,
    originalPeriodKey,
    amendInPeriodKey: currentPeriod(kind, today),
  });
  return saveAmendment({ ...draft, reason: cancelled.cancelReason });
}
