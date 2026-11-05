"use client";

import { toast } from "sonner";
import { cancelInvoice, deleteInvoice, InvoiceActionError } from "@/db/invoices";
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

/** Ask for a reason and cancel. Resolves the cancelled record, or null. */
export async function confirmCancel(inv: Invoice): Promise<Invoice | null> {
  const reason = await promptText({
    title: `Cancel ${inv.number || "this document"}?`,
    description:
      "It stays in your records and number series, marked as cancelled. This can't be undone — if it was already reported in a filed return, issue a credit note instead.",
    confirmLabel: "Cancel document",
    cancelLabel: "Keep it",
    tone: "danger",
    input: { label: "Reason", placeholder: "e.g. Wrong customer details", required: true },
  });
  if (reason === null) return null;
  try {
    const saved = await cancelInvoice(inv, reason);
    toast.success(`${inv.number || "Document"} cancelled`);
    return saved;
  } catch (error) {
    if (error instanceof InvoiceActionError) toast.error(error.message);
    return null;
  }
}
