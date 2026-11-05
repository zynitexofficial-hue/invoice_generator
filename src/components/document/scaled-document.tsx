"use client";

import { useCallback, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { DocViewModel } from "@/lib/render/view-model";
import type { DesignCustomization, TemplateId } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { DocumentPages, type DocumentLayoutInfo } from "./document-pages";
import { MM_TO_PX, PAGE_SIZES } from "./layout";

export interface ScaledDocumentProps {
  vm: DocViewModel;
  design: DesignCustomization;
  templateId: TemplateId;
  className?: string;
  /** Horizontal breathing room inside the container (px). */
  inset?: number;
  maxScale?: number;
  maxPages?: number;
  /** Extra zoom multiplier on top of fit-to-width (1 = fit). */
  zoom?: number;
  onLayout?: (info: DocumentLayoutInfo) => void;
}

/**
 * Fits A4/Letter pages to the container width. The scale lives in a CSS
 * variable updated by a ResizeObserver, so resizing never re-renders React —
 * no jitter, no layout thrash.
 */
export function ScaledDocument({
  vm,
  design,
  templateId,
  className,
  inset = 0,
  maxScale = 1,
  maxPages,
  zoom = 1,
  onLayout,
}: ScaledDocumentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const size = PAGE_SIZES[design.pageSize];
  const pageWidthPx = size.widthMm * MM_TO_PX;

  const apply = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const available = el.clientWidth - inset * 2;
    const fit = Math.max(0.05, Math.min(maxScale, available / pageWidthPx));
    el.style.setProperty("--s", String(fit * zoom));
  }, [inset, maxScale, pageWidthPx, zoom]);

  useLayoutEffect(() => {
    apply();
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [apply]);

  const frameVars = {
    "--page-w": `${size.widthMm}mm`,
    "--page-h": `${size.heightMm}mm`,
  } as CSSProperties;

  return (
    <div ref={ref} className={cn("flex w-full flex-col items-center", className)}>
      <DocumentPages
        vm={vm}
        design={design}
        templateId={templateId}
        maxPages={maxPages}
        onLayout={onLayout}
        renderPage={(page, index, count) => (
          <div
            className="doc-scaled"
            style={frameVars}
            role="img"
            aria-label={`Page ${index + 1} of ${count}`}
          >
            {page}
          </div>
        )}
      />
    </div>
  );
}
