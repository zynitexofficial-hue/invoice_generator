"use client";

/* eslint-disable @next/next/no-img-element -- data URLs from local uploads */

import { ImagePlus, RefreshCw, Trash } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ACCEPTED_IMAGE_TYPES, ImageError, processImage } from "@/lib/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ImageUpload({
  value,
  onChange,
  label,
  hint = "PNG, JPG, WebP or SVG · up to 2 MB",
  aspect = "wide",
  maxDimension,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
  label: string;
  hint?: string;
  aspect?: "wide" | "square";
  maxDimension?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await processImage(file, maxDimension));
    } catch (error) {
      toast.error(error instanceof ImageError ? error.message : "Couldn't use this image.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFile(e.dataTransfer.files[0]);
        }}
        aria-label={value ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
        className={cn(
          "group relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border-strong bg-surface-2/60",
          "transition-[border-color,background-color] duration-150 hover:border-primary/60 hover:bg-primary-soft/50 focus-visible:focus-ring",
          aspect === "wide" ? "h-20 w-36" : "size-20",
          dragging && "border-primary bg-primary-soft",
          value &&
            "border-solid bg-[repeating-conic-gradient(var(--surface-3)_0%_25%,var(--surface)_0%_50%)] bg-[length:12px_12px]",
        )}
      >
        {value ? (
          <img src={value} alt="" className="max-h-[85%] max-w-[85%] object-contain" />
        ) : (
          <ImagePlus
            className={cn(
              "size-6 text-muted-foreground transition-transform group-hover:scale-110",
              busy && "animate-pulse",
            )}
          />
        )}
      </button>
      <div className="min-w-0 space-y-1.5">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
        <div className="flex gap-1.5">
          <Button
            size="xs"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            loading={busy}
          >
            {value ? <RefreshCw /> : <ImagePlus />}
            {value ? "Replace" : "Upload"}
          </Button>
          {value && (
            <Button size="xs" variant="danger-ghost" onClick={() => onChange("")}>
              <Trash />
              Remove
            </Button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
