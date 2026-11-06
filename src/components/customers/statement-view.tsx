"use client";

import { Download, Plus, Printer, Receipt } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useCustomers, useInvoices, usePayments, useSettings } from "@/db/hooks";
import { getPayment } from "@/db/payments";
import { customerIdentity, prepareAnalytics } from "@/lib/analytics/base";
import { downloadCsv } from "@/lib/csv";
import { addDaysISO, formatDate, todayISO } from "@/lib/dates";
import { settingsStateCode } from "@/lib/gst/returns";
import { formatMoney } from "@/lib/format";
import { toDec } from "@/lib/money";
import { buildPaymentEvents } from "@/lib/payments/ledger";
import { fyStartYear } from "@/lib/period";
import {
  buildStatement,
  customerMatch,
  KIND_LABEL,
  statementCsvRows,
} from "@/lib/payments/statement";
import { safeFileName } from "@/lib/utils";
import { Page } from "@/components/layout/page";
import { useReceiptPrint } from "@/components/payments/receipt";
import { usePrintSummary } from "@/components/returns/print-portal";
import { AdvanceDialog } from "@/components/statements/advance-dialog";
import { StatementDocument } from "@/components/statements/statement-document";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Printable customer statement: /customers/statement?customer=ID&from=YYYY-MM-DD&to=YYYY-MM-DD */
export function StatementView() {
  const params = useSearchParams();
  const router = useRouter();
  const settings = useSettings();
  const customers = useCustomers();
  const invoices = useInvoices();
  const payments = usePayments();
  const { print, portal } = usePrintSummary();
  const { printReceipt, portal: receiptPortal } = useReceiptPrint(settings);
  const [advanceOpen, setAdvanceOpen] = useState(false);

  const today = todayISO();
  const fyStart = `${fyStartYear(today)}-04-01`;
  const customerId = params.get("customer") ?? "";
  const rawFrom = params.get("from");
  const rawTo = params.get("to");
  const from = rawFrom === null ? fyStart : ISO.test(rawFrom) ? rawFrom : "";
  const to = rawTo === null ? today : ISO.test(rawTo) ? rawTo : "";

  const setParams = (next: { customer?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    q.set("customer", next.customer ?? customerId);
    q.set("from", next.from ?? from);
    q.set("to", next.to ?? to);
    router.replace(`/customers/statement?${q.toString()}`);
  };

  const customer = customers?.find((c) => c.id === customerId);
  const sellerState = settings ? settingsStateCode(settings) : "";
  const data = useMemo(
    () =>
      invoices ? prepareAnalytics({ invoices, expenses: [], incomes: [], sellerState }) : undefined,
    [invoices, sellerState],
  );
  const events = useMemo(
    () =>
      invoices && payments
        ? buildPaymentEvents(invoices, payments, (i) => customerIdentity(i).key)
        : undefined,
    [invoices, payments],
  );
  const statement = useMemo(
    () =>
      data && events && customer
        ? buildStatement({ facts: data.facts, events, match: customerMatch(customer), from, to })
        : undefined,
    [data, events, customer, from, to],
  );

  const ready = Boolean(settings && customers && data && events);
  const money = (v: string) =>
    v ? formatMoney(v, "INR", settings?.formats.numberGrouping ?? "indian") : "";
  const dateFormat = settings?.formats.dateFormat ?? "dd/MM/yyyy";
  const name = customer ? customer.company || customer.name || "Customer" : "";

  const exportCsv = () => {
    if (!statement) return;
    const { headers, rows } = statementCsvRows(statement);
    downloadCsv(`statement-${safeFileName(name)}-${to || today}`, headers, rows);
  };
  const printIt = () => {
    if (!statement || !settings || !customer) return;
    print(
      `Statement ${name}`,
      <StatementDocument
        statement={statement}
        customerName={name}
        customerGstin={customer.gstin}
        settings={settings}
      />,
    );
  };

  return (
    <Page
      title="Customer statement"
      width="narrow"
      description="Invoices, payments and balance for a date range."
      actions={
        statement && (
          <>
            <Button variant="secondary" size="sm" onClick={exportCsv}>
              <Download />
              CSV
            </Button>
            <Button variant="primary" size="sm" onClick={printIt}>
              <Printer />
              Print
            </Button>
          </>
        )
      }
    >
      {!ready ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardContent className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
              <Field label="Customer">
                <Combobox
                  items={customers!}
                  getKey={(c) => c.id}
                  getLabel={(c) => c.company || c.name || "Unnamed customer"}
                  getDescription={(c) => c.gstin || c.city}
                  getKeywords={(c) => [c.name, c.company, c.gstin]}
                  selectedKey={customerId}
                  onSelect={(c) => setParams({ customer: c.id })}
                  placeholder="Choose a customer"
                  searchPlaceholder="Search customers"
                  emptyText="No customers yet. Add one from the Customers page."
                />
              </Field>
              <Field label="From">
                <DatePicker
                  value={from}
                  onChange={(v) => setParams({ from: v })}
                  dateFormat={dateFormat}
                  clearable
                  placeholder="Start"
                />
              </Field>
              <Field label="To">
                <DatePicker
                  value={to}
                  onChange={(v) => setParams({ to: v })}
                  dateFormat={dateFormat}
                  clearable
                  placeholder="Today"
                />
              </Field>
              <div className="flex flex-wrap gap-2 sm:col-span-3">
                <Button
                  size="xs"
                  variant="soft"
                  onClick={() => setParams({ from: fyStart, to: today })}
                >
                  This financial year
                </Button>
                <Button
                  size="xs"
                  variant="soft"
                  onClick={() =>
                    setParams({
                      from: `${fyStartYear(today) - 1}-04-01`,
                      to: addDaysISO(fyStart, -1),
                    })
                  }
                >
                  Last financial year
                </Button>
                <Button size="xs" variant="soft" onClick={() => setParams({ from: "", to: today })}>
                  All dates
                </Button>
              </div>
            </CardContent>
          </Card>

          {!customer ? (
            <Alert tone="info">
              {customerId
                ? "That customer could not be found. Pick another one above."
                : "Pick a customer to see their statement."}
            </Alert>
          ) : (
            statement && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    {name}
                    {customer.gstin ? ` · ${customer.gstin}` : ""}
                  </p>
                  <Button size="xs" variant="soft" onClick={() => setAdvanceOpen(true)}>
                    <Plus />
                    Record advance
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Tile label="Opening balance" value={money(statement.opening)} />
                  <Tile label="Invoiced" value={money(statement.totals.invoiced)} />
                  <Tile label="Received" value={money(statement.totals.received)} />
                  <Tile label="Closing balance" value={money(statement.closing)} strong />
                </div>
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-sm">
                        <caption className="sr-only">
                          Statement for {name}, opening balance {statement.opening}, closing balance{" "}
                          {statement.closing}
                        </caption>
                        <thead className="bg-surface-2 text-left text-xs text-muted-foreground">
                          <tr>
                            <th scope="col" className="px-3 py-2">
                              Date
                            </th>
                            <th scope="col" className="px-3 py-2">
                              Details
                            </th>
                            <th scope="col" className="px-3 py-2 text-right">
                              Debit
                            </th>
                            <th scope="col" className="px-3 py-2 text-right">
                              Credit
                            </th>
                            <th scope="col" className="px-3 py-2 text-right">
                              Balance
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border tabular-nums">
                          <tr className="bg-surface-2/40 font-medium">
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2">Opening balance</td>
                            <td />
                            <td />
                            <td className="px-3 py-2 text-right">{money(statement.opening)}</td>
                          </tr>
                          {statement.lines.length === 0 && (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-3 py-6 text-center text-muted-foreground"
                              >
                                Nothing happened in this period.
                              </td>
                            </tr>
                          )}
                          {statement.lines.map((l, i) => (
                            <tr key={i}>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {formatDate(l.date, dateFormat)}
                              </td>
                              <td className="px-3 py-2 font-sans">
                                <div className="font-medium">
                                  {KIND_LABEL[l.kind]} {l.ref}
                                </div>
                                <div className="text-xs text-muted-foreground">{l.description}</div>
                                {l.paymentId && l.kind !== "refund" && (
                                  <button
                                    type="button"
                                    className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                    onClick={async () => {
                                      const p = await getPayment(l.paymentId);
                                      if (p) void printReceipt(p);
                                    }}
                                  >
                                    <Receipt className="size-3" aria-hidden="true" />
                                    Print receipt
                                  </button>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">{money(l.debit)}</td>
                              <td className="px-3 py-2 text-right">{money(l.credit)}</td>
                              <td className="px-3 py-2 text-right font-medium">
                                {money(l.balance)}
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-surface-2/40 font-semibold">
                            <td />
                            <td className="px-3 py-2">Closing balance</td>
                            <td />
                            <td />
                            <td className="px-3 py-2 text-right">{money(statement.closing)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
                <p className="text-xs text-muted-foreground">
                  A positive balance is what the customer owes you. Of the closing balance,{" "}
                  {money(statement.invoicesDue)} is still due on invoices (same as Receivables)
                  {toDec(statement.adjustments).isZero()
                    ? "."
                    : `; the other ${money(statement.adjustments)} is credit notes and advances not yet used.`}
                </p>
              </>
            )
          )}
        </div>
      )}
      {customer && settings && (
        <AdvanceDialog
          open={advanceOpen}
          customerId={customer.id}
          customerName={name}
          settings={settings}
          onClose={() => setAdvanceOpen(false)}
        />
      )}
      {portal}
      {receiptPortal}
    </Page>
  );
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={strong ? "text-lg font-semibold tabular-nums" : "text-base tabular-nums"}>
        {value}
      </div>
    </div>
  );
}
