"use client";

import { History } from "lucide-react";
import { useEffect, useState } from "react";
import { toDec } from "@/lib/money";
import { invoiceLedgerView } from "@/lib/payments/ledger";
import type { AppSettings, PaymentEntry } from "@/lib/schema";
import { formatMoney } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { useEditor } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { PaymentsDialog } from "./payments-dialog";

/**
 * Editor side of the payment ledger. Once an invoice has ledger rows, "amount
 * received" is derived from them: this panel shows the summary, keeps the open
 * editor copy in step (so an autosave can't write a stale amount back) and
 * opens the payment history dialog.
 */
export function LedgerPayments({
  rows,
  settings,
  ledgerActive,
}: {
  rows: PaymentEntry[];
  settings: AppSettings;
  /** True once the invoice has ledger rows (fields become read-only). */
  ledgerActive: boolean;
}) {
  const invoice = useEditor((s) => s.invoice);
  const patchPayment = useEditor((s) => s.patchPayment);
  const [open, setOpen] = useState(false);

  const view = invoice ? invoiceLedgerView(invoice, rows) : null;
  const received = view?.received ?? "0";
  const latest = rows.filter((r) => r.kind !== "refund").at(-1);
  const current = invoice?.payment;
  useEffect(() => {
    if (!ledgerActive || !current) return;
    const next = {
      amountReceived: toDec(received).isZero() ? "" : received,
      date: latest?.date ?? "",
      mode: latest?.mode ?? ("" as const),
    };
    if (
      !toDec(current.amountReceived).equals(toDec(next.amountReceived)) ||
      current.date !== next.date ||
      current.mode !== next.mode
    )
      patchPayment(next);
  }, [ledgerActive, current, received, latest?.date, latest?.mode, patchPayment]);

  if (!invoice || !view) return null;
  const money = (v: string) => formatMoney(v, invoice.currency, settings.formats.numberGrouping);

  return (
    <>
      {ledgerActive && (
        <div className="rounded-xl bg-surface-2/60 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span>
              Received <strong className="tabular-nums">{money(view.received)}</strong> in{" "}
              {rows.length} {rows.length === 1 ? "entry" : "entries"}
            </span>
            {latest && (
              <span className="text-xs text-muted-foreground">
                Last on {formatDate(latest.date, settings.formats.dateFormat)}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Payments are managed in the payment history, so the amount here always matches it.
          </p>
        </div>
      )}
      <div>
        <Button size="sm" variant="soft" onClick={() => setOpen(true)}>
          <History />
          Payment history and receipts
        </Button>
      </div>
      <PaymentsDialog
        invoice={open ? invoice : null}
        settings={settings}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
