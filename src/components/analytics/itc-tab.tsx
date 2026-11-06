"use client";

import Link from "next/link";
import { useMemo } from "react";
import { itcReconReport } from "@/lib/analytics/itc-recon";
import { bookTax, type BookDoc } from "@/lib/gst/gstr2b";
import type { ItcSource } from "@/lib/gst/gstr3b";
import { toDec } from "@/lib/money";
import { periodLabel } from "@/lib/period";
import { BarChart, ChartFrame, KpiCard, type CategoryDatum } from "@/components/charts";
import { useReconData } from "@/components/returns/gstr2b/use-recon";
import { useItcSource } from "@/components/returns/gstr3b/use-itc-source";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { monthsOf, num } from "./analytics-model";
import type { TabContext } from "./context";

/** Tax claimed per month in the 3B (4A(3) + 4A(5) lines), from the shared ITC source. */
function claimedIn3b(source: ItcSource, months: string[]) {
  return months.reduce((sum, m) => {
    for (const l of source(m))
      if (l.eligible)
        sum = sum.plus(toDec(l.igst)).plus(toDec(l.cgst)).plus(toDec(l.sgst)).plus(toDec(l.cess));
    return sum;
  }, toDec("0"));
}

export function ItcTab({ ctx }: { ctx: TabContext }) {
  const { money } = ctx;
  const data = useReconData();
  const source = useItcSource();
  const months = useMemo(() => monthsOf(ctx.period.selector), [ctx.period.selector]);

  const inRange = useMemo(
    () => data.recons.filter((r) => months.includes(r.imp.periodKey)),
    [data.recons, months],
  );
  const ineligibleBooks = useMemo<BookDoc[]>(
    () =>
      data.books.filter(
        (b) => !b.itcEligible && !b.rcm && months.some((m) => b.periodDate.startsWith(m)),
      ),
    [data.books, months],
  );
  const report = useMemo(
    () =>
      itcReconReport(
        inRange.map((r) => ({ importId: r.imp.id, periodKey: r.imp.periodKey, result: r.result })),
        { ineligibleBooks },
      ),
    [inRange, ineligibleBooks],
  );

  if (data.loading || !source) return <Skeleton className="h-72 w-full rounded-2xl" />;

  const missingMonths = months.filter((m) => !inRange.some((r) => r.imp.periodKey === m));
  const t = report.totals;
  const claim3b = claimedIn3b(source, months);
  const diff3b = claim3b.minus(toDec(report.booksClaimed));

  const bars: CategoryDatum[] = report.byPeriod.map((p) => ({
    key: p.periodKey,
    label: periodLabel(p.periodKey),
    shortLabel: periodLabel(p.periodKey).slice(0, 3),
    values: {
      matched: Math.max(0, num(p.matched)),
      mismatched: Math.abs(num(p.mismatched)),
      missing2b: Math.max(0, num(p.missingIn2B)),
      missingBooks: Math.max(0, num(p.missingInBooks)),
    },
  }));

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Compare the ITC in your books with GSTR-2B">
        Based on GSTR-2B files you imported and your purchase bills and GST expenses. A draft check
        prepared from your records; confirm figures on the GST portal.
      </Alert>

      {inRange.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm">
            No GSTR-2B is imported for {periodLabel(ctx.period.param) || "this period"}. Import the
            statement to see matched, mismatched and missing ITC.
          </p>
          <Button className="mt-3" size="sm" variant="primary" asChild>
            <Link href={`/returns?tab=gstr2b${months[0] ? `&period=${months[0]}` : ""}`}>
              Import GSTR-2B
            </Link>
          </Button>
        </Card>
      ) : (
        <>
          {missingMonths.length > 0 && (
            <Alert tone="warning">
              No GSTR-2B imported for {missingMonths.map(periodLabel).join(", ")}. Totals below
              cover only the months with an import.
            </Alert>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              label="ITC claimed in your books"
              value={money(report.booksClaimed)}
              definition="Eligible GST on documents compared with GSTR-2B (reverse-charge excluded)."
            />
            <KpiCard
              label="ITC available in GSTR-2B"
              value={money(report.available2B)}
              definition="ITC marked available in the imported GSTR-2B, credit notes deducted."
            />
            <KpiCard
              label="Difference"
              value={money(report.difference)}
              footnote="Books minus GSTR-2B. Positive means you claim more than 2B shows."
              positiveIsGood={false}
            />
            <KpiCard
              label="Matched"
              value={money(t.matched.itc)}
              footnote={`${t.matched.count} documents`}
            />
            <KpiCard
              label="Values differ"
              value={money(t.mismatched.difference)}
              footnote={`${t.mismatched.count} documents (books − 2B)`}
              positiveIsGood={false}
            />
            <KpiCard
              label="ITC at risk: not in 2B"
              value={money(t.missingIn2B.itc)}
              footnote={`${t.missingIn2B.count} bills not reported by suppliers`}
              positiveIsGood={false}
            />
            <KpiCard
              label="Unclaimed: in 2B, not in books"
              value={money(t.missingInBooks.itc)}
              footnote={`${t.missingInBooks.count} documents`}
            />
            <KpiCard
              label="Ineligible ITC"
              value={money(toDec(t.ineligible2B.itc).plus(toDec(t.ineligibleBooks.itc)).toFixed(2))}
              footnote={`2B ${money(t.ineligible2B.itc)} (${t.ineligible2B.count}) · books ${money(t.ineligibleBooks.itc)} (${t.ineligibleBooks.count})`}
            />
            <KpiCard
              label="Needs attention"
              value={String(report.needsAttention)}
              footnote="Mismatches, probable matches and missing documents"
              positiveIsGood={false}
            />
          </div>

          <ChartFrame
            title="ITC by month"
            description="2B tax by outcome. Mismatched shows the size of the difference."
            empty={bars.every((b) => Object.values(b.values).every((v) => !v))}
            table={{
              headers: [
                "Month",
                "Matched",
                "Mismatch (difference)",
                "Missing in 2B",
                "Missing in books",
                "Ineligible in 2B",
              ],
              rows: report.byPeriod.map((p) => [
                periodLabel(p.periodKey),
                p.matched,
                p.mismatched,
                p.missingIn2B,
                p.missingInBooks,
                p.ineligible2B,
              ]),
            }}
            csvName="itc-reconciliation-by-month"
          >
            <BarChart
              data={bars}
              series={[
                { key: "matched", label: "Matched" },
                { key: "mismatched", label: "Mismatch" },
                { key: "missing2b", label: "Missing in 2B" },
                { key: "missingBooks", label: "Missing in books" },
              ]}
            />
          </ChartFrame>

          <Card className="overflow-hidden">
            <CardHeader
              title="How books and 2B reconcile"
              description="Every rupee of the difference is explained below. The 3B line is the ITC your GSTR-3B worksheet claims."
            />
            <dl className="mt-3 divide-y divide-border border-t border-border text-sm">
              <Line
                label="ITC claimed in books (compared documents)"
                value={money(report.booksClaimed)}
              />
              <Line label="ITC available in GSTR-2B" value={money(report.available2B)} />
              {report.bridge.map((b) => (
                <Line key={b.id} label={`  ${b.label}`} value={money(b.amount)} muted />
              ))}
              <Line label="Difference (books − 2B)" value={money(report.difference)} bold />
              <Line
                label="ITC claimed in the GSTR-3B worksheet (4A(3) + 4A(5))"
                value={money(claim3b.toFixed(2))}
              />
              <Line label="3B claim minus compared books" value={money(diff3b.toFixed(2))} muted />
            </dl>
            {!diff3b.isZero() && (
              <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground sm:px-6">
                A difference here usually means a bill is dated in this period but matched in
                another month&apos;s GSTR-2B, or a month has no import. Reverse-charge ITC is in the
                3B line but not in 2B.
              </p>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="By supplier"
              description="Suppliers with documents to review come first."
            />
            <div className="mt-3 overflow-x-auto border-t border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-surface-2/60 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-2 font-medium sm:px-6">
                      Supplier
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Matched
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Difference
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Not in 2B
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Not in books
                    </th>
                    <th scope="col" className="px-5 py-2 text-right font-medium sm:px-6">
                      Ineligible
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular-nums">
                  {report.bySupplier.map((s) => (
                    <tr key={s.gstin || s.name}>
                      <td className="px-5 py-2 sm:px-6">
                        <span className="block max-w-56 truncate font-medium">
                          {s.name || "Unknown"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {s.gstin || "No GSTIN"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{money(s.matched)}</td>
                      <td className="px-3 py-2 text-right">{money(s.mismatched)}</td>
                      <td className="px-3 py-2 text-right">{money(s.missingIn2B)}</td>
                      <td className="px-3 py-2 text-right">{money(s.missingInBooks)}</td>
                      <td className="px-5 py-2 text-right sm:px-6">{money(s.ineligible2B)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        {data.books.length} purchase bills and GST expenses considered (
        {money(data.books.reduce((a, b) => a.plus(bookTax(b)), toDec("0")).toFixed(2))} tax in
        total).
      </p>
    </div>
  );
}

function Line({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 px-5 py-2.5 sm:px-6 ${bold ? "font-semibold" : ""} ${muted ? "text-muted-foreground" : ""}`}
    >
      <dt className="min-w-0 whitespace-pre-wrap">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}
