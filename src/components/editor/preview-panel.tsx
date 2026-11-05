"use client";

import { Minus, Plus, ScanSearch } from "lucide-react";
import { useCallback, useDeferredValue, useState } from "react";
import type { AppSettings } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { useDocumentModel } from "@/hooks/use-document";
import { useEditor } from "@/stores/editor-store";
import { ScaledDocument } from "@/components/document/scaled-document";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

const ZOOMS = [0.6, 0.75, 1, 1.25, 1.5];

/**
 * Live preview. Uses a deferred copy of the invoice so typing stays instant
 * even for long documents — the preview catches up a frame later.
 */
export function PreviewPanel({
  settings,
  className,
}: {
  settings: AppSettings;
  className?: string;
}) {
  const invoice = useEditor((s) => s.invoice);
  const deferred = useDeferredValue(invoice);
  const model = useDocumentModel(deferred, settings);
  const [pages, setPages] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(2);
  const onLayout = useCallback(({ pageCount }: { pageCount: number }) => setPages(pageCount), []);
  if (!deferred || !model) return null;
  const zoom = ZOOMS[zoomIndex];

  return (
    <div
      className={cn("relative flex min-h-0 flex-col bg-surface-3/60 dark:bg-background", className)}
    >
      <div
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--border-strong)_1px,transparent_1px)] [background-size:18px_18px] opacity-[0.5] dark:opacity-30"
        aria-hidden
      />
      <div className="relative z-10 flex h-12 shrink-0 items-center justify-between gap-2 px-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <ScanSearch className="size-4" />
          Live preview
          <span className="rounded-full bg-surface px-2 py-0.5 tabular-nums shadow-xs ring-1 ring-border">
            {pages} {pages === 1 ? "page" : "pages"}
          </span>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg bg-surface p-0.5 shadow-xs ring-1 ring-border">
          <Tooltip content="Zoom out">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Zoom out"
              disabled={zoomIndex === 0}
              onClick={() => setZoomIndex((z) => z - 1)}
            >
              <Minus />
            </Button>
          </Tooltip>
          <button
            type="button"
            onClick={() => setZoomIndex(2)}
            className="w-11 rounded text-center text-xs font-medium text-muted-foreground tabular-nums hover:text-foreground focus-visible:focus-ring"
            aria-label="Fit to width"
            title="Fit to width"
          >
            {zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}
          </button>
          <Tooltip content="Zoom in">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Zoom in"
              disabled={zoomIndex === ZOOMS.length - 1}
              onClick={() => setZoomIndex((z) => z + 1)}
            >
              <Plus />
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto px-4 pb-10 sm:px-8">
        <ScaledDocument
          vm={model.vm}
          design={deferred.design.customization}
          templateId={deferred.design.templateId}
          zoom={zoom}
          maxScale={1}
          onLayout={onLayout}
          className={cn("gap-6", zoom > 1 && "items-start")}
        />
      </div>
    </div>
  );
}
