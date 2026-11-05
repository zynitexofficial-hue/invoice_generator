"use client";

import { ChevronDown, Download, Printer } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { saveSnapshot, upsertFiling } from "@/db/filings";
import { downloadCsv } from "@/lib/csv";
import {
  DRAFT_NOTE,
  gstr3bRow,
  returnPeriod,
  type Gstr3bResult,
  type Gstr3bRow,
  type TaxHeads,
} from "@/lib/gst/returns";
import { periodKind, periodLabel } from "@/lib/period";
import { filingId, type Filing, type Invoice } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Collapse } from "@/components/ui/collapse";
import { IssueList, useRecordLabel, type Formatters } from "./gstr1-tab";
import {
  GSTR3B_CSV_HEADERS,
  GSTR3B_GROUPS,
  gstr3bCsvRows,
  gstr3bSnapshotTotals,
} from "./returns-data";

const GRID =
  "@3xl:grid @3xl:grid-cols-[minmax(0,1fr)_repeat(4,112px)] @3xl:items-center @3xl:gap-3";

function Cells({ cells, bold }: { cells: [string, string | null][]; bold?: boolean }) {
  return (
    <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm @3xl:contents">
      {cells.map(([label, v]) => (
        <div
          key={label}
          className={cn(
            "flex justify-between gap-2 tabular-nums @3xl:block @3xl:text-right",
            bold && "font-semibold",
            // Empty cells only hold the column on wide layouts.
            v === null && "hidden @3xl:block",
          )}
        >
          <span className="text-xs text-muted-foreground @3xl:sr-only">{label}</span>
          <span className="whitespace-nowrap">{v ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

function HeaderRow({ first, cols }: { first: string; cols: string[] }) {
  return (
    <div
      className={cn(
        "hidden border-y border-border bg-surface-2/60 px-6 py-2 text-xs font-medium text-muted-foreground",
        GRID,
      )}
      aria-hidden
    >
      <span>{first}</span>
      {cols.map((c) => (
        <span key={c} className="text-right">
          {c}
        </span>
      ))}
    </div>
  );
}

function WorksheetRow({ row, f }: { row: Gstr3bRow; f: Formatters }) {
  return (
    <li className={cn("px-5 py-3 sm:px-6", GRID, row.informational && "text-muted-foreground")}>
      <div className="min-w-0 text-sm">
        <span className="mr-1.5 font-semibold text-foreground">
          {row.id === "outward-rcm" ? "Info" : row.id}
        </span>
        {row.label}
      </div>
      <Cells
        bold={row.id === "4C"}
        cells={[
          ["Taxable", row.id.startsWith("4") ? null : f.money(row.taxable)],
          ["IGST", f.money(row.igst)],
          ["CGST", f.money(row.cgst)],
          ["SGST", f.money(row.sgst)],
        ]}
      />
    </li>
  );
}

function HeadsRow({
  label,
  heads,
  f,
  bold,
}: {
  label: string;
  heads: TaxHeads;
  f: Formatters;
  bold?: boolean;
}) {
  return (
    <li className={cn("px-5 py-3 sm:px-6", GRID)}>
      <div className={cn("min-w-0 text-sm", bold && "font-semibold")}>{label}</div>
      <Cells
        bold={bold}
        cells={[
          ["", null],
          ["IGST", f.money(heads.igst)],
          ["CGST", f.money(heads.cgst)],
          ["SGST", f.money(heads.sgst)],
        ]}
      />
    </li>
  );
}

function Gstr3bPrint({ result, gstin, f }: { result: Gstr3bResult; gstin: string; f: Formatters }) {
  const p = result.payable;
  return (
    <div>
      <h1>GSTR-3B worksheet — {periodLabel(result.periodKey)}</h1>
      <p>GSTIN {gstin}</p>
      <p className="muted">Generated {new Date().toLocaleString()}</p>
      <p className="note">
        {DRAFT_NOTE} Tables 3.1 and 3.2 are auto-filled on the portal from GSTR-1; claim ITC only as
        shown in GSTR-2B / IMS.
      </p>
      <table>
        <thead>
          <tr>
            <th>Table</th>
            <th>Description</th>
            <th className="num">Taxable</th>
            <th className="num">IGST</th>
            <th className="num">CGST</th>
            <th className="num">SGST</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.label}</td>
              <td className="num">{f.money(r.taxable)}</td>
              <td className="num">{f.money(r.igst)}</td>
              <td className="num">{f.money(r.cgst)}</td>
              <td className="num">{f.money(r.sgst)}</td>
            </tr>
          ))}
          {result.table32.map((r) => (
            <tr key={r.pos}>
              <td>3.2</td>
              <td>Inter-state to unregistered — {r.posName || r.pos}</td>
              <td className="num">{f.money(r.taxable)}</td>
              <td className="num">{f.money(r.igst)}</td>
              <td className="num" />
              <td className="num" />
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Estimated payable (per head)</h2>
      <table>
        <thead>
          <tr>
            <th />
            <th className="num">IGST</th>
            <th className="num">CGST</th>
            <th className="num">SGST</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ["Output tax", p.outputTax],
              ["Reverse charge (cash)", p.rcmTax],
              ["Net ITC (4C)", p.netItc],
              ["Payable in cash", p.cashPayable],
              ["ITC balance", p.itcBalance],
            ] as const
          ).map(([label, h]) => (
            <tr key={label}>
              <td>{label}</td>
              <td className="num">{f.money(h.igst)}</td>
              <td className="num">{f.money(h.cgst)}</td>
              <td className="num">{f.money(h.sgst)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Notes</h2>
      <ul>
        {result.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

export function Gstr3bTab({
  result,
  gstin,
  invoices,
  filing,
  due,
  f,
  onPrint,
}: {
  result: Gstr3bResult;
  gstin: string;
  invoices: Invoice[];
  filing: Filing | undefined;
  due: string | null;
  f: Formatters;
  onPrint: (title: string, node: ReactNode) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const notesId = useId();
  const labelOf = useRecordLabel(invoices);
  const period = result.periodKey;
  const hasExpenses = result.recordHashes.some((r) => r.kind === "expense");
  const expenseIssues = result.issues.filter((i) => i.recordKind === "expense");
  const p = result.payable;
  const fileBase = `GSTR3B_${gstin || "NOGSTIN"}_${returnPeriod(period)}`;

  const downloadSheet = async () => {
    const now = new Date().toISOString();
    downloadCsv(
      fileBase,
      GSTR3B_CSV_HEADERS,
      gstr3bCsvRows(result, { gstin, generatedAt: now, draftNote: DRAFT_NOTE }),
    );
    try {
      await upsertFiling({
        periodKey: period,
        periodKind: periodKind(period),
        returnType: "GSTR-3B",
        status: filing?.status === "filed" ? "filed" : "exported",
        exportedAt: now,
        dueDate: due ?? "",
      });
      await saveSnapshot({
        filingId: filingId(period, "GSTR-3B"),
        periodKey: period,
        returnType: "GSTR-3B",
        totals: gstr3bSnapshotTotals(result, "exported"),
        records: result.recordHashes,
      });
    } catch {
      /* reported by guardedWrite */
    }
    toast.success("GSTR-3B worksheet downloaded");
  };

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Use this sheet to cross-check">
        Outward liability (3.1/3.2) is auto-filled and locked on the portal from GSTR-1 — use this
        sheet to cross-check. Claim ITC only as shown in your GSTR-2B/IMS.
      </Alert>
      {!hasExpenses && (
        <Alert
          tone="info"
          title="No purchase bills recorded"
          action={
            <Button size="sm" asChild>
              <Link href="/money?tab=out">Open Money</Link>
            </Button>
          }
        >
          ITC shows ₹0. Add expenses in Money.
        </Alert>
      )}

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void downloadSheet()}>
            <Download />
            Download CSV
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              onPrint(`${fileBase}_worksheet`, <Gstr3bPrint result={result} gstin={gstin} f={f} />)
            }
          >
            <Printer />
            Print
          </Button>
        </div>
      </Card>

      {GSTR3B_GROUPS.map((g, gi) => (
        <Card key={g.title} className="overflow-hidden">
          <CardHeader title={g.title} />
          <div className="mt-3">
            <HeaderRow first="Row" cols={["Taxable", "IGST", "CGST", "SGST"]} />
          </div>
          <ul className="divide-y divide-border border-t border-border @3xl:border-t-0">
            {g.ids.map((id) => (
              <WorksheetRow key={id} row={gstr3bRow(result, id)} f={f} />
            ))}
          </ul>
          {gi === 0 && (
            <div className="border-t border-border">
              <div className="px-5 pt-4 pb-1 sm:px-6">
                <h3 className="text-sm font-semibold">
                  3.2 Inter-state supplies to unregistered persons
                </h3>
                <p className="text-xs text-muted-foreground">Part of 3.1(a), by place of supply</p>
              </div>
              {result.table32.length === 0 ? (
                <p className="px-5 pb-4 text-[13px] text-muted-foreground sm:px-6">
                  None this period.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {result.table32.map((r) => (
                    <li key={r.pos} className={cn("px-5 py-2.5 sm:px-6", GRID)}>
                      <div className="text-sm">{r.posName || r.pos}</div>
                      <Cells
                        cells={[
                          ["Taxable", f.money(r.taxable)],
                          ["IGST", f.money(r.igst)],
                          ["", null],
                          [" ", null],
                        ]}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      ))}

      <Card className="@container overflow-hidden">
        <CardHeader
          title="Estimated payable"
          description="Per tax head, after using ITC. Reverse-charge tax is always paid in cash."
        />
        <div className="mt-3">
          <HeaderRow first="" cols={["", "IGST", "CGST", "SGST"]} />
        </div>
        <ul className="divide-y divide-border border-t border-border @3xl:border-t-0">
          <HeadsRow label="Output tax (3.1(a) + 3.1(b))" heads={p.outputTax} f={f} />
          <HeadsRow label="Less: net ITC (4C)" heads={p.netItc} f={f} />
          <HeadsRow label="Add: reverse charge (3.1(d))" heads={p.rcmTax} f={f} />
          <HeadsRow label="Tax payable in cash (estimate)" heads={p.cashPayable} f={f} bold />
          <HeadsRow label="ITC balance carried forward" heads={p.itcBalance} f={f} />
        </ul>
      </Card>

      {expenseIssues.length > 0 && (
        <Card className="@container overflow-hidden">
          <CardHeader
            title="Purchase bill checks"
            description="These don't block anything, but may affect the ITC you can claim."
          />
          <div className="mt-3 border-t border-border">
            <IssueList issues={expenseIssues} labelOf={labelOf} />
          </div>
        </Card>
      )}

      <Card className="@container overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-semibold focus-visible:focus-ring sm:px-6"
          aria-expanded={notesOpen}
          aria-controls={notesId}
          onClick={() => setNotesOpen((o) => !o)}
        >
          About these figures
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              notesOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        <Collapse open={notesOpen} id={notesId}>
          <ul className="list-disc space-y-1.5 border-t border-border py-4 pr-5 pl-9 text-[13px] text-muted-foreground sm:pr-6 sm:pl-10">
            {result.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Collapse>
      </Card>
    </div>
  );
}
