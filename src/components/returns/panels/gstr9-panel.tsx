"use client";

import { CircleCheck, Download, Printer, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { resetGstr9Row, setAnnualValue } from "@/db/annual-inputs";
import { useAnnualInput } from "@/db/hooks";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { computeMetrics, prepareAnalytics } from "@/lib/analytics";
import { downloadCsv } from "@/lib/csv";
import {
  GSTR9_TABLES,
  HEAD_LABELS,
  annualApplicability,
  buildGstr9,
  buildGstr9c,
  gstr9RowsOf,
  type Applicability,
} from "@/lib/gst/annual";
import { settingsStateCode } from "@/lib/gst/returns";
import { AnnualTable, DrillList } from "../annual/annual-table";
import { FySelect } from "../annual/fy-select";
import { Gstr9cSection } from "../annual/gstr9c-section";
import type { ReturnsTabContext } from "../tab-context";

type Section = "outward" | "itc" | "tax" | "prev" | "other" | "hsn" | "gstr9c";
const SECTIONS: { value: Section; label: string; tables: string[] }[] = [
  { value: "outward", label: "Outward (4–5)", tables: ["4", "5"] },
  { value: "itc", label: "ITC (6–8)", tables: ["6", "7", "8"] },
  { value: "tax", label: "Tax paid (9)", tables: ["9"] },
  { value: "prev", label: "Previous year (10–14)", tables: ["10-14"] },
  { value: "other", label: "Other (15–19)", tables: ["15", "16", "19"] },
  { value: "hsn", label: "HSN (17–18)", tables: [] },
  { value: "gstr9c", label: "GSTR-9C", tables: [] },
];

const LEVEL: Record<Applicability, string> = {
  mandatory: "Likely required",
  optional: "Likely optional",
  unknown: "Unknown",
};

export function Gstr9Panel({ ctx }: { ctx: ReturnsTabContext }) {
  const { invoices, expenses, settings, filings, today, f } = ctx;
  const [fy, setFy] = useState(ctx.fyKey);
  const [section, setSection] = useState<Section>("outward");
  const annual = useAnnualInput(fy);
  const inputs = annual?.gstr9;

  const result = useMemo(
    () => buildGstr9({ invoices, expenses, settings, fyKey: fy, inputs, filings }),
    [invoices, expenses, settings, fy, inputs, filings],
  );
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
  const booksTurnover = useMemo(
    () => computeMetrics(data, fy, today).salesRevenue,
    [data, fy, today],
  );
  const c9 = useMemo(
    () =>
      buildGstr9c({
        gstr9: result,
        booksTurnover,
        values: annual?.gstr9c.values,
        checklist: annual?.gstr9c.checklist,
      }),
    [result, booksTurnover, annual],
  );
  const applicability = annualApplicability({
    bookTurnover: result.totalTurnover,
    settingsAato: settings.gst.aato,
    dueDate: result.dueDate,
  });

  const dates = useMemo(
    () => [...invoices.map((i) => i.invoiceDate), ...expenses.map((e) => e.date)],
    [invoices, expenses],
  );
  const onChange = (rowId: string, head: string, value: string) =>
    void setAnnualValue(fy, "gstr9", `${rowId}.${head}`, value);
  const onReset = (rowId: string) => void resetGstr9Row(fy, rowId);

  const exportCsv = () => {
    const heads = ["taxable", "igst", "cgst", "sgst", "cess", "interest", "payable", "cash", "itc"];
    downloadCsv(
      `gstr9-worksheet-${fy}`,
      ["Table", "Ref", "Particulars", ...heads.map((h) => HEAD_LABELS[h]), "Source"],
      result.rows.map((r) => [
        r.table,
        r.id,
        r.label,
        ...heads.map((h) => (r.heads.includes(h) ? r.values[h] : "")),
        r.overridden.length ? "Manual entry" : r.source,
      ]),
    );
  };

  const printSummary = () => {
    const key = ["4N", "5N", "6O", "7J"];
    ctx.onPrint(
      `GSTR-9 worksheet ${fy}`,
      <div>
        <h1>GSTR-9 worksheet (draft) · {result.fyLabel}</h1>
        <p className="muted">
          {settings.profile.legalName || settings.profile.name} · {result.gstin || "GSTIN not set"}
        </p>
        <p className="note">Draft prepared from your records. Verify with your CA before filing.</p>
        <table>
          <thead>
            <tr>
              <th>Ref</th>
              <th>Particulars</th>
              <th className="num">Taxable</th>
              <th className="num">IGST</th>
              <th className="num">CGST</th>
              <th className="num">SGST</th>
            </tr>
          </thead>
          <tbody>
            {result.rows
              .filter((r) => key.includes(r.id))
              .map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.label}</td>
                  <td className="num">{f.money(r.values.taxable ?? "0")}</td>
                  <td className="num">{f.money(r.values.igst ?? "0")}</td>
                  <td className="num">{f.money(r.values.cgst ?? "0")}</td>
                  <td className="num">{f.money(r.values.sgst ?? "0")}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>,
    );
  };

  const current = SECTIONS.find((s) => s.value === section)!;
  const badChecks = result.checks.filter((c) => !c.ok);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="GSTR-9 annual return worksheet"
          description="Built from a full year of your invoices and expenses. Every number can be traced to its records, and any number can be replaced with your own."
          action={
            <FySelect value={fy} onChange={setFy} dates={dates} today={today} className="w-36" />
          }
          className="flex-col sm:flex-row"
        />
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile label="GSTR-9" value={LEVEL[applicability.gstr9]} />
            <Tile label="GSTR-9C" value={LEVEL[applicability.gstr9c]} />
            <Tile label="Due date (verify)" value={result.dueDate ? f.date(result.dueDate) : "—"} />
          </div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer rounded-sm hover:text-foreground focus-visible:focus-ring">
              Who needs to file, and why we say so
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {applicability.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
              <li>
                Turnover used: {applicability.turnover ? f.money(applicability.turnover) : "none"} (
                {applicability.turnoverSource === "books"
                  ? "from your records for this year"
                  : applicability.turnoverSource === "settings"
                    ? "AATO from Settings"
                    : "not available"}
                ).
              </li>
            </ul>
          </details>
          <p className="text-xs text-muted-foreground">
            Draft only. This worksheet does not file anything. Table numbers follow the GSTR-9 form
            as we know it; rows marked <em>verify</em> must be checked against the live form on the
            GST portal. Check everything with your CA.
          </p>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="secondary" size="sm" onClick={exportCsv}>
              <Download aria-hidden />
              Worksheet CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={printSummary}>
              <Printer aria-hidden />
              Print key totals
            </Button>
          </div>
        </CardContent>
      </Card>

      {result.dataGaps.length > 0 && (
        <Alert
          tone="warning"
          title={`${result.dataGaps.length} document(s) left out for missing data`}
        >
          {result.dataGaps
            .slice(0, 5)
            .map((g) => `${g.number || "(no number)"}: ${g.message}`)
            .join(" · ")}
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Checks against your GSTR-3B build"
          description="The worksheet should agree with the year's GSTR-3B totals from the same records."
        />
        <CardContent>
          <ul className="space-y-1.5 text-sm">
            {result.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                {c.ok ? (
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                )}
                <span>
                  {c.label}
                  {c.ok
                    ? " ✓"
                    : `: difference ${f.money(c.difference)} (${f.money(c.actual)} vs ${f.money(c.expected)})`}
                  {!c.ok && c.explanation && (
                    <span className="block text-xs text-muted-foreground">{c.explanation}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {badChecks.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {result.counts.invoices} documents and {result.counts.expenses} expenses in{" "}
              {result.fyLabel}.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Segmented<Section>
          value={section}
          onValueChange={setSection}
          options={SECTIONS.map((s) => ({ value: s.value, label: s.label }))}
          aria-label="Worksheet section"
          className="min-w-max"
        />
      </div>

      {section === "gstr9c" ? (
        <Gstr9cSection
          fyKey={fy}
          result={c9}
          annual={annual}
          applicability={applicability.gstr9c}
          format={f.money}
        />
      ) : section === "hsn" ? (
        <HsnSection result={result} format={f.money} />
      ) : (
        current.tables.map((t) => {
          const def = GSTR9_TABLES.find((d) => d.id === t)!;
          const rows = gstr9RowsOf(result, t);
          return (
            <Card key={t}>
              <CardHeader title={def.title} description={`${def.part}. ${def.help ?? ""}`} />
              <CardContent>
                <AnnualTable
                  rows={rows}
                  format={f.money}
                  caption={def.title}
                  onChange={onChange}
                  onReset={onReset}
                />
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

function HsnSection({
  result,
  format,
}: {
  result: ReturnType<typeof buildGstr9>;
  format: (v: string) => string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Table 17 · HSN-wise summary of outward supplies"
          description="From your invoice lines, net of credit notes. HSN reporting is mandatory or optional depending on turnover (verify)."
          action={
            <Button
              variant="ghost"
              size="xs"
              disabled={!result.hsnOutward.length}
              onClick={() =>
                downloadCsv(
                  `gstr9-hsn-outward-${result.fyKey}`,
                  ["HSN", "UQC", "Quantity", "Rate", "Taxable", "IGST", "CGST", "SGST", "Cess"],
                  result.hsnOutward.map((h) => [
                    h.hsn,
                    h.uqc,
                    h.qty,
                    h.rate,
                    h.taxable,
                    h.igst,
                    h.cgst,
                    h.sgst,
                    h.cess,
                  ]),
                )
              }
            >
              <Download aria-hidden />
              CSV
            </Button>
          }
        />
        <CardContent>
          {result.hsnOutward.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales in this year.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] border-collapse text-xs">
                <caption className="sr-only">HSN-wise outward supplies</caption>
                <thead className="bg-surface-2 text-muted-foreground">
                  <tr>
                    {["HSN/SAC", "UQC", "Qty", "Rate %", "Taxable", "IGST", "CGST", "SGST"].map(
                      (h, i) => (
                        <th
                          key={h}
                          scope="col"
                          className={`px-2.5 py-2 font-medium ${i < 2 ? "text-left" : "text-right"}`}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {result.hsnOutward.map((h) => {
                    const key = `${h.hsn}|${h.uqc}|${h.rate}`;
                    return (
                      <HsnRowView
                        key={key}
                        row={h}
                        open={open === key}
                        onToggle={() => setOpen(open === key ? null : key)}
                        format={format}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          title="Table 18 · HSN-wise summary of inward supplies"
          description="Your expenses do not carry HSN codes, so only totals by credit type are shown. Prepare the HSN-wise inward summary from your purchase bills."
        />
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[420px] border-collapse text-xs">
              <caption className="sr-only">Inward supplies by type</caption>
              <thead className="bg-surface-2 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-2.5 py-2 text-left font-medium">
                    Type
                  </th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">
                    Bills
                  </th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">
                    Taxable
                  </th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">
                    GST
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.inwardSummary.map((r) => (
                  <tr key={r.id} className="border-t border-border/70">
                    <td className="px-2.5 py-1.5">{r.label}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{r.count}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{format(r.taxable)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{format(r.tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HsnRowView({
  row: h,
  open,
  onToggle,
  format,
}: {
  row: ReturnType<typeof buildGstr9>["hsnOutward"][number];
  open: boolean;
  onToggle: () => void;
  format: (v: string) => string;
}) {
  return (
    <>
      <tr className="border-t border-border/70">
        <td className="px-2.5 py-1.5">
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="rounded-sm text-primary hover:underline focus-visible:focus-ring"
          >
            {h.hsn || "(none)"}
          </button>
        </td>
        <td className="px-2.5 py-1.5">{h.uqc}</td>
        <td className="px-2.5 py-1.5 text-right tabular-nums">{h.qty}</td>
        <td className="px-2.5 py-1.5 text-right tabular-nums">{h.rate}</td>
        <td className="px-2.5 py-1.5 text-right tabular-nums">{format(h.taxable)}</td>
        <td className="px-2.5 py-1.5 text-right tabular-nums">{format(h.igst)}</td>
        <td className="px-2.5 py-1.5 text-right tabular-nums">{format(h.cgst)}</td>
        <td className="px-2.5 py-1.5 text-right tabular-nums">{format(h.sgst)}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="px-2.5 py-2">
            <DrillList items={h.drill} format={format} />
          </td>
        </tr>
      )}
    </>
  );
}
