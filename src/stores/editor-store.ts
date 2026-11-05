import { create } from "zustand";
import { arrayMove } from "@dnd-kit/sortable";
import type { InvoiceTotals } from "@/lib/calc/engine";
import { computeTotals } from "@/lib/invoice-calc";
import { newId } from "@/lib/invoice-factory";
import { validateInvoice, type ValidationResult } from "@/lib/validation";
import { getTemplateMeta } from "@/lib/templates-meta";
import type {
  DesignCustomization,
  Invoice,
  InvoiceCustomer,
  LineItem,
  PaymentInfo,
  Seller,
  TemplateId,
} from "@/lib/schema";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

interface EditorState {
  invoice: Invoice | null;
  /** Whether the record exists in IndexedDB yet (new drafts are saved on first edit). */
  persisted: boolean;
  /** Bumped on every user edit; autosave compares it with the last saved revision. */
  revision: number;
  savedRevision: number;
  status: SaveStatus;
  lastSavedAt: number | null;
  /** Show inline validation errors (after the first download attempt). */
  showErrors: boolean;
  numberTaken: boolean;
  /** Derived on every edit — components select only the slices they show. */
  totals: InvoiceTotals | null;
  validation: ValidationResult;

  /** Open a document. `dirty` marks it as needing a save (e.g. a fresh duplicate). */
  load: (invoice: Invoice, persisted: boolean, opts?: { dirty?: boolean }) => void;
  clear: () => void;
  /** Replace the invoice through an updater; counts as a user edit. */
  update: (fn: (inv: Invoice) => Invoice) => void;
  patch: (partial: Partial<Invoice>) => void;
  patchSeller: (partial: Partial<Seller>) => void;
  patchCustomer: (partial: Partial<InvoiceCustomer>) => void;
  patchPayment: (partial: Partial<PaymentInfo>) => void;
  patchLine: (id: string, partial: Partial<LineItem>) => void;
  /** Inserts after `afterId`; `null` puts the line first, omitted appends it. */
  addLine: (line: LineItem, afterId?: string | null) => void;
  removeLine: (id: string) => void;
  duplicateLine: (id: string) => void;
  moveLine: (fromId: string, toId: string) => void;
  moveLineBy: (id: string, delta: number) => void;
  patchDesign: (partial: Partial<DesignCustomization>) => void;
  setTemplate: (templateId: TemplateId) => void;
  setDesign: (templateId: TemplateId, customization: DesignCustomization) => void;

  markSaving: () => void;
  markSaved: (revision: number, invoice: Invoice) => void;
  markError: () => void;
  setShowErrors: (v: boolean) => void;
  setNumberTaken: (v: boolean) => void;
}

const EMPTY_VALIDATION: ValidationResult = { errors: [], warnings: [] };

function derive(invoice: Invoice, numberTaken: boolean) {
  const totals = computeTotals(invoice);
  return { totals, validation: validateInvoice(invoice, totals, { duplicateNumber: numberTaken }) };
}

