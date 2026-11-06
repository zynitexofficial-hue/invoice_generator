"use client";

import { Ellipsis, HandCoins, Paperclip, Pencil, Trash } from "lucide-react";
import { useState } from "react";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { purchaseGst, purchaseItc } from "@/lib/purchases/calc";
import type { BillTotals } from "@/lib/purchases/list";
import type { AppSettings, Purchase } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { PaymentStatusBadge } from "@/components/money/money-lists";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PAGE = 100;
const th = "px-4 py-3 font-medium";
const td = "px-4 py-3";
const num = "text-right whitespace-nowrap tabular-nums";

export interface BillHandlers {
  onEdit: (b: Purchase) => void;
  onPay: (b: Purchase) => void;
  onDelete: (b: Purchase) => void;
}

function Menu({ bill, label, ...h }: BillHandlers & { bill: Purchase; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label}`}>
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem icon={<Pencil />} onSelect={() => h.onEdit(bill)}>
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem icon={<HandCoins />} onSelect={() => h.onPay(bill)}>
          Payments
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Trash />} tone="danger" onSelect={() => h.onDelete(bill)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BillsList({
  rows,
  totals,
  settings,
  today,
  attachmentOwners,
  ...handlers
}: BillHandlers & {
  rows: Purchase[];
  totals: BillTotals;
  settings: AppSettings;
  today: string;
  /** Bill ids that have attached files. */
  attachmentOwners?: ReadonlySet<string>;
}) {
  const [limit, setLimit] = useState(PAGE);
  const visible = rows.slice(0, limit);
  const money = (v: string) =>
    formatMoney(v, settings.invoiceDefaults.currency, settings.formats.numberGrouping);
  const date = (iso: string) => (iso ? formatDate(iso, settings.formats.dateFormat) : "—");
  const label = (b: Purchase) => `${b.vendorName || "bill"} ${b.billNo}`.trim();
  const overdue = (b: Purchase) => b.paymentStatus !== "paid" && b.dueDate && b.dueDate < today;
  const clip = (b: Purchase) =>
    attachmentOwners?.has(b.id) ? (
      <Paperclip className="inline size-3.5 text-muted-foreground" aria-label="Has attachments" />
    ) : null;
  const more =
    rows.length > limit ? (
      <div className="border-t border-border px-4 py-3 text-center">
        <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
          Show {Math.min(PAGE, rows.length - limit)} more of {rows.length - limit}
        </Button>
      </div>
    ) : null;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Purchase bills</caption>
          <thead>
            <tr className="border-b border-border bg-surface-2/60 text-left text-xs font-medium text-muted-foreground">
              <th className={th}>Bill date</th>
              <th className={th}>Vendor</th>
              <th className={th}>Due</th>
              <th className={cn(th, "text-right")}>Taxable</th>
              <th className={cn(th, "text-right")}>GST</th>
              <th className={cn(th, "text-right")}>Total</th>
              <th className={cn(th, "text-right")}>Balance</th>
              <th className={th}>Status</th>
              <th className="w-12 px-2 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => (
              <tr
                key={b.id}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/60"
                onClick={() => handlers.onEdit(b)}
              >
                <td className={cn(td, "whitespace-nowrap text-muted-foreground tabular-nums")}>
                  {date(b.billDate)}
                </td>
                <td className={cn(td, "max-w-60")}>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      handlers.onEdit(b);
                    }}
                    className="block max-w-full truncate rounded text-left font-medium focus-visible:focus-ring"
                    aria-label={`Edit bill ${label(b)}`}
                  >
                    {b.vendorName || "—"} {clip(b)}
                  </button>
                  <div className="truncate text-xs text-muted-foreground">
                    {b.billNo ? `Bill ${b.billNo}` : "No bill number"}
                    {b.reverseCharge ? " · Reverse charge" : ""}
                  </div>
                </td>
                <td
                  className={cn(
                    td,
                    "whitespace-nowrap tabular-nums",
                    overdue(b) ? "text-danger-foreground" : "text-muted-foreground",
                  )}
                >
                  {date(b.dueDate)}
                </td>
                <td className={cn(td, num, "text-muted-foreground")}>{money(b.summary.taxable)}</td>
                <td className={cn(td, num, "text-muted-foreground")}>
                  {b.gstMode === "none" ? (
                    "—"
                  ) : (
                    <span
                      title={purchaseItc(b).total !== "0.00" ? "ITC claimed" : "No ITC claimed"}
                    >
                      {money(purchaseGst(b))}
                    </span>
                  )}
                </td>
                <td className={cn(td, num, "font-medium")}>{money(b.summary.total)}</td>
                <td className={cn(td, num)}>{money(b.summary.balance)}</td>
                <td className={td}>
                  <PaymentStatusBadge status={b.paymentStatus} />
                </td>
                <td className="px-2 py-3" onClick={(ev) => ev.stopPropagation()}>
                  <Menu bill={b} label={label(b)} {...handlers} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-surface-2/60 text-sm font-semibold">
              <td className={td} colSpan={3}>
                Total ({totals.count} {totals.count === 1 ? "bill" : "bills"})
              </td>
              <td className={cn(td, num)}>{money(totals.taxable)}</td>
              <td className={cn(td, num)}>{money(totals.gst)}</td>
              <td className={cn(td, num)}>{money(totals.total)}</td>
              <td className={cn(td, num)}>{money(totals.balance)}</td>
              <td className={td} colSpan={2}>
                {totals.itc !== "0.00" && (
                  <span className="text-xs font-medium text-success-foreground">
                    ITC {money(totals.itc)}
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ul className="divide-y divide-border md:hidden">
        {visible.map((b) => (
          <li key={b.id} className="flex items-start gap-2 px-4 py-3">
            <button
              type="button"
              onClick={() => handlers.onEdit(b)}
              className="min-w-0 flex-1 rounded text-left focus-visible:focus-ring"
              aria-label={`Edit bill ${label(b)}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {b.vendorName || "—"} {clip(b)}
                </span>
                <span className="font-semibold tabular-nums">{money(b.summary.total)}</span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {b.billNo ? `Bill ${b.billNo} · ` : ""}
                {date(b.billDate)}
              </span>
              <span className="mt-1.5 flex items-center justify-between gap-2">
                <PaymentStatusBadge status={b.paymentStatus} />
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    overdue(b) ? "text-danger-foreground" : "text-muted-foreground",
                  )}
                >
                  {b.paymentStatus === "paid"
                    ? "Settled"
                    : `${money(b.summary.balance)} due ${date(b.dueDate)}`}
                </span>
              </span>
              {b.reverseCharge && (
                <Badge size="sm" tone="outline" className="mt-1">
                  Reverse charge
                </Badge>
              )}
            </button>
            <Menu bill={b} label={label(b)} {...handlers} />
          </li>
        ))}
        <li className="flex items-center justify-between bg-surface-2/60 px-4 py-3 text-sm font-semibold">
          <span>
            Total ({totals.count} {totals.count === 1 ? "bill" : "bills"})
          </span>
          <span className="tabular-nums">
            {money(totals.total)} · due {money(totals.balance)}
          </span>
        </li>
      </ul>
      {more}
    </>
  );
}
