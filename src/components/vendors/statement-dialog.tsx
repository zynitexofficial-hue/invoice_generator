"use client";

import { Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { useAnalyticsPrint } from "@/components/analytics/print-report";
import { formatDate, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { vendorStatement } from "@/lib/analytics/vendor-statement";
import { periodRange, currentPeriod } from "@/lib/period";
import type { AppSettings, Purchase, Vendor } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";

/** Printable statement for one vendor: opening balance, bills, payments, closing balance. */
export function StatementDialog({
  vendor,
  purchases,
  settings,
  onClose,
}: {
  vendor: Vendor | null;
  purchases: Purchase[];
  settings: AppSettings;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(vendor)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        {vendor && (
          <StatementBody
            vendor={vendor}
            purchases={purchases}
            settings={settings}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatementBody({
  vendor,
  purchases,
  settings,
  onClose,
}: {
  vendor: Vendor;
  purchases: Purchase[];
  settings: AppSettings;
  onClose: () => void;
}) {
  const fy = periodRange(currentPeriod("fy", todayISO()));
  const [from, setFrom] = useState(fy.start);
  const [to, setTo] = useState(fy.end);
  const { print, node } = useAnalyticsPrint();
  const money = (v: string) =>
    formatMoney(v, settings.invoiceDefaults.currency, settings.formats.numberGrouping);
  const date = (iso: string) => formatDate(iso, settings.formats.dateFormat);

  const statement = useMemo(
    () => vendorStatement(vendor, purchases, { start: from, end: to }),
    [vendor, purchases, from, to],
  );
  const periodLabel = `${from ? date(from) : "Start"} – ${to ? date(to) : "Today"}`;

  const doPrint = () =>
    print({
      title: `Statement of account: ${vendor.name}`,
      businessName: settings.profile.name,
      gstin: settings.profile.gstin,
      periodLabel,
      sections: [
        {
          title: vendor.gstin ? `${vendor.name} (GSTIN ${vendor.gstin})` : vendor.name,
          headers: ["Date", "Details", "Paid (Dr)", "Billed (Cr)", "You owe"],
          numeric: [false, false, true, true, true],
          rows: [
            ["", "Opening balance", "", "", money(statement.opening)],
            ...statement.rows.map((r) => [
              date(r.date),
              r.description + (r.ref && r.kind === "payment" ? ` (${r.ref})` : ""),
              r.debit === "0.00" ? "" : money(r.debit),
              r.credit === "0.00" ? "" : money(r.credit),
              money(r.balance),
            ]),
          ],
          totals: [
            "",
            "Closing balance",
            money(statement.paid),
            money(statement.billed),
            money(statement.closing),
          ],
        },
      ],
    });

  return (
    <>
      <DialogHeader
        title={`Statement: ${vendor.name}`}
        description="What you billed by and paid to this vendor. A positive balance means you owe them."
      />
      <DialogBody className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <DatePicker value={from} onChange={setFrom} dateFormat={settings.formats.dateFormat} />
          </Field>
          <Field label="To">
            <DatePicker
              value={to}
              onChange={setTo}
              dateFormat={settings.formats.dateFormat}
              min={from}
            />
          </Field>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Vendor statement</caption>
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Details</th>
                <th className="px-3 py-2 text-right font-medium">Paid</th>
                <th className="px-3 py-2 text-right font-medium">Billed</th>
                <th className="px-3 py-2 text-right font-medium">You owe</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-muted-foreground">Opening balance</td>
                <td />
                <td />
                <td className="px-3 py-2 text-right tabular-nums">{money(statement.opening)}</td>
              </tr>
              {statement.rows.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{date(r.date)}</td>
                  <td className="px-3 py-2">{r.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.debit === "0.00" ? "" : money(r.debit)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.credit === "0.00" ? "" : money(r.credit)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface-2/60 font-semibold">
                <td className="px-3 py-2" colSpan={2}>
                  Closing balance
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(statement.paid)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(statement.billed)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(statement.closing)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {statement.rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No bills or payments in this date range.</p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button variant="primary" onClick={doPrint}>
          <Printer />
          Print
        </Button>
      </DialogFooter>
      {node}
    </>
  );
}
