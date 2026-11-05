"use client";

import type { DateFormatId } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import {
  PERIOD_PRESET_LABELS,
  PERIOD_PRESETS,
  type PeriodPreset,
  type PeriodSelection,
} from "./money-data";

/**
 * Period picker: This month · Last month · This quarter · This FY · Last FY ·
 * Custom range (two date pickers). Pair with resolvePeriod() from money-data.
 */
export function PeriodFilter({
  value,
  onChange,
  dateFormat,
  className,
}: {
  value: PeriodSelection;
  onChange: (next: PeriodSelection) => void;
  dateFormat?: DateFormatId;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Select<PeriodPreset>
        value={value.preset}
        onValueChange={(preset) => onChange({ ...value, preset })}
        options={PERIOD_PRESETS.map((p) => ({ value: p, label: PERIOD_PRESET_LABELS[p] }))}
        className="w-full sm:w-40"
        aria-label="Period"
      />
      {value.preset === "custom" && (
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <DatePicker
            value={value.from}
            onChange={(from) => onChange({ ...value, from })}
            placeholder="From date"
            clearable
            dateFormat={dateFormat}
            className="sm:w-40"
          />
          <DatePicker
            value={value.to}
            onChange={(to) => onChange({ ...value, to })}
            placeholder="To date"
            clearable
            min={value.from}
            dateFormat={dateFormat}
            className="sm:w-40"
          />
        </div>
      )}
    </div>
  );
}
