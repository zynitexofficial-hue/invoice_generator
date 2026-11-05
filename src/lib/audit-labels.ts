import type { AuditAction } from "@/lib/schema";

/** Plain-language names for the field keys the invoice audit log records. */
const FIELD_LABELS: Record<string, string> = {
  number: "Number",
  invoiceDate: "Date",
  "customer.name": "Customer",
  "customer.gstin": "Customer GSTIN",
  placeOfSupply: "Place of supply",
  status: "Status",
  "summary.grandTotal": "Total",
  lines: "Line items",
};

export function auditFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

const ACTION_LABELS: Record<AuditAction, string> = {
  create: "Created",
  update: "Edited",
  issue: "Issued",
  cancel: "Cancelled",
  delete: "Deleted",
  restore: "Restored",
};

export function auditActionLabel(action: AuditAction): string {
  return ACTION_LABELS[action];
}

/** "Total: 1,000.00 → 1,180.00"; an empty side reads as "empty". */
export function describeChange(c: { field: string; from: string; to: string }): string {
  return `${auditFieldLabel(c.field)}: ${c.from || "empty"} → ${c.to || "empty"}`;
}
