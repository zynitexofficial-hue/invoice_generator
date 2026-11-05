"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { peekNumber } from "@/db/invoices";
import { addDaysISO } from "@/lib/dates";
import { DOC_TYPE_META } from "@/lib/documents";
import { withDocType } from "@/lib/invoice-factory";
import { businessCode } from "@/lib/numbering";
import type { DocType, Invoice } from "@/lib/schema";
import { useEditor } from "@/stores/editor-store";
import { useEditorContext } from "./editor-context";

/** Editor actions that need settings or async work (numbering). */
export function useEditorActions() {
  const { settings } = useEditorContext();
  /** {BIZ} uses this document's seller name, falling back to the saved profile. */
  const businessOf = useCallback(
    (inv: Invoice) => inv.seller.name.trim() || settings.profile.name,
    [settings],
  );

  const changeDocType = useCallback(
    async (docType: DocType) => {
      const inv = useEditor.getState().invoice;
      if (!inv || inv.docType === docType) return;
      const generated = await peekNumber(settings, docType, new Date(), businessOf(inv));
      useEditor.getState().update((current) => withDocType(current, docType, settings, generated));
      toast.message(`Switched to ${DOC_TYPE_META[docType].label}`, {
        description: `Number updated to ${generated.number}`,
      });
    },
    [settings, businessOf],
  );

  const regenerateNumber = useCallback(async () => {
    const inv = useEditor.getState().invoice;
    if (!inv) return;
    const generated = await peekNumber(settings, inv.docType, new Date(), businessOf(inv));
    useEditor
      .getState()
      .patch({ number: generated.number, autoNumber: generated.autoNumber, seqCommitted: false });
  }, [settings, businessOf]);

  /**
   * After the business name is entered, refresh an auto-generated number so
   * its {BIZ} code matches (e.g. INV-261022-4827 → ZYNI-261022-1093). Numbers
   * typed by hand, already used, or already downloaded are never changed.
   */
  const refreshBusinessCode = useCallback(async () => {
    const inv = useEditor.getState().invoice;
    const pattern = inv ? settings.numbering[inv.docType].pattern : "";
    if (!inv || !pattern.includes("{BIZ}") || inv.downloadedAt || inv.seqCommitted) return;
    if (!inv.autoNumber || inv.autoNumber.value !== inv.number) return;
    const code = businessCode(businessOf(inv));
    if (inv.number.includes(code)) return;
    await regenerateNumber();
  }, [settings, businessOf, regenerateNumber]);

  const setInvoiceDate = useCallback(
    (iso: string) => {
      useEditor.getState().update((inv) => {
        // Keep the same payment term when the invoice date moves.
        const days =
          inv.invoiceDate && inv.dueDate
            ? Math.round((Date.parse(inv.dueDate) - Date.parse(inv.invoiceDate)) / 86_400_000)
            : settings.invoiceDefaults.paymentDays;
        return {
          ...inv,
          invoiceDate: iso,
          dueDate: iso && inv.dueDate ? addDaysISO(iso, Math.max(0, days)) : inv.dueDate,
        };
      });
    },
    [settings],
  );

  return { changeDocType, regenerateNumber, refreshBusinessCode, setInvoiceDate };
}
