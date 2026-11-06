/**
 * Who has to file the annual returns. Thresholds are written from our best
 * knowledge of the rules and are all marked "verify": thresholds, waivers and
 * due dates change by notification, so check the GST portal or ask your CA.
 */
import { Dec, toDec } from "@/lib/money";

const CRORE = new Dec(10_000_000);

export type Applicability = "mandatory" | "optional" | "unknown";

export interface AnnualApplicability {
  /** Turnover used for the decision (₹, 2 dp) or "" when none. */
  turnover: string;
  turnoverSource: "books" | "settings" | "none";
  gstr9: Applicability;
  gstr9c: Applicability;
  notes: string[];
}

export const GSTR9_OPTIONAL_UPTO = CRORE.times(2);
export const GSTR9C_ABOVE = CRORE.times(5);

/**
 * `bookTurnover` is the year's turnover per your records (GSTR-9 Table 5N); when
 * it is zero the AATO saved in Settings (previous year) is used instead.
 */
export function annualApplicability(input: {
  bookTurnover: string;
  settingsAato: string;
  dueDate: string | null;
}): AnnualApplicability {
  const book = toDec(input.bookTurnover);
  const setting = toDec(input.settingsAato);
  const source = book.greaterThan(0) ? "books" : setting.greaterThan(0) ? "settings" : "none";
  const t = source === "books" ? book : source === "settings" ? setting : null;
  const gstr9: Applicability = !t
    ? "unknown"
    : t.greaterThan(GSTR9_OPTIONAL_UPTO)
      ? "mandatory"
      : "optional";
  const gstr9c: Applicability = !t
    ? "unknown"
    : t.greaterThan(GSTR9C_ABOVE)
      ? "mandatory"
      : "optional";
  const notes = [
    "GSTR-9 is generally optional when your aggregate annual turnover (AATO) is up to ₹2 crore and mandatory above it. Verify for this year on the GST portal.",
    "GSTR-9C (reconciliation statement) generally applies when AATO is above ₹5 crore. For recent years it is self-certified by the taxpayer; for earlier years it needed certification by a CA or cost accountant. Ask your CA which applies to you (verify).",
    input.dueDate
      ? `Standard due date for GSTR-9/9C: ${input.dueDate} (31 December after the year ends). Due dates are often extended by notification (verify).`
      : "Due date not available.",
  ];
  if (source === "books")
    notes.push(
      "The decision above uses this year's turnover from your records. AATO is defined in the GST law and includes exempt supplies and exports; your CA can confirm.",
    );
  if (source === "settings")
    notes.push(
      "No turnover found in your records for this year, so the AATO saved in Settings is used.",
    );
  if (source === "none")
    notes.push("Add invoices or set your AATO in Settings to see whether you need to file.");
  return { turnover: t ? t.toFixed(2) : "", turnoverSource: source, gstr9, gstr9c, notes };
}
