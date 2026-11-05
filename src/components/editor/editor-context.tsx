"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { InvoiceTotals } from "@/lib/calc/engine";
import type { AppSettings } from "@/lib/schema";
import { useEditor } from "@/stores/editor-store";

interface EditorContextValue {
  /** Settings are stable while editing, so sharing them via context is cheap. */
  settings: AppSettings;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({
  value,
  children,
}: {
  value: EditorContextValue;
  children: ReactNode;
}) {
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditorContext() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditorContext must be used inside the editor");
  return ctx;
}

/** Live totals for the open document (from the editor store). */
export function useEditorTotals(): InvoiceTotals {
  return useEditor((s) => s.totals!);
}

/**
 * Inline message for one field. Each call subscribes to just that field's
 * message string, so typing elsewhere doesn't re-render this component.
 * Errors appear after the first download attempt; warnings show immediately.
 */
export function useFieldIssue(fieldId: string): { error?: string; warning?: string } {
  const error = useEditor((s) =>
    s.showErrors ? s.validation.errors.find((i) => i.field === fieldId)?.message : undefined,
  );
  // Soft (missing-info) warnings stay hidden until the first download attempt.
  const warning = useEditor(
    (s) =>
      s.validation.warnings.find((i) => i.field === fieldId && (s.showErrors || !i.soft))?.message,
  );
  return { error, warning };
}
