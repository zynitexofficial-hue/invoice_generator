import type { DocType } from "@/lib/schema";

export interface NumberToken {
  token: string;
  description: string;
}

/** Default pattern: business code + date + random digits, e.g. ZYNI-261022-4827 (16 chars). */
export const DEFAULT_NUMBER_PATTERN = "{BIZ}-{YY}{MM}{DD}-{RAND:4}";
/** The earlier default — settings still using it are upgraded automatically. */
export const LEGACY_NUMBER_PATTERN = "{PREFIX}-{YY}{MM}{DD}-{HH}{mm}";

export const NUMBER_TOKENS: NumberToken[] = [
  { token: "{BIZ}", description: "First 4 letters of your business name" },
  { token: "{PREFIX}", description: "Prefix for this document type" },
  { token: "{YYYY}", description: "Year, 4 digits" },
  { token: "{YY}", description: "Year, 2 digits" },
  { token: "{MM}", description: "Month, 01–12" },
  { token: "{DD}", description: "Day, 01–31" },
  { token: "{HH}", description: "Hour, 00–23" },
  { token: "{mm}", description: "Minute, 00–59" },
  { token: "{ss}", description: "Second, 00–59" },
  { token: "{FY}", description: "Indian financial year, e.g. 26-27" },
  { token: "{SEQ}", description: "Running number (this browser)" },
  { token: "{SEQ:3}", description: "Running number padded to 3 digits" },
  { token: "{RAND:4}", description: "Random digits (checked against your history)" },
];

const TOKEN_RE = /\{(BIZ|PREFIX|YYYY|YY|MM|DD|HH|mm|ss|FY|SEQ|RAND)(?::(\d{1,2}))?\}/g;
const ANY_TOKEN_RE = /\{[^{}]*\}/g;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** Indian financial year (April–March) containing `date`. */
export function financialYear(date: Date): { startYear: number; label: string } {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  const label = `${pad(startYear % 100)}-${pad((startYear + 1) % 100)}`;
  return { startYear, label };
}

export function patternUsesRandom(pattern: string) {
  return /\{RAND(?::\d{1,2})?\}/.test(pattern);
}

/**
 * Short business code for {BIZ}: the first 4 letters/digits of the business
 * name in capitals ("Zynitex" → "ZYNI"), or "INV" when no name is set yet.
 */
export function businessCode(name: string): string {
  const code = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase();
  return code || "INV";
}

/** Random decimal digits (crypto-backed where available). */
export function randomDigits(length: number): string {
  const values = new Uint32Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(values);
  else for (let i = 0; i < length; i++) values[i] = Math.floor(Math.random() * 10);
  return Array.from(values, (v) => String(v % 10)).join("");
}

export function patternUsesSeq(pattern: string) {
  return /\{SEQ(?::\d{1,2})?\}/.test(pattern);
}

/** Tokens in the pattern that we don't recognise (shown as a warning in settings). */
export function unknownTokens(pattern: string): string[] {
  const known = new Set<string>();
  for (const m of pattern.matchAll(TOKEN_RE)) known.add(m[0]);
  return [...pattern.matchAll(ANY_TOKEN_RE)].map((m) => m[0]).filter((t) => !known.has(t));
}

/**
 * Counter scope for {SEQ}: per document type, and per financial year when
 * {FY} is in the pattern (otherwise per calendar year when a year token is used).
 */
export function counterKey(docType: DocType, pattern: string, date: Date): string {
  if (pattern.includes("{FY}")) return `${docType}:fy${financialYear(date).label}`;
  if (pattern.includes("{YYYY}") || pattern.includes("{YY}"))
    return `${docType}:y${date.getFullYear()}`;
  return docType;
}

export interface FormatNumberOptions {
  prefix: string;
  date: Date;
  seq?: number;
  /** Business name for {BIZ}. */
  business?: string;
  /** Random digit source for {RAND:n} (injectable for tests). */
  random?: (length: number) => string;
}

export function formatDocumentNumber(pattern: string, opts: FormatNumberOptions): string {
  const { prefix, date, seq = 1, business = "", random = randomDigits } = opts;
  return pattern.replace(TOKEN_RE, (_match, token: string, width?: string) => {
    switch (token) {
      case "BIZ":
        return businessCode(business);
      case "PREFIX":
        return prefix;
      case "YYYY":
        return String(date.getFullYear());
      case "YY":
        return pad(date.getFullYear() % 100);
      case "MM":
        return pad(date.getMonth() + 1);
      case "DD":
        return pad(date.getDate());
      case "HH":
        return pad(date.getHours());
      case "mm":
        return pad(date.getMinutes());
      case "ss":
        return pad(date.getSeconds());
      case "FY":
        return financialYear(date).label;
      case "SEQ":
        return pad(seq, width ? Number(width) : 1);
      case "RAND":
        return random(Math.min(Math.max(width ? Number(width) : 4, 1), 8));
      default:
        return "";
    }
  });
}

export interface GstNumberCheck {
  tooLong: boolean;
  invalidChars: boolean;
}

/** GST rule 46(b): ≤16 chars; only letters, digits, "-" and "/". */
export function checkGstNumberRules(value: string): GstNumberCheck {
  return {
    tooLong: value.length > 16,
    invalidChars: !/^[A-Za-z0-9/-]*$/.test(value),
  };
}
