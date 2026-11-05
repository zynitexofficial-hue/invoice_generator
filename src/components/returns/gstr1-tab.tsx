"use client";

import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Download,
  FileJson,
  Info,
  Printer,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { saveSnapshot, upsertFiling } from "@/db/filings";
import { downloadCsv } from "@/lib/csv";
import {
  DRAFT_NOTE,
  gstr1Csv,
  gstr1FileBase,
  gstr1JsonFile,
  type Gstr1Result,
  type ReturnIssue,
} from "@/lib/gst/returns";
import { periodKind, periodLabel } from "@/lib/period";
import { filingId, type Filing, type Invoice } from "@/lib/schema";
import { cn, downloadBlob, plural } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Collapse } from "@/components/ui/collapse";
import {
  countIssues,
  excludedForPeriod,
  gstr1SnapshotRecords,
  gstr1SnapshotTotals,
  issueHref,
  sectionRows,
  sortIssues,
  type DetailItem,
  type SectionRow,
} from "./returns-data";

export interface Formatters {
  money: (v: string) => string;
  date: (iso: string) => string;
}

const ISSUE_ICON = {
  error: <CircleAlert className="text-danger-foreground" aria-hidden />,
  warning: <TriangleAlert className="text-warning-foreground" aria-hidden />,
  info: <Info className="text-info-foreground" aria-hidden />,
};
const SEVERITY_LABEL = { error: "Must fix", warning: "Check", info: "Note" };

/** Name of the record an issue is about ("INV/26-27/004", "Settings"). */
export function useRecordLabel(invoices: Invoice[]) {
  return useMemo(() => {
    const byId = new Map(invoices.map((i) => [i.id, i]));
    return (issue: ReturnIssue): string => {
      if (issue.recordKind === "invoice") {
        const inv = byId.get(issue.recordId);
        return inv ? inv.number || "Document without number" : "Document";
      }
      if (issue.recordKind === "expense") return "Expense";
      if (issue.recordKind === "settings") return "Settings";
      return "Whole period";
    };
  }, [invoices]);
}

