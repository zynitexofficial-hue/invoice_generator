"use client";

import { Select } from "@/components/ui/select";
import { financialYearsWithData } from "@/lib/gst/annual";
import { periodLabel } from "@/lib/period";

/** Financial-year picker listing the current year and every year with records. */
export function FySelect({
  value,
  onChange,
  dates,
  today,
  className,
}: {
  value: string;
  onChange: (fy: string) => void;
  dates: string[];
  today: string;
  className?: string;
}) {
  const years = financialYearsWithData([...dates, `${value.slice(2, 6)}-04-01`], today);
  return (
    <Select<string>
      value={value}
      onValueChange={onChange}
      options={years.map((y) => ({ value: y, label: periodLabel(y) }))}
      aria-label="Financial year"
      className={className ?? "w-40"}
    />
  );
}
