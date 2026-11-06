"use client";

import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getDb } from "@/db/db";
import { useSettings } from "@/db/hooks";
import { todayISO } from "@/lib/dates";
import { downloadBlob } from "@/lib/utils";
import { applyImport, type ImportSummary } from "@/lib/import/apply";
import {
  DELIMITER_LABELS,
  ENCODING_LABELS,
  ImportFileError,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseCsvFile,
  type ParsedCsvFile,
} from "@/lib/import/csv-parse";
import {
  ENTITY_DEFS,
  IMPORT_ENTITIES,
  missingRequired,
  suggestMapping,
  type ColumnMapping,
  type ImportEntity,
} from "@/lib/import/fields";
import {
  buildPlan,
  countPlan,
  entityTemplateName,
  errorReportCsv,
  importableCount,
  templateCsv,
  type DuplicatePolicy,
  type PlanRow,
} from "@/lib/import/plan";
import { validateRows } from "@/lib/import/validate";
import { customerSchema, catalogItemSchema, expenseSchema } from "@/lib/schema";
import { cn, plural } from "@/lib/utils";
import { Page } from "@/components/layout/page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";

type Step = "pick" | "map" | "review" | "done";

const STEP_LABELS: { id: Step; label: string }[] = [
  { id: "pick", label: "Choose file" },
  { id: "map", label: "Match columns" },
  { id: "review", label: "Check and import" },
];

function downloadText(name: string, text: string) {
  downloadBlob(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }), name);
}

