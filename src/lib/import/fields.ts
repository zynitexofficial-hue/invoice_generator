/** What each importable record type accepts, and how column headers are matched to fields. */

export const IMPORT_ENTITIES = ["customers", "items", "expenses"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  /** Other header names people use for this field (matched ignoring case and punctuation). */
  aliases: string[];
  hint?: string;
  /** Used in the downloadable template (first sample row). */
  example: string;
  /** Second sample row. */
  example2?: string;
}

export interface EntityDef {
  entity: ImportEntity;
  label: string;
  singular: string;
  plural: string;
  description: string;
  fields: FieldDef[];
  /** How duplicates are recognised, in plain language. */
  duplicateRule: string;
  fileName: string;
}

const CUSTOMER_FIELDS: FieldDef[] = [
  {
    key: "name",
    label: "Name",
    required: true,
    aliases: [
      "customer",
      "customer name",
      "party",
      "party name",
      "client",
      "client name",
      "contact name",
      "contact",
    ],
    example: "Asha Mehta",
    example2: "Rao & Sons",
    hint: "Contact or business name. If empty, Company is used.",
  },
  {
    key: "company",
    label: "Company",
    aliases: [
      "company name",
      "business",
      "business name",
      "firm",
      "organisation",
      "organization",
      "trade name",
      "legal name",
    ],
    example: "Mehta Traders",
    example2: "Rao & Sons Pvt Ltd",
  },
  {
    key: "gstin",
    label: "GSTIN",
    aliases: ["gst", "gst no", "gst number", "gstin number", "gstin uin", "gstin/uin", "tax id"],
    example: "27AAPFU0939F1ZV",
    example2: "",
    hint: "15 characters; checked for format and check digit.",
  },
  {
    key: "email",
    label: "Email",
    aliases: ["e-mail", "email id", "email address", "mail"],
    example: "asha@example.com",
    example2: "",
  },
  {
    key: "phone",
    label: "Phone",
    aliases: [
      "mobile",
      "mobile no",
      "mobile number",
      "phone no",
      "phone number",
      "contact number",
      "telephone",
      "tel",
    ],
    example: "9820012345",
    example2: "",
  },
  {
    key: "billingAddress",
    label: "Billing address",
    aliases: ["address", "address line 1", "billing", "bill to", "street", "street address"],
    example: "12 Linking Road, Bandra West",
    example2: "4 MG Road",
  },
  {
    key: "shippingAddress",
    label: "Shipping address",
    aliases: ["shipping", "ship to", "delivery address", "shipping address line 1"],
    example: "",
    example2: "",
  },
  {
    key: "city",
    label: "City",
    aliases: ["town", "district"],
    example: "Mumbai",
    example2: "Bengaluru",
  },
  {
    key: "pincode",
    label: "PIN code",
    aliases: ["pin", "pin code", "postal code", "postcode", "zip", "zip code"],
    example: "400050",
    example2: "560001",
  },
  {
    key: "state",
    label: "State",
    aliases: ["state name", "state code", "place of supply", "pos", "state/ut"],
    example: "Maharashtra",
    example2: "29",
    hint: "Name or 2-digit GST state code. Taken from the GSTIN when empty.",
  },
  {
    key: "country",
    label: "Country",
    aliases: [],
    example: "India",
    example2: "India",
    hint: "Defaults to India.",
  },
  {
    key: "notes",
    label: "Notes",
    aliases: ["remarks", "comment", "comments"],
    example: "",
    example2: "Pays by cheque",
  },
];

