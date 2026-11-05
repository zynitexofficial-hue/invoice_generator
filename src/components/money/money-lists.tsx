"use client";

import { Copy, Ellipsis, Pencil, Trash } from "lucide-react";
import { useState, type ReactNode } from "react";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import type { AppSettings, Expense, Income } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  claimsItc,
  expenseGst,
  hasGst,
  itcClaimable,
  PAYMENT_STATUS_LABELS,
  type ExpenseTotals,
  type PaymentStatus,
} from "./money-data";

const PAGE = 100;

const STATUS_TONES: Record<PaymentStatus, "success" | "warning" | "info"> = {
  paid: "success",
  unpaid: "warning",
  partial: "info",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge size="sm" tone={STATUS_TONES[status]} dot>
      {PAYMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

interface RowHandlers<T> {
  onEdit: (row: T) => void;
  onDuplicate: (row: T) => void;
  onDelete: (row: T) => void;
}

function RowMenu<T>({
  row,
  label,
  onEdit,
  onDuplicate,
  onDelete,
}: RowHandlers<T> & {
  row: T;
  label: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label}`}>
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem icon={<Pencil />} onSelect={() => onEdit(row)}>
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Copy />} onSelect={() => onDuplicate(row)}>
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Trash />} tone="danger" onSelect={() => onDelete(row)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "Show more" paging so a full FY of entries doesn't render all at once. */
function usePaged<T>(rows: T[]) {
  const [limit, setLimit] = useState(PAGE);
  const visible = rows.slice(0, limit);
  const more =
    rows.length > limit ? (
      <div className="border-t border-border px-4 py-3 text-center">
        <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
          Show {Math.min(PAGE, rows.length - limit)} more of {rows.length - limit}
        </Button>
      </div>
    ) : null;
  return { visible, more };
}

const th = "px-4 py-3 font-medium";
const td = "px-4 py-3";
const num = "text-right whitespace-nowrap tabular-nums";

/* ------------------------------------------------------------------ */
/* Expenses                                                            */
/* ------------------------------------------------------------------ */

export function ExpenseList({
  rows,
  totals,
  settings,
  ...handlers
}: RowHandlers<Expense> & {
  rows: Expense[];
  totals: ExpenseTotals;
  settings: AppSettings;
}) {
  const { visible, more } = usePaged(rows);
  const money = (v: string) =>
    formatMoney(v, settings.invoiceDefaults.currency, settings.formats.numberGrouping);
  const date = (iso: string) => formatDate(iso, settings.formats.dateFormat);
  const title = (e: Expense) => e.vendorName || e.description || e.category || "Expense";
  const label = (e: Expense) => `${title(e)}, ${date(e.date)}`;

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/60 text-left text-xs font-medium text-muted-foreground">
              <th className={th}>Date</th>
              <th className={th}>Paid to</th>
              <th className={th}>Category</th>
              <th className={cn(th, "text-right")}>Taxable</th>
              <th className={cn(th, "text-right")}>GST</th>
              <th className={cn(th, "text-right")}>Total</th>
              <th className={th}>ITC</th>
              <th className={th}>Status</th>
              <th className="w-12 px-2 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr
                key={e.id}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/60"
                onClick={() => handlers.onEdit(e)}
              >
                <td className={cn(td, "whitespace-nowrap text-muted-foreground tabular-nums")}>
                  {date(e.date)}
                </td>
                <td className={cn(td, "max-w-60")}>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      handlers.onEdit(e);
                    }}
                    className="block max-w-full truncate rounded text-left font-medium focus-visible:focus-ring"
                    aria-label={`Edit ${label(e)}`}
                  >
                    {e.vendorName || <span className="text-subtle-foreground">—</span>}
                  </button>
                  {e.description && (
                    <div className="truncate text-xs text-muted-foreground">{e.description}</div>
                  )}
                </td>
                <td className={cn(td, "max-w-44 truncate text-muted-foreground")}>
                  {e.category || "—"}
                </td>
                <td className={cn(td, num, "text-muted-foreground")}>{money(e.summary.taxable)}</td>
                <td className={cn(td, num, "text-muted-foreground")}>
                  {hasGst(e) ? (
                    <span className="inline-flex items-center gap-1.5">
                      {e.reverseCharge && (
                        <Badge size="sm" tone="outline" title="Reverse charge">
                          RCM
                        </Badge>
                      )}
                      {money(expenseGst(e))}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={cn(td, num, "font-medium")}>{money(e.summary.total)}</td>
                <td className={td}>
                  <ItcBadge expense={e} money={money} />
                </td>
                <td className={td}>
                  <PaymentStatusBadge status={e.paymentStatus} />
                </td>
                <td className="px-2 py-3" onClick={(ev) => ev.stopPropagation()}>
                  <RowMenu row={e} label={label(e)} {...handlers} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-surface-2/60 font-semibold">
              <td className={td} colSpan={3}>
                Total{" "}
                <span className="font-normal text-muted-foreground">
                  ({totals.count} {totals.count === 1 ? "entry" : "entries"})
                </span>
              </td>
              <td className={cn(td, num)}>{money(totals.taxable)}</td>
              <td className={cn(td, num)}>{money(totals.gst)}</td>
              <td className={cn(td, num)}>{money(totals.total)}</td>
              <td className={cn(td, "whitespace-nowrap tabular-nums")} colSpan={3}>
                <span className="text-success-foreground">{money(totals.itc)}</span>{" "}
                <span className="text-xs font-normal text-muted-foreground">eligible ITC</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-border md:hidden">
        {visible.map((e) => (
          <li key={e.id} className="flex items-start gap-2 py-3 pr-2 pl-4">
            <button
              type="button"
              onClick={() => handlers.onEdit(e)}
              className="min-w-0 flex-1 rounded-lg text-left focus-visible:focus-ring"
              aria-label={`Edit ${label(e)}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-medium">{title(e)}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {money(e.summary.total)}
                </span>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
                {[date(e.date), e.category].filter(Boolean).join(" · ")}
                {hasGst(e) && ` · GST ${money(expenseGst(e))}`}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <PaymentStatusBadge status={e.paymentStatus} />
                <ItcBadge expense={e} money={money} hideNone />
                {e.reverseCharge && (
                  <Badge size="sm" tone="outline">
                    RCM
                  </Badge>
                )}
              </div>
            </button>
            <RowMenu row={e} label={label(e)} {...handlers} />
          </li>
        ))}
      </ul>
      {more}
      <MobileTotals
        items={[
          ["Total", money(totals.total)],
          ["GST", money(totals.gst)],
          ["Eligible ITC", money(totals.itc)],
        ]}
        count={totals.count}
      />
    </>
  );
}

