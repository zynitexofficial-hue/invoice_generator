"use client";

import { ChevronRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HEAD_LABELS, type AnnualRow, type DrillRef } from "@/lib/gst/annual";
import { cn } from "@/lib/utils";

const HEAD_ORDER = [
  "taxable",
  "igst",
  "cgst",
  "sgst",
  "cess",
  "interest",
  "penalty",
  "other",
  "payable",
  "cash",
  "itc",
  "paid",
];

const NUMBER_TEXT = /^-?[\d.,\s]*$/;

/** A manual-entry number field: commits on blur, accepts "1,234.50" and negatives. */
export function ManualInput({
  value,
  placeholder,
  label,
  onCommit,
  edited,
  className,
}: {
  value: string;
  placeholder?: string;
  label: string;
  onCommit: (value: string) => void;
  edited?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  return (
    <Input
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      aria-label={label}
      value={shown}
      placeholder={placeholder}
      aria-description={edited ? "Edited by you" : undefined}
      onChange={(e) => {
        if (NUMBER_TEXT.test(e.target.value)) setDraft(e.target.value);
      }}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft.replace(/[,\s]/g, ""));
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={cn(
        "h-8 w-full min-w-24 text-right text-xs tabular-nums",
        edited && "border-primary/60 bg-primary/5",
        className,
      )}
    />
  );
}

function DrillList({
  items,
  format,
  limit = 100,
}: {
  items: DrillRef[];
  format: (v: string) => string;
  limit?: number;
}) {
  const shown = items.slice(0, limit);
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-surface-2 text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Document</th>
            <th className="px-2 py-1.5 text-left font-medium">Date</th>
            <th className="px-2 py-1.5 text-left font-medium">Party</th>
            <th className="px-2 py-1.5 text-right font-medium">Taxable</th>
            <th className="px-2 py-1.5 text-right font-medium">Tax</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((d, i) => (
            <tr key={`${d.id}-${i}`} className="border-t border-border/70">
              <td className="px-2 py-1">
                {d.kind === "invoice" ? (
                  <Link
                    href={`/invoice?id=${encodeURIComponent(d.id)}`}
                    className="text-primary hover:underline focus-visible:focus-ring"
                  >
                    {d.number || "(no number)"}
                  </Link>
                ) : (
                  <span>{d.number || "Expense"}</span>
                )}
              </td>
              <td className="px-2 py-1 whitespace-nowrap">{d.date}</td>
              <td className="max-w-40 truncate px-2 py-1" title={d.party}>
                {d.party}
              </td>
              <td className="px-2 py-1 text-right tabular-nums">{format(d.taxable)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{format(d.tax)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length > limit && (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          Showing the first {limit} of {items.length} records.
        </p>
      )}
    </div>
  );
}

export { DrillList };

/**
 * One GSTR-9 table. Books rows show your records (placeholder) and accept a
 * manual replacement; derived rows are calculated. `onChange(key, "")` clears.
 */
export function AnnualTable({
  rows,
  format,
  onChange,
  onReset,
  caption,
}: {
  rows: AnnualRow[];
  format: (v: string) => string;
  onChange: (rowId: string, head: string, value: string) => void;
  onReset: (rowId: string) => void;
  caption: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const columns = HEAD_ORDER.filter((h) => rows.some((r) => r.heads.includes(h)));
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] border-collapse text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-2 text-muted-foreground">
          <tr>
            <th scope="col" className="w-12 px-2.5 py-2 text-left font-medium">
              Ref
            </th>
            <th scope="col" className="px-2.5 py-2 text-left font-medium">
              Particulars
            </th>
            {columns.map((h) => (
              <th key={h} scope="col" className="w-28 px-2.5 py-2 text-right font-medium">
                {HEAD_LABELS[h] ?? h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOpen = open === r.id;
            return (
              <RowView
                key={r.id}
                row={r}
                columns={columns}
                isOpen={isOpen}
                format={format}
                onToggle={() => setOpen(isOpen ? null : r.id)}
                onChange={onChange}
                onReset={onReset}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RowView({
  row: r,
  columns,
  isOpen,
  format,
  onToggle,
  onChange,
  onReset,
}: {
  row: AnnualRow;
  columns: string[];
  isOpen: boolean;
  format: (v: string) => string;
  onToggle: () => void;
  onChange: (rowId: string, head: string, value: string) => void;
  onReset: (rowId: string) => void;
}) {
  const label = r.label.replace(/\s+/g, " ");
  return (
    <>
      <tr
        className={cn(
          "border-t border-border/70 align-top",
          r.total && "bg-surface-2/60 font-medium",
        )}
      >
        <th scope="row" className="px-2.5 py-2 text-left font-medium text-muted-foreground">
          {r.id.replace(/^9-/, "9 ")}
        </th>
        <td className="px-2.5 py-2">
          <div className="text-foreground">
            {label}
            {r.sign && (
              <span
                className="ml-1 text-muted-foreground"
                aria-label={r.sign === "-" ? "deducted" : "added"}
              >
                ({r.sign === "-" ? "−" : "+"})
              </span>
            )}
            {r.verify && (
              <span
                className="ml-1.5 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning-foreground"
                title="Not confirmed against the live form. Verify on the GST portal."
              >
                verify
              </span>
            )}
          </div>
          {r.note && <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{r.note}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>
              {r.source === "books"
                ? "From your records"
                : r.source === "manual"
                  ? "Enter by hand"
                  : "Calculated"}
            </span>
            {r.drill.length > 0 && (
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={onToggle}
                className="inline-flex items-center gap-0.5 rounded-sm text-primary hover:underline focus-visible:focus-ring"
              >
                <ChevronRight
                  className={cn("size-3 transition-transform", isOpen && "rotate-90")}
                  aria-hidden
                />
                {r.drill.length} record{r.drill.length === 1 ? "" : "s"}
              </button>
            )}
            {r.overridden.length > 0 && (
              <Button variant="ghost" size="xs" onClick={() => onReset(r.id)}>
                <RotateCcw aria-hidden />
                Use books value
              </Button>
            )}
          </div>
        </td>
        {columns.map((h) => (
          <td key={h} className="px-2.5 py-1.5 text-right">
            {!r.heads.includes(h) ? (
              <span className="text-subtle-foreground" aria-hidden>
                –
              </span>
            ) : r.source === "derived" ? (
              <span className="tabular-nums">{format(r.values[h])}</span>
            ) : (
              <ManualInput
                label={`${r.id} ${HEAD_LABELS[h] ?? h}`}
                value={r.values[h]}
                edited={r.overridden.includes(h)}
                onCommit={(v) =>
                  onChange(r.id, h, r.books && Number(v) === Number(r.books[h]) ? "" : v)
                }
              />
            )}
          </td>
        ))}
      </tr>
      {isOpen && (
        <tr className="bg-surface-2/40">
          <td />
          <td colSpan={columns.length + 1} className="px-2.5 py-2">
            <DrillList items={r.drill} format={format} />
          </td>
        </tr>
      )}
    </>
  );
}
