import type { InvoiceTotals, TaxKind } from "@/lib/calc/engine";
import { activeStages, computeSchedule } from "@/lib/calc/schedule";
import { amountInWords } from "@/lib/calc/words";
import { DOC_TYPE_META, PAYMENT_MODE_LABELS } from "@/lib/documents";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatPercent, formatQuantity, type NumberGrouping } from "@/lib/format";
import { checkGstin } from "@/lib/gst/gstin";
import { stateName, stateWithCode } from "@/lib/gst/states";
import {
  formatRate,
  halfRate,
  isIndia,
  resolvePlaceOfSupply,
  sellerStateCode,
  stateTaxLabel,
} from "@/lib/gst/tax";
import { toDec } from "@/lib/money";
import type { DateFormatId, DesignCustomization, Invoice } from "@/lib/schema";
import { resolvePaymentQr } from "@/lib/payment-qr";

export type ColumnKey = "index" | "item" | "hsn" | "qty" | "price" | "discount" | "tax" | "amount";

export interface DocColumn {
  key: ColumnKey;
  label: string;
  align: "left" | "right" | "center";
  /** CSS grid track size. */
  track: string;
}

export interface DocRow {
  id: string;
  index: string;
  name: string;
  description: string;
  hsn: string;
  qty: string;
  price: string;
  discount: string;
  taxRate: string;
  taxAmount: string;
  amount: string;
}

export interface TotalsRow {
  key: string;
  label: string;
  value: string;
  tone: "default" | "muted" | "discount" | "subtotal" | "grand" | "balance";
}

export interface LabelValue {
  label: string;
  value: string;
}

export interface PartyView {
  name: string;
  company: string;
  addressLines: string[];
  contacts: string[];
  tax: LabelValue[];
}

export interface PaymentView {
  bank: LabelValue[];
  upiId: string;
  upiUri: string | null;
  /** Uploaded QR image (used instead of a generated UPI QR). */
  qrImage: string;
  /** Formatted amount the generated QR asks for ("" when the payer enters it). */
  qrAmount: string;
  /** Instalment the QR amount is for, e.g. "Advance". */
  qrFor: string;
  /** UPI query for the tap-to-pay link ("" = no link); the page origin is added when rendering. */
  payParams: string;
  instructions: string;
  /** Set only when both bank and UPI are shown: which one goes first, marked "Preferred". */
  preferred: "" | "upi" | "bank";
}

export interface TaxSummaryView {
  headers: string[];
  rows: string[][];
  total: string[];
}

export interface ScheduleRowView {
  id: string;
  index: string;
  label: string;
  due: string;
  share: string;
  amount: string;
  status: string;
}

export interface ScheduleView {
  rows: ScheduleRowView[];
  total: string;
  /** Some stage has a "when" — otherwise that column is left out. */
  hasDue: boolean;
  /** Invoices with money received show Paid / Due per instalment. */
  hasStatus: boolean;
}

export interface DocViewModel {
  id: string;
  docType: Invoice["docType"];
  title: string;
  number: string;
  numberLabel: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  dueLabel: string;
  meta: LabelValue[];
  seller: PartyView & { logo: string; signature: string; signatoryName: string };
  customer: PartyView & { shipTo: string[] };
  hasCustomer: boolean;
  placeOfSupply: string;
  taxKind: TaxKind;
  columns: DocColumn[];
  gridTemplate: string;
  rows: DocRow[];
  totals: TotalsRow[];
  grandTotal: string;
  amountDue: string;
  amountDueLabel: string;
  words: string;
  taxSummary: TaxSummaryView | null;
  schedule: ScheduleView | null;
  payment: PaymentView | null;
  paymentStatus: "unpaid" | "partial" | "paid" | null;
  stamp: "PAID" | "PARTIALLY PAID" | null;
  received: string;
  receivedNote: string;
  notes: string;
  terms: string;
  declaration: string;
  footer: string;
  hasPaymentInfo: boolean;
}

export interface ViewModelOptions {
  dateFormat: DateFormatId;
  grouping: NumberGrouping;
  upiIncludeAmount: boolean;
}

