"use client";

import Link from "next/link";
import { AMENDED_KEYS, AMENDED_LABELS, type AmendmentSections } from "@/lib/gst/amendments";
import { cn } from "@/lib/utils";
import type { Formatters } from "../gstr1-tab";

/**
 * Amendment tables for one return: per section, what was originally reported,
 * what it should read, and the net change. Plain table that scrolls inside
 * its container on narrow screens.
 */
export function SectionsPreview({
  sections,
  f,
  period,
}: {
  sections: AmendmentSections;
  f: Formatters;
  period: string;
}) {
  const keys = [...AMENDED_KEYS, "b2csa" as const].filter((k) => sections.totals[k].count > 0);
  if (keys.length === 0) return null;
  return (
    <div className="space-y-3">
      {keys.map((key) => {
        const meta = AMENDED_LABELS[key];
        const total = sections.totals[key];
        return (
          <div key={key}>
            <h3 className="text-[13px] font-medium">
              Table {meta.table} · {meta.label}{" "}
              <span className="font-normal text-muted-foreground">({total.count})</span>
            </h3>
            <div className="mt-1 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[480px] text-left text-[13px]">
                <caption className="sr-only">{meta.label}</caption>
                <thead className="bg-surface-2/60 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-1.5 font-medium">
                      Document
                    </th>
                    <th scope="col" className="px-3 py-1.5 text-right font-medium">
                      Revised taxable
                    </th>
                    <th scope="col" className="px-3 py-1.5 text-right font-medium">
                      Change in tax
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {key === "b2csa"
                    ? sections.b2csa.map((r) => (
                        <tr key={`${r.month}${r.supplyType}${r.pos}${r.rate}`}>
                          <td className="px-3 py-1.5">
                            {r.month} · state {r.pos} · {r.rate}%
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {f.money(r.taxable)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground">
                            revised totals
                          </td>
                        </tr>
                      ))
                    : sections.rows[key].map((r) => {
                        const tax = (
                          Number(r.delta.igst) +
                          Number(r.delta.cgst) +
                          Number(r.delta.sgst)
                        ).toFixed(2);
                        const taxable = r.revised.items.reduce((n, i) => n + Number(i.taxable), 0);
                        return (
                          <tr key={r.amendmentId}>
                            <td className="px-3 py-1.5">
                              <Link
                                href={`/returns?tab=amendments&period=${encodeURIComponent(period)}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {r.original.number}
                              </Link>{" "}
                              <span className="text-muted-foreground">
                                {f.date(r.original.date)}
                                {r.cancelled ? " · cancelled" : ""}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {f.money(taxable.toFixed(2))}
                            </td>
                            <td
                              className={cn(
                                "px-3 py-1.5 text-right tabular-nums",
                                Number(tax) < 0 && "text-danger-foreground",
                              )}
                            >
                              {f.money(tax)}
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <p className="text-[13px] text-muted-foreground">
        Net change in taxable value: {f.money(sections.net.taxable)}. Table numbers and file keys
        for amendments are unconfirmed: verify against the portal.
      </p>
    </div>
  );
}
