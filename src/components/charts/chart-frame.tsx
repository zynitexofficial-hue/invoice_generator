"use client";

import { Download, Table2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { downloadCsv, type CsvCell } from "@/lib/csv";
import { cn } from "@/lib/utils";

export interface ChartTable {
  headers: string[];
  rows: CsvCell[][];
  /** Right-align these columns (numbers). Defaults to every column but the first. */
  numeric?: boolean[];
  /** Optional totals row. */
  totals?: CsvCell[];
}

export interface ChartFrameProps {
  title: string;
  description?: ReactNode;
  /** One-sentence plain-text takeaway shown under the title (the chart's text summary). */
  summary?: ReactNode;
  /** Data behind the chart: drives the table toggle and CSV download. */
  table?: ChartTable;
  /** CSV file name (without extension); defaults to the title. */
  csvName?: string;
  /** Show the empty state instead of the chart. */
  empty?: boolean;
  emptyMessage?: ReactNode;
  /** Extra controls in the header (e.g. a select). */
  actions?: ReactNode;
  /** Start with the table shown. */
  defaultShowTable?: boolean;
  children: ReactNode;
  className?: string;
}

/** Card around a chart: title, description, summary, data-table toggle, CSV export and empty state. */
export function ChartFrame({
  title,
  description,
  summary,
  table,
  csvName,
  empty,
  emptyMessage = "No data for this period yet.",
  actions,
  defaultShowTable = false,
  children,
  className,
}: ChartFrameProps) {
  const [showTable, setShowTable] = useState(defaultShowTable);
  const tableId = useId();
  const headingId = useId();
  const hasRows = Boolean(table && table.rows.length);
  const numeric = table?.numeric ?? table?.headers.map((_, i) => i > 0) ?? [];

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex min-w-0 break-inside-avoid flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-xs",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={headingId} className="text-sm font-semibold text-foreground">
            {title}
          </h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-1 print:hidden">
          {actions}
          {hasRows && !empty && (
            <>
              <Button
                variant="ghost"
                size="xs"
                aria-expanded={showTable}
                aria-controls={tableId}
                onClick={() => setShowTable((v) => !v)}
              >
                <Table2 aria-hidden="true" />
                {showTable ? "Hide data table" : "Show data table"}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                aria-label={`Download ${title} as CSV`}
                onClick={() => {
                  if (!table) return;
                  const rows = table.totals ? [...table.rows, table.totals] : table.rows;
                  downloadCsv(csvName ?? title, table.headers, rows);
                }}
              >
                <Download aria-hidden="true" />
                CSV
              </Button>
            </>
          )}
        </div>
      </header>
      {summary && !empty && <p className="text-sm text-foreground">{summary}</p>}
      {empty ? (
        <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        children
      )}
      {table && hasRows && !empty && (
        <div id={tableId} hidden={!showTable} className="overflow-x-auto print:block">
          <table className="w-full border-collapse text-xs">
            <caption className="sr-only">{title} data</caption>
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                {table.headers.map((h, i) => (
                  <th
                    key={i}
                    scope="col"
                    className={cn(
                      "px-2 py-1.5 font-medium",
                      numeric[i] ? "text-right" : "text-left",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, ri) => (
                <tr key={ri} className="border-b border-border/60 last:border-0">
                  {r.map((cell, ci) =>
                    ci === 0 ? (
                      <th
                        key={ci}
                        scope="row"
                        className="px-2 py-1.5 text-left font-normal text-foreground"
                      >
                        {cell}
                      </th>
                    ) : (
                      <td
                        key={ci}
                        className={cn(
                          "px-2 py-1.5 text-foreground",
                          numeric[ci] && "text-right tabular-nums",
                        )}
                      >
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
            {table.totals && (
              <tfoot>
                <tr className="border-t border-border-strong font-semibold">
                  {table.totals.map((cell, ci) =>
                    ci === 0 ? (
                      <th key={ci} scope="row" className="px-2 py-1.5 text-left">
                        {cell}
                      </th>
                    ) : (
                      <td
                        key={ci}
                        className={cn("px-2 py-1.5", numeric[ci] && "text-right tabular-nums")}
                      >
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
}