export function IssueList({
  issues,
  labelOf,
  limit = 6,
}: {
  issues: ReturnIssue[];
  labelOf: (i: ReturnIssue) => string;
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  const sorted = sortIssues(issues);
  const visible = all ? sorted : sorted.slice(0, limit);
  return (
    <>
      <ul className="divide-y divide-border">
        {visible.map((issue, idx) => {
          const href = issueHref(issue);
          return (
            <li
              key={`${issue.code}-${issue.recordId}-${idx}`}
              className="flex items-start gap-3 px-5 py-3 sm:px-6"
            >
              <span className="mt-0.5 shrink-0 [&_svg]:size-4">{ISSUE_ICON[issue.severity]}</span>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">
                  <span className="sr-only">{SEVERITY_LABEL[issue.severity]}: </span>
                  {labelOf(issue)}
                </div>
                <p className="text-sm break-words">{issue.message}</p>
              </div>
              {href && (
                <Button variant="secondary" size="xs" asChild>
                  <Link href={href} aria-label={`Fix: ${labelOf(issue)}`}>
                    Fix
                  </Link>
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {sorted.length > limit && (
        <div className="border-t border-border px-5 py-2 sm:px-6">
          <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
            {all ? "Show fewer" : `Show all ${sorted.length}`}
          </Button>
        </div>
      )}
    </>
  );
}

function ChecksPanel({
  issues,
  labelOf,
}: {
  issues: ReturnIssue[];
  labelOf: (i: ReturnIssue) => string;
}) {
  const { errors, warnings, infos } = countIssues(issues);
  if (issues.length === 0)
    return (
      <Alert tone="success" title="Checks passed">
        Nothing blocks this return. Review the summary below before downloading.
      </Alert>
    );
  return (
    <Card className="@container overflow-hidden">
      <CardHeader
        title="Checks"
        icon={errors ? <CircleAlert /> : <CircleCheck />}
        description={
          errors
            ? "Fix the items marked in red before you can download the return."
            : "Nothing blocks the download, but have a look at these."
        }
        action={
          <div className="flex flex-wrap justify-end gap-1">
            {errors > 0 && (
              <Badge size="sm" tone="danger">
                {plural(errors, "error")}
              </Badge>
            )}
            {warnings > 0 && (
              <Badge size="sm" tone="warning">
                {plural(warnings, "warning")}
              </Badge>
            )}
            {infos > 0 && (
              <Badge size="sm" tone="info">
                {plural(infos, "note")}
              </Badge>
            )}
          </div>
        }
      />
      <div className="mt-3 border-t border-border">
        <IssueList issues={issues} labelOf={labelOf} />
      </div>
    </Card>
  );
}

const ROW_GRID =
  "@4xl:grid @4xl:grid-cols-[minmax(0,1fr)_48px_repeat(4,104px)_16px] @4xl:items-center @4xl:gap-3";

function Amounts({
  row,
  f,
  bold,
}: {
  row: Omit<DetailItem, "id" | "title" | "subtitle">;
  f: Formatters;
  bold?: boolean;
}) {
  const cells: [string, string][] = [
    ["Taxable", row.taxable],
    ["IGST", row.igst],
    ["CGST", row.cgst],
    ["SGST", row.sgst],
  ];
  return (
    <>
      {cells.map(([label, v]) => (
        <div
          key={label}
          className={cn(
            "flex justify-between gap-2 tabular-nums @4xl:block @4xl:text-right",
            bold && "font-semibold",
          )}
        >
          <span className="text-xs text-muted-foreground @4xl:sr-only">{label}</span>
          <span className="whitespace-nowrap">{f.money(v)}</span>
        </div>
      ))}
    </>
  );
}

function SectionLine({ row, f }: { row: SectionRow; f: Formatters }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const empty = row.count === 0;
  const head = (
    <>
      <div className="min-w-0">
        <div className="text-sm font-medium">{row.label}</div>
        <div className="text-xs text-muted-foreground">{row.hint}</div>
      </div>
      <div className="mt-1 text-sm tabular-nums @4xl:mt-0 @4xl:text-right">
        <span className="text-xs text-muted-foreground @4xl:sr-only">Count </span>
        {row.count}
      </div>
      {row.hasValues ? (
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm @4xl:contents">
          <Amounts row={row} f={f} />
        </div>
      ) : (
        <div className="hidden @4xl:col-span-4 @4xl:block" />
      )}
    </>
  );
  if (empty)
    return (
      <li
        className={cn("px-5 py-3 opacity-60 sm:px-6", ROW_GRID)}
        aria-label={`${row.label}: none`}
      >
        {head}
      </li>
    );
  return (
    <li>
      <button
        type="button"
        className={cn(
          "w-full px-5 py-3 text-left hover:bg-surface-2/60 focus-visible:focus-ring sm:px-6",
          ROW_GRID,
        )}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {head}
        <ChevronDown
          className={cn(
            "hidden size-4 text-muted-foreground transition-transform @4xl:block",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      <Collapse open={open} id={id}>
        <ul className="border-t border-dashed border-border bg-surface-2/40">
          {row.details.map((d) => (
            <li key={d.id} className={cn("px-5 py-2.5 text-[13px] sm:px-6", ROW_GRID)}>
              <div className="min-w-0 @4xl:col-span-2 @4xl:pl-3">
                {d.href ? (
                  <Link href={d.href} className="font-medium text-primary hover:underline">
                    {d.title}
                  </Link>
                ) : (
                  <span className="font-medium">{d.title}</span>
                )}
                <div className="text-xs break-words text-muted-foreground">{d.subtitle}</div>
              </div>
              {row.hasValues && row.key !== "nil" ? (
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 @4xl:contents">
                  <Amounts row={d} f={f} />
                </div>
              ) : row.key === "nil" ? (
                <div className="mt-1 flex justify-between @4xl:col-span-1 @4xl:mt-0 @4xl:block @4xl:text-right">
                  <span className="text-xs text-muted-foreground @4xl:sr-only">Total</span>
                  <span className="tabular-nums">{f.money(d.taxable)}</span>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Collapse>
    </li>
  );
}

function SummaryTable({
  rows,
  result,
  f,
}: {
  rows: SectionRow[];
  result: Gstr1Result;
  f: Formatters;
}) {
  const g = result.grandTotals;
  const [showEmpty, setShowEmpty] = useState(false);
  const emptyCount = rows.filter((r) => r.count === 0).length;
  const visible = showEmpty ? rows : rows.filter((r) => r.count > 0);
  return (
    <Card className="@container overflow-hidden">
      <CardHeader
        title="Summary"
        description="Tap a section to see its documents. Credit notes reduce the totals."
      />
      <div
        className={cn(
          "mt-3 hidden border-y border-border bg-surface-2/60 px-6 py-2.5 text-xs font-medium text-muted-foreground",
          ROW_GRID,
        )}
        aria-hidden
      >
        <span>Section</span>
        <span className="text-right">Count</span>
        <span className="text-right">Taxable</span>
        <span className="text-right">IGST</span>
        <span className="text-right">CGST</span>
        <span className="text-right">SGST</span>
        <span />
      </div>
      <ul className="mt-3 divide-y divide-border border-t border-border @4xl:mt-0 @4xl:border-t-0">
        {visible.map((r) => (
          <SectionLine key={r.key} row={r} f={f} />
        ))}
        {visible.length === 0 && (
          <li className="px-5 py-4 text-sm text-muted-foreground sm:px-6">
            Nothing to report this period — this would be a nil return.
          </li>
        )}
      </ul>
      {emptyCount > 0 && (
        <div className="border-t border-border px-5 py-2 sm:px-6">
          <Button variant="ghost" size="sm" onClick={() => setShowEmpty((v) => !v)}>
            {showEmpty ? "Hide empty sections" : `Show ${emptyCount} empty sections`}
          </Button>
        </div>
      )}
      <div
        className={cn("border-t border-border bg-surface-2/60 px-5 py-3 text-sm sm:px-6", ROW_GRID)}
      >
        <div className="font-semibold">Total of supplies</div>
        <div className="mt-1 tabular-nums @4xl:mt-0 @4xl:text-right">
          <span className="text-xs text-muted-foreground @4xl:sr-only">Documents </span>
          {g.count}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 @4xl:contents">
          <Amounts row={g} f={f} bold />
        </div>
      </div>
    </Card>
  );
}

function NotIncluded({ result, f }: { result: Gstr1Result; f: Formatters }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rows = excludedForPeriod(result.excluded);
  if (rows.length === 0) return null;
  return (
    <Card className="@container overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left focus-visible:focus-ring sm:px-6"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <span>
          <span className="block text-sm font-semibold">Not included ({rows.length})</span>
          <span className="block text-xs text-muted-foreground">
            Drafts, quotations, cancelled documents and others left out of this return
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      <Collapse open={open} id={id}>
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((e) => (
            <li
              key={e.invoiceId}
              className="flex flex-wrap items-baseline gap-x-3 px-5 py-2.5 text-[13px] sm:px-6"
            >
              <Link
                href={`/invoice?id=${encodeURIComponent(e.invoiceId)}`}
                className="font-medium text-primary hover:underline"
              >
                {e.number || "No number"}
              </Link>
              {e.date && <span className="text-muted-foreground">{f.date(e.date)}</span>}
              <span className="w-full text-muted-foreground sm:w-auto sm:flex-1">{e.message}</span>
            </li>
          ))}
        </ul>
      </Collapse>
    </Card>
  );
}

export function Gstr1PrintSummary({
  result,
  rows,
  f,
}: {
  result: Gstr1Result;
  rows: SectionRow[];
  f: Formatters;
}) {
  const { errors, warnings } = countIssues(result.issues);
  const excluded = excludedForPeriod(result.excluded);
  return (
    <div>
      <h1>GSTR-1 summary — {periodLabel(result.periodKey)}</h1>
      <p>GSTIN {result.gstin}</p>
      <p className="muted">Generated {new Date().toLocaleString()}</p>
      <p className="note">{DRAFT_NOTE}</p>
      <table>
        <thead>
          <tr>
            <th>Section</th>
            <th className="num">Count</th>
            <th className="num">Taxable</th>
            <th className="num">IGST</th>
            <th className="num">CGST</th>
            <th className="num">SGST</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              <td className="num">{r.count}</td>
              <td className="num">{r.hasValues ? f.money(r.taxable) : ""}</td>
              <td className="num">{r.hasValues ? f.money(r.igst) : ""}</td>
              <td className="num">{r.hasValues ? f.money(r.cgst) : ""}</td>
              <td className="num">{r.hasValues ? f.money(r.sgst) : ""}</td>
            </tr>
          ))}
          <tr>
            <th>Total of supplies</th>
            <th className="num">{result.grandTotals.count}</th>
            <th className="num">{f.money(result.grandTotals.taxable)}</th>
            <th className="num">{f.money(result.grandTotals.igst)}</th>
            <th className="num">{f.money(result.grandTotals.cgst)}</th>
            <th className="num">{f.money(result.grandTotals.sgst)}</th>
          </tr>
        </tbody>
      </table>
      <p>
        Checks: {plural(errors, "error")}, {plural(warnings, "warning")}.
      </p>
      {excluded.length > 0 && (
        <>
          <h2>Not included</h2>
          <table>
            <tbody>
              {excluded.map((e) => (
                <tr key={e.invoiceId}>
                  <td>{e.number || "No number"}</td>
                  <td>{e.date ? f.date(e.date) : ""}</td>
                  <td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Gstr1Tab({
  result,
  invoices,
  filing,
  due,
  f,
  onPrint,
}: {
  result: Gstr1Result;
  invoices: Invoice[];
  filing: Filing | undefined;
  due: string | null;
  f: Formatters;
  onPrint: (title: string, node: ReactNode) => void;
}) {
  const labelOf = useRecordLabel(invoices);
  const rows = useMemo(() => {
    const byId = new Map(invoices.map((i) => [i.id, i.customer.name]));
    return sectionRows(result, { partyOf: (id) => byId.get(id) ?? "", formatDate: f.date });
  }, [result, invoices, f.date]);
  const [busy, setBusy] = useState<"json" | "csv" | null>(null);
  const period = result.periodKey;
  const { errors } = countIssues(result.issues);

  const downloadJson = async () => {
    setBusy("json");
    try {
      const now = new Date().toISOString();
      const json = gstr1JsonFile(result, { generatedAt: now });
      downloadBlob(new Blob([json], { type: "application/json" }), `${gstr1FileBase(result)}.json`);
      await upsertFiling({
        periodKey: period,
        periodKind: periodKind(period),
        returnType: "GSTR-1",
        status: filing?.status === "filed" ? "filed" : "exported",
        exportedAt: now,
        dueDate: due ?? "",
      });
      await saveSnapshot({
        filingId: filingId(period, "GSTR-1"),
        periodKey: period,
        returnType: "GSTR-1",
        totals: gstr1SnapshotTotals(result, "exported"),
        records: gstr1SnapshotRecords(result),
      });
      toast.success("GSTR-1 JSON downloaded", {
        description: "Upload it in the GST portal's offline tool, then mark the return as filed.",
      });
    } catch {
      /* storage errors are reported by guardedWrite */
    } finally {
      setBusy(null);
    }
  };

  const downloadCsvs = async () => {
    setBusy("csv");
    const files = gstr1Csv(result);
    for (let i = 0; i < files.length; i++) {
      if (i > 0) await wait(400); // browsers drop downloads started in the same tick
      downloadCsv(files[i].filename.replace(/\.csv$/, ""), files[i].headers, files[i].rows);
    }
    setBusy(null);
    toast.success(`Downloaded ${plural(files.length, "CSV file")}`);
  };

  return (
    <div className="space-y-4">
      <ChecksPanel issues={result.issues} labelOf={labelOf} />

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            variant="primary"
            size="lg"
            onClick={() => void downloadJson()}
            disabled={result.hasErrors}
            loading={busy === "json"}
            aria-describedby={result.hasErrors ? "gstr1-blocked" : undefined}
          >
            <FileJson />
            Download GSTR-1 JSON
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void downloadCsvs()} loading={busy === "csv"}>
              <Download />
              Download CSV files
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                onPrint(
                  `${gstr1FileBase(result)}_summary`,
                  <Gstr1PrintSummary result={result} rows={rows} f={f} />,
                )
              }
            >
              <Printer />
              Print summary
            </Button>
          </div>
        </div>
        {result.hasErrors ? (
          <p id="gstr1-blocked" className="mt-3 text-[13px] text-danger-foreground">
            Fix {plural(errors, "error")} above to download the JSON.
          </p>
        ) : (
          <p className="mt-3 text-[13px] text-muted-foreground">
            Upload the JSON in the GST portal (Returns → GSTR-1 → Prepare offline) and check the
            figures there before you submit.
          </p>
        )}
      </Card>

      <SummaryTable rows={rows} result={result} f={f} />
      <NotIncluded result={result} f={f} />
    </div>
  );
}
