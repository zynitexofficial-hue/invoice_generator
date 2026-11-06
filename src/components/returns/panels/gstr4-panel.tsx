"use client";

import { Download, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { patchAnnualGroup, setAnnualValue } from "@/db/annual-inputs";
import { useAnnualInput } from "@/db/hooks";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { prepareAnalytics } from "@/lib/analytics";
import { downloadCsv } from "@/lib/csv";
import { COMPOSITION_RATES, buildGstr4 } from "@/lib/gst/annual";
import { settingsStateCode } from "@/lib/gst/returns";
import { DrillList, ManualInput } from "../annual/annual-table";
import { FySelect } from "../annual/fy-select";
import type { ReturnsTabContext } from "../tab-context";

export function Gstr4Panel({ ctx }: { ctx: ReturnsTabContext }) {
  const { invoices, expenses, settings, filings, today, f } = ctx;
  const [fy, setFy] = useState(ctx.fyKey);
  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const annual = useAnnualInput(fy);
  const values = annual?.gstr4.values;

  const data = useMemo(
    () =>
      prepareAnalytics({
        invoices,
        expenses,
        incomes: [],
        sellerState: settingsStateCode(settings),
      }),
    [invoices, expenses, settings],
  );
  const r = useMemo(
    () => buildGstr4({ data, expenses, settings, fyKey: fy, values, filings, today }),
    [data, expenses, settings, fy, values, filings, today],
  );
  const dates = useMemo(
    () => [...invoices.map((i) => i.invoiceDate), ...expenses.map((e) => e.date)],
    [invoices, expenses],
  );
  const set = (key: string, v: string) => void setAnnualValue(fy, "gstr4", key, v);
  const savedNotes = annual?.gstr4.notes ?? "";

  const exportCsv = () =>
    downloadCsv(
      `gstr4-worksheet-${fy}`,
      ["Section", "Item", "Turnover / taxable", "CGST", "SGST", "Tax"],
      [
        ...r.rates.map((x) => ["Outward supplies", x.label, x.turnover, x.cgst, x.sgst, x.tax]),
        ...r.inward.map((x) => ["Inward supplies", x.label, x.taxable, "", "", x.tax]),
        ["Summary", "Tax on outward supplies", "", "", "", r.outwardTax],
        ["Summary", "Reverse-charge tax", "", "", "", r.rcmTax],
        ["Summary", "Total payable", "", "", "", r.totalPayable],
        ["Summary", "Paid through CMP-08", "", "", "", r.cmp08Paid],
        ["Summary", "Balance", "", "", "", r.balance],
      ],
    );

  const printSummary = () =>
    ctx.onPrint(
      `GSTR-4 worksheet ${fy}`,
      <div>
        <h1>GSTR-4 worksheet (draft) · {fy}</h1>
        <p className="note">Draft prepared from your records. Verify with your CA before filing.</p>
        <table>
          <tbody>
            {r.rates
              .filter((x) => Number(x.turnover) !== 0)
              .map((x) => (
                <tr key={x.rate}>
                  <td>{x.label}</td>
                  <td className="num">{f.money(x.turnover)}</td>
                  <td className="num">{f.money(x.tax)}</td>
                </tr>
              ))}
            <tr>
              <td>Reverse-charge tax</td>
              <td />
              <td className="num">{f.money(r.rcmTax)}</td>
            </tr>
            <tr>
              <td>
                <strong>Total payable</strong>
              </td>
              <td />
              <td className="num">{f.money(r.totalPayable)}</td>
            </tr>
            <tr>
              <td>Paid through CMP-08</td>
              <td />
              <td className="num">{f.money(r.cmp08Paid)}</td>
            </tr>
            <tr>
              <td>
                <strong>Balance</strong>
              </td>
              <td />
              <td className="num">{f.money(r.balance)}</td>
            </tr>
          </tbody>
        </table>
      </div>,
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="GSTR-4 annual statement and CMP-08 worksheet"
          description="For composition dealers: tax on your yearly turnover at the composition rate, reverse-charge tax on purchases, and what you paid through the quarterly CMP-08."
          action={
            <FySelect value={fy} onChange={setFy} dates={dates} today={today} className="w-36" />
          }
          className="flex-col sm:flex-row"
        />
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Draft only; nothing is filed from here. Rates (1% manufacturers and traders, 5%
            restaurants, 6% other services) and the due date{" "}
            {r.dueDate ? `(${f.date(r.dueDate)})` : ""} are the usual ones: verify what applies to
            you on the GST portal or with your CA. Section names approximate the GSTR-4 form.
          </p>
          {r.warnings.map((w) => (
            <Alert key={w} tone="warning">
              {w}
            </Alert>
          ))}
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <label className="flex items-center gap-2 text-sm">
              Rate for your turnover
              <Select<string>
                value={r.defaultRate}
                onValueChange={(v) => set("defaultRate", v)}
                options={COMPOSITION_RATES.map((x) => ({ value: x.rate, label: x.label }))}
                aria-label="Default composition rate"
                className="w-72 max-w-full"
              />
            </label>
            <Button variant="secondary" size="sm" onClick={exportCsv}>
              <Download aria-hidden />
              CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={printSummary}>
              <Printer aria-hidden />
              Print
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Outward supplies by rate"
          description={`Turnover per your records is ${f.money(r.booksTurnover)} (net of credit notes). All of it is placed at the rate above; if you have supplies at more than one rate, type the turnover for each rate.`}
        />
        <CardContent className="space-y-2">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <caption className="sr-only">Outward supplies by composition rate</caption>
              <thead className="bg-surface-2 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-2.5 py-2 text-left font-medium">
                    Rate
                  </th>
                  <th scope="col" className="w-36 px-2.5 py-2 text-right font-medium">
                    Turnover
                  </th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">
                    CGST
                  </th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">
                    SGST
                  </th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">
                    Tax
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.rates.map((x) => (
                  <tr key={x.rate} className="border-t border-border/70">
                    <td className="px-2.5 py-1.5">{x.label}</td>
                    <td className="px-2.5 py-1.5">
                      <ManualInput
                        label={`Turnover at ${x.rate}%`}
                        value={x.turnover}
                        edited={x.overridden}
                        onCommit={(v) =>
                          set(`turnover.${x.rate}`, Number(v) === Number(x.booksTurnover) ? "" : v)
                        }
                      />
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{f.money(x.cgst)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{f.money(x.sgst)}</td>
                    <td className="px-2.5 py-1.5 text-right font-medium tabular-nums">
                      {f.money(x.tax)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.turnoverDrill.length > 0 && (
            <details onToggle={(e) => setOpen(e.currentTarget.open ? "t" : null)}>
              <summary className="cursor-pointer text-xs text-primary hover:underline">
                {r.turnoverDrill.length} documents behind the turnover
              </summary>
              {open === "t" && (
                <div className="mt-2">
                  <DrillList items={r.turnoverDrill} format={f.money} />
                </div>
              )}
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Inward supplies"
          description="From your expenses. Tax you pay under reverse charge is added to what you owe; composition dealers cannot claim input tax credit."
        />
        <CardContent className="space-y-2">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[480px] border-collapse text-xs">
              <caption className="sr-only">Inward supplies</caption>
              <thead className="bg-surface-2 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-2.5 py-2 text-left font-medium">
                    Supplies
                  </th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">
                    Bills
                  </th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">
                    Taxable
                  </th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">
                    Tax
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.inward.map((x) => (
                  <tr key={x.id} className="border-t border-border/70">
                    <td className="px-2.5 py-1.5">{x.label}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{x.count}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{f.money(x.taxable)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{f.money(x.tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.inward
            .filter((x) => x.drill.length)
            .map((x) => (
              <details key={x.id}>
                <summary className="cursor-pointer text-xs text-primary hover:underline">
                  {x.drill.length} bill(s): {x.label}
                </summary>
                <div className="mt-2">
                  <DrillList items={x.drill} format={f.money} />
                </div>
              </details>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Tax payable and CMP-08 payments"
          description="Enter what you actually paid in each quarter's CMP-08. The quarterly estimate uses the rate above."
        />
        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[520px] border-collapse text-xs">
              <caption className="sr-only">Quarterly CMP-08</caption>
              <thead className="bg-surface-2 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-2.5 py-2 text-left font-medium">
                    Quarter
                  </th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">
                    Turnover
                  </th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">
                    Estimated tax
                  </th>
                  <th scope="col" className="w-32 px-2.5 py-2 text-right font-medium">
                    Paid (CMP-08)
                  </th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">
                    Difference
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.quarters.map((q, i) => (
                  <tr key={q.key} className="border-t border-border/70">
                    <td className="px-2.5 py-1.5">{q.label}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{f.money(q.turnover)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">
                      {f.money(q.estimated)}
                    </td>
                    <td className="px-2.5 py-1.5">
                      <ManualInput
                        label={`CMP-08 paid ${q.label}`}
                        value={values?.[`cmp08.q${i + 1}`] ?? ""}
                        placeholder="0.00"
                        edited={Boolean(values?.[`cmp08.q${i + 1}`])}
                        onCommit={(v) => set(`cmp08.q${i + 1}`, v)}
                      />
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">
                      {f.money(q.difference)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            <dt>Tax on outward supplies</dt>
            <dd className="text-right tabular-nums">{f.money(r.outwardTax)}</dd>
            <dt>Reverse-charge tax on inward supplies</dt>
            <dd className="text-right tabular-nums">{f.money(r.rcmTax)}</dd>
            <dt className="font-semibold">Total tax payable</dt>
            <dd className="text-right font-semibold tabular-nums">{f.money(r.totalPayable)}</dd>
            <dt>Paid through CMP-08</dt>
            <dd className="text-right tabular-nums">{f.money(r.cmp08Paid)}</dd>
            <dt className="font-semibold">Balance to pay (negative = paid extra)</dt>
            <dd className="text-right font-semibold tabular-nums">{f.money(r.balance)}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Interest and late fee estimate"
          description="An estimate for a late GSTR-4 using today's date (or the filed date if you marked it filed). The portal computes the real amounts."
        />
        <CardContent className="space-y-2">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            <dt>Days late</dt>
            <dd className="text-right tabular-nums">{r.lateFee.daysLate}</dd>
            <dt>Late fee (capped at {f.money(r.lateFee.cap)})</dt>
            <dd className="text-right tabular-nums">{f.money(r.lateFee.lateFee.total)}</dd>
            <dt>Interest on unpaid tax</dt>
            <dd className="text-right tabular-nums">{f.money(r.lateFee.interest)}</dd>
          </dl>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {r.lateFee.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
            <li>Composition late-fee amounts and caps change by notification: verify.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Notes for your CA" />
        <CardContent>
          <Textarea
            aria-label="GSTR-4 notes"
            value={notes ?? savedNotes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== null && notes !== savedNotes)
                void patchAnnualGroup(fy, "gstr4", { notes });
              setNotes(null);
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
