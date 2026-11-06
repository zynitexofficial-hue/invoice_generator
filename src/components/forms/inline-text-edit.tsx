"use client";

import { Pencil } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * A rarely-changed text shown as one compact line with its live value (or the
 * default it falls back to). Clicking it swaps in an input; Enter, Escape or
 * leaving the field closes it again.
 *
 * `value` is the stored override; "" means "use `fallback`". Typing the
 * fallback back in stores "" again, so the text keeps following live data
 * (such as the business name) instead of freezing a copy of it.
 */
export function InlineTextEdit({
  label,
  value,
  fallback,
  onChange,
  maxLength,
  showLabel = true,
  leading,
  muted = false,
  className,
}: {
  /** Names the text for the edit button and input (and is shown unless `showLabel` is false). */
  label: string;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
  maxLength?: number;
  showLabel?: boolean;
  /** Rendered before everything else, e.g. a show/hide switch. */
  leading?: ReactNode;
  /** Dim the text, e.g. while it's switched off. */
  muted?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = value.trim() || fallback;
  const custom = Boolean(value.trim()) && value.trim() !== fallback;

  const update = (next: string) => {
    setDraft(next);
    onChange(next.trim() === fallback ? "" : next);
  };

  return (
    <div className={cn("flex min-h-9 items-center gap-2.5 text-xs", className)}>
      {leading}
      {showLabel && <span className="w-16 shrink-0 text-muted-foreground">{label}</span>}
      {draft !== null ? (
        <Input
          autoFocus
          aria-label={label}
          value={draft}
          maxLength={maxLength}
          placeholder={fallback}
          onChange={(e) => update(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              setDraft(null);
            }
          }}
          className="h-8 text-xs"
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => setDraft(shown)}
            title={`Edit ${label.toLowerCase()}`}
            aria-label={`Edit ${label.toLowerCase()}: ${shown}`}
            className="group flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-surface-2 focus-visible:focus-ring"
          >
            <span
              className={cn(
                "min-w-0 truncate font-medium",
                muted
                  ? "text-muted-foreground line-through decoration-border-strong"
                  : "text-foreground",
              )}
            >
              {shown}
            </span>
            <Pencil className="size-3 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />
          </button>
          {custom && (
            <button
              type="button"
              onClick={() => onChange("")}
              title={`Reset to “${fallback}”`}
              className="shrink-0 text-[11px] text-muted-foreground underline hover:text-foreground"
            >
              Reset
            </button>
          )}
        </>
      )}
    </div>
  );
}
