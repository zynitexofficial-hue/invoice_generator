"use client";

import { Ban, BadgeCheck, FileMinus, FilePlus2, Trash } from "lucide-react";
import { toast } from "sonner";
import { filedPeriodFor } from "@/db/filings";
import { useFilings } from "@/db/hooks";
import { InvoiceActionError, issueInvoice } from "@/db/invoices";
import { DOC_TYPE_META } from "@/lib/documents";
import { formatDate } from "@/lib/dates";
import { computeTotals, isDraft, isIssued } from "@/lib/invoice-calc";
import { periodLabel } from "@/lib/period";
import {
  isNoteDocType,
  type AppSettings,
  type Filing,
  type Invoice,
  type NoteDocType,
} from "@/lib/schema";
import { validateInvoice } from "@/lib/validation";
import { canCancel, canDelete } from "@/components/document-lifecycle";
import { confirm } from "@/components/ui/confirm";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";

/** What a document allows right now (A2, B1, B3). */
export interface Lifecycle {
  /** Draft that can be marked issued (not quotations, not cancelled). */
  canIssue: boolean;
  /** Issued, not cancelled, and its return period isn't filed. */
  canCancel: boolean;
  /** Would be cancellable, but its GSTR-1 is filed — correct it with a credit note instead. */
  cancelBlockedBy: Filing | undefined;
  /** Issued invoices (not quotations or notes) can get credit/debit notes. */
  canCreateNotes: boolean;
  /** Only drafts and quotations can be deleted. */
  canDelete: boolean;
  /** The filed GSTR-1/IFF covering this document's date, if any. */
  filedBy: Filing | undefined;
}

export function lifecycleOf(
  inv: Invoice,
  filings: readonly Filing[],
  frequency: AppSettings["gst"]["filingFrequency"],
): Lifecycle {
  const filedBy = isIssued(inv) ? filedPeriodFor(filings, inv.invoiceDate, frequency) : undefined;
  const cancellable = canCancel(inv);
  return {
    canIssue: isDraft(inv) && inv.docType !== "proforma" && inv.status !== "cancelled",
    canCancel: cancellable && !filedBy,
    cancelBlockedBy: cancellable ? filedBy : undefined,
    canCreateNotes:
      isIssued(inv) &&
      inv.status !== "cancelled" &&
      inv.docType !== "proforma" &&
      !isNoteDocType(inv.docType),
    canDelete: canDelete(inv),
    filedBy,
  };
}

/** Lifecycle of a document with live filing status (undefined filings = treat as none filed). */
export function useLifecycle(inv: Invoice, settings: AppSettings): Lifecycle {
  const filings = useFilings();
  return lifecycleOf(inv, filings ?? [], settings.gst.filingFrequency);
}

/** "Oct 2026" / "Q3 FY 2026-27 (Oct–Dec 2026)" for a filing row. */
export function filingPeriodText(filing: Filing) {
  return `${filing.returnType} for ${periodLabel(filing.periodKey)}`;
}

export function filedOnText(filing: Filing, settings: AppSettings) {
  return filing.filedAt
    ? ` on ${formatDate(filing.filedAt.slice(0, 10), settings.formats.dateFormat)}`
    : "";
}

/**
 * Mark a draft as issued after checking it has no blocking problems.
 * Resolves the saved record, or null when cancelled/blocked.
 */
export async function confirmIssue(inv: Invoice, settings: AppSettings): Promise<Invoice | null> {
  const problems = validateInvoice(inv, computeTotals(inv), {
    hsnDigits: settings.gst.hsnDigits,
  }).errors;
  if (problems.length) {
    toast.error(
      `Fix ${problems.length === 1 ? "1 problem" : `${problems.length} problems`} first`,
      {
        description: problems[0].message,
      },
    );
    return null;
  }
  const label = DOC_TYPE_META[inv.docType].shortLabel;
  const ok = await confirm({
    title: `Mark ${inv.number || "this document"} as issued?`,
    description: `Use this when you've sent the ${label.toLowerCase()} some other way. It will count in your GST returns and can no longer be deleted — only cancelled or corrected with a credit/debit note.`,
    confirmLabel: "Mark as issued",
  });
  if (!ok) return null;
  try {
    const saved = await issueInvoice(inv);
    toast.success(`${inv.number || label} marked as issued`);
    return saved;
  } catch (error) {
    if (error instanceof InvoiceActionError) toast.error(error.message);
    else toast.error("Couldn't mark it as issued");
    return null;
  }
}

export function noteHref(inv: Invoice, kind: NoteDocType) {
  return `/invoice?from=${encodeURIComponent(inv.id)}&note=${kind}`;
}

/**
 * Menu entries for issuing, cancelling, correcting and deleting a document.
 * Shared by the History row menu and the editor menu.
 */
export function LifecycleMenuItems({
  invoice: inv,
  lifecycle: lc,
  settings,
  onIssue,
  onCancel,
  onDelete,
  onNavigate,
}: {
  invoice: Invoice;
  lifecycle: Lifecycle;
  settings: AppSettings;
  onIssue: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onNavigate: (href: string) => void;
}) {
  const blocked = lc.cancelBlockedBy;
  const blockedWhy = blocked
    ? `${filingPeriodText(blocked)} is marked filed${filedOnText(blocked, settings)}, so this invoice can't be cancelled. Issue a credit note to reduce or reverse it.`
    : "";
  const any = lc.canIssue || lc.canCreateNotes || lc.canCancel || lc.canDelete;
  if (!any) return null;
  return (
    <>
      <DropdownMenuSeparator />
      {lc.canIssue && (
        <DropdownMenuItem icon={<BadgeCheck />} onSelect={onIssue}>
          Mark as issued
        </DropdownMenuItem>
      )}
      {lc.canCreateNotes &&
        (blocked ? (
          <Tooltip content={blockedWhy} side="left">
            <DropdownMenuItem
              icon={<FileMinus />}
              onSelect={() => onNavigate(noteHref(inv, "credit_note"))}
            >
              <span className="block">Create credit note</span>
              <span className="block text-xs text-muted-foreground">
                Period filed — can&apos;t cancel
              </span>
            </DropdownMenuItem>
          </Tooltip>
        ) : (
          <DropdownMenuItem
            icon={<FileMinus />}
            onSelect={() => onNavigate(noteHref(inv, "credit_note"))}
          >
            Create credit note
          </DropdownMenuItem>
        ))}
      {lc.canCreateNotes && (
        <DropdownMenuItem
          icon={<FilePlus2 />}
          onSelect={() => onNavigate(noteHref(inv, "debit_note"))}
        >
          Create debit note
        </DropdownMenuItem>
      )}
      {lc.canDelete ? (
        <DropdownMenuItem icon={<Trash />} tone="danger" onSelect={onDelete}>
          Delete
        </DropdownMenuItem>
      ) : lc.canCancel ? (
        <DropdownMenuItem icon={<Ban />} tone="danger" onSelect={onCancel}>
          {isNoteDocType(inv.docType)
            ? `Cancel ${DOC_TYPE_META[inv.docType].shortLabel.toLowerCase()}`
            : "Cancel invoice"}
        </DropdownMenuItem>
      ) : null}
    </>
  );
}
