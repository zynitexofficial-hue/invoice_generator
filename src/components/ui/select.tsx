"use client";

import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";
import { fieldBase } from "./input";

export interface SelectOption<T extends string = string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface SelectGroupDef<T extends string = string> {
  label: string;
  options: SelectOption<T>[];
}

export interface SelectProps<T extends string> {
  value: T | "";
  onValueChange: (value: T) => void;
  options?: SelectOption<T>[];
  groups?: SelectGroupDef<T>[];
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  id?: string;
  size?: "sm" | "md";
  /** Rendered in the trigger instead of the selected option's label. */
  renderValue?: (value: T) => ReactNode;
  "aria-label"?: string;
}

/** Fully custom select: styled trigger, animated popover list, keyboard support. */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  groups,
  placeholder = "Select…",
  className,
  contentClassName,
  disabled,
  id,
  size = "md",
  renderValue,
  ...aria
}: SelectProps<T>) {
  const field = useFieldControl(id);
  const all = groups ? groups.flatMap((g) => g.options) : (options ?? []);
  const selected = all.find((o) => o.value === value);
  return (
    <SelectPrimitive.Root
      value={value || undefined}
      onValueChange={(v) => onValueChange(v as T)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        {...field}
        aria-label={aria["aria-label"]}
        className={cn(
          fieldBase,
          "group flex items-center justify-between gap-2 text-left data-[placeholder]:text-subtle-foreground",
          size === "md" ? "h-[var(--field-h)] px-3" : "h-8 px-2.5 text-[13px]",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          <SelectPrimitive.Value placeholder={placeholder}>
            {value && renderValue ? renderValue(value as T) : selected?.label}
          </SelectPrimitive.Value>
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "relative z-50 max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden",
            "rounded-xl border border-border bg-surface text-foreground shadow-lg",
            "origin-[var(--radix-select-content-transform-origin)] data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
            contentClassName,
          )}
        >
          <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-muted-foreground">
            <ChevronUp className="size-4" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">
            {groups
              ? groups.map((g, i) => (
                  <SelectPrimitive.Group key={g.label}>
                    {i > 0 && <SelectPrimitive.Separator className="mx-2 my-1 h-px bg-border" />}
                    <SelectPrimitive.Label className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-subtle-foreground uppercase">
                      {g.label}
                    </SelectPrimitive.Label>
                    {g.options.map((o) => (
                      <SelectItem key={o.value} option={o} />
                    ))}
                  </SelectPrimitive.Group>
                ))
              : options?.map((o) => <SelectItem key={o.value} option={o} />)}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-muted-foreground">
            <ChevronDown className="size-4" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function SelectItem<T extends string>({ option }: { option: SelectOption<T> }) {
  return (
    <SelectPrimitive.Item
      value={option.value}
      disabled={option.disabled}
      className={cn(
        "relative flex cursor-pointer items-start gap-2 rounded-lg py-2 pr-8 pl-2.5 text-sm outline-none select-none",
        "transition-colors duration-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-surface-2",
        "data-[state=checked]:font-medium",
      )}
    >
      <div className="min-w-0">
        <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
        {option.description && (
          <div className="mt-0.5 text-xs font-normal text-muted-foreground">
            {option.description}
          </div>
        )}
      </div>
      <SelectPrimitive.ItemIndicator className="absolute top-2.5 right-2.5 text-primary">
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
