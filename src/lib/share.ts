import { formatDate } from "@/lib/dates";
import { DOC_TYPE_META } from "@/lib/documents";
import { formatMoney } from "@/lib/format";
import { computeTotals } from "@/lib/invoice-calc";
import { toDec } from "@/lib/money";
import { resolvePaymentQr } from "@/lib/payment-qr";
import type { AppSettings, Invoice } from "@/lib/schema";
import { payPageHref } from "@/lib/upi";

/*
 * "Share without a backend" (feature C5): build the message and the
 * wa.me / mailto: links. Nothing is sent by this app — the user's own
 * WhatsApp, mail app or share sheet does the sending.
 *
 * The PDF itself comes from the browser's print dialog, so there is no file to
 * attach programmatically; the message tells the user to attach it themselves.
 */

export interface ShareMessage {
  /** Short subject line, e.g. "Tax Invoice INV/26-27/001 from Acme". */
  subject: string;
  /** Plain-text body, safe to put in WhatsApp, mail or a share sheet. */
  text: string;
  /** Tap-to-pay link included in `text`, if a UPI ID is set and an amount is due. */
  payLink: string | null;
}

/** Customer name for the greeting: contact person, falling back to company. */
function greetingName(invoice: Invoice): string {
  return invoice.customer.name.trim() || invoice.customer.company.trim();
}

export function buildShareMessage(
  invoice: Invoice,
  settings: AppSettings,
  origin: string,
): ShareMessage {
  const totals = computeTotals(invoice);
  const meta = DOC_TYPE_META[invoice.docType];
  const title = (invoice.docTitle || meta.defaultTitle).trim();
  const label = `${title} ${invoice.number}`.trim();
  const sellerName = (invoice.seller.name || invoice.seller.legalName).trim();
  const grouping = settings.formats.numberGrouping;
  const money = (v: string) => formatMoney(v, invoice.currency, grouping);

  const lines: string[] = [];
  const who = greetingName(invoice);
  lines.push(who ? `Hi ${who},` : "Hello,");
  lines.push("");

  const from = sellerName ? ` from ${sellerName}` : "";
  lines.push(`${label}${from} — total ${money(totals.grandTotal)}.`);

  const owes = meta.hasPayment && toDec(totals.balanceDue).greaterThan(0);
  const paidSome = meta.hasPayment && toDec(totals.amountReceived).greaterThan(0);
  if (owes && paidSome) lines.push(`Balance due: ${money(totals.balanceDue)}.`);
  if (meta.hasPayment && !owes && toDec(totals.grandTotal).greaterThan(0))
    lines.push("This is fully paid. Thank you!");
  if (owes && invoice.dueDate)
    lines.push(`Please pay by ${formatDate(invoice.dueDate, settings.formats.dateFormat)}.`);
  if (!meta.hasPayment && invoice.dueDate)
    lines.push(`Valid until ${formatDate(invoice.dueDate, settings.formats.dateFormat)}.`);

  let payLink: string | null = null;
  if (owes) {
    const qr = resolvePaymentQr(invoice, totals, {
      show: true,
      includeAmount: settings.upi.includeAmount,
    });
    if ((qr.kind === "auto" || qr.kind === "upload") && qr.params) {
      payLink = payPageHref(origin, qr.params);
      lines.push("", `Pay by UPI: ${payLink}`);
    }
  }

  lines.push("", "Thank you,");
  if (sellerName) lines.push(sellerName);
  const phone = invoice.seller.phone.trim();
  if (phone) lines.push(phone);

  return { subject: `${label}${from}`, text: lines.join("\n"), payLink };
}

/**
 * Digits for a wa.me link, or "" when the number can't be used.
 * wa.me wants the country code with no "+" or leading zeros; a bare 10-digit
 * number is taken as Indian (this is an India GST product).
 */
export function whatsappNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  let n = digits;
  if (raw.trim().startsWith("+")) n = digits;
  else if (digits.startsWith("00")) n = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) n = `91${digits.slice(1)}`;
  else if (digits.length === 10) n = `91${digits}`;
  return n.length >= 8 && n.length <= 15 ? n : "";
}

/** wa.me link; without a usable number WhatsApp asks which chat to send to. */
export function whatsappHref(phone: string, text: string): string {
  const n = whatsappNumber(phone);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export function mailtoHref(email: string, subject: string, body: string): string {
  const to = email.trim();
  return `mailto:${to ? encodeURIComponent(to).replace(/%40/g, "@") : ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