const lines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

function numberLabel(invoice: Invoice) {
  switch (invoice.docType) {
    case "bill_of_supply":
      return "Bill No.";
    case "proforma": {
      const title = invoice.docTitle.toLowerCase();
      if (title.includes("estimate")) return "Estimate No.";
      if (title.includes("proforma")) return "Proforma No.";
      return "Quote No.";
    }
    default:
      return "Invoice No.";
  }
}

export function isBlankLine(l: Invoice["lines"][number]) {
  return !l.name.trim() && !l.description.trim() && !toDec(l.unitPrice).greaterThan(0);
}

export function buildViewModel(
  invoice: Invoice,
  totals: InvoiceTotals,
  design: DesignCustomization,
  opts: ViewModelOptions,
): DocViewModel {
  const meta = DOC_TYPE_META[invoice.docType];
  const money = (v: string) => formatMoney(v, invoice.currency, opts.grouping);
  const date = (v: string) => formatDate(v, opts.dateFormat);
  const show = design.show;
  const kind = totals.taxKind;
  const hasTax = kind !== "none";
  const sellerState = sellerStateCode(invoice.seller);
  const stateTax = stateTaxLabel(sellerState);
  const pos = resolvePlaceOfSupply(invoice);
  // Rule 46 asks for the state code for unregistered customers (≥ ₹50,000); it can be hidden in Design.
  const stateText = (code: string) => (show.stateCodes ? stateWithCode(code) : stateName(code));

  /* ---------------- Parties ---------------- */
  const seller = invoice.seller;
  const sellerTax: LabelValue[] = [];
  if (seller.gstin.trim())
    sellerTax.push({ label: "GSTIN", value: seller.gstin.trim().toUpperCase() });
  if (seller.pan.trim()) sellerTax.push({ label: "PAN", value: seller.pan.trim().toUpperCase() });
  if (sellerState && isIndia(seller.country))
    // The seller's GSTIN already carries the state code, so only the name is shown.
    sellerTax.push({ label: "State", value: stateName(sellerState) });

  const customer = invoice.customer;
  const customerTax: LabelValue[] = [];
  if (customer.gstin.trim())
    customerTax.push({ label: "GSTIN", value: customer.gstin.trim().toUpperCase() });
  const custState =
    customer.stateCode || (customer.gstin ? checkGstin(customer.gstin).stateCode : "");
  if (custState && isIndia(customer.country))
    customerTax.push({ label: "State", value: stateText(custState) });

  const sellerAddress = lines(seller.address);
  if (!isIndia(seller.country) && seller.country.trim()) sellerAddress.push(seller.country.trim());
  const customerAddress = lines(customer.billingAddress);
  if (customer.country.trim() && !isIndia(customer.country))
    customerAddress.push(customer.country.trim());
  const shipTo = lines(customer.shippingAddress);
  const sameShip = shipTo.join("\n") === lines(customer.billingAddress).join("\n");

  /* ---------------- Meta ---------------- */
  const placeOfSupply = hasTax && pos ? stateText(pos) : "";
  const metaRows: LabelValue[] = [
    { label: numberLabel(invoice), value: invoice.number },
    { label: "Date", value: date(invoice.invoiceDate) },
  ];
  if (invoice.dueDate) metaRows.push({ label: meta.dueLabel, value: date(invoice.dueDate) });
  if (placeOfSupply) metaRows.push({ label: "Place of supply", value: placeOfSupply });
  if (invoice.referenceNo.trim())
    metaRows.push({ label: "Reference", value: invoice.referenceNo.trim() });
  if (invoice.poNo.trim()) metaRows.push({ label: "PO No.", value: invoice.poNo.trim() });

  /* ---------------- Rows & columns ---------------- */
  const lineTotals = new Map(totals.lines.map((l) => [l.id, l]));
  const visibleLines = invoice.lines.filter((l) => !isBlankLine(l));
  const anyHsn = visibleLines.some((l) => l.hsnSac.trim());
  const anyDiscount = visibleLines.some((l) =>
    toDec(lineTotals.get(l.id)?.lineDiscount).greaterThan(0),
  );
  // A column (and summary) of "0% ₹0.00" on every line is noise — hide them until some line is taxed.
  const anyTaxed = visibleLines.some((l) => !toDec(lineTotals.get(l.id)?.rate).isZero());

  const rows: DocRow[] = visibleLines.map((l, i) => {
    const t = lineTotals.get(l.id);
    const discount =
      t && toDec(t.lineDiscount).greaterThan(0)
        ? l.discount.kind === "percent"
          ? formatPercent(l.discount.value)
          : money(t.lineDiscount)
        : "";
    const qty = formatQuantity(l.quantity || "0", opts.grouping);
    return {
      id: l.id,
      index: String(i + 1),
      name: l.name.trim(),
      description: l.description.trim(),
      hsn: l.hsnSac.trim(),
      qty: show.unitColumn && l.unit.trim() ? `${qty} ${l.unit.trim()}` : qty,
      price: money(l.unitPrice || "0"),
      discount,
      taxRate: t ? `${formatRate(t.rate)}%` : "",
      taxAmount: t ? money(t.tax) : "",
      amount: money(t?.amount ?? "0"),
    };
  });

  const columns: DocColumn[] = [];
  if (show.itemIndex) columns.push({ key: "index", label: "#", align: "left", track: "1.75em" });
  columns.push({
    key: "item",
    label: "Item & description",
    align: "left",
    track: "minmax(0, 1fr)",
  });
  if (show.hsnColumn && anyHsn)
    columns.push({ key: "hsn", label: "HSN/SAC", align: "left", track: "5.5em" });
  columns.push({
    key: "qty",
    label: "Qty",
    align: "right",
    track: show.unitColumn ? "5.5em" : "3.75em",
  });
  columns.push({ key: "price", label: "Rate", align: "right", track: "7em" });
  if (show.discountColumn && anyDiscount)
    columns.push({ key: "discount", label: "Disc.", align: "right", track: "5em" });
  if (show.taxColumns && hasTax && anyTaxed)
    columns.push({
      key: "tax",
      label: kind === "inter" ? "IGST" : "GST",
      align: "right",
      track: "6.5em",
    });
  columns.push({ key: "amount", label: "Amount", align: "right", track: "7.5em" });

  /* ---------------- Totals ---------------- */
  const t = totals;
  const totalsRows: TotalsRow[] = [];
  const inclusive = t.pricesIncludeGst;
  totalsRows.push({
    key: "subtotal",
    label: inclusive ? "Subtotal (incl. GST)" : "Subtotal",
    value: money(t.subtotal),
    tone: "subtotal",
  });
  if (toDec(t.invoiceDiscount).greaterThan(0)) {
    const pct =
      invoice.invoiceDiscount.kind === "percent"
        ? ` (${formatPercent(invoice.invoiceDiscount.value)})`
        : "";
    totalsRows.push({
      key: "discount",
      label: `Discount${pct}`,
      value: `−${money(t.invoiceDiscount)}`,
      tone: "discount",
    });
  }
  if (hasTax && (inclusive || toDec(t.invoiceDiscount).greaterThan(0))) {
    totalsRows.push({
      key: "taxable",
      label: "Taxable value",
      value: money(t.taxableTotal),
      tone: "muted",
    });
  }
  if (hasTax) {
    const suffix = inclusive ? " (incl.)" : "";
    for (const r of t.taxSummary) {
      if (toDec(r.rate).isZero()) continue;
      if (kind === "intra") {
        totalsRows.push({
          key: `cgst-${r.rate}`,
          label: `CGST @ ${halfRate(r.rate)}%${suffix}`,
          value: money(r.cgst),
          tone: "muted",
        });
        totalsRows.push({
          key: `sgst-${r.rate}`,
          label: `${stateTax} @ ${halfRate(r.rate)}%${suffix}`,
          value: money(r.sgst),
          tone: "muted",
        });
      } else if (kind === "inter") {
        totalsRows.push({
          key: `igst-${r.rate}`,
          label: `IGST @ ${formatRate(r.rate)}%${suffix}`,
          value: money(r.igst),
          tone: "muted",
        });
      } else {
        totalsRows.push({
          key: `gst-${r.rate}`,
          label: `GST @ ${formatRate(r.rate)}%${suffix}`,
          value: money(r.gst),
          tone: "muted",
        });
      }
    }
  }
  if (!toDec(t.roundOff).isZero()) {
    const neg = toDec(t.roundOff).isNegative();
    totalsRows.push({
      key: "roundoff",
      label: "Round off",
      value: `${neg ? "−" : "+"}${money(toDec(t.roundOff).abs().toFixed(t.precision))}`,
      tone: "muted",
    });
  }
  totalsRows.push({ key: "grand", label: "Total", value: money(t.grandTotal), tone: "grand" });

  const received = meta.hasPayment && toDec(t.amountReceived).greaterThan(0);
  if (received) {
    totalsRows.push({
      key: "received",
      label: "Amount received",
      value: `−${money(t.amountReceived)}`,
      tone: "muted",
    });
    totalsRows.push({
      key: "balance",
      label: "Balance due",
      value: money(t.balanceDue),
      tone: "balance",
    });
  }

  /* ---------------- Tax summary ---------------- */
  let taxSummary: TaxSummaryView | null = null;
  if (hasTax && anyTaxed && t.taxSummary.length > 0) {
    const headers =
      kind === "intra"
        ? ["Rate", "Taxable value", "CGST", stateTax, "Total tax"]
        : kind === "inter"
          ? ["Rate", "Taxable value", "IGST", "Total tax"]
          : ["Rate", "Taxable value", "GST", "Total tax"];
    const rowFor = (r: (typeof t.taxSummary)[number]) =>
      kind === "intra"
        ? [`${formatRate(r.rate)}%`, money(r.taxable), money(r.cgst), money(r.sgst), money(r.tax)]
        : kind === "inter"
          ? [`${formatRate(r.rate)}%`, money(r.taxable), money(r.igst), money(r.tax)]
          : [`${formatRate(r.rate)}%`, money(r.taxable), money(r.gst), money(r.tax)];
    taxSummary = {
      headers,
      rows: t.taxSummary.map(rowFor),
      total:
        kind === "intra"
          ? [
              "Total",
              money(t.taxableTotal),
              money(t.cgstTotal),
              money(t.sgstTotal),
              money(t.taxTotal),
            ]
          : kind === "inter"
            ? ["Total", money(t.taxableTotal), money(t.igstTotal), money(t.taxTotal)]
            : ["Total", money(t.taxableTotal), money(t.gstTotal), money(t.taxTotal)],
    };
  }

  /* ---------------- Payment schedule ---------------- */
  const stages = activeStages(invoice.paymentSchedule);
  let schedule: ScheduleView | null = null;
  if (stages.length > 0) {
    const plan = computeSchedule(
      stages,
      t.grandTotal,
      t.precision,
      meta.hasPayment ? t.amountReceived : "0",
    );
    const hasStatus = meta.hasPayment && toDec(t.amountReceived).greaterThan(0);
    schedule = {
      rows: stages.map((s, i) => {
        const p = plan.stages[i];
        return {
          id: s.id,
          index: String(i + 1),
          label: s.label.trim() || `Instalment ${i + 1}`,
          due: s.due.trim(),
          share: formatPercent(p.percent),
          amount: money(p.amount),
          status: p.status === "paid" ? "Paid" : p.status === "partial" ? "Part paid" : "Due",
        };
      }),
      total: money(plan.scheduled),
      hasDue: stages.some((s) => s.due.trim()),
      hasStatus,
    };
  }

  /* ---------------- Payment ---------------- */
  const bank: LabelValue[] = [];
  const b = seller.bank;
  if (show.bankDetails && b.accountNumber.trim()) {
    if (b.accountName.trim()) bank.push({ label: "Account name", value: b.accountName.trim() });
    bank.push({ label: "Account no.", value: b.accountNumber.trim() });
    if (b.ifsc.trim()) bank.push({ label: "IFSC", value: b.ifsc.trim().toUpperCase() });
    if (b.bankName.trim())
      bank.push({
        label: "Bank",
        value: [b.bankName.trim(), b.branch.trim()].filter(Boolean).join(", "),
      });
    if (b.swift.trim() && invoice.currency !== "INR")
      bank.push({ label: "SWIFT", value: b.swift.trim().toUpperCase() });
  }
  const qr = resolvePaymentQr(invoice, t, {
    show: show.upiQr,
    includeAmount: opts.upiIncludeAmount,
  });
  const upiUri = qr.kind === "auto" ? qr.uri : null;
  const qrImage = qr.kind === "upload" ? qr.image : "";
  const instructions = invoice.paymentInstructions.trim();
  const upiId = show.upiQr && invoice.currency === "INR" ? seller.upiId.trim() : "";
  const preferred = bank.length && (upiUri || qrImage || upiId) ? seller.preferredPayment : "";
  const payment: PaymentView | null =
    bank.length || upiUri || qrImage || instructions || upiId
      ? {
          bank,
          upiId,
          upiUri,
          qrImage,
          qrAmount: qr.kind === "auto" && qr.amount ? money(qr.amount) : "",
          qrFor: qr.kind === "auto" ? qr.forLabel : "",
          payParams: show.payLink && qr.kind !== "none" ? qr.params : "",
          instructions,
          preferred,
        }
      : null;

  /* ---------------- Status ---------------- */
  const paymentStatus = meta.hasPayment ? t.paymentStatus : null;
  const stamp =
    show.statusStamp && paymentStatus === "paid"
      ? "PAID"
      : show.statusStamp && paymentStatus === "partial"
        ? "PARTIALLY PAID"
        : null;
  const receivedNote = received
    ? [
        invoice.payment.date ? `on ${date(invoice.payment.date)}` : "",
        invoice.payment.mode ? `via ${PAYMENT_MODE_LABELS[invoice.payment.mode]}` : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  const sellerContacts = [seller.email, seller.phone, seller.website]
    .map((s) => s.trim())
    .filter(Boolean);
  const customerContacts = [customer.email, customer.phone].map((s) => s.trim()).filter(Boolean);

  return {
    id: invoice.id,
    docType: invoice.docType,
    title: invoice.docTitle.trim() || meta.defaultTitle,
    number: invoice.number,
    numberLabel: numberLabel(invoice),
    currency: invoice.currency,
    issueDate: date(invoice.invoiceDate),
    dueDate: invoice.dueDate ? date(invoice.dueDate) : "",
    dueLabel: meta.dueLabel,
    meta: metaRows,
    seller: {
      name: seller.name.trim(),
      company: "",
      addressLines: sellerAddress,
      contacts: sellerContacts,
      tax: sellerTax,
      logo: show.logo ? seller.logo : "",
      signature: seller.signature,
      signatoryName: seller.signatoryName.trim(),
    },
    customer: {
      name: customer.name.trim(),
      company: customer.company.trim(),
      addressLines: customerAddress,
      contacts: customerContacts,
      tax: customerTax,
      shipTo: shipTo.length && !sameShip ? shipTo : [],
    },
    hasCustomer: Boolean(customer.name.trim() || customer.company.trim()),
    placeOfSupply,
    taxKind: kind,
    columns,
    gridTemplate: columns.map((c) => c.track).join(" "),
    rows,
    totals: totalsRows,
    grandTotal: money(t.grandTotal),
    amountDue: money(received ? t.balanceDue : t.grandTotal),
    amountDueLabel: !meta.hasPayment ? "Total" : received ? "Balance due" : "Amount due",
    words: show.amountInWords ? amountInWords(t.grandTotal, invoice.currency) : "",
    taxSummary: show.taxSummary ? taxSummary : null,
    schedule,
    payment,
    paymentStatus,
    stamp,
    received: received ? money(t.amountReceived) : "",
    receivedNote,
    notes: show.notes ? invoice.notes.trim() : "",
    terms: show.terms ? invoice.terms.trim() : "",
    declaration: invoice.declaration.trim(),
    footer: show.footer ? invoice.footer.trim() : "",
    hasPaymentInfo: Boolean(payment),
  };
}
