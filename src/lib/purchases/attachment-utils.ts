/** Pure helpers for receipt attachments: validation, sizes and storage warnings. */

export const ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const ATTACHMENT_ACCEPT = ATTACHMENT_TYPES.join(",");

export function isImageType(mime: string): boolean {
  return mime.startsWith("image/");
}

/** "48 KB", "1.4 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export type AttachmentProblem = "type" | "empty" | "size";

/** Check a file (or its compressed form) against the allowed types and the size cap. */
export function checkAttachment(
  file: { type: string; size: number },
  maxFileKb: number,
): { ok: true } | { ok: false; problem: AttachmentProblem; message: string } {
  if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type))
    return {
      ok: false,
      problem: "type",
      message: "Attach a photo (JPG, PNG, WebP) or a PDF.",
    };
  if (file.size <= 0) return { ok: false, problem: "empty", message: "This file is empty." };
  if (file.size > maxFileKb * 1024)
    return {
      ok: false,
      problem: "size",
      message: `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(maxFileKb * 1024)} (change it in Settings → Data & backup).`,
    };
  return { ok: true };
}

export type StorageLevel = "ok" | "warn" | "full";

export interface StorageWarning {
  level: StorageLevel;
  /** Plain-language lines, most important first; empty when all is well. */
  messages: string[];
  /** Attachments' share of the warning size (%, whole number). */
  attachmentPercent: number;
}

/**
 * Warn when attachments near the size set in Settings (80%) or pass it, and
 * when the browser reports that its storage for this site is over 80% used.
 * `quota`/`usage` come from navigator.storage.estimate() and may be 0 (unknown).
 */
export function storageWarning(args: {
  attachmentBytes: number;
  warnTotalMb: number;
  quota?: number;
  usage?: number;
}): StorageWarning {
  const limit = args.warnTotalMb * 1024 * 1024;
  const ratio = limit > 0 ? args.attachmentBytes / limit : 0;
  const messages: string[] = [];
  let level: StorageLevel = "ok";
  if (ratio >= 1) {
    level = "warn";
    messages.push(
      `Attached files use ${formatBytes(args.attachmentBytes)}, over your ${args.warnTotalMb} MB warning size. Back up, then remove old files.`,
    );
  } else if (ratio >= 0.8) {
    level = "warn";
    messages.push(
      `Attached files use ${formatBytes(args.attachmentBytes)}, close to your ${args.warnTotalMb} MB warning size.`,
    );
  }
  const quota = args.quota ?? 0;
  const usage = args.usage ?? 0;
  if (quota > 0) {
    const q = usage / quota;
    if (q >= 0.95) {
      level = "full";
      messages.unshift("Browser storage for this app is almost full. New files may not save.");
    } else if (q >= 0.8) {
      if (level === "ok") level = "warn";
      messages.push(
        `Browser storage is ${Math.round(q * 100)}% full (${formatBytes(usage)} of ${formatBytes(quota)}).`,
      );
    }
  }
  return { level, messages, attachmentPercent: Math.round(ratio * 100) };
}
