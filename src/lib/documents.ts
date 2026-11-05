import type { DocType } from "@/lib/schema";

export interface DocTypeMeta {
  label: string;
  shortLabel: string;
  description: string;
  defaultTitle: string;
  hasTax: boolean;
  hasPayment: boolean;
  dueLabel: string;
}

export const DOC_TYPE_META: Record<DocType, DocTypeMeta> = {
  tax_invoice: {
    label: "Tax Invoice",
    shortLabel: "Tax Invoice",
    description: "Standard GST invoice with CGST/SGST or IGST.",
    defaultTitle: "Tax Invoice",
    hasTax: true,
    hasPayment: true,
    dueLabel: "Due date",
  },
  invoice: {
    label: "Invoice (without GST)",
    shortLabel: "Invoice",
    description: "Simple invoice for businesses not registered under GST.",
    defaultTitle: "Invoice",
    hasTax: false,
    hasPayment: true,
    dueLabel: "Due date",
  },
  bill_of_supply: {
    label: "Bill of Supply",
    shortLabel: "Bill of Supply",
    description: "GST-registered composition dealers and exempt supplies.",
    defaultTitle: "Bill of Supply",
    hasTax: false,
    hasPayment: true,
    dueLabel: "Due date",
  },
  proforma: {
    label: "Proforma / Quotation",
    shortLabel: "Quotation",
    description: "Pre-sale estimate. Convert it into a tax invoice later.",
    defaultTitle: "Quotation",
    hasTax: true,
    hasPayment: false,
    dueLabel: "Valid until",
  },
  export: {
    label: "Export Invoice",
    shortLabel: "Export",
    description: "Foreign clients in any currency, zero-rated under LUT.",
    defaultTitle: "Export Invoice",
    hasTax: false,
    hasPayment: true,
    dueLabel: "Due date",
  },
};

export const PROFORMA_TITLES = ["Quotation", "Proforma Invoice", "Estimate"] as const;

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  "": "Not specified",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
  card: "Card",
  other: "Other",
};

export const COMMON_UNITS = [
  "pcs",
  "nos",
  "hrs",
  "days",
  "months",
  "kg",
  "g",
  "ltr",
  "m",
  "sq.ft",
  "box",
  "set",
  "job",
];