export function ImportView() {
  const settings = useSettings();
  const [step, setStep] = useState<Step>("pick");
  const [entity, setEntity] = useState<ImportEntity>("customers");
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState<ParsedCsvFile | null>(null);
  const [fileError, setFileError] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [policy, setPolicy] = useState<DuplicatePolicy>("skip");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const def = ENTITY_DEFS[entity];

  const reset = () => {
    setStep("pick");
    setCsv(null);
    setFileName("");
    setFileError("");
    setPlan([]);
    setSummary(null);
    setPolicy("skip");
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError("");
    if (file.size > MAX_IMPORT_BYTES) {
      setFileError(
        `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_IMPORT_BYTES / 1024 / 1024} MB — split it into smaller files.`,
      );
      return;
    }
    try {
      const parsed = parseCsvFile(new Uint8Array(await file.arrayBuffer()));
      setCsv(parsed);
      setFileName(file.name);
      setMapping(suggestMapping(entity, parsed.headers));
      setStep("map");
    } catch (error) {
      setFileError(
        error instanceof ImportFileError
          ? error.message
          : "Couldn't read this file. Is it a CSV exported from a spreadsheet?",
      );
    }
  };

  const goReview = async () => {
    if (!csv || !settings) return;
    setBusy(true);
    try {
      const db = getDb();
      const [customers, items, expenses] = await Promise.all([
        entity === "customers" ? db.customers.toArray() : Promise.resolve([]),
        entity === "items" ? db.items.toArray() : Promise.resolve([]),
        entity === "expenses" ? db.expenses.toArray() : Promise.resolve([]),
      ]);
      const existing = {
        customers: customers.flatMap((r) => {
          const p = customerSchema.safeParse(r);
          return p.success ? [p.data] : [];
        }),
        items: items.flatMap((r) => {
          const p = catalogItemSchema.safeParse(r);
          return p.success ? [p.data] : [];
        }),
        expenses: expenses.flatMap((r) => {
          const p = expenseSchema.safeParse(r);
          return p.success ? [p.data] : [];
        }),
      };
      const results = validateRows(entity, csv.rows, mapping, { settings, today: todayISO() });
      setPlan(buildPlan(entity, results, existing));
      setStep("review");
    } catch {
      toast.error("Couldn't check the file. Nothing was imported.");
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setBusy(true);
    try {
      setSummary(await applyImport(entity, plan, policy, fileName));
      setStep("done");
    } catch {
      toast.error("The import didn't finish, so nothing was added. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="Import from CSV"
      width="narrow"
      description="Bring customers, items and expenses in from a spreadsheet. The file stays on this device."
    >
      {step !== "done" && <Steps current={step} />}

      {step === "pick" && (
        <PickStep
          entity={entity}
          onEntity={(e) => {
            setEntity(e);
            setFileError("");
          }}
          onFile={onFile}
          error={fileError}
        />
      )}

      {step === "map" && csv && (
        <MapStep
          entity={entity}
          csv={csv}
          fileName={fileName}
          mapping={mapping}
          onMapping={setMapping}
          onBack={reset}
          onNext={goReview}
          busy={busy}
        />
      )}

      {step === "review" && csv && (
        <ReviewStep
          entity={entity}
          csv={csv}
          plan={plan}
          policy={policy}
          onPolicy={setPolicy}
          onBack={() => setStep("map")}
          onImport={doImport}
          busy={busy}
        />
      )}

      {step === "done" && summary && <DoneStep entity={entity} summary={summary} onAgain={reset} />}
      <span className="sr-only">{def.label}</span>
    </Page>
  );
}

/* ---------------- Progress ---------------- */

function Steps({ current }: { current: Step }) {
  const index = STEP_LABELS.findIndex((s) => s.id === current);
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" aria-label="Progress">
      {STEP_LABELS.map((s, i) => (
        <li
          key={s.id}
          aria-current={i === index ? "step" : undefined}
          className={cn(
            "flex items-center gap-2",
            i === index ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full text-xs",
              i <= index ? "bg-primary text-primary-foreground" : "bg-surface-3",
            )}
          >
            {i + 1}
          </span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

/* ---------------- Step 1 ---------------- */

function PickStep({
  entity,
  onEntity,
  onFile,
  error,
}: {
  entity: ImportEntity;
  onEntity: (e: ImportEntity) => void;
  onFile: (f: File | undefined) => void;
  error: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const descId = useId();
  const def = ENTITY_DEFS[entity];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Card>
        <CardHeader title="What are you importing?" />
        <CardContent className="grid gap-4">
          <Segmented
            fullWidth
            value={entity}
            onValueChange={onEntity}
            options={IMPORT_ENTITIES.map((e) => ({ value: e, label: ENTITY_DEFS[e].label }))}
            aria-label="Type of records"
          />
          <p id={descId} className="text-sm text-muted-foreground">
            {def.description} A row counts as a duplicate when it has the{" "}
            <span className="font-medium text-foreground">{def.duplicateRule.toLowerCase()}</span>.
          </p>
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => downloadText(`${entityTemplateName(entity)}.csv`, templateCsv(entity))}
            >
              <Download />
              Download a {def.singular} template
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Choose your CSV file" />
        <CardContent className="grid gap-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              onFile(e.dataTransfer.files[0]);
            }}
            className={cn(
              "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors",
              dragging ? "border-primary bg-primary-soft" : "border-border",
            )}
          >
            <FileSpreadsheet className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">Drop a .csv file here, or</p>
            <Button variant="primary" onClick={() => inputRef.current?.click()}>
              <Upload />
              Choose file
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="sr-only"
              aria-label="CSV file"
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Up to {MAX_IMPORT_BYTES / 1024 / 1024} MB and {MAX_IMPORT_ROWS.toLocaleString("en-IN")}{" "}
            rows per file. Comma, semicolon, tab and pipe separators work. Excel: use File, Save as,
            CSV.
          </p>
          {error && (
            <Alert tone="danger" title="Can't use this file">
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Step 2 ---------------- */

function MapStep({
  entity,
  csv,
  fileName,
  mapping,
  onMapping,
  onBack,
  onNext,
  busy,
}: {
  entity: ImportEntity;
  csv: ParsedCsvFile;
  fileName: string;
  mapping: ColumnMapping;
  onMapping: (m: ColumnMapping) => void;
  onBack: () => void;
  onNext: () => void;
  busy: boolean;
}) {
  const def = ENTITY_DEFS[entity];
  const missing = missingRequired(entity, mapping);
  const options = useMemo(
    () => [
      { value: "-1", label: "Don't import" },
      ...csv.headers.map((h, i) => ({ value: String(i), label: h })),
    ],
    [csv.headers],
  );
  const sample = (idx: number) =>
    idx < 0
      ? ""
      : csv.rows
          .slice(0, 3)
          .map((r) => r[idx])
          .filter(Boolean)
          .join(" · ");
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Alert tone="info" title={fileName}>
        {plural(csv.rows.length, "row")}, {csv.headers.length} columns · separator:{" "}
        {DELIMITER_LABELS[csv.delimiter]} · encoding: {ENCODING_LABELS[csv.encoding]}
      </Alert>
      {csv.raggedRows > 0 && (
        <Alert tone="warning">
          {plural(csv.raggedRows, "row has", "rows have")} a different number of cells than the
          header. Missing cells are treated as empty and extra cells are ignored.
        </Alert>
      )}
      {csv.unterminatedQuote && (
        <Alert tone="warning">
          A quotation mark in the file was never closed, so some rows may be merged. Check the file
          in a spreadsheet.
        </Alert>
      )}
      <Card>
        <CardHeader
          title="Match your columns"
          description="We guessed from the column names. Change any that look wrong."
        />
        <CardContent className="grid gap-1">
          <div className="hidden grid-cols-[1fr_1fr_1.2fr] gap-3 px-1 pb-1 text-xs font-medium text-muted-foreground sm:grid">
            <span>Field</span>
            <span>Your column</span>
            <span>Examples from your file</span>
          </div>
          {def.fields.map((f) => {
            const idx = mapping[f.key] ?? -1;
            return (
              <div
                key={f.key}
                className="grid gap-1.5 border-t border-border py-3 sm:grid-cols-[1fr_1fr_1.2fr] sm:items-center sm:gap-3"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium">{f.label}</span>
                  {f.required && (
                    <span className="ml-1 text-danger-foreground" aria-label="required">
                      *
                    </span>
                  )}
                  {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                </div>
                <Select
                  value={String(idx)}
                  onValueChange={(v) => onMapping({ ...mapping, [f.key]: Number(v) })}
                  options={options}
                  aria-label={`Column for ${f.label}`}
                />
                <p className="truncate text-xs text-muted-foreground" title={sample(idx)}>
                  {sample(idx) || "—"}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>
      {missing.length > 0 && (
        <Alert tone="warning">
          Pick a column for {missing.map((f) => f.label).join(" and ")} to continue.
        </Alert>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft />
          Choose another file
        </Button>
        <Button variant="primary" onClick={onNext} disabled={missing.length > 0} loading={busy}>
          Check the rows
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Step 3 ---------------- */

type Filter = "all" | "problems" | "duplicates" | "ready";
const PAGE = 100;

const STATUS_BADGE: Record<
  PlanRow["status"],
  { label: string; tone: "success" | "danger" | "warning" | "neutral" }
> = {
  new: { label: "Ready", tone: "success" },
  error: { label: "Error", tone: "danger" },
  duplicate: { label: "Already saved", tone: "warning" },
  duplicate_in_file: { label: "Repeated in file", tone: "neutral" },
};

function ReviewStep({
  entity,
  csv,
  plan,
  policy,
  onPolicy,
  onBack,
  onImport,
  busy,
}: {
  entity: ImportEntity;
  csv: ParsedCsvFile;
  plan: PlanRow[];
  policy: DuplicatePolicy;
  onPolicy: (p: DuplicatePolicy) => void;
  onBack: () => void;
  onImport: () => void;
  busy: boolean;
}) {
  const def = ENTITY_DEFS[entity];
  const counts = countPlan(plan);
  const willImport = importableCount(plan, policy);
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);
  const shown = plan.filter((p) =>
    filter === "all"
      ? true
      : filter === "problems"
        ? p.status === "error" || p.warnings.length > 0
        : filter === "duplicates"
          ? p.status === "duplicate" || p.status === "duplicate_in_file"
          : p.status === "new",
  );
  const summaryKeys = def.fields.slice(0, 3).map((f) => f.key);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Ready" value={counts.new} tone="success" />
        <Stat
          label="Already saved"
          value={counts.duplicate + counts.duplicateInFile}
          tone="warning"
        />
        <Stat label="With errors" value={counts.error} tone={counts.error ? "danger" : "neutral"} />
        <Stat label="Rows in file" value={counts.total} tone="neutral" />
      </div>

      {counts.error > 0 && (
        <Alert
          tone="warning"
          title={`${plural(counts.error, "row has", "rows have")} errors and will be left out`}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                downloadText(
                  `${def.plural}-import-errors.csv`,
                  errorReportCsv(csv.headers, csv.rows, plan),
                )
              }
            >
              <Download />
              Error report
            </Button>
          }
        >
          Fix them in your spreadsheet and import that file again, or carry on with the valid rows.
        </Alert>
      )}

      {counts.duplicate > 0 && (
        <Card>
          <CardHeader
            title={`${plural(counts.duplicate, def.singular)} already saved`}
            description={`Matched by: ${def.duplicateRule.toLowerCase()}.`}
          />
          <CardContent>
            <Segmented
              value={policy}
              onValueChange={onPolicy}
              fullWidth
              aria-label="What to do with duplicates"
              options={[
                { value: "skip", label: "Skip them" },
                { value: "merge", label: "Fill in details" },
                { value: "add", label: "Add anyway" },
              ]}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {policy === "skip" && "Saved records stay exactly as they are."}
              {policy === "merge" &&
                "Saved records keep their identity; any cell filled in your file replaces the saved value."}
              {policy === "add" &&
                "Adds a second record for each. Use this only if they really are different."}
              {counts.duplicateInFile > 0 &&
                ` ${plural(counts.duplicateInFile, "row repeats", "rows repeat")} an earlier row of this file and is always skipped.`}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader title="Rows" />
        <div className="px-5 pb-3">
          <Segmented
            size="sm"
            value={filter}
            onValueChange={(f) => {
              setFilter(f);
              setLimit(PAGE);
            }}
            aria-label="Filter rows"
            options={[
              { value: "all", label: "All" },
              { value: "problems", label: "Problems" },
              { value: "duplicates", label: "Duplicates" },
              { value: "ready", label: "Ready" },
            ]}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-y border-border bg-surface-2/60 text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-2.5">Line</th>
                <th className="px-4 py-2.5">Status</th>
                {summaryKeys.map((k) => (
                  <th key={k} className="px-4 py-2.5">
                    {def.fields.find((f) => f.key === k)?.label}
                  </th>
                ))}
                <th className="px-4 py-2.5">Notes</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, limit).map((p) => {
                const badge = STATUS_BADGE[p.status];
                return (
                  <tr key={p.line} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{p.line}</td>
                    <td className="px-4 py-2.5">
                      <Badge size="sm" tone={badge.tone}>
                        {badge.label}
                      </Badge>
                    </td>
                    {summaryKeys.map((k) => (
                      <td key={k} className="max-w-[12rem] truncate px-4 py-2.5">
                        {p.raw[k] || "—"}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-xs">
                      {p.errors.map((m) => (
                        <p key={m} className="text-danger-foreground">
                          {m}
                        </p>
                      ))}
                      {p.warnings.map((m) => (
                        <p key={m} className="text-warning-foreground">
                          {m}
                        </p>
                      ))}
                      {p.matchLabel && <p className="text-muted-foreground">{p.matchLabel}</p>}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td
                    colSpan={summaryKeys.length + 3}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No rows to show here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {shown.length > limit && (
          <div className="flex justify-center p-3">
            <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, shown.length - limit)} more of {shown.length - limit}
            </Button>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft />
          Back
        </Button>
        <Button variant="primary" onClick={onImport} disabled={willImport === 0} loading={busy}>
          Import {plural(willImport, def.singular, def.plural)}
        </Button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "danger" && "text-danger-foreground",
          tone === "warning" && "text-warning-foreground",
          tone === "success" && "text-success-foreground",
        )}
      >
        {value.toLocaleString("en-IN")}
      </p>
    </div>
  );
}

/* ---------------- Step 4 ---------------- */

const DONE_LINKS: Record<ImportEntity, { href: string; label: string }> = {
  customers: { href: "/customers", label: "View customers" },
  items: { href: "/items", label: "View items" },
  expenses: { href: "/money?tab=out", label: "View expenses" },
};

function DoneStep({
  entity,
  summary,
  onAgain,
}: {
  entity: ImportEntity;
  summary: ImportSummary;
  onAgain: () => void;
}) {
  const def = ENTITY_DEFS[entity];
  const link = DONE_LINKS[entity];
  return (
    <Card>
      <CardContent className="grid justify-items-center gap-3 py-10 text-center">
        <CircleCheck className="size-10 text-success" aria-hidden />
        <h2 className="text-lg font-semibold" role="status">
          Import finished
        </h2>
        <p className="text-sm text-muted-foreground">
          {plural(summary.created, def.singular, def.plural)} added
          {summary.merged ? `, ${summary.merged} updated` : ""}
          {summary.skipped ? `, ${summary.skipped} skipped` : ""}
          {summary.failed ? `, ${plural(summary.failed, "row")} left out because of errors` : ""}.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" asChild>
            <Link href={link.href}>{link.label}</Link>
          </Button>
          <Button variant="secondary" onClick={onAgain}>
            Import another file
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
