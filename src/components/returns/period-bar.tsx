"use client";

import { CalendarClock, ChevronLeft, ChevronRight, Hourglass } from "lucide-react";
import { isTimeBarred, timeBarDate } from "@/lib/gst/returns";
import { periodLabel, shiftPeriod } from "@/lib/period";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { daysFromTo } from "@/lib/gst/returns";
import { dueText, STEP_LABEL, type FilingStep } from "./returns-data";

export function PeriodBar({
  period,
  current,
  kindLabel,
  onChange,
}: {
  period: string;
  current: string;
  kindLabel: string;
  onChange: (period: string) => void;
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Return period">
      <Button
        size="icon"
        aria-label={`Previous ${kindLabel}`}
        onClick={() => onChange(shiftPeriod(period, -1))}
      >
        <ChevronLeft />
      </Button>
      <div
        className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold tabular-nums sm:flex-none sm:px-2"
        aria-live="polite"
      >
        {periodLabel(period)}
      </div>
      <Button
        size="icon"
        aria-label={`Next ${kindLabel}`}
        onClick={() => onChange(shiftPeriod(period, 1))}
      >
        <ChevronRight />
      </Button>
      <Button variant="ghost" disabled={period === current} onClick={() => onChange(current)}>
        Current
      </Button>
    </div>
  );
}

const STEP_TONE: Record<FilingStep, "neutral" | "info" | "primary" | "success"> = {
  not_started: "neutral",
  data_ready: "info",
  exported: "primary",
  filed: "success",
};

export function StepBadge({ step }: { step: FilingStep }) {
  return (
    <Badge size="sm" tone={STEP_TONE[step]} dot>
      {STEP_LABEL[step]}
    </Badge>
  );
}

export interface StatusCardData {
  title: string;
  hint?: string;
  due: string | null;
  step: FilingStep;
}

export function StatusCard({
  data,
  today,
  formatDate,
}: {
  data: StatusCardData;
  today: string;
  formatDate: (iso: string) => string;
}) {
  const { due, step } = data;
  const filed = step === "filed";
  const daysLeft = due ? daysFromTo(today, due) : null;
  const overdue = !filed && daysLeft !== null && daysLeft < 0;
  const barred = !filed && due ? isTimeBarred(due, today) : false;
  const barDate = due ? timeBarDate(due) : "";
  // Warn in the last 6 months before the 3-year time bar.
  const nearBar = !filed && !barred && due && daysFromTo(today, barDate) <= 183 && overdue;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{data.title}</h3>
          {data.hint && <p className="text-xs text-muted-foreground">{data.hint}</p>}
        </div>
        <StepBadge step={step} />
      </div>
      {due ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CalendarClock className="size-3.5" aria-hidden />
            Due {formatDate(due)}
          </span>
          {!filed && daysLeft !== null && (
            <span
              className={cn("font-medium", overdue ? "text-danger-foreground" : "text-foreground")}
            >
              {dueText(daysLeft)}
            </span>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">No due date for this period.</p>
      )}
      {(barred || nearBar) && (
        <p
          className={cn(
            "mt-2 flex items-start gap-1.5 text-xs",
            barred ? "text-danger-foreground" : "text-warning-foreground",
          )}
        >
          <Hourglass className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {barred
            ? `Time-barred: returns can't be filed more than 3 years after the due date (${formatDate(barDate)}).`
            : `Last date to file is ${formatDate(barDate)} (3 years after the due date).`}
        </p>
      )}
    </Card>
  );
}
