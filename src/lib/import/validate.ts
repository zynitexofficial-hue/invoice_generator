/**
 * Row validation for the import wizard. Each function takes the raw text of
 * one row (already mapped to field keys) and returns either a clean value
 * ready to store or a list of plain-language problems.
 */

import { checkGstin, normalizeGstin, stateFromGstin } from "@/lib/gst/gstin";
import { INDIAN_STATES, isValidStateCode } from "@/lib/gst/states";
import { Dec, isValidDecimal, normalizeNumeric } from "@/lib/money";
import { parseYmd } from "@/lib/recurring/schedule";
import {
  catalogItemSchema,
  customerFieldsSchema,
  expenseSchema,
  PAYMENT_MODES,
  type AppSettings,
  type Expense,
} from "@/lib/schema";
import { isAllowedGstRate } from "@/lib/validation";
import type { ColumnMapping, ImportEntity } from "./fields";
import { ENTITY_DEFS } from "./fields";

export interface CustomerValue {
  name: string;
  company: string;
  email: string;
  phone: string;
  billingAddress: string;
  shippingAddress: string;
  city: string;
  pincode: string;
  stateCode: string;
  country: string;
  gstin: string;
  notes: string;
}

export interface ItemValue {
  name: string;
  description: string;
  hsnSac: string;
  unit: string;
  price: string;
  gstRate: string;
  priceIncludesGst: boolean;
}

export type ExpenseValue = Partial<Expense> & { date: string; amount: string };

export interface RowResult<T> {
  /** Line number in the file (the header is line 1). */
  line: number;
  raw: Record<string, string>;
  value?: T;
  errors: string[];
  warnings: string[];
}

export interface ValidationContext {
  settings: AppSettings;
  today: string;
}

/* ---------------- Cell parsers ---------------- */

export function parseBool(input: string): boolean | undefined {
  const v = input.trim().toLowerCase();
  if (["yes", "y", "true", "1", "paid", "inclusive"].includes(v)) return true;
  if (["no", "n", "false", "0", "unpaid", "exclusive"].includes(v)) return false;
  return undefined;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, or "5 Oct 2026". Day comes first (Indian convention). */
export function parseImportDate(input: string): string | undefined {
  const s = input.trim();
  if (!s) return undefined;
  let y: number, m: number, d: number;
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(s);
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else if ((match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s))) {
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
    if (match[3]!.length === 2) y += 2000;
  } else if ((match = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{2}|\d{4})$/.exec(s))) {
    d = Number(match[1]);
    m = MONTHS.indexOf(match[2]!.slice(0, 3).toLowerCase()) + 1;
    y = Number(match[3]);
    if (match[3]!.length === 2) y += 2000;
  } else return undefined;
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return parseYmd(iso) ? iso : undefined;
}

/** "₹ 1,23,456.50" -> "123456.50". undefined when it isn't a non-negative number. */
export function parseAmount(input: string): string | undefined {
  const cleaned = input
    .replace(/[₹\s]/g, "")
    .replace(/^(rs\.?|inr)/i, "")
    .replace(/,/g, "");
  if (cleaned === "") return undefined;
  if (!isValidDecimal(cleaned, { maxDecimals: 4 })) return undefined;
  const n = normalizeNumeric(cleaned);
  return new Dec(n.startsWith(".") ? `0${n}` : n).toFixed();
}

/** "18", "18%", "18.0" -> "18". */
export function parseRate(input: string): string | undefined {
  const s = input.trim().replace(/%$/, "").trim();
  if (s === "") return undefined;
  if (!isValidDecimal(s, { maxDecimals: 2 })) return undefined;
  const d = new Dec(s.startsWith(".") ? `0${s}` : s);
  return d.gt(100) ? undefined : d.toFixed();
}

