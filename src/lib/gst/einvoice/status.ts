import type { AppSettings, EInvoiceDetails, Invoice } from "@/lib/schema";
import {
  cancelWindow,
  isEInvoiceEligible,
  reportingStatus,
  type CancelWindow,
  type ReportingStatus,
} from "./applicability";
import { buildEInvoices, type EInvoiceBuild } from "./payload";
import type { IrpEntry } from "./response";

/** Where one document stands with the IRP, as shown to the user. */
export type EInvoiceState = "todo" | "exported" | "generated" | "cancelled";

export const STATE_LABEL: Record<EInvoiceState, string> = {
  todo: "To do",
  exported: "Exported, waiting for IRN",
  generated: "IRN recorded",
  cancelled: "IRN cancelled",
};

export function einvoiceState(inv: Pick<Invoice, "eInvoice">): EInvoiceState {
  const e = inv.eInvoice;
  if (e.status === "cancelled" || e.cancelledAt) return "cancelled";
  if (e.status === "generated" || e.irn) return "generated";
  if (e.exportedAt || e.status === "pending") return "exported";
  return "todo";
}

/** An IRN is a 64-character hash (hex). */
export function irnError(irn: string): string | null {
  const t = irn.trim();
  if (!t) return null;
  if (!/^[0-9a-fA-F]+$/.test(t)) return "An IRN has only letters A-F and digits.";
  if (t.length !== 64) return `An IRN has 64 characters (this has ${t.length}).`;
  return null;
}

/** Ack number: digits, up to 15. */
export function ackNoError(ack: string): string | null {
  const t = ack.trim();
  if (!t) return null;
  return /^\d{1,15}$/.test(t) ? null : "The acknowledgement number is digits only.";
}

export interface EInvoiceRow {
  invoice: Invoice;
  state: EInvoiceState;
  build: EInvoiceBuild;
  reporting: ReportingStatus;
  cancel: CancelWindow;
  /** Cancelled in the app but the IRN is still live on the IRP. */
  irnNeedsCancel: boolean;
}

/** One row per e-invoice-eligible document, newest document date first. */
export function einvoiceRows(input: {
  invoices: Invoice[];
  settings: AppSettings;
  today: string;
  nowMs: number;
}): EInvoiceRow[] {
  const { invoices, settings, today, nowMs } = input;
  const builds = new Map(buildEInvoices({ invoices, settings }).map((b) => [b.invoiceId, b]));
  return invoices
    .filter(isEInvoiceEligible)
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || b.number.localeCompare(a.number))
    .map((invoice) => {
      const state = einvoiceState(invoice);
      return {
        invoice,
        state,
        build: builds.get(invoice.id) ?? {
          invoiceId: invoice.id,
          number: invoice.number,
          payload: null,
          issues: [],
          blocked: true,
        },
        reporting:
          state === "generated" || state === "cancelled" || invoice.status === "cancelled"
            ? { deadline: "", daysLeft: null, state: "none" }
            : reportingStatus(invoice, settings, today),
        cancel: cancelWindow(invoice.eInvoice.ackDate, nowMs),
        irnNeedsCancel: invoice.status === "cancelled" && state === "generated",
      };
    });
}

export interface EInvoiceCounts {
  todo: number;
  exported: number;
  generated: number;
  cancelled: number;
  blocked: number;
  overdue: number;
  soon: number;
  irnNeedsCancel: number;
}

export function countRows(rows: readonly EInvoiceRow[]): EInvoiceCounts {
  const c: EInvoiceCounts = {
    todo: 0,
    exported: 0,
    generated: 0,
    cancelled: 0,
    blocked: 0,
    overdue: 0,
    soon: 0,
    irnNeedsCancel: 0,
  };
  for (const r of rows) {
    c[r.state]++;
    if (r.state === "todo" || r.state === "exported") {
      if (r.build.blocked) c.blocked++;
      if (r.reporting.state === "overdue") c.overdue++;
      if (r.reporting.state === "soon") c.soon++;
    }
    if (r.irnNeedsCancel) c.irnNeedsCancel++;
  }
  return c;
}

/** Remember that the document went into an export file (waiting for its IRN). */
export function withExported(inv: Invoice, nowISO: string): Invoice {
  if (inv.eInvoice.irn) return { ...inv, eInvoice: { ...inv.eInvoice, exportedAt: nowISO } };
  return {
    ...inv,
    eInvoice: { ...inv.eInvoice, exportedAt: nowISO, status: "pending" },
  };
}

/** Record that the IRN was cancelled on the portal. */
export function withIrnCancelled(inv: Invoice, nowISO: string, reason: string): Invoice {
  return {
    ...inv,
    eInvoice: {
      ...inv.eInvoice,
      status: "cancelled",
      cancelledAt: nowISO,
      cancelReason: reason.trim().slice(0, 300),
    },
  };
}

/** Store a parsed IRP row on an invoice's e-invoice details (pure; save with saveInvoice). */
export function withIrpEntry(inv: Invoice, entry: IrpEntry): Invoice {
  const eInvoice: EInvoiceDetails = {
    ...inv.eInvoice,
    irn: entry.irn,
    ackNo: entry.ackNo || inv.eInvoice.ackNo,
    ackDate: entry.ackDate || inv.eInvoice.ackDate,
    qr: entry.signedQr || inv.eInvoice.qr,
    status: /cancel|^cnl$/i.test(entry.status) ? "cancelled" : "generated",
  };
  return { ...inv, eInvoice };
}
