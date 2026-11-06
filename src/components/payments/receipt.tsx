"use client";

import { useCallback } from "react";
import { paymentsForReceipt } from "@/db/payments";
import { amountInWords } from "@/lib/calc/words";
import { formatDate } from "@/lib/dates";
import { PAYMENT_MODE_LABELS } from "@/lib/documents";
import { formatMoney } from "@/lib/format";
import { Dec, toDec } from "@/lib/money";
import type { AppSettings, PaymentEntry } from "@/lib/schema";
import { usePrintSummary } from "@/components/returns/print-portal";

export const PAYMENT_PRINT_CSS = `
.pay-print h1 { font-size: 20px; letter-spacing: .02em; text-transform: uppercase; }
.pay-print .head { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
.pay-print .big { font-size: 22px; font-weight: 700; }
.pay-print .box { border: 1px solid #999; padding: 10px 12px; margin: 10px 0; }
.pay-print .sign { margin-top: 48px; text-align: right; }
.pay-print dl { display: grid; grid-template-columns: 140px 1fr; gap: 3px 10px; margin: 0; }
.pay-print dt { color: #555; }
.pay-print dd { margin: 0; }
`;

function Header({ settings, title }: { settings: AppSettings; title: string }) {
  const p = settings.profile;
  return (
    <div className="head">
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          {p.tradeName || p.name || "My business"}
        </div>
        {p.address && <div>{[p.address, p.city, p.pincode].filter(Boolean).join(", ")}</div>}
        {p.gstin && <div>GSTIN: {p.gstin}</div>}
        {(p.phone || p.email) && <div>{[p.phone, p.email].filter(Boolean).join(" · ")}</div>}
      </div>
      <h1>{title}</h1>
    </div>
  );
}

/** Printable receipt for one payment (or one receipt number covering applied + advance parts). */
export function ReceiptDocument({
  rows,
  settings,
}: {
  rows: PaymentEntry[];
  settings: AppSettings;
}) {
  const first = rows[0];
  const grouping = settings.formats.numberGrouping;
  const dateFormat = settings.formats.dateFormat;
  const currency = first.currency || "INR";
  const money = (v: string) => formatMoney(v, currency, grouping);
  const total = rows.reduce((a, r) => a.plus(toDec(r.amount)), new Dec(0));
  const isRefund = first.kind === "refund";
  return (
    <div className="pay-print">
      <Header settings={settings} title={isRefund ? "Refund voucher" : "Payment receipt"} />
      <dl>
        <dt>{isRefund ? "Voucher no." : "Receipt no."}</dt>
        <dd>{first.receiptNo || "—"}</dd>
        <dt>Date</dt>
        <dd>{formatDate(first.date, dateFormat)}</dd>
        <dt>{isRefund ? "Paid to" : "Received from"}</dt>
        <dd>{first.customerName || "Customer"}</dd>
        <dt>Mode</dt>
        <dd>{first.mode ? PAYMENT_MODE_LABELS[first.mode] : "Not specified"}</dd>
        {first.reference && (
          <>
            <dt>Reference</dt>
            <dd>{first.reference}</dd>
          </>
        )}
      </dl>
      <div className="box">
        <div className="muted">{isRefund ? "Amount refunded" : "Amount received"}</div>
        <div className="big">{money(total.toString())}</div>
        <div className="muted">{amountInWords(total.toString(), currency)}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Towards</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {r.invoiceId
                  ? `${isRefund ? "Refund on invoice" : "Invoice"} ${r.invoiceNumber}`
                  : "Advance (not yet adjusted against an invoice)"}
              </td>
              <td className="num">{money(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.some((r) => r.notes) && (
        <p className="muted">
          Notes:{" "}
          {rows
            .map((r) => r.notes)
            .filter(Boolean)
            .join("; ")}
        </p>
      )}
      <p className="muted">This receipt confirms payment only. It is not a tax invoice.</p>
      <div className="sign">
        For {settings.profile.tradeName || settings.profile.name || "the business"}
        <br />
        <span className="muted">{settings.profile.signatoryName || "Authorised signatory"}</span>
      </div>
    </div>
  );
}

/** Print hook: `printReceipt(payment)` opens the browser print dialog; render `portal` once. */
export function useReceiptPrint(settings: AppSettings | undefined) {
  const { print, portal } = usePrintSummary();
  const printReceipt = useCallback(
    async (payment: PaymentEntry) => {
      if (!settings) return;
      const rows = await paymentsForReceipt(payment);
      print(
        `Receipt ${payment.receiptNo || payment.customerName}`,
        <>
          <style>{PAYMENT_PRINT_CSS}</style>
          <ReceiptDocument rows={rows} settings={settings} />
        </>,
      );
    },
    [print, settings],
  );
  return { printReceipt, portal };
}

export { Header as PrintHeader };