/** State code ("27", "7") or name ("maharashtra", "MH" is not supported) -> 2-digit code. */
export function resolveState(input: string): string | undefined {
  const s = input.trim();
  if (!s) return undefined;
  if (/^\d{1,2}$/.test(s)) {
    const code = s.padStart(2, "0");
    return isValidStateCode(code) ? code : undefined;
  }
  const lead = /^(\d{2})\b/.exec(s) ?? /\((?:code\s*)?(\d{2})\)/i.exec(s);
  if (lead && isValidStateCode(lead[1]!)) return lead[1];
  const wanted = s.toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ");
  return INDIAN_STATES.find((st) => st.name.toLowerCase() === wanted)?.code;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function zodMessages(issues: { path: PropertyKey[]; message: string }[]): string[] {
  return issues.map((i) => {
    const field = i.path.join(".");
    return field ? `${field}: ${i.message}` : i.message;
  });
}

/* ---------------- Per-entity validation ---------------- */

export function validateCustomer(
  raw: Record<string, string>,
  line: number,
): RowResult<CustomerValue> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const g = (k: string) => (raw[k] ?? "").trim();

  let name = g("name");
  const company = g("company");
  if (!name && company) {
    name = company;
    warnings.push("No name; the company name is used as the name.");
  }
  if (!name) errors.push("Name is required.");

  let gstin = "";
  if (g("gstin")) {
    gstin = normalizeGstin(g("gstin"));
    const check = checkGstin(gstin);
    if (!check.valid) errors.push(`GSTIN: ${check.message ?? "not valid"}.`);
  }

  let stateCode = "";
  if (g("state")) {
    const resolved = resolveState(g("state"));
    if (resolved) stateCode = resolved;
    else warnings.push(`Couldn't recognise the state "${g("state")}"; left blank.`);
  }
  const fromGstin = gstin ? stateFromGstin(gstin) : undefined;
  if (fromGstin) {
    if (stateCode && stateCode !== fromGstin)
      warnings.push("The state doesn't match the GSTIN; the GSTIN's state is used.");
    stateCode = fromGstin;
  }

  const email = g("email");
  if (email && !EMAIL_RE.test(email)) errors.push("Email address doesn't look right.");

  const phone = g("phone");
  if (phone && phone.replace(/\D/g, "").length < 7) warnings.push("Phone number looks too short.");

  const country = g("country") || "India";
  const pincode = g("pincode");
  if (pincode && country.toLowerCase() === "india" && !/^\d{6}$/.test(pincode))
    errors.push("PIN code must be 6 digits.");

  const candidate = {
    name,
    company,
    email,
    phone,
    billingAddress: g("billingAddress"),
    shippingAddress: g("shippingAddress"),
    city: g("city"),
    pincode,
    stateCode,
    country,
    gstin,
  };
  const parsed = customerFieldsSchema.safeParse(candidate);
  if (!parsed.success) errors.push(...zodMessages(parsed.error.issues));
  const notes = g("notes").slice(0, 1000);
  return {
    line,
    raw,
    errors,
    warnings,
    value: errors.length || !parsed.success ? undefined : { ...parsed.data, notes },
  };
}

export function validateItem(
  raw: Record<string, string>,
  line: number,
  ctx: ValidationContext,
): RowResult<ItemValue> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const g = (k: string) => (raw[k] ?? "").trim();

  const name = g("name");
  if (!name) errors.push("Item name is required.");

  let price = "";
  if (g("price")) {
    const p = parseAmount(g("price"));
    if (p === undefined) errors.push(`Price "${g("price")}" isn't a valid amount.`);
    else price = p;
  } else warnings.push("No price; it will be blank.");

  let gstRate = "";
  if (g("gstRate")) {
    const r = parseRate(g("gstRate"));
    if (r === undefined) errors.push(`GST rate "${g("gstRate")}" must be a number from 0 to 100.`);
    else {
      gstRate = r;
      if (!isAllowedGstRate(r, ctx.today))
        warnings.push(`${r}% isn't a standard GST slab today; check it.`);
    }
  }

  const hsnSac = g("hsnSac").replace(/\s+/g, "");
  if (hsnSac && !/^\d{4,8}$/.test(hsnSac)) warnings.push("HSN/SAC is usually 4 to 8 digits.");

  let priceIncludesGst = false;
  if (g("priceIncludesGst")) {
    const b = parseBool(g("priceIncludesGst"));
    if (b === undefined) errors.push(`"Price includes GST" must be Yes or No.`);
    else priceIncludesGst = b;
  }

  const candidate = {
    id: "import",
    name,
    description: g("description"),
    hsnSac,
    unit: g("unit"),
    price,
    gstRate,
    priceIncludesGst,
  };
  const parsed = catalogItemSchema.safeParse(candidate);
  if (!parsed.success) errors.push(...zodMessages(parsed.error.issues));
  return {
    line,
    raw,
    errors,
    warnings,
    value:
      errors.length || !parsed.success
        ? undefined
        : {
            name: parsed.data.name,
            description: parsed.data.description,
            hsnSac: parsed.data.hsnSac,
            unit: parsed.data.unit,
            price: parsed.data.price,
            gstRate: parsed.data.gstRate,
            priceIncludesGst: parsed.data.priceIncludesGst,
          },
  };
}

const PAYMENT_MODE_WORDS: Record<string, (typeof PAYMENT_MODES)[number]> = {
  upi: "upi",
  banktransfer: "bank_transfer",
  neft: "bank_transfer",
  rtgs: "bank_transfer",
  imps: "bank_transfer",
  bank: "bank_transfer",
  cash: "cash",
  cheque: "cheque",
  check: "cheque",
  card: "card",
  creditcard: "card",
  debitcard: "card",
  other: "other",
};

