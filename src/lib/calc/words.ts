import { getCurrency, currencyPrecision } from "@/lib/currency";
import { toDec, roundTo } from "@/lib/money";

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 0–999 → words (no "and"), e.g. 868 → "Eight Hundred Sixty-Eight". */
function underThousand(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) {
    if (rest < 20) parts.push(ONES[rest]);
    else {
      const t = TENS[Math.floor(rest / 10)];
      const o = ONES[rest % 10];
      parts.push(o ? `${t}-${o}` : t);
    }
  }
  return parts.join(" ");
}

/** Indian system: crore (10^7), lakh (10^5), thousand, hundred. */
function indianWords(n: bigint): string {
  if (n === BigInt(0)) return "";
  const crore = BigInt(10_000_000);
  const parts: string[] = [];
  if (n >= crore) {
    parts.push(`${indianWords(n / crore)} Crore`);
    n %= crore;
  }
  const num = Number(n);
  const lakh = Math.floor(num / 100_000);
  const thousand = Math.floor((num % 100_000) / 1000);
  const rest = num % 1000;
  if (lakh) parts.push(`${underThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`);
  if (rest) parts.push(underThousand(rest));
  return parts.join(" ");
}

const SCALES = ["", "Thousand", "Million", "Billion", "Trillion", "Quadrillion"];

/** International system: thousand, million, billion, … */
function internationalWords(n: bigint): string {
  if (n === BigInt(0)) return "";
  const groups: number[] = [];
  const thousand = BigInt(1000);
  while (n > BigInt(0)) {
    groups.push(Number(n % thousand));
    n /= thousand;
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (!groups[i]) continue;
    const scale = SCALES[i] ?? "";
    parts.push(scale ? `${underThousand(groups[i])} ${scale}` : underThousand(groups[i]));
  }
  return parts.join(" ");
}

export function integerToWords(n: bigint, system: "indian" | "international"): string {
  const words = system === "indian" ? indianWords(n) : internationalWords(n);
  return words || "Zero";
}

/**
 * Amount in words for an invoice total.
 * INR uses the Indian numbering system (lakh/crore); other currencies use
 * the international system. Example: "Indian Rupees Twenty-Two Thousand
 * Eight Hundred Sixty-Eight and Paise Fifty Only".
 */
export function amountInWords(amount: string, currencyCode: string): string {
  const currency = getCurrency(currencyCode);
  const dp = currencyPrecision(currencyCode);
  const value = roundTo(toDec(amount).abs(), dp);
  const [intPart, fracPart = ""] = value.toFixed(dp).split(".");
  const system = currencyCode === "INR" ? "indian" : "international";

  const major = integerToWords(BigInt(intPart), system);
  let result = `${currency.major} ${major}`;
  const minorValue = fracPart ? Number(fracPart) : 0;
  if (minorValue > 0 && currency.minor) {
    result += ` and ${currency.minor} ${integerToWords(BigInt(minorValue), system)}`;
  }
  return `${result} Only`;
}
