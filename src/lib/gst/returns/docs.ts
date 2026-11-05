import type { Invoice } from "@/lib/schema";
import type { DocNature, DocSeries } from "./types";

/**
 * GSTR-1 Table 13 (documents issued). Groups issued documents by nature and
 * number series; manual/non-numeric numbers are handled without assuming a
 * sequence. Verify on portal.
 */

export const DOC_NATURE_LABELS: Record<DocNature, string> = {
  1: "Invoices for outward supply",
  4: "Debit Note",
  5: "Credit Note",
};

export function docNatureOf(docType: Invoice["docType"]): DocNature | null {
  switch (docType) {
    case "tax_invoice":
    case "bill_of_supply":
    case "export":
      return 1;
    case "debit_note":
      return 4;
    case "credit_note":
      return 5;
    default:
      return null;
  }
}

/** "INV/26-27/012" → { prefix: "INV/26-27/", serial: 12n }; "ABC" → { prefix: "", serial: null }. */
export function splitNumber(number: string): { prefix: string; serial: bigint | null } {
  const m = /^(.*?)(\d+)$/.exec(number.trim());
  if (!m) return { prefix: "", serial: null };
  return { prefix: m[1], serial: BigInt(m[2]) };
}

interface Entry {
  number: string;
  serial: bigint | null;
  cancelled: boolean;
}

function compareEntries(a: Entry, b: Entry) {
  if (a.serial !== null && b.serial !== null && a.serial !== b.serial)
    return a.serial < b.serial ? -1 : 1;
  return a.number < b.number ? -1 : a.number > b.number ? 1 : 0;
}

/**
 * Build the DOCS table from issued documents (cancelled included). Drafts,
 * quotations and non-GST invoices should not be passed in (they are ignored
 * if they are). Numbers without trailing digits form one series per nature
 * with prefix "" and lexical from/to.
 */
export function buildDocSeries(invoices: Invoice[]): DocSeries[] {
  const groups = new Map<string, { nature: DocNature; prefix: string; entries: Entry[] }>();
  for (const inv of invoices) {
    const nature = docNatureOf(inv.docType);
    const number = inv.number.trim();
    if (!nature || !number || !inv.issuedAt) continue;
    const { prefix, serial } = splitNumber(number);
    const key = `${nature}|${serial === null ? "\u0000" : prefix}`;
    let g = groups.get(key);
    if (!g) {
      g = { nature, prefix, entries: [] };
      groups.set(key, g);
    }
    g.entries.push({ number, serial, cancelled: inv.status === "cancelled" });
  }
  const out: DocSeries[] = [];
  for (const g of groups.values()) {
    const entries = [...g.entries].sort(compareEntries);
    const total = entries.length;
    const cancelled = entries.filter((e) => e.cancelled).length;
    const first = entries[0];
    const last = entries[entries.length - 1];
    let gaps = 0;
    if (first.serial !== null && last.serial !== null) {
      const distinct = new Set(entries.map((e) => e.serial)).size;
      const span = Number(last.serial - first.serial) + 1;
      gaps = Math.max(0, span - distinct);
    }
    out.push({
      nature: g.nature,
      natureLabel: DOC_NATURE_LABELS[g.nature],
      prefix: g.prefix,
      from: first.number,
      to: last.number,
      total,
      cancelled,
      net: total - cancelled,
      gaps,
    });
  }
  return out.sort((a, b) => a.nature - b.nature || a.prefix.localeCompare(b.prefix));
}
