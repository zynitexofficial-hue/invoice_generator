"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { DataCoverage } from "@/lib/analytics";
import { nowISO } from "@/lib/dates";
import { plural } from "@/lib/utils";
import { DISCLAIMER } from "./shared";

export interface PrintSection {
  title: string;
  headers: string[];
  rows: string[][];
  totals?: string[];
  numeric: boolean[];
}

export interface PrintJob {
  title: string;
  businessName: string;
  gstin: string;
  periodLabel: string;
  coverage?: DataCoverage;
  sections: PrintSection[];
  /** Wide registers print in landscape. */
  landscape?: boolean;
}

function coverageText(c: DataCoverage): string {
  const left = c.invoicesExcluded + c.expensesExcluded;
  const parts = Object.entries(c.reasons)
    .filter(([, n]) => n)
    .map(([r, n]) => `${r}: ${n}`);
  return `Based on ${plural(c.invoicesIncluded, "invoice")} and ${plural(c.expensesIncluded, "expense")}${
    left ? `; ${left} not included (${parts.join(", ")})` : ""
  }.`;
}

/**
 * Prints an analytics report. The report is portalled into <body> as a
 * `[data-print-analytics]` container, which the global print CSS allows
 * alongside #print-root; it only exists while the print dialog is open.
 */
export function useAnalyticsPrint(): { print: (job: PrintJob) => void; node: ReactNode } {
  const [job, setJob] = useState<PrintJob | null>(null);

  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    const previousTitle = document.title;
    const done = () => {
      window.removeEventListener("afterprint", done);
      document.title = previousTitle;
      setJob(null);
    };
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled) return;
        document.title = `${job.title} — ${job.periodLabel}`;
        window.addEventListener("afterprint", done);
        window.print();
        if (!("onafterprint" in window)) setTimeout(done, 1000);
      }),
    );
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", done);
    };
  }, [job]);

  const print = useCallback((j: PrintJob) => setJob(j), []);
  const node =
    job && typeof document !== "undefined"
      ? createPortal(<PrintReport job={job} />, document.body)
      : null;
  return { print, node };
}

function PrintReport({ job }: { job: PrintJob }) {
  const generated = nowISO().slice(0, 16).replace("T", " ");
  return (
    <div data-print-analytics="" style={{ color: "#111", background: "#fff", fontSize: 10 }}>
      <style>{`@page { size: A4 ${job.landscape ? "landscape" : "portrait"}; margin: 12mm; }
[data-print-analytics] table { width: 100%; border-collapse: collapse; margin-top: 4px; }
[data-print-analytics] th, [data-print-analytics] td { border-bottom: 1px solid #ddd; padding: 3px 4px; text-align: left; vertical-align: top; }
[data-print-analytics] th { background: #f3f3f3; font-weight: 600; }
[data-print-analytics] .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
[data-print-analytics] tfoot td { font-weight: 700; border-top: 1.5px solid #555; }
[data-print-analytics] section { break-inside: auto; margin-top: 14px; }
[data-print-analytics] thead { display: table-header-group; }
[data-print-analytics] tr { break-inside: avoid; }`}</style>
      <header style={{ borderBottom: "2px solid #111", paddingBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{job.businessName || "My business"}</div>
        {job.gstin && <div>GSTIN: {job.gstin}</div>}
        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600 }}>
          {job.title} · {job.periodLabel}
        </div>
        <div style={{ color: "#555", marginTop: 2 }}>
          Prepared from local records on {generated}.{" "}
          {job.coverage ? coverageText(job.coverage) : ""}
        </div>
      </header>
      {job.sections.map((s, i) => (
        <section key={i}>
          <h2 style={{ fontSize: 12, fontWeight: 700, margin: 0 }}>{s.title}</h2>
          {s.rows.length === 0 ? (
            <p style={{ color: "#555" }}>No records.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  {s.headers.map((h, ci) => (
                    <th key={ci} className={s.numeric[ci] ? "num" : undefined}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci} className={s.numeric[ci] ? "num" : undefined}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {s.totals && (
                <tfoot>
                  <tr>
                    {s.totals.map((c, ci) => (
                      <td key={ci} className={s.numeric[ci] ? "num" : undefined}>
                        {c}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </section>
      ))}
      <p style={{ marginTop: 16, color: "#555" }}>{DISCLAIMER}</p>
    </div>
  );
}