export function validateExpense(
  raw: Record<string, string>,
  line: number,
  ctx: ValidationContext,
): RowResult<ExpenseValue> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const g = (k: string) => (raw[k] ?? "").trim();

  const date = parseImportDate(g("date"));
  if (!g("date")) errors.push("Date is required.");
  else if (!date)
    errors.push(`Date "${g("date")}" isn't recognised. Use yyyy-mm-dd or dd/mm/yyyy.`);
  else if (date > ctx.today) warnings.push("Date is in the future.");

  const amount = parseAmount(g("amount"));
  if (!g("amount")) errors.push("Amount is required.");
  else if (amount === undefined) errors.push(`Amount "${g("amount")}" isn't a valid number.`);
  else if (new Dec(amount).lte(0)) errors.push("Amount must be more than zero.");

  const vendorName = g("vendorName");
  const description = g("description");
  if (!vendorName && !description) warnings.push("No vendor or description.");

  let vendorGstin = "";
  let vendorStateCode = "";
  if (g("vendorGstin")) {
    vendorGstin = normalizeGstin(g("vendorGstin"));
    const check = checkGstin(vendorGstin);
    if (!check.valid) errors.push(`Vendor GSTIN: ${check.message ?? "not valid"}.`);
    else vendorStateCode = check.stateCode ?? "";
  }

  let gstRate = "0";
  if (g("gstRate")) {
    const r = parseRate(g("gstRate"));
    if (r === undefined) errors.push(`GST rate "${g("gstRate")}" must be a number from 0 to 100.`);
    else gstRate = r;
  }
  const hasGst = new Dec(gstRate).gt(0);

  let amountIncludesGst = true;
  if (g("amountIncludesGst")) {
    const b = parseBool(g("amountIncludesGst"));
    if (b === undefined) errors.push(`"Amount includes GST" must be Yes or No.`);
    else amountIncludesGst = b;
  }

  const category = g("category");
  const known = ctx.settings.expenseCategories.find(
    (c) => c.name.toLowerCase() === category.toLowerCase(),
  );
  if (category && !known) warnings.push(`"${category}" isn't one of your expense categories.`);

  let itcEligible = false;
  if (g("itcEligible")) {
    const b = parseBool(g("itcEligible"));
    if (b === undefined) errors.push(`"ITC eligible" must be Yes or No.`);
    else itcEligible = b;
  } else if (known) {
    itcEligible = known.defaultItc === "eligible" && hasGst && !!vendorGstin;
  }
  if (itcEligible && !hasGst) {
    itcEligible = false;
    warnings.push("ITC needs GST on the bill; marked not eligible.");
  }

  let paymentStatus: Expense["paymentStatus"] = "paid";
  if (g("paymentStatus")) {
    const v = g("paymentStatus")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
    if (["paid", "yes", "settled"].includes(v)) paymentStatus = "paid";
    else if (["unpaid", "due", "pending", "no", "open"].includes(v)) paymentStatus = "unpaid";
    else if (["partial", "partlypaid", "partiallypaid"].includes(v)) paymentStatus = "partial";
    else errors.push(`Payment status "${g("paymentStatus")}" must be Paid, Partly paid or Unpaid.`);
  }

  let paymentMode: Expense["paymentMode"] = "";
  if (g("paymentMode")) {
    const mode =
      PAYMENT_MODE_WORDS[
        g("paymentMode")
          .toLowerCase()
          .replace(/[^a-z]/g, "")
      ];
    if (mode) paymentMode = mode;
    else warnings.push(`Payment mode "${g("paymentMode")}" isn't recognised; left blank.`);
  }

  let invoiceDate = "";
  if (g("invoiceDate")) {
    const d = parseImportDate(g("invoiceDate"));
    if (d) invoiceDate = d;
    else warnings.push("Bill date isn't recognised; left blank.");
  }

  const value: ExpenseValue | undefined =
    date && amount !== undefined
      ? {
          date,
          amount,
          amountIncludesGst,
          vendorName,
          vendorGstin,
          vendorStateCode,
          category,
          description,
          gstRate,
          gstMode: hasGst
            ? vendorStateCode && ctx.settings.profile.stateCode
              ? vendorStateCode === ctx.settings.profile.stateCode
                ? "intra"
                : "inter"
              : "intra"
            : "none",
          itcEligible,
          invoiceNo: g("invoiceNo"),
          invoiceDate,
          paymentStatus,
          paymentDate: paymentStatus === "unpaid" ? "" : date,
          paymentMode,
          notes: g("notes"),
        }
      : undefined;

  if (value) {
    const parsed = expenseSchema.safeParse({
      ...value,
      id: "import",
      createdAt: "",
      updatedAt: "",
    });
    if (!parsed.success) errors.push(...zodMessages(parsed.error.issues));
  }
  return { line, raw, errors, warnings, value: errors.length ? undefined : value };
}

/* ---------------- Whole-file validation ---------------- */

/** Pull a row's cells into field-key form using the column mapping. */
export function mapRow(
  entity: ImportEntity,
  row: string[],
  mapping: ColumnMapping,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ENTITY_DEFS[entity].fields) {
    const idx = mapping[f.key] ?? -1;
    out[f.key] = idx >= 0 ? (row[idx] ?? "").trim() : "";
  }
  return out;
}

export type AnyValue = CustomerValue | ItemValue | ExpenseValue;

export function validateRows(
  entity: ImportEntity,
  rows: string[][],
  mapping: ColumnMapping,
  ctx: ValidationContext,
): RowResult<AnyValue>[] {
  return rows.map((row, i) => {
    const raw = mapRow(entity, row, mapping);
    const line = i + 2;
    if (entity === "customers") return validateCustomer(raw, line);
    if (entity === "items") return validateItem(raw, line, ctx);
    return validateExpense(raw, line, ctx);
  });
}