const ITEM_FIELDS: FieldDef[] = [
  {
    key: "name",
    label: "Item name",
    required: true,
    aliases: [
      "item",
      "product",
      "product name",
      "service",
      "service name",
      "particulars",
      "description of goods",
      "title",
    ],
    example: "Website design",
    example2: "A4 paper ream",
  },
  {
    key: "description",
    label: "Description",
    aliases: ["details", "item description", "long description"],
    example: "Up to 5 pages",
    example2: "",
  },
  {
    key: "hsnSac",
    label: "HSN / SAC",
    aliases: ["hsn", "sac", "hsn code", "sac code", "hsn/sac", "hsn sac code"],
    example: "998314",
    example2: "4802",
  },
  {
    key: "unit",
    label: "Unit",
    aliases: ["uom", "unit of measure", "units", "measure"],
    example: "job",
    example2: "ream",
  },
  {
    key: "price",
    label: "Price",
    required: false,
    aliases: [
      "rate",
      "unit price",
      "selling price",
      "mrp",
      "amount",
      "sale price",
      "price per unit",
    ],
    example: "25000",
    example2: "320.50",
    hint: "Numbers only, e.g. 1250.50.",
  },
  {
    key: "gstRate",
    label: "GST rate %",
    aliases: ["gst", "gst %", "gst rate", "tax rate", "tax %", "rate of tax", "igst rate"],
    example: "18",
    example2: "5",
  },
  {
    key: "priceIncludesGst",
    label: "Price includes GST",
    aliases: ["tax inclusive", "inclusive of gst", "includes gst", "gst inclusive", "inclusive"],
    example: "No",
    example2: "Yes",
    hint: "Yes or No.",
  },
];

const EXPENSE_FIELDS: FieldDef[] = [
  {
    key: "date",
    label: "Date",
    required: true,
    aliases: ["expense date", "transaction date", "bill date", "paid on", "voucher date"],
    example: "2026-10-05",
    example2: "06/10/2026",
    hint: "yyyy-mm-dd or dd/mm/yyyy.",
  },
  {
    key: "amount",
    label: "Amount",
    required: true,
    aliases: [
      "total",
      "total amount",
      "expense amount",
      "value",
      "debit",
      "gross amount",
      "amount paid",
    ],
    example: "11800",
    example2: "450",
    hint: "Amount you paid, including GST unless you say otherwise.",
  },
  {
    key: "vendorName",
    label: "Vendor",
    aliases: ["vendor name", "supplier", "supplier name", "payee", "paid to", "party", "merchant"],
    example: "Sunrise Realty",
    example2: "Cafe Coffee",
  },
  {
    key: "vendorGstin",
    label: "Vendor GSTIN",
    aliases: ["supplier gstin", "gstin", "gst no", "gst number", "vendor gst"],
    example: "27AAPFU0939F1ZV",
    example2: "",
  },
  {
    key: "category",
    label: "Category",
    aliases: ["expense category", "head", "expense head", "type", "account", "ledger"],
    example: "Rent",
    example2: "Food & entertainment",
  },
  {
    key: "description",
    label: "Description",
    aliases: ["narration", "particulars", "details", "memo", "purpose"],
    example: "October office rent",
    example2: "Client meeting",
  },
  {
    key: "gstRate",
    label: "GST rate %",
    aliases: ["gst", "gst %", "tax rate", "tax %", "gst rate"],
    example: "18",
    example2: "0",
  },
  {
    key: "amountIncludesGst",
    label: "Amount includes GST",
    aliases: ["tax inclusive", "inclusive of gst", "includes gst", "gst inclusive"],
    example: "Yes",
    example2: "Yes",
    hint: "Yes or No. Defaults to Yes.",
  },
  {
    key: "itcEligible",
    label: "ITC eligible",
    aliases: ["itc", "input tax credit", "claim itc", "eligible for itc"],
    example: "Yes",
    example2: "No",
    hint: "Yes or No.",
  },
  {
    key: "invoiceNo",
    label: "Bill number",
    aliases: [
      "bill no",
      "bill number",
      "invoice no",
      "invoice number",
      "vendor invoice",
      "reference",
      "ref no",
    ],
    example: "SR/2610/14",
    example2: "",
  },
  {
    key: "invoiceDate",
    label: "Bill date",
    aliases: ["invoice date", "vendor invoice date"],
    example: "2026-10-01",
    example2: "",
  },
  {
    key: "paymentStatus",
    label: "Payment status",
    aliases: ["status", "paid", "payment"],
    example: "Paid",
    example2: "Unpaid",
    hint: "Paid, Partly paid or Unpaid. Defaults to Paid.",
  },
  {
    key: "paymentMode",
    label: "Payment mode",
    aliases: ["mode", "paid by", "payment method", "method"],
    example: "Bank transfer",
    example2: "UPI",
    hint: "UPI, Bank transfer, Cash, Cheque, Card or Other.",
  },
  {
    key: "notes",
    label: "Notes",
    aliases: ["remarks", "comment", "comments"],
    example: "",
    example2: "",
  },
];

