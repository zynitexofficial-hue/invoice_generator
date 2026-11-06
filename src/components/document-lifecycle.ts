"use client";

import { toast } from "sonner";
import { recordCancellationAmendment } from "@/db/amendments";
import { getFiledPeriodForDate } from "@/db/filings";
import { cancelInvoice, deleteInvoice, InvoiceActionError } from "@/db/invoices";
import { loadSettings } from "@/db/settings";
import { todayISO } from "@/lib/dates";
import { isIssued } from "@/lib/invoice-calc";
import type { Invoice } from "@/lib/schema";
import { confirm, promptText } from "@/components/ui/confirm";

/** Issued documents (other than quotations) can't be deleted — only cancelled. */
export function canDelete(inv: Invoice) {
  return !isIssued(inv) || inv.docType === "proforma";
}

export function canCancel(inv: Invoice) {
  return isIssued(inv) && inv.docType !== "proforma" && inv.status !== "cancelled";
}

/** Confirm and delete. Resolves true when deleted. */
export async function confirmDelete(inv: Invoice, persisted = true): Promise<boolean> {
  const ok = await confirm({
    title: `Delete ${inv.number || "this document"}?`,
    description:
      "It will be removed from this browser. PDFs and invoice files you downloaded are not affected.",
    confirmLabel: "Delete",
    tone: "danger",
  });
  if (!ok) return false;
  try {
    if (persisted) await deleteInvoice(inv.id);
    toast.success("Document deleted");
    return true;
  } catch (error) {
    if (error instanceof InvoiceActionError) toast.error(error.message);
    return false;
  }
}

/**
 * Ask for a reason and cancel. Resolves the cancelled record, or null.
 * When the document's GSTR-1 period is already filed, the dialog explains the
 * options (credit note, or cancel and report it as an amendment) and a draft
 * amendment record is created after cancelling.
 */
export async function confirmCancel(inv: Invoice): Promise<Invoice | null> {
  const settings = await loadSettings();
  const filed = inv.invoiceDate
    ? await getFiledPeriodForDate(inv.invoiceDate, settings.gst.filingFrequency)
    : undefined;
  const reason = await promptText({
    title: filed
      ? `${inv.number || "This document"} is in a return you already filed`
      : `Cancel ${inv.number || "this document"}?`,
    description: filed
      ? "Its GSTR-1 for this period is marked filed, so the filed return can't change. If the sale really happened and something changed (goods returned, price reduced), keep it and issue a credit note instead. If it was issued by mistake, cancel it here: it stays in your number series and an amendment is added so the cancellation is reported in a later GSTR-1. This can't be undone."
      : "It stays in your records and number series, marked as cancelled. This can't be undone — if it was already reported in a filed return, issue a credit note instead.",
    confirmLabel: filed ? "Cancel and record amendment" : "Cancel document",
    cancelLabel: "Keep it",
    tone: "danger",
    input: { label: "Reason", placeholder: "e.g. Wrong customer details", required: true },
  });
  if (reason === null) return null;
  try {
    const saved = await cancelInvoice(inv, reason);
    if (filed) {
      await recordCancellationAmendment({
        cancelled: saved,
        settings,
        originalPeriodKey: filed.periodKey,
        today: todayISO(),
      });
      toast.success(`${inv.number || "Document"} cancelled`, {
        description: "Added to Returns → Amendments to report in your next GSTR-1.",
      });
    } else {
      toast.success(`${inv.number || "Document"} cancelled`);
    }
    return saved;
  } catch (error) {
    if (error instanceof InvoiceActionError) toast.error(error.message);
    return null;
  }
}