function ItcBadge({
  expense: e,
  money,
  hideNone,
}: {
  expense: Expense;
  money: (v: string) => string;
  hideNone?: boolean;
}) {
  if (claimsItc(e))
    return (
      <Badge size="sm" tone="success" title="Input tax credit you can claim">
        ITC {money(itcClaimable(e))}
      </Badge>
    );
  if (hideNone) return null;
  if (hasGst(e))
    return (
      <Badge size="sm" tone="neutral">
        No ITC
      </Badge>
    );
  return <span className="text-subtle-foreground">—</span>;
}

function MobileTotals({ items, count }: { items: [string, ReactNode][]; count: number }) {
  return (
    <div className="border-t border-border bg-surface-2/60 px-4 py-3 md:hidden">
      <div className="mb-1.5 text-xs text-muted-foreground">
        {count} {count === 1 ? "entry" : "entries"}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {items.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="truncate font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Income                                                              */
/* ------------------------------------------------------------------ */

export function IncomeList({
  rows,
  total,
  settings,
  ...handlers
}: RowHandlers<Income> & {
  rows: Income[];
  total: string;
  settings: AppSettings;
}) {
  const { visible, more } = usePaged(rows);
  const money = (v: string) =>
    formatMoney(v, settings.invoiceDefaults.currency, settings.formats.numberGrouping);
  const date = (iso: string) => formatDate(iso, settings.formats.dateFormat);
  const title = (i: Income) => i.source || i.category || "Income";
  const label = (i: Income) => `${title(i)}, ${date(i.date)}`;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/60 text-left text-xs font-medium text-muted-foreground">
              <th className={th}>Date</th>
              <th className={th}>Source</th>
              <th className={th}>Category</th>
              <th className={cn(th, "text-right")}>Amount</th>
              <th className="w-12 px-2 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((i) => (
              <tr
                key={i.id}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/60"
                onClick={() => handlers.onEdit(i)}
              >
                <td className={cn(td, "w-32 whitespace-nowrap text-muted-foreground tabular-nums")}>
                  {date(i.date)}
                </td>
                <td className={cn(td, "max-w-72")}>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      handlers.onEdit(i);
                    }}
                    className="block max-w-full truncate rounded text-left font-medium focus-visible:focus-ring"
                    aria-label={`Edit ${label(i)}`}
                  >
                    {i.source || <span className="text-subtle-foreground">—</span>}
                  </button>
                  {i.notes && (
                    <div className="truncate text-xs text-muted-foreground">{i.notes}</div>
                  )}
                </td>
                <td className={cn(td, "text-muted-foreground")}>{i.category || "—"}</td>
                <td className={cn(td, num, "font-medium")}>{money(i.amount)}</td>
                <td className="px-2 py-3" onClick={(ev) => ev.stopPropagation()}>
                  <RowMenu row={i} label={label(i)} {...handlers} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-surface-2/60 font-semibold">
              <td className={td} colSpan={3}>
                Total{" "}
                <span className="font-normal text-muted-foreground">
                  ({rows.length} {rows.length === 1 ? "entry" : "entries"})
                </span>
              </td>
              <td className={cn(td, num)}>{money(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <ul className="divide-y divide-border md:hidden">
        {visible.map((i) => (
          <li key={i.id} className="flex items-start gap-2 py-3 pr-2 pl-4">
            <button
              type="button"
              onClick={() => handlers.onEdit(i)}
              className="min-w-0 flex-1 rounded-lg text-left focus-visible:focus-ring"
              aria-label={`Edit ${label(i)}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-medium">{title(i)}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {money(i.amount)}
                </span>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
                {[date(i.date), i.source ? i.category : ""].filter(Boolean).join(" · ")}
              </div>
            </button>
            <RowMenu row={i} label={label(i)} {...handlers} />
          </li>
        ))}
      </ul>
      {more}
      <MobileTotals items={[["Total", money(total)]]} count={rows.length} />
    </>
  );
}