export const ENTITY_DEFS: Record<ImportEntity, EntityDef> = {
  customers: {
    entity: "customers",
    label: "Customers",
    singular: "customer",
    plural: "customers",
    description: "Names, GSTINs and addresses of the people and businesses you bill.",
    fields: CUSTOMER_FIELDS,
    duplicateRule: "Same GSTIN, or the same name when there is no GSTIN",
    fileName: "customers-template",
  },
  items: {
    entity: "items",
    label: "Items",
    singular: "item",
    plural: "items",
    description: "Products and services with HSN/SAC, price and GST rate.",
    fields: ITEM_FIELDS,
    duplicateRule: "Same name and HSN/SAC",
    fileName: "items-template",
  },
  expenses: {
    entity: "expenses",
    label: "Expenses",
    singular: "expense",
    plural: "expenses",
    description: "Money you spent: rent, travel, supplies and so on.",
    fields: EXPENSE_FIELDS,
    duplicateRule: "Same date, amount and vendor",
    fileName: "expenses-template",
  },
};

/** Lower-case letters and digits only, for forgiving header comparison. */
export function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Field key -> index of the CSV column it reads from, or -1 for "don't import". */
export type ColumnMapping = Record<string, number>;

/**
 * Suggest which column feeds each field: exact (normalised) matches on the
 * label, key or an alias first, then looser "contains" matches. A column is
 * used for at most one field.
 */
export function suggestMapping(entity: ImportEntity, headers: string[]): ColumnMapping {
  const fields = ENTITY_DEFS[entity].fields;
  const normHeaders = headers.map(normalizeHeader);
  const mapping: ColumnMapping = Object.fromEntries(fields.map((f) => [f.key, -1]));
  const used = new Set<number>();

  const names = (f: FieldDef) =>
    [f.label, f.key, ...f.aliases].map(normalizeHeader).filter((n) => n.length > 0);

  for (const f of fields) {
    const wanted = names(f);
    const idx = normHeaders.findIndex((h, i) => !used.has(i) && wanted.includes(h));
    if (idx >= 0) {
      mapping[f.key] = idx;
      used.add(idx);
    }
  }
  for (const f of fields) {
    if (mapping[f.key]! >= 0) continue;
    const wanted = names(f).filter((n) => n.length >= 5);
    const idx = normHeaders.findIndex(
      (h, i) => !used.has(i) && h.length >= 4 && wanted.some((n) => h.includes(n) || n.includes(h)),
    );
    if (idx >= 0) {
      mapping[f.key] = idx;
      used.add(idx);
    }
  }
  return mapping;
}

/** Required fields that no column is mapped to. */
export function missingRequired(entity: ImportEntity, mapping: ColumnMapping): FieldDef[] {
  return ENTITY_DEFS[entity].fields.filter((f) => f.required && (mapping[f.key] ?? -1) < 0);
}

/** Header row plus two sample rows for the downloadable template. */
export function templateRows(entity: ImportEntity): { headers: string[]; rows: string[][] } {
  const fields = ENTITY_DEFS[entity].fields;
  return {
    headers: fields.map((f) => f.label),
    rows: [fields.map((f) => f.example), fields.map((f) => f.example2 ?? f.example)],
  };
}
