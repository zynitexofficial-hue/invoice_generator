"use client";

import { useEffect } from "react";
import { isNumberTaken, saveInvoice } from "@/db/invoices";
import { useEditor } from "@/stores/editor-store";
import { CARRY_OVER_TEXT, rememberDesign, rememberTexts } from "./remember";

const AUTOSAVE_DELAY = 600;

let queue: Promise<void> = Promise.resolve();

/**
 * Write the current document if it has unsaved edits. Saves are serialised
 * through a promise queue so two writes never race each other.
 */
export function flushSave(): Promise<void> {
  queue = queue.then(async () => {
    const state = useEditor.getState();
    const invoice = state.invoice;
    if (!invoice || state.revision === state.savedRevision) return;
    const revision = state.revision;
    const firstSave = !state.persisted;
    state.markSaving();
    try {
      const saved = await saveInvoice(invoice);
      useEditor.getState().markSaved(revision, saved);
      if (firstSave && typeof window !== "undefined") {
        // Give the draft a stable URL without a navigation/re-render.
        window.history.replaceState(window.history.state, "", `/invoice?id=${saved.id}`);
      }
    } catch {
      useEditor.getState().markError();
    }
  });
  return queue;
}

/** Debounced autosave + duplicate-number check + leave-page guard. */
export function useAutosave() {
  useEffect(() => {
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let numberTimer: ReturnType<typeof setTimeout> | undefined;
    let textTimer: ReturnType<typeof setTimeout> | undefined;
    let designTimer: ReturnType<typeof setTimeout> | undefined;
    const saveDesign = () => {
      designTimer = undefined;
      const latest = useEditor.getState().invoice;
      if (latest) void rememberDesign(latest).catch(() => {});
    };
    const saveTexts = () => {
      textTimer = undefined;
      const latest = useEditor.getState().invoice;
      if (latest) void rememberTexts(latest).catch(() => {});
    };

    const unsubscribe = useEditor.subscribe((state, prev) => {
      // Editing notes/terms here makes them the starting text of the next document.
      const inv = state.invoice;
      if (
        inv &&
        prev.invoice?.id === inv.id &&
        CARRY_OVER_TEXT.some((k) => inv[k] !== prev.invoice![k])
      ) {
        clearTimeout(textTimer);
        textTimer = setTimeout(saveTexts, 1000);
      }
      // Likewise a design change becomes the starting design of the next document.
      if (inv && prev.invoice?.id === inv.id && inv.design !== prev.invoice.design) {
        clearTimeout(designTimer);
        designTimer = setTimeout(saveDesign, 800);
      }
      if (state.revision !== prev.revision && state.revision !== state.savedRevision) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => void flushSave(), AUTOSAVE_DELAY);
      }
      const number = state.invoice?.number;
      if (
        state.invoice &&
        (number !== prev.invoice?.number || state.invoice.id !== prev.invoice?.id)
      ) {
        clearTimeout(numberTimer);
        const id = state.invoice.id;
        numberTimer = setTimeout(async () => {
          const taken = await isNumberTaken(number ?? "", id).catch(() => false);
          if (useEditor.getState().invoice?.id === id) useEditor.getState().setNumberTaken(taken);
        }, 300);
      }
    });

    const beforeUnload = (e: BeforeUnloadEvent) => {
      const s = useEditor.getState();
      if (s.invoice && s.revision !== s.savedRevision) {
        void flushSave();
        e.preventDefault();
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushSave();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      unsubscribe();
      clearTimeout(saveTimer);
      clearTimeout(numberTimer);
      if (textTimer) {
        clearTimeout(textTimer);
        saveTexts();
      }
      if (designTimer) {
        clearTimeout(designTimer);
        saveDesign();
      }
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", onHide);
      void flushSave();
    };
  }, []);
}
