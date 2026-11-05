import { currencyPrecision } from "@/lib/currency";
import { normalizeNumeric } from "@/lib/money";

export type NumberGrouping = "indian" | "international";

const localeFor = (grouping: NumberGrouping) => (grouping === "indian" ? "en-IN" : "en-US");

const cache = new Map<string, Intl.NumberFormat>();
function formatter(key: string, make: () => Intl.NumberFormat) {
  let f = cache.get(key);
  if (!f) {
    f = make();
    cache.set(key, f);
  }
  return f;
}

/** Intl accepts exact decimal strings in modern browsers; keep that precision. */
function asFormattable(value: string): string {
  const s = normalizeNumeric(value);
  return /^-?\d+(\.\d+)?$/.test(s) ? s : "0";
}

/** "₹12,34,567.00" (Indian grouping) or "$1,234,567.00". */
export function formatMoney(
  value: string,
  currency: string,
  grouping: NumberGrouping = "indian",
  { symbol = true }: { symbol?: boolean } = {},
): string {
  const dp = currencyPrecision(currency);
  const f = formatter(`m:${currency}:${grouping}:${symbol}`, () =>
    symbol
      ? new Intl.NumberFormat(localeFor(grouping), {
          style: "currency",
          currency,
          currencyDisplay: "narrowSymbol",
          minimumFractionDigits: dp,
          maximumFractionDigits: dp,
        })
      : new Intl.NumberFormat(localeFor(grouping), {
          minimumFractionDigits: dp,
          maximumFractionDigits: dp,
        }),
  );
  // Intl.NumberFormat.format accepts decimal strings (ES2023) — no float conversion.
  return f.format(asFormattable(value) as unknown as number);
}

/** Quantities: up to 3 decimals, no trailing zeros. */
export function formatQuantity(value: string, grouping: NumberGrouping = "indian"): string {
  const f = formatter(
    `q:${grouping}`,
    () => new Intl.NumberFormat(localeFor(grouping), { maximumFractionDigits: 3 }),
  );
  return f.format(asFormattable(value) as unknown as number);
}

/** Compact money for dashboards: ₹1.2L, $3.4K. */
export function formatMoneyCompact(
  value: string,
  currency: string,
  grouping: NumberGrouping = "indian",
) {
  const f = formatter(
    `c:${currency}:${grouping}`,
    () =>
      new Intl.NumberFormat(localeFor(grouping), {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        notation: "compact",
        maximumFractionDigits: 1,
      }),
  );
  return f.format(asFormattable(value) as unknown as number);
}

export function formatPercent(value: string) {
  const n = Number(normalizeNumeric(value));
  if (!Number.isFinite(n)) return "0%";
  return `${Number(n.toFixed(4))}%`;
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
