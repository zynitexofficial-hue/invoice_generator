"use client";

import { Download, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteGstr2bImportWithMatches } from "@/db/gstr2b";
import { downloadCsv } from "@/lib/csv";
import { bookTax } from "@/lib/gst/gstr2b";
import { itcReconReport } from "@/lib/analytics/itc-recon";
import { monthsInPeriod, periodLabel } from "@/lib/period";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { confirm } from "@/components/ui/confirm";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/misc";
import type { ReturnsTabContext } from "../tab-context";
import { ImportCard } from "./import-card";
import { ReconList } from "./recon-list";
import { useReconData } from "./use-recon";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Gstr2bView({ ctx }: { ctx: ReturnsTabContext }) {
  const data = useReconData();
  const months = useMemo(() => monthsInPeriod(ctx.period), [ctx.period]);
  const [picked, setPicked] = useState<string>("");
  const { f } = ctx;

  const imports = data.imports;
  const forPeriod = imports.filter((i) => months.includes(i.periodKey));
  const current =
    data.recons.find((r) => r.imp.id === picked) ??
    data.recons.find((r) => r.imp.id === forPeriod[0]?.id) ??
    data.recons[0];

  const report = useMemo(
    () =>
      current
        ? itcReconReport([
            { importId: current.imp.id, periodKey: current.imp.periodKey, result: current.result },
          ])
        : undefined,
    [current],
  );

  if (data.loading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const exportCsv = () => {
    if (!current) return;
    const { imp, result } = current;
    const rows: (string | number)[][] = [];
    for (const m of result.matches)
      rows.push([
        m.status,
        m.row.supplierGstin,
        m.row.supplierName,
        m.row.docNo,
        m.row.docDate,
        m.row.taxable,
        bookTax(m.row).toFixed(2),
        m.book.label,
        m.taxableDiff,
        m.taxDiff,
        m.reasons.join("; "),
      ]);
    for (const r of result.missingInBooks)
      rows.push([
        "missing in books",
        r.supplierGstin,
        r.supplierName,
        r.docNo,
        r.docDate,
        r.taxable,
        bookTax(r).toFixed(2),
        "",
        "",
        "",
        "",
      ]);
    for (const b of result.missingIn2B)
      rows.push([
        "missing in 2B",
        b.gstin,
        b.name,
        b.docNo,
        b.date,
        b.taxable,
        bookTax(b).toFixed(2),
        b.label,
        "",
        "",
        "",
      ]);
    downloadCsv(
      `GSTR2B_reconciliation_${imp.periodKey}`,
      [
        "Status",
        "Supplier GSTIN",
        "Supplier",
        "Document no",
        "Date",
        "Taxable (2B or books)",
        "Tax",
        "Your record",
        "Taxable difference (books - 2B)",
        "Tax difference (books - 2B)",
        "Notes",
      ],
      rows,
    );
  };

  const remove = async () => {
    if (!current) return;
    const ok = await confirm({
      title: `Delete the ${current.imp.periodKey} import?`,
      description:
        "The imported rows and your match decisions are removed. Your bills are not touched.",
      confirmLabel: "Delete import",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteGstr2bImportWithMatches(current.imp.id);
      setPicked("");
      toast.success("Import deleted");
    } catch {
      /* reported */
    }
  };

  const defaultPeriod = months[0] ?? "";
  const t = report?.totals;

  return (
    <div className="space-y-4">
      <Alert tone="info" title="GSTR-2B shows the ITC you can claim">
        Import your GSTR-2B to see which purchase bills are reported by your suppliers. This is a
        draft check prepared from your records; the GST portal is the source of truth. Nothing
        leaves this device.
      </Alert>

      <ImportCard
        key={imports.length}
        defaultPeriod={defaultPeriod}
        gstin={ctx.settings.profile.gstin}
        existing={imports}
        onImported={(id) => setPicked(id)}
      />

      {!current && (
        <Card className="p-5 text-sm text-muted-foreground">
          No GSTR-2B imported yet. Import a file above to start matching.{" "}
          <Link href="/money?tab=bills" className="font-medium text-foreground underline">
            Open purchase bills
          </Link>
        </Card>
      )}

      {current && report && t && (
        <>
          <Card>
            <CardHeader
              title={`GSTR-2B for ${periodLabel(current.imp.periodKey)}`}
              description={`${current.imp.rows.length} documents from ${current.imp.fileName || "manual entry"}${
                current.imp.gstin ? ` · GSTIN ${current.imp.gstin}` : ""
              }`}
              action={
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={exportCsv}>
                    <Download /> CSV
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Delete this import"
                    onClick={() => void remove()}
                  >
                    <Trash2 />
                  </Button>
                </div>
              }
            />
            <div className="space-y-4 px-5 pt-3 pb-5 sm:px-6">
              {imports.length > 1 && (
                <Select
                  aria-label="Choose import"
                  value={current.imp.id}
                  onValueChange={setPicked}
                  options={imports.map((i) => ({
                    value: i.id,
                    label: `${periodLabel(i.periodKey)} · ${i.rows.length} documents`,
                  }))}
                  className="max-w-xs"
                />
              )}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat
                  label="Matched"
                  value={String(t.matched.count)}
                  sub={`ITC ${f.money(t.matched.itc)}`}
                />
                <Stat
                  label="Need review"
                  value={String(t.probable.count + t.mismatched.count)}
                  sub={`${t.mismatched.count} with different values`}
                />
                <Stat
                  label="In 2B, not in books"
                  value={String(t.missingInBooks.count)}
                  sub={`ITC ${f.money(t.missingInBooks.itc)}`}
                />
                <Stat
                  label="In books, not in 2B"
                  value={String(t.missingIn2B.count)}
                  sub={`ITC at risk ${f.money(t.missingIn2B.itc)}`}
                />
              </div>
              {t.ineligible2B.count > 0 && (
                <p className="text-sm text-muted-foreground">
                  {t.ineligible2B.count} document(s) show ITC as not available in 2B (tax{" "}
                  {f.money(t.ineligible2B.itc)}).
                </p>
              )}
              {data.books.length === 0 && (
                <Alert tone="warning">
                  You have no purchase bills or GST expenses recorded yet, so everything shows as
                  missing in your books.
                </Alert>
              )}
            </div>
          </Card>
          <ReconList imp={current.imp} result={current.result} matches={data.matches} f={f} />
        </>
      )}
    </div>
  );
}
