export interface CurrencyInfo {
  code: string;
  name: string;
  /** Name of the major unit used in "amount in words", e.g. "US Dollars". */
  major: string;
  /** Name of the minor unit, e.g. "Cents". Empty for currencies without one. */
  minor: string;
}

/** Curated list of currencies supported for invoicing. INR first. */
export const CURRENCIES: CurrencyInfo[] = [
  { code: "INR", name: "Indian Rupee", major: "Indian Rupees", minor: "Paise" },
  { code: "USD", name: "US Dollar", major: "US Dollars", minor: "Cents" },
  { code: "EUR", name: "Euro", major: "Euros", minor: "Cents" },
  { code: "GBP", name: "British Pound", major: "Pounds Sterling", minor: "Pence" },
  { code: "AED", name: "UAE Dirham", major: "UAE Dirhams", minor: "Fils" },
  { code: "AUD", name: "Australian Dollar", major: "Australian Dollars", minor: "Cents" },
  { code: "CAD", name: "Canadian Dollar", major: "Canadian Dollars", minor: "Cents" },
  { code: "SGD", name: "Singapore Dollar", major: "Singapore Dollars", minor: "Cents" },
  { code: "NZD", name: "New Zealand Dollar", major: "New Zealand Dollars", minor: "Cents" },
  { code: "CHF", name: "Swiss Franc", major: "Swiss Francs", minor: "Rappen" },
  { code: "JPY", name: "Japanese Yen", major: "Japanese Yen", minor: "" },
  { code: "CNY", name: "Chinese Yuan", major: "Chinese Yuan", minor: "Fen" },
  { code: "HKD", name: "Hong Kong Dollar", major: "Hong Kong Dollars", minor: "Cents" },
  { code: "SAR", name: "Saudi Riyal", major: "Saudi Riyals", minor: "Halalas" },
  { code: "QAR", name: "Qatari Riyal", major: "Qatari Riyals", minor: "Dirhams" },
  { code: "KWD", name: "Kuwaiti Dinar", major: "Kuwaiti Dinars", minor: "Fils" },
  { code: "OMR", name: "Omani Rial", major: "Omani Rials", minor: "Baisa" },
  { code: "BHD", name: "Bahraini Dinar", major: "Bahraini Dinars", minor: "Fils" },
  { code: "MYR", name: "Malaysian Ringgit", major: "Malaysian Ringgit", minor: "Sen" },
  { code: "THB", name: "Thai Baht", major: "Thai Baht", minor: "Satang" },
  { code: "IDR", name: "Indonesian Rupiah", major: "Indonesian Rupiah", minor: "Sen" },
  { code: "PHP", name: "Philippine Peso", major: "Philippine Pesos", minor: "Centavos" },
  { code: "KRW", name: "South Korean Won", major: "South Korean Won", minor: "" },
  { code: "ZAR", name: "South African Rand", major: "South African Rand", minor: "Cents" },
  { code: "SEK", name: "Swedish Krona", major: "Swedish Kronor", minor: "Öre" },
  { code: "NOK", name: "Norwegian Krone", major: "Norwegian Kroner", minor: "Øre" },
  { code: "DKK", name: "Danish Krone", major: "Danish Kroner", minor: "Øre" },
  { code: "NPR", name: "Nepalese Rupee", major: "Nepalese Rupees", minor: "Paisa" },
  { code: "LKR", name: "Sri Lankan Rupee", major: "Sri Lankan Rupees", minor: "Cents" },
  { code: "BDT", name: "Bangladeshi Taka", major: "Bangladeshi Taka", minor: "Poisha" },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function getCurrency(code: string): CurrencyInfo {
  return BY_CODE.get(code) ?? { code, name: code, major: code, minor: "" };
}

export function isSupportedCurrency(code: string) {
  return BY_CODE.has(code);
}

const precisionCache = new Map<string, number>();

/** Number of minor-unit digits for a currency (INR 2, JPY 0, KWD 3). */
export function currencyPrecision(code: string): number {
  const cached = precisionCache.get(code);
  if (cached !== undefined) return cached;
  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    digits = 2;
  }
  precisionCache.set(code, digits);
  return digits;
}

const symbolCache = new Map<string, string>();

/** Narrow symbol for a currency, e.g. ₹, $, €. Falls back to the code. */
export function currencySymbol(code: string): string {
  const cached = symbolCache.get(code);
  if (cached) return cached;
  let symbol = code;
  try {
    const part = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    if (part) symbol = part.value;
  } catch {
    symbol = code;
  }
  symbolCache.set(code, symbol);
  return symbol;
}
