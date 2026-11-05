import { computeTotals, summarize } from "@/lib/invoice-calc";
import type { GeneratedNumber } from "@/lib/invoice-factory";
import {
  counterKey,
  formatDocumentNumber,
  patternUsesRandom,
  patternUsesSeq,
} from "@/lib/numbering";
import { invoiceSchema, type AppSettings, type DocType, type Invoice } from "@/lib/schema";
import { getDb } from "./db";
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

/** Persist an invoice: recomputes the summary from scratch and stamps updatedAt. */
export async function saveInvoice(invoice: Invoice): Promise<Invoice> {
  return guardedWrite("this document", async () => {
    const db = getDb();
    const seqCommitted = await commitSequence(invoice);
    const record: Invoice = {
      ...invoice,
      seqCommitted,
      summary: summarize(computeTotals(invoice)),
      updatedAt: new Date().toISOString(),
    };
    await db.invoices.put(record);
    return record;
  });
}

export async function getInvoice(id: string): Promise<Invoice | undefined> {
  const raw = await getDb().invoices.get(id);
  if (!raw) return undefined;
  const parsed = invoiceSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export async function deleteInvoice(id: string) {
  await guardedWrite("the change", () => getDb().invoices.delete(id), { deletion: true });
}

export async function markDownloaded(invoice: Invoice) {
  return saveInvoice({ ...invoice, downloadedAt: new Date().toISOString() });
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

/** The most recently edited document that has never been downloaded. */
export async function latestDraft(): Promise<Invoice | undefined> {
  const drafts = await getDb()
    .invoices.orderBy("updatedAt")
    .reverse()
    .filter((i) => !i.downloadedAt)
    .limit(1)
    .toArray();
  return drafts[0];
}
