"use client";

import { AnimatePresence, motion } from "motion/react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { forwardRef, useId, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Input } from "./input";

export interface AutocompleteInputProps<T> {
  value: string;
  onChange: (value: string) => void;
  suggestions: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getDescription?: (item: T) => ReactNode;
  onPick: (item: T) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  maxResults?: number;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  /** Shown above the suggestions. */
  heading?: string;
}

function AutocompleteInputInner<T>(
  {
    value,
    onChange,
    suggestions,
    getKey,
    getLabel,
    getDescription,
    onPick,
    placeholder,
    id,
    className,
    maxResults = 6,
    heading = "From your catalog",
    ...aria
  }: AutocompleteInputProps<T>,
  ref: React.ForwardedRef<HTMLInputElement>,
) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return suggestions
      .filter((s) => {
        const label = getLabel(s).toLowerCase();
        return label.includes(q) && label !== q;
      })
      .slice(0, maxResults);
  }, [value, suggestions, getLabel, maxResults]);

  const open = focused && !dismissed && matches.length > 0;

  const pick = (item: T) => {
    onPick(item);
    setDismissed(true);
  };

  return (
    <PopoverPrimitive.Root open={open}>
      <PopoverPrimitive.Anchor asChild>
        <div className={cn("relative", className)}>
          <Input
            ref={ref}
            id={id}
            value={value}
            placeholder={placeholder}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={open ? `${listId}-${active}` : undefined}
            aria-label={aria["aria-label"]}
            aria-invalid={aria["aria-invalid"]}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => {
              onChange(e.target.value);
              setDismissed(false);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (!open) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => (a + 1) % matches.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a - 1 + matches.length) % matches.length);
              } else if (e.key === "Enter") {
                e.preventDefault();
                pick(matches[active]);
              } else if (e.key === "Escape") {
                setDismissed(true);
              }
            }}
          />
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-64 outline-none"
        >
          <AnimatePresence>
            <motion.ul
              id={listId}
              role="listbox"
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.14 }}
              className="rounded-xl border border-border bg-surface p-1 shadow-lg"
            >
              <li
                className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-subtle-foreground uppercase"
                role="presentation"
              >
                {heading}
              </li>
              {matches.map((m, i) => (
                <li
                  key={getKey(m)}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(m);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "cursor-pointer rounded-lg px-2.5 py-2 text-sm transition-colors duration-75",
                    i === active && "bg-surface-2",
                  )}
                >
                  <div className="truncate font-medium">{getLabel(m)}</div>
                  {getDescription && (
                    <div className="truncate text-xs text-muted-foreground">
                      {getDescription(m)}
                    </div>
                  )}
                </li>
              ))}
            </motion.ul>
          </AnimatePresence>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export const AutocompleteInput = forwardRef(AutocompleteInputInner) as <T>(
  props: AutocompleteInputProps<T> & { ref?: React.ForwardedRef<HTMLInputElement> },
) => ReturnType<typeof AutocompleteInputInner>;
