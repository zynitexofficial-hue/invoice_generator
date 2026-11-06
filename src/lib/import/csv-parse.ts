/**
 * Small RFC 4180 CSV reader for the import wizard. Runs entirely in the
 * browser on a file the user picked; nothing is uploaded.
 */

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_COLUMNS = 60;

export type CsvEncoding = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be" | "windows-1252";

export const ENCODING_LABELS: Record<CsvEncoding, string> = {
  "utf-8": "UTF-8",
  "utf-8-bom": "UTF-8 (with BOM)",
  "utf-16le": "UTF-16",
  "utf-16be": "UTF-16",
  "windows-1252": "Windows-1252 (Excel on Windows)",
};

/** Thrown with a message that is safe to show as-is. */
export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFileError";
  }
}

export interface DecodedText {
  text: string;
  encoding: CsvEncoding;
}

/** Decode file bytes: honours a BOM, tries UTF-8, falls back to Windows-1252 (common in Excel exports). */
export function decodeCsvBytes(bytes: Uint8Array): DecodedText {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8-bom" };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16be" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
  }
}

export const DELIMITERS = [",", ";", "\t", "|"] as const;
export type Delimiter = (typeof DELIMITERS)[number];

export const DELIMITER_LABELS: Record<Delimiter, string> = {
  ",": "comma",
  ";": "semicolon",
  "\t": "tab",
  "|": "pipe",
};

export interface ParsedRecords {
  rows: string[][];
  /** A quoted cell was never closed, so the rest of the file was read as one cell. */
  unterminatedQuote: boolean;
}

/**
 * Parse CSV text into rows of cells. Handles quoted cells, doubled quotes,
 * delimiters and line breaks inside quotes, and CRLF / LF / CR line ends.
 * Lines with no content at all are dropped.
 */
export function parseCsv(text: string, delimiter: string = ","): ParsedRecords {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let cellStarted = false;
  let unterminatedQuote = false;

  const endCell = () => {
    row.push(cell);
    cell = "";
    cellStarted = false;
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== "") || row.length > 1) rows.push(row);
    row = [];
  };

  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && !cellStarted) {
      inQuotes = true;
      cellStarted = true;
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      endRow();
    } else if (ch === "\n") {
      endRow();
    } else {
      cell += ch;
      cellStarted = true;
    }
  }
  if (inQuotes) unterminatedQuote = true;
  if (cell !== "" || row.length > 0 || cellStarted) endRow();
  // Rows made only of delimiters (",,,") are kept above when they have >1 cell; drop the ones that are blank.
  return { rows: rows.filter((r) => r.some((c) => c.trim() !== "")), unterminatedQuote };
}

/** Guess the delimiter: the one that splits the first lines into the same, larger-than-one number of cells. */
export function detectDelimiter(text: string): Delimiter {
  let sample = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  // Excel's optional "sep=;" first line.
  const sep = /^sep=(.)\r?\n/i.exec(sample);
  if (sep && (DELIMITERS as readonly string[]).includes(sep[1]!)) return sep[1] as Delimiter;
  sample = sample.slice(0, 20_000);
  let best: Delimiter = ",";
  let bestScore = 0;
  for (const d of DELIMITERS) {
    const { rows } = parseCsv(sample, d);
    const head = rows.slice(0, 20);
    const width = head[0]?.length ?? 0;
    if (width < 2) continue;
    const consistent = head.filter((r) => r.length === width).length / head.length;
    const score = consistent * (width - 1);
    if (score > bestScore + 1e-9) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

/** Leading ' that our own export adds to neutralise =, +, -, @ is not part of the value. */
export function cleanCell(value: string): string {
  const v = value.trim();
  return /^'[=+\-@]/.test(v) ? v.slice(1) : v;
}

export interface ParsedCsvFile {
  headers: string[];
  /** Data rows, each exactly `headers.length` long and cleaned. */
  rows: string[][];
  delimiter: Delimiter;
  encoding: CsvEncoding;
  /** Rows that had more or fewer cells than the header. */
  raggedRows: number;
  unterminatedQuote: boolean;
}

/** Make header names unique and non-empty so each can be picked in a dropdown. */
function tidyHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const base = cleanCell(h) || `Column ${i + 1}`;
    const n = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/** Read a chosen CSV file. Throws ImportFileError with a plain-language message for unusable files. */
export function parseCsvFile(bytes: Uint8Array, delimiter?: Delimiter): ParsedCsvFile {
  if (bytes.length === 0) throw new ImportFileError("This file is empty.");
  if (bytes.length > MAX_IMPORT_BYTES) {
    throw new ImportFileError(
      `This file is ${(bytes.length / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_IMPORT_BYTES / 1024 / 1024} MB — split it into smaller files.`,
    );
  }
  const { text, encoding } = decodeCsvBytes(bytes);
  const chosen = delimiter ?? detectDelimiter(text);
  const body = /^sep=.\r?\n/i.test(text) ? text.replace(/^sep=.\r?\n/i, "") : text;
  const { rows, unterminatedQuote } = parseCsv(body, chosen);
  if (rows.length === 0) throw new ImportFileError("No rows found in this file.");
  const headerRow = rows[0]!;
  if (headerRow.length > MAX_IMPORT_COLUMNS) {
    throw new ImportFileError(
      `This file has ${headerRow.length} columns. The limit is ${MAX_IMPORT_COLUMNS}. Is it really a CSV?`,
    );
  }
  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    throw new ImportFileError("This file has a header row but no data rows.");
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new ImportFileError(
      `This file has ${dataRows.length.toLocaleString("en-IN")} rows. The limit is ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} per import — split it into smaller files.`,
    );
  }
  const headers = tidyHeaders(headerRow);
  let raggedRows = 0;
  const cleaned = dataRows.map((r) => {
    if (r.length !== headers.length) raggedRows++;
    return headers.map((_, i) => cleanCell(r[i] ?? ""));
  });
  return {
    headers,
    rows: cleaned,
    delimiter: chosen,
    encoding,
    raggedRows,
    unterminatedQuote,
  };
}
