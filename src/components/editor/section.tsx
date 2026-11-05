"use client";

import { ChevronDown, CircleCheck } from "lucide-react";
import { useEffect, useEffectEvent, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Collapse } from "@/components/ui/collapse";

/*
 * Jump-to-field (from the download checks) needs the field on screen, but a
 * collapsed section or a "+ Add …" group isn't rendered at all. The jump
 * broadcasts the field id first; whatever hides that field opens itself.
 */
const REVEAL_EVENT = "editor:reveal-field";

export function revealField(field: string) {
  window.dispatchEvent(new CustomEvent<string>(REVEAL_EVENT, { detail: field }));
}

export function useRevealOn(fields: string[], reveal: () => void) {
  const onReveal = useEffectEvent((field: string) => {
    if (fields.includes(field)) reveal();
  });
  useEffect(() => {
    const listener = (e: Event) => onReveal((e as CustomEvent<string>).detail);
    window.addEventListener(REVEAL_EVENT, listener);
    return () => window.removeEventListener(REVEAL_EVENT, listener);
  }, []);
}

/** A card-like editor section with an optional collapsible body. */
export function EditorSection({
  title,
  icon,
  summary,
  action,
  children,
  collapsible = false,
  defaultOpen = true,
  done = false,
  hasIssue = false,
  fields = [],
  id,
  className,
}: {
  title: ReactNode;
  icon?: ReactNode;
  summary?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Shows a check in place of the icon once the section's essentials are filled. */
  done?: boolean;
  /** A field inside has a warning or error — flagged on the collapsed header, and opens it on load. */
  hasIssue?: boolean;
  /** Field ids inside this section, so jump-to-field can open it. */
  fields?: string[];
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen || hasIssue);
  const bodyId = useId();
  useRevealOn(fields, () => setOpen(true));
  const header = (
    <>
      {done ? (
        <CircleCheck className="size-[18px] shrink-0 text-success" aria-hidden />
      ) : (
        icon && (
          <span className="flex shrink-0 text-muted-foreground [&_svg]:size-[18px]">{icon}</span>
        )
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-semibold tracking-[-0.01em] sm:text-[15px]">
          {title}
          {done && <span className="sr-only">, complete</span>}
        </span>
        {!open && hasIssue ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-warning-foreground sm:text-[13px]">
            <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
            Needs attention
          </span>
        ) : (
          summary &&
          !open && (
            <span className="block truncate text-xs text-muted-foreground sm:text-[13px]">
              {summary}
            </span>
          )
        )}
      </span>
    </>
  );
  const body = <div className="px-3.5 pb-3.5 sm:px-5 sm:pb-5">{children}</div>;
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24 rounded-2xl border border-border bg-surface shadow-xs",
        className,
      )}
    >
      <div className="flex min-h-12 items-center gap-3 px-3.5 py-2 sm:min-h-14 sm:px-5 sm:py-2.5">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={bodyId}
            className="-m-1.5 flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1.5 focus-visible:focus-ring"
          >
            {header}
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{header}</div>
        )}
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {collapsible ? (
        <Collapse open={open} id={bodyId}>
          {body}
        </Collapse>
      ) : (
        body
      )}
    </section>
  );
}

/** Small "+ Label" button that reveals an optional, hidden group of fields. */
export function AddFieldLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center rounded-full border border-dashed border-border-strong px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary-soft/40 hover:text-primary focus-visible:focus-ring"
    >
      + {children}
    </button>
  );
}
