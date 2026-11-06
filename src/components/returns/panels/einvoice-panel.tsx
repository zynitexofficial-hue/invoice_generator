"use client";

import { ExternalLink, FileJson, FileSpreadsheet, ScanLine, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { saveInvoice } from "@/db/invoices";
import { downloadCsv } from "@/lib/csv";
import {
  DRAFT_DISCLAIMER,
  EINVOICE_CSV_HEADERS,
  EINVOICE_SCHEMA_VERSION,
  PORTAL_LINK_TEXT,
  PORTAL_URL,
  STATE_LABEL,
  countRows,
  einvoiceBulkJson,
  einvoiceCsvRows,
  einvoiceFileBase,
  einvoiceRows,
  isEInvoiceApplicable,
  matchResponse,
  parseIrpResponse,
  reportingWindowDays,
  withExported,
  withIrpEntry,
  type EInvoiceRow,
  type EInvoiceState,
  type ResponseMatch,
} from "@/lib/gst/einvoice";
import { inPeriod, periodLabel } from "@/lib/period";
import type { Invoice } from "@/lib/schema";
import { downloadBlob, plural } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/misc";
import { IrnDialog } from "../einvoice/irn-dialog";
import { IssueList, useRecordLabel } from "../gstr1-tab";
import type { ReturnsTabContext } from "../tab-context";

const STATE_TONE: Record<EInvoiceState, "neutral" | "info" | "success" | "danger"> = {
  todo: "neutral",
  exported: "info",
  generated: "success",
  cancelled: "danger",
};

function Disclaimer() {
  return (
    <Alert tone="warning" title="Draft only: verify against the portal">
      {DRAFT_DISCLAIMER} The file layout (schema version {EINVOICE_SCHEMA_VERSION}) was prepared
      without access to the official schema document, so field names, limits and the bulk-upload
      file shape are unconfirmed.{" "}
      <a
        href={PORTAL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
      >
        {PORTAL_LINK_TEXT}
        <ExternalLink className="size-3" aria-hidden />
      </a>
    </Alert>
  );
}

export function EInvoicePanel({ ctx }: { ctx: ReturnsTabContext }) {
  const { settings, invoices, today, f } = ctx;
  const [nowMs] = useState(() => Date.now());
  const [allPeriods, setAllPeriods] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [imported, setImported] = useState<{ matches: ResponseMatch[]; problems: string[] } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const labelOf = useRecordLabel(invoices);
  const applicable = isEInvoiceApplicable(settings);

  const rows = useMemo(
    () => (applicable ? einvoiceRows({ invoices, settings, today, nowMs }) : []),
    [applicable, invoices, settings, today, nowMs],
  );
  const counts = countRows(rows);
  const visible = allPeriods
    ? rows
    : rows.filter((r) => inPeriod(r.invoice.invoiceDate, ctx.period));
  const window = reportingWindowDays(settings);

  if (!applicable)
    return (
      <Card>
        <EmptyState
          icon={<ScanLine />}
          title="E-invoicing isn't switched on"
          description="E-invoicing applies to businesses with yearly turnover above ₹5 crore (check the current limit on the portal). If it applies to you, switch it on in Settings → GST and this tab will prepare your files."
          action={
            <Button variant="primary" asChild>
              <Link href="/settings?section=gst">Open Settings → GST</Link>
            </Button>
          }
        />
      </Card>
    );

  const exportable = (r: EInvoiceRow) =>
    !r.build.blocked &&
    (r.state === "todo" || r.state === "exported") &&
    r.invoice.status !== "cancelled";
  const chosen = visible.filter((r) => selected.has(r.invoice.id) && exportable(r));
  const batch = chosen.length > 0 ? chosen : visible.filter(exportable);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const base = einvoiceFileBase(settings.profile.gstin.trim().toUpperCase(), today);

  const downloadJson = async () => {
    const builds = batch.map((r) => r.build);
    downloadBlob(
      new Blob([einvoiceBulkJson(builds, { pretty: true })], { type: "application/json" }),
      `${base}.json`,
    );
    const now = new Date().toISOString();
    try {
      for (const r of batch) await saveInvoice(withExported(r.invoice, now));
      toast.success(`Downloaded ${plural(batch.length, "document")}`, {
        description: "Upload the file on the e-invoice portal, then enter the IRNs here.",
      });
    } catch {
      /* reported by guardedWrite */
    }
  };

  const downloadPreview = () => {
    downloadCsv(
      `${base}_preview`,
      EINVOICE_CSV_HEADERS,
      einvoiceCsvRows(batch.map((r) => r.build)),
    );
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseIrpResponse(await file.text());
    setImported({
      matches: matchResponse(
        parsed.entries,
        rows.map((r) => r.invoice),
      ),
      problems: parsed.problems,
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const apply = async () => {
    const ok = imported?.matches.filter((m) => m.reason === "matched" && m.invoice) ?? [];
    try {
      for (const m of ok) await saveInvoice(withIrpEntry(m.invoice!, m.entry));
      toast.success(`Recorded ${plural(ok.length, "IRN")}`);
      setImported(null);
    } catch {
      /* reported by guardedWrite */
    }
  };

  const REASON_TEXT: Record<ResponseMatch["reason"], string> = {
    matched: "Will be recorded",
    no_document: "No document with this number",
    ambiguous: "More than one document has this number",
    no_number: "No document number in the file",
    already_has_irn: "Already has a different IRN: enter it by hand if it is right",
  };
  const matchedCount = imported?.matches.filter((m) => m.reason === "matched").length ?? 0;

  return (
    <div className="space-y-4">
      <Disclaimer />

      {(counts.overdue > 0 || counts.soon > 0 || counts.irnNeedsCancel > 0) && (
        <Alert tone="danger" title="Needs attention">
          <ul className="list-disc pl-4">
            {counts.overdue > 0 && (
              <li>
                {plural(counts.overdue, "document")} past the {window}-day reporting window. Report
                them on the portal now and check the rules for late reporting.
              </li>
            )}
            {counts.soon > 0 && (
              <li>
                {plural(counts.soon, "document")} will pass the {window}-day reporting window within
                5 days.
              </li>
            )}
            {counts.irnNeedsCancel > 0 && (
              <li>
                {plural(counts.irnNeedsCancel, "cancelled document")} still have a live IRN. Cancel
                the IRN on the portal within 24 hours of generating it, otherwise issue a credit
                note.
              </li>
            )}
          </ul>
        </Alert>
      )}

      <Card>
        <CardHeader
          icon={<ScanLine />}
          title="E-invoices"
          description="B2B tax invoices, credit notes and debit notes. Exports, B2C and quotations are not included."
        />
        <div className="grid grid-cols-2 gap-2 px-5 pt-3 sm:grid-cols-4 sm:px-6">
          {(
            [
              ["To do", counts.todo],
              ["Waiting for IRN", counts.exported],
              ["IRN recorded", counts.generated],
              ["Missing data", counts.blocked],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="rounded-xl bg-surface-2/60 px-3 py-2">
              <div className="text-lg font-semibold tabular-nums">{n}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
          <Button
            variant="primary"
            size="lg"
            disabled={batch.length === 0}
            onClick={() => void downloadJson()}
          >
            <FileJson />
            Download IRP JSON ({batch.length})
          </Button>
          <Button disabled={batch.length === 0} onClick={downloadPreview}>
            <FileSpreadsheet />
            CSV preview
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload />
            Import IRP response
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="IRP response file"
            onChange={(ev) => void readFile(ev.target.files?.[0])}
          />
        </div>
        <p className="px-5 pb-4 text-[13px] text-muted-foreground sm:px-6">
          {chosen.length > 0
            ? `Exporting the ${chosen.length} you ticked.`
            : "Exporting every document below that is ready. Tick some to export only those."}{" "}
          Files are draft: upload them on the{" "}
          <a
            href={PORTAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            e-invoice portal
          </a>{" "}
          and read its bulk-upload instructions first. Nothing is sent from this app.
        </p>
      </Card>

      {imported && (
        <Card>
          <CardHeader
            title="IRP response file"
            description={`${plural(imported.matches.length, "row")} read, ${matchedCount} can be matched.`}
          />
          <div className="px-5 py-3 sm:px-6">
            {imported.problems.map((p) => (
              <p key={p} className="text-sm text-warning-foreground">
                {p}
              </p>
            ))}
            <ul className="divide-y divide-border">
              {imported.matches.map((m, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                  <span className="break-all">
                    {m.entry.docNo || m.entry.irn.slice(0, 12) + "…"}
                  </span>
                  <Badge tone={m.reason === "matched" ? "success" : "warning"} size="sm">
                    {REASON_TEXT[m.reason]}
                  </Badge>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" disabled={matchedCount === 0} onClick={() => void apply()}>
                Record {matchedCount} IRN{matchedCount === 1 ? "" : "s"}
              </Button>
              <Button variant="ghost" onClick={() => setImported(null)}>
                Discard
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title={allPeriods ? "All documents" : `Documents in ${periodLabel(ctx.period)}`}
          description={
            window
              ? `Report each invoice within ${window} days of its date (turnover ₹10 crore or more; verify on the portal).`
              : undefined
          }
          action={
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox checked={allPeriods} onCheckedChange={(v) => setAllPeriods(v === true)} />
              All periods
            </label>
          }
        />
        {visible.length === 0 ? (
          <EmptyState
            title="No e-invoice documents here"
            description="B2B tax invoices and credit/debit notes issued in this period appear here."
          />
        ) : (
          <ul className="divide-y divide-border px-5 pb-2 sm:px-6">
            {visible.map((r) => {
              const errors = r.build.issues.filter((i) => i.severity === "error");
              return (
                <li key={r.invoice.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      className="mt-1"
                      aria-label={`Select ${r.invoice.number}`}
                      disabled={!exportable(r)}
                      checked={selected.has(r.invoice.id)}
                      onCheckedChange={() => toggle(r.invoice.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium break-words">{r.invoice.number}</span>
                        <Badge tone={STATE_TONE[r.state]} size="sm">
                          {STATE_LABEL[r.state]}
                        </Badge>
                        {r.invoice.status === "cancelled" && (
                          <Badge tone="danger" size="sm">
                            Cancelled document
                          </Badge>
                        )}
                        {r.reporting.state === "overdue" && (
                          <Badge tone="danger" size="sm">
                            {-(r.reporting.daysLeft ?? 0)} days past window
                          </Badge>
                        )}
                        {r.reporting.state === "soon" && (
                          <Badge tone="warning" size="sm">
                            {r.reporting.daysLeft} days left to report
                          </Badge>
                        )}
                        {r.state === "generated" && r.cancel.state === "open" && (
                          <Badge tone="info" size="sm">
                            IRN cancellable for {r.cancel.hoursLeft}h
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {f.date(r.invoice.invoiceDate)} ·{" "}
                        {r.invoice.customer.company || r.invoice.customer.name} ·{" "}
                        {r.invoice.eInvoice.irn
                          ? `IRN ${r.invoice.eInvoice.irn.slice(0, 10)}…`
                          : "no IRN yet"}
                      </div>
                      {errors.length > 0 && r.state !== "generated" && (
                        <details className="mt-2 rounded-lg border border-border">
                          <summary className="cursor-pointer px-3 py-1.5 text-[13px] text-danger-foreground">
                            {plural(errors.length, "thing")} to fix before export
                          </summary>
                          <IssueList issues={errors} labelOf={labelOf} limit={4} />
                        </details>
                      )}
                    </div>
                    <Button size="sm" onClick={() => setEditing(r.invoice)}>
                      {r.invoice.eInvoice.irn ? "Edit" : "Enter IRN"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editing && (
        <IrnDialog
          key={editing.id}
          invoice={rows.find((r) => r.invoice.id === editing.id)?.invoice ?? editing}
          nowMs={nowMs}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
