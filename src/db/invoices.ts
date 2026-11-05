import type { z } from "zod";
import { DOC_TYPE_META } from "@/lib/documents";
import { computeTotals, isDraft, isIssued, summarize } from "@/lib/invoice-calc";
import type { GeneratedNumber } from "@/lib/invoice-factory";
import {
  counterKey,
  formatDocumentNumber,
  patternUsesRandom,
  patternUsesSeq,
} from "@/lib/numbering";
import { invoiceSchema, type AppSettings, type DocType, type Invoice } from "@/lib/schema";
import { stableStringify } from "@/lib/return-hash";
import { diffFields, logAudit, type AuditFields } from "./audit";
import { getDb } from "./db";
import { readTable, type ParsedRows } from "./read";
import { guardedWrite } from "./write";

/* ---------------- Numbering ---------------- */

/**
 * Next number for a document type, without consuming the {SEQ} counter.
 * Numbers with {RAND} are re-rolled until unused in this browser, so two
 * documents created in the same minute never share a number.
 */
export async function peekNumber(
  settings: AppSettings,
  docType: DocType,
  date = new Date(),
  business = settings.profile.name,
): Promise<GeneratedNumber> {
  const rule = settings.numbering[docType];
  const opts = { prefix: rule.prefix, date, business };
  if (patternUsesSeq(rule.pattern)) {
    const key = counterKey(docType, rule.pattern, date);
    const seq = ((await getDb().counters.get(key))?.value ?? 0) + 1;
    const number = formatDocumentNumber(rule.pattern, { ...opts, seq });
    return { number, autoNumber: { value: number, key, seq } };
  }
  let number = formatDocumentNumber(rule.pattern, opts);
  if (patternUsesRandom(rule.pattern)) {
    for (let attempt = 0; attempt < 12 && (await isNumberTaken(number, "")); attempt++) {
      number = formatDocumentNumber(rule.pattern, opts);
    }
  }
  // key "" = generated but no counter to commit.
  return { number, autoNumber: { value: number, key: "", seq: 0 } };
}

/**
 * Consume a {SEQ} value the first time a document is saved — but only while
 * it still carries the generated number. Numbers typed by hand and drafts
 * that are never saved leave the counter alone, so the series has no gaps.
 */
async function commitSequence(invoice: Invoice): Promise<boolean> {
  const auto = invoice.autoNumber;
  if (invoice.seqCommitted || !auto?.key || auto.value !== invoice.number)
    return invoice.seqCommitted;
  const db = getDb();
  await db.transaction("rw", db.counters, async () => {
    const current = (await db.counters.get(auto.key))?.value ?? 0;
    if (auto.seq > current) await db.counters.put({ key: auto.key, value: auto.seq });
  });
  return true;
}

/* ---------------- Invoices ---------------- */

/** Thrown when an action isn't allowed for a document in its current state. */
export class InvoiceActionError extends Error {
  constructor(
    message: string,
    readonly code: "issued" | "not_issued" | "proforma" | "reason_required" | "not_found",
  ) {
    super(message);
    this.name = "InvoiceActionError";
  }
}

/** Thrown when a document fails schema validation before it is written. */
export class InvalidInvoiceError extends Error {
  constructor(readonly issues: z.ZodError["issues"]) {
    const issue = issues[0];
    const path = issue?.path.join(".") ?? "";
    super(
      `The document has invalid data${path ? ` at “${path}”` : ""}: ${issue?.message ?? "unknown"}`,
    );
    this.name = "InvalidInvoiceError";
  }
}

const IGNORED_FOR_CHANGE = ["downloadedAt", "updatedAt", "summary"] as const;

/** Content of a record minus fields that change on download/save bookkeeping. */
function contentKey(invoice: Invoice): string {
  const rest: Record<string, unknown> = { ...invoice };
  for (const k of IGNORED_FOR_CHANGE) delete rest[k];
  return stableStringify(rest);
}

/** Short diff of key fields for the audit log. */
export const INVOICE_AUDIT_FIELDS: AuditFields<Invoice> = {
  number: (i) => i.number,
  invoiceDate: (i) => i.invoiceDate,
  "customer.name": (i) => i.customer.name || i.customer.company,
  "customer.gstin": (i) => i.customer.gstin,
  placeOfSupply: (i) => i.placeOfSupply,
  status: (i) => i.status,
  "summary.grandTotal": (i) => i.summary.grandTotal,
  lines: (i) => String(i.lines.length),
};

function label(inv: Invoice) {
  return `${DOC_TYPE_META[inv.docType].shortLabel} ${inv.number || "(no number)"}`.trim();
}

