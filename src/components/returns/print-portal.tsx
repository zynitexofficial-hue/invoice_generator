"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Prints a returns summary. The app's global print CSS hides everything
 * except `body > #print-root` (used by the document PrintHost), so the
 * summary is rendered into its own temporary `#print-root` at the end of
 * <body> while the print dialog is open, with a scoped print style.
 */
export function usePrintSummary() {
  const [content, setContent] = useState<{ title: string; node: ReactNode } | null>(null);

  useEffect(() => {
    if (!content) return;
    let cancelled = false;
    const previousTitle = document.title;
    const done = () => {
      window.removeEventListener("afterprint", done);
      document.title = previousTitle;
      setContent(null);
    };
    // Two frames so the portal is laid out before the browser snapshots it.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled) return;
        document.title = content.title;
        window.addEventListener("afterprint", done);
        window.print();
        if (!("onafterprint" in window)) setTimeout(done, 1000);
      }),
    );
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", done);
    };
  }, [content]);

  const print = useCallback((title: string, node: ReactNode) => setContent({ title, node }), []);

  const portal = content
    ? createPortal(
        <div id="print-root" className="returns-print">
          <style>{PRINT_CSS}</style>
          {content.node}
        </div>,
        document.body,
      )
    : null;

  return { print, portal };
}

const PRINT_CSS = `
@page { size: A4 portrait; margin: 14mm; }
.returns-print { color: #111; font: 11px/1.45 system-ui, sans-serif; background: #fff; }
.returns-print h1 { font-size: 17px; margin: 0 0 2px; }
.returns-print h2 { font-size: 13px; margin: 14px 0 6px; }
.returns-print p { margin: 0 0 4px; }
.returns-print .muted { color: #555; }
.returns-print .note { border: 1px solid #999; padding: 6px 8px; margin: 8px 0; }
.returns-print table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
.returns-print th, .returns-print td { border: 1px solid #bbb; padding: 3px 5px; text-align: left; vertical-align: top; }
.returns-print th { background: #f2f2f2; }
.returns-print td.num, .returns-print th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.returns-print tr { break-inside: avoid; }
`;
