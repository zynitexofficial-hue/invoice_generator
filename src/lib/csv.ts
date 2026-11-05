import { downloadBlob, safeFileName } from "@/lib/utils";

export type CsvCell = string | number | boolean | null | undefined;

/** Quote a cell per RFC 4180; neutralise spreadsheet formula injection. */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // A leading =, +, -, @ makes Excel/Sheets evaluate the cell as a formula.
  // Numbers like "-12.50" are safe and kept as-is.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** Download a UTF-8 CSV with BOM so Excel shows ₹ and non-Latin text correctly. */
export function downloadCsv(name: string, headers: string[], rows: CsvCell[][]) {
  const blob = new Blob(["﻿", toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `${safeFileName(name)}.csv`);
}