export const useEditor = create<EditorState>((set, get) => {
  const edit = (fn: (inv: Invoice) => Invoice) => {
    const current = get().invoice;
    if (!current) return;
    const next = fn(current);
    if (next === current) return;
    set((s) => ({
      invoice: next,
      revision: s.revision + 1,
      status: "pending",
      ...derive(next, s.numberTaken),
    }));
  };

  return {
    invoice: null,
    persisted: false,
    revision: 0,
    savedRevision: 0,
    status: "idle",
    lastSavedAt: null,
    showErrors: false,
    numberTaken: false,
    totals: null,
    validation: EMPTY_VALIDATION,

    load: (invoice, persisted, opts) =>
      set({
        ...derive(invoice, false),
        invoice,
        persisted,
        revision: opts?.dirty ? 1 : 0,
        savedRevision: 0,
        status: opts?.dirty ? "pending" : persisted ? "saved" : "idle",
        lastSavedAt: persisted ? Date.parse(invoice.updatedAt) || Date.now() : null,
        showErrors: false,
        numberTaken: false,
      }),
    clear: () =>
      set({
        invoice: null,
        persisted: false,
        revision: 0,
        savedRevision: 0,
        status: "idle",
        totals: null,
        validation: EMPTY_VALIDATION,
      }),

    update: edit,
    patch: (partial) => edit((inv) => ({ ...inv, ...partial })),
    patchSeller: (partial) => edit((inv) => ({ ...inv, seller: { ...inv.seller, ...partial } })),
    patchCustomer: (partial) =>
      edit((inv) => ({ ...inv, customer: { ...inv.customer, ...partial } })),
    patchPayment: (partial) => edit((inv) => ({ ...inv, payment: { ...inv.payment, ...partial } })),
    patchLine: (id, partial) =>
      edit((inv) => ({
        ...inv,
        lines: inv.lines.map((l) => (l.id === id ? { ...l, ...partial } : l)),
      })),
    addLine: (line, afterId) =>
      edit((inv) => {
        const index = afterId ? inv.lines.findIndex((l) => l.id === afterId) : -1;
        const lines = [...inv.lines];
        lines.splice(afterId === null ? 0 : index === -1 ? lines.length : index + 1, 0, line);
        return { ...inv, lines };
      }),
    removeLine: (id) => edit((inv) => ({ ...inv, lines: inv.lines.filter((l) => l.id !== id) })),
    duplicateLine: (id) =>
      edit((inv) => {
        const index = inv.lines.findIndex((l) => l.id === id);
        if (index === -1) return inv;
        const lines = [...inv.lines];
        lines.splice(index + 1, 0, { ...structuredClone(inv.lines[index]), id: newId() });
        return { ...inv, lines };
      }),
    moveLine: (fromId, toId) =>
      edit((inv) => {
        const from = inv.lines.findIndex((l) => l.id === fromId);
        const to = inv.lines.findIndex((l) => l.id === toId);
        if (from === -1 || to === -1 || from === to) return inv;
        return { ...inv, lines: arrayMove(inv.lines, from, to) };
      }),
    moveLineBy: (id, delta) =>
      edit((inv) => {
        const from = inv.lines.findIndex((l) => l.id === id);
        const to = from + delta;
        if (from === -1 || to < 0 || to >= inv.lines.length) return inv;
        return { ...inv, lines: arrayMove(inv.lines, from, to) };
      }),
    patchDesign: (partial) =>
      edit((inv) => ({
        ...inv,
        design: { ...inv.design, customization: { ...inv.design.customization, ...partial } },
      })),
    setTemplate: (templateId) =>
      edit((inv) =>
        inv.design.templateId === templateId
          ? inv
          : {
              ...inv,
              design: {
                ...inv.design,
                templateId,
                templateVersion: getTemplateMeta(templateId).version,
              },
            },
      ),
    setDesign: (templateId, customization) =>
      edit((inv) => ({
        ...inv,
        design: {
          templateId,
          templateVersion: getTemplateMeta(templateId).version,
          customization: structuredClone(customization),
        },
      })),

    markSaving: () => set({ status: "saving" }),
    markSaved: (revision, invoice) =>
      set((s) => ({
        persisted: true,
        savedRevision: revision,
        lastSavedAt: Date.now(),
        status: s.revision === revision ? "saved" : "pending",
        // Keep server-side derived fields (summary, seq) without clobbering newer edits.
        invoice:
          s.invoice && s.invoice.id === invoice.id
            ? {
                ...s.invoice,
                summary: invoice.summary,
                seqCommitted: invoice.seqCommitted,
                downloadedAt: invoice.downloadedAt || s.invoice.downloadedAt,
                updatedAt: invoice.updatedAt,
              }
            : s.invoice,
      })),
    markError: () => set({ status: "error" }),
    setShowErrors: (v) => set({ showErrors: v }),
    setNumberTaken: (v) =>
      set((s) =>
        s.numberTaken === v || !s.invoice
          ? { numberTaken: v }
          : { numberTaken: v, ...derive(s.invoice, v) },
      ),
  };
});

/** True when there are edits not yet written to IndexedDB. */
export const selectHasUnsaved = (s: EditorState) =>
  s.revision !== s.savedRevision && s.status !== "idle";
