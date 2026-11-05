"use client";

import { Command } from "cmdk";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";
import { fieldBase } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface ComboboxProps<T> {
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getDescription?: (item: T) => ReactNode;
  /** Extra text matched by search (e.g. GSTIN, email). */
  getKeywords?: (item: T) => string[];
  selectedKey?: string;
  onSelect: (item: T) => void;
  placeholder?: ReactNode;
  searchPlaceholder?: string;
  emptyText?: ReactNode;
  /** Rendered under the list, e.g. "Add new customer". Receives a close callback. */
  footer?: (close: () => void) => ReactNode;
  trigger?: ReactNode;
  id?: string;
  className?: string;
  contentClassName?: string;
  align?: "start" | "end";
}

/** Searchable picker (button trigger + filtered list) built on cmdk. */
export function Combobox<T>({
  items,
  getKey,
  getLabel,
  getDescription,
  getKeywords,
  selectedKey,
  onSelect,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches",
  footer,
  trigger,
  id,
  className,
  contentClassName,
  align = "start",
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const field = useFieldControl(id);
  const selected = items.find((i) => getKey(i) === selectedKey);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            {...field}
            className={cn(
              fieldBase,
              "flex h-[var(--field-h)] items-center justify-between gap-2 px-3 text-left",
              className,
            )}
          >
            <span className={cn("truncate", !selected && "text-subtle-foreground")}>
              {selected ? getLabel(selected) : placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn("w-[min(360px,calc(100vw-24px))] p-0", contentClassName)}
      >
        <Command loop className="flex max-h-[min(420px,70dvh)] flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              placeholder={searchPlaceholder}
              className="h-11 w-full bg-transparent text-[length:var(--field-font)] outline-none placeholder:text-subtle-foreground"
            />
          </div>
          <Command.List className="min-h-0 flex-1 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
              {emptyText}
            </Command.Empty>
            {items.map((item) => {
              const key = getKey(item);
              return (
                <Command.Item
                  key={key}
                  value={`${getLabel(item)} ${key}`}
                  keywords={getKeywords?.(item)}
                  onSelect={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-100 outline-none data-[selected=true]:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{getLabel(item)}</div>
                    {getDescription && (
                      <div className="truncate text-xs text-muted-foreground">
                        {getDescription(item)}
                      </div>
                    )}
                  </div>
                  {key === selectedKey && <Check className="mt-0.5 size-4 text-primary" />}
                </Command.Item>
              );
            })}
          </Command.List>
          {footer && (
            <div className="border-t border-border p-1">{footer(() => setOpen(false))}</div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
