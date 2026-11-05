"use client";

import { format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { formatDate, parseISODate, toISODate, todayISO } from "@/lib/dates";
import type { DateFormatId } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { useFieldControl } from "./field";
import { fieldBase } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface DatePickerProps {
  value: string;
  onChange: (iso: string) => void;
  dateFormat?: DateFormatId;
  placeholder?: string;
  clearable?: boolean;
  id?: string;
  className?: string;
  min?: string;
  presets?: { label: string; iso: string }[];
}

export function DatePicker({
  value,
  onChange,
  dateFormat = "dd MMM yyyy",
  placeholder = "Pick a date",
  clearable,
  id,
  className,
  min,
  presets,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const field = useFieldControl(id);
  const selected = parseISODate(value);
  const minDate = min ? parseISODate(min) : undefined;
  const [month, setMonth] = useState<Date>(selected ?? new Date());

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setMonth(selected ?? new Date());
      }}
    >
      <div className={cn("relative", className)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            {...field}
            className={cn(
              fieldBase,
              "flex h-[var(--field-h)] items-center gap-2 px-3 text-left",
              // Leave room for the clear button so the date never runs under it.
              clearable && value && "pr-9",
              !value && "text-subtle-foreground",
            )}
          >
            {/* Phones need the width for the date text; the field still reads as a date. */}
            <CalendarDays className="size-4 shrink-0 text-muted-foreground max-sm:hidden" />
            <span className="flex-1 truncate">
              {value ? formatDate(value, dateFormat) : placeholder}
            </span>
          </button>
        </PopoverTrigger>
        {clearable && value && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-1/2 right-1.5 -translate-y-1/2"
            aria-label="Clear date"
            onClick={() => onChange("")}
          >
            <X />
          </Button>
        )}
      </div>
      <PopoverContent className="w-auto p-3" align="start">
        {presets && presets.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  onChange(p.iso);
                  setOpen(false);
                }}
                className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary-soft-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        <DayPicker
          mode="single"
          selected={selected}
          month={month}
          onMonthChange={setMonth}
          onSelect={(d) => {
            if (d) {
              onChange(toISODate(d));
              setOpen(false);
            }
          }}
          disabled={minDate ? { before: minDate } : undefined}
          weekStartsOn={1}
          showOutsideDays
          components={{
            Chevron: ({ orientation }) =>
              orientation === "left" ? (
                <ChevronLeft className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              ),
          }}
          classNames={{
            root: "relative select-none",
            months: "flex",
            month: "space-y-2",
            month_caption: "flex h-8 items-center px-1 text-sm font-semibold",
            caption_label: "text-sm font-semibold",
            nav: "absolute right-0 top-0 flex items-center gap-1",
            button_previous:
              "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-30",
            button_next:
              "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-30",
            month_grid: "border-collapse",
            weekdays: "flex",
            weekday:
              "w-9 pb-1 text-center text-[11px] font-medium uppercase text-subtle-foreground",
            week: "flex",
            day: "size-9 p-0 text-center text-sm",
            day_button:
              "size-9 rounded-lg font-medium tabular-nums transition-colors duration-100 hover:bg-surface-2 focus-visible:focus-ring",
            selected:
              "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:shadow-sm [&>button:hover]:bg-primary-hover",
            today: "[&>button]:text-primary [&>button]:font-semibold",
            outside: "text-subtle-foreground/60",
            disabled: "opacity-30 [&>button]:cursor-not-allowed",
          }}
        />
        <div className="mt-2 flex justify-between border-t border-border pt-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              onChange(todayISO());
              setOpen(false);
            }}
          >
            Today
          </Button>
          <span className="self-center text-xs text-subtle-foreground">
            {format(month, "MMMM yyyy")}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
