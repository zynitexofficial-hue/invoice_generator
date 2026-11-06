import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { KIND_LABEL, type Statement } from "@/lib/payments/statement";
import type { AppSettings } from "@/lib/schema";
import { PAYMENT_PRINT_CSS, PrintHeader } from "@/components/payments/receipt";

/** Printable customer statement (rendered into the print portal). */
export function StatementDocument({
  statement,
  customerName,
  customerGstin,
  settings,
}: {
  statement: Statement;
  customerName: string;
  customerGstin: string;
  settings: AppSettings;
}) {
  const fmt = settings.formats.dateFormat;
  const money = (v: string) => (v ? formatMoney(v, "INR", settings.formats.numberGrouping) : "");
  const range =
    statement.from || statement.to
      ? `${statement.from ? formatDate(statement.from, fmt) : "Start"} to ${statement.to ? formatDate(statement.to, fmt) : "today"}`
      : "All dates";
  return (
    <div className="pay-print">
      <style>{PAYMENT_PRINT_CSS}</style>
      <PrintHeader settings={settings} title="Statement of account" />
      <dl>
        <dt>Customer</dt>
        <dd>
          {customerName}
          {customerGstin ? ` (GSTIN ${customerGstin})` : ""}
        </dd>
        <dt>Period</dt>
        <dd>{range}</dd>
        <dt>Amounts in</dt>
        <dd>Indian rupees</dd>
      </dl>
      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Details</th>
            <th className="num">Debit</th>
            <th className="num">Credit</th>
            <th className="num">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td />
            <td>
              <strong>Opening balance</strong>
            </td>
            <td />
            <td />
            <td className="num">
              <strong>{money(statement.opening)}</strong>
            </td>
          </tr>
          {statement.lines.map((l, i) => (
            <tr key={i}>
              <td>{formatDate(l.date, fmt)}</td>
              <td>
                {KIND_LABEL[l.kind]} {l.ref}
                {l.description ? <div className="muted">{l.description}</div> : null}
              </td>
              <td className="num">{money(l.debit)}</td>
              <td className="num">{money(l.credit)}</td>
              <td className="num">{money(l.balance)}</td>
            </tr>
          ))}
          <tr>
            <td />
            <td>
              <strong>Closing balance</strong>
            </td>
            <td className="num">{money(statement.totals.invoiced)}</td>
            <td className="num">{money(statement.totals.received)}</td>
            <td className="num">
              <strong>{money(statement.closing)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="muted">
        A positive balance is the amount the customer owes. A negative balance means the customer
        has paid in advance or holds credit.
      </p>
    </div>
  );
}