async function readStored(id: string): Promise<Invoice | undefined> {
  const raw = await getDb().invoices.get(id);
  if (!raw) return undefined;
  const parsed = invoiceSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Persist an invoice: validates it, recomputes the summary and stamps
 * updatedAt — unless nothing but download bookkeeping changed, in which case
 * the previous updatedAt is kept (downloads are not edits).
 *
 * Lifecycle fields are protected against stale in-memory copies: once a
 * document is issued its issuedAt is kept, and a cancellation is never undone
 * by a later save.
 */
export async function saveInvoice(invoice: Invoice): Promise<Invoice> {
  return guardedWrite("this document", async () => {
    const parsed = invoiceSchema.safeParse(invoice);
    if (!parsed.success) throw new InvalidInvoiceError(parsed.error.issues);
    const db = getDb();
    return db.transaction("rw", [db.invoices, db.counters, db.auditLog], async () => {
      const existing = await readStored(parsed.data.id);
      const seqCommitted = await commitSequence(parsed.data);
      let record: Invoice = {
        ...parsed.data,
        seqCommitted,
        summary: summarize(computeTotals(parsed.data)),
      };
      if (existing) {
        record = {
          ...record,
          issuedAt: existing.issuedAt || record.issuedAt,
          downloadedAt:
            record.downloadedAt > existing.downloadedAt
              ? record.downloadedAt
              : existing.downloadedAt,
        };
        if (existing.status === "cancelled") {
          record = {
            ...record,
            status: "cancelled",
            cancelledAt: existing.cancelledAt,
            cancelReason: existing.cancelReason,
          };
        }
      }
      const unchanged = existing && contentKey(existing) === contentKey(record);
      record = {
        ...record,
        createdAt: record.createdAt || existing?.createdAt || new Date().toISOString(),
        updatedAt: unchanged ? existing.updatedAt : new Date().toISOString(),
      };
      await db.invoices.put(record);

      if (!existing) {
        await logAudit({
          entity: "invoice",
          entityId: record.id,
          action: "create",
          summary: `Created ${label(record)}`,
          changes: diffFields(undefined, record, INVOICE_AUDIT_FIELDS),
        });
        if (record.issuedAt)
          await logAudit({
            entity: "invoice",
            entityId: record.id,
            action: "issue",
            summary: `Issued ${label(record)}`,
          });
      } else if (!unchanged) {
        const issuedNow = !existing.issuedAt && Boolean(record.issuedAt);
        const changes = diffFields(existing, record, INVOICE_AUDIT_FIELDS);
        if (issuedNow) {
          await logAudit({
            entity: "invoice",
            entityId: record.id,
            action: "issue",
            summary: `Issued ${label(record)}`,
            changes,
          });
        } else {
          await logAudit({
            entity: "invoice",
            entityId: record.id,
            action: "update",
            summary: `Edited ${label(record)}`,
            changes,
          });
        }
      }
      return record;
    });
  });
}

export async function getInvoice(id: string): Promise<Invoice | undefined> {
  return readStored(id);
}

/**
 * Delete a document. Issued documents (other than quotations) are part of the
 * GST record and can't be deleted — cancel them or issue a credit note instead.
 */
export async function deleteInvoice(id: string) {
  const existing = await readStored(id);
  if (existing && isIssued(existing) && existing.docType !== "proforma") {
    throw new InvoiceActionError(
      `${label(existing)} has been issued, so it can't be deleted. Cancel it or create a credit note instead.`,
      "issued",
    );
  }
  const db = getDb();
  await guardedWrite(
    "the change",
    () =>
      db.transaction("rw", [db.invoices, db.auditLog], async () => {
        await db.invoices.delete(id);
        await logAudit({
          entity: "invoice",
          entityId: id,
          action: "delete",
          summary: existing ? `Deleted ${label(existing)}` : "Deleted document",
          changes: existing ? diffFields(existing, undefined, INVOICE_AUDIT_FIELDS) : [],
        });
      }),
    { deletion: true },
  );
}

/** Record a download/print. The first one also issues the document (not quotations). */
export async function markDownloaded(invoice: Invoice) {
  const now = new Date().toISOString();
  return saveInvoice({
    ...invoice,
    downloadedAt: now,
    issuedAt: invoice.issuedAt || (invoice.docType === "proforma" ? "" : now),
  });
}

/** Mark a document as issued without downloading it. No-op if already issued. */
export async function issueInvoice(invoice: Invoice): Promise<Invoice> {
  if (invoice.docType === "proforma")
    throw new InvoiceActionError(
      "Quotations aren't issued — convert it to an invoice.",
      "proforma",
    );
  if (invoice.issuedAt) return saveInvoice(invoice);
  return saveInvoice({ ...invoice, issuedAt: new Date().toISOString() });
}

/**
 * Cancel an issued document. It keeps its number (it stays in the series and
 * is reported as cancelled). Checking whether its return period is already
 * filed is up to the caller.
 */
export async function cancelInvoice(invoice: Invoice, reason: string): Promise<Invoice> {
  const stored = (await readStored(invoice.id)) ?? invoice;
  if (!stored.issuedAt)
    throw new InvoiceActionError(
      "Only issued documents can be cancelled. A draft can simply be deleted.",
      "not_issued",
    );
  if (stored.status === "cancelled") return stored;
  const why = reason.trim();
  if (!why) throw new InvoiceActionError("Please give a reason for cancelling.", "reason_required");
  const db = getDb();
  return guardedWrite("the cancellation", () =>
    db.transaction("rw", [db.invoices, db.auditLog], async () => {
      const now = new Date().toISOString();
      const record: Invoice = {
        ...stored,
        status: "cancelled",
        cancelledAt: now,
        cancelReason: why.slice(0, 300),
        updatedAt: now,
      };
      await db.invoices.put(record);
      await logAudit({
        entity: "invoice",
        entityId: record.id,
        action: "cancel",
        summary: `Cancelled ${label(record)}: ${why}`,
        changes: [{ field: "status", from: stored.status, to: "cancelled" }],
      });
      return record;
    }),
  );
}

export async function isNumberTaken(number: string, exceptId: string): Promise<boolean> {
  if (!number.trim()) return false;
  const count = await getDb()
    .invoices.where("number")
    .equals(number)
    .filter((i) => i.id !== exceptId)
    .count();
  return count > 0;
}

/** The most recently edited document that has not been issued yet. */
export async function latestDraft(): Promise<Invoice | undefined> {
  const rows = await getDb().invoices.orderBy("updatedAt").reverse().toArray();
  for (const raw of rows) {
    const parsed = invoiceSchema.safeParse(raw);
    if (parsed.success && isDraft(parsed.data)) return parsed.data;
  }
  return undefined;
}

/** All valid invoices plus the number of stored rows that failed validation. */
export async function listInvoices(): Promise<ParsedRows<Invoice>> {
  return readTable("invoices");
}
