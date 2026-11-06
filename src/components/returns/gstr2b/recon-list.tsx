"use client";

import { Check, EyeOff, Link2Off, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteGstr2bMatch, saveGstr2bImport, saveGstr2bMatch } from "@/db/gstr2b";
import {
  bookTax,
  overrideRecord,
  rowSign,
  rowTax,
  type BookDoc,
  type ReconResult,
} from "@/lib/gst/gstr2b";
import {
  IMS_ACTIONS,
  type Gstr2bImport,
  type Gstr2bMatch,
  type Gstr2bRow,
  type ImsAction,
} from "@/lib/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Formatters } from "../gstr1-tab";

type Filter =
  "all" | "matched" | "attention" | "missingInBooks" | "missingIn2B" | "ignored" | "other";

const IMS_LABELS: Record<ImsAction, string> = {
  none: "IMS: no action",
  accepted: "IMS: accepted",
  rejected: "IMS: rejected",
  pending: "IMS: pending",
};

const STATUS_BADGE = {
  matched: { tone: "success", label: "Matched" },
  manual: { tone: "info", label: "Confirmed by you" },
  probable: { tone: "warning", label: "Probable match" },
  mismatch: { tone: "danger", label: "Values differ" },
} as const;

interface Item {
  kind: "pair" | "missingInBooks" | "ignored" | "other";
  row: Gstr2bRow;
  pair?: ReconResult["matches"][number];
}

function RowShell({
  title,
  sub,
  badge,
  amounts,
  children,
  actions,
}: {
  title: string;
  sub: string;
  badge: React.ReactNode;
  amounts: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <li className="px-5 py-3 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{sub}</p>
        </div>
        {badge}
      </div>
      <div className="mt-1.5 text-[13px] tabular-nums">{amounts}</div>
      {children}
      {actions && <div className="mt-2 flex flex-wrap items-center gap-2">{actions}</div>}
    </li>
  );
}

export function ReconList({
  imp,
  result,
  matches,
  f,
}: {
  imp: Gstr2bImport;
  result: ReconResult;
  matches: Gstr2bMatch[];
  f: Formatters;
}) {
  const [filter, setFilter] = useState<Filter>("attention");
  const pairs = result.matches;
  const counts = {
    matched: pairs.filter((m) => m.status === "matched" || m.status === "manual").length,
    attention: pairs.filter((m) => m.status === "probable" || m.status === "mismatch").length,
  };
  const options: { value: Filter; label: string }[] = [
    { value: "attention", label: `Review (${counts.attention})` },
    { value: "matched", label: `Matched (${counts.matched})` },
    { value: "missingInBooks", label: `Not in books (${result.missingInBooks.length})` },
    { value: "missingIn2B", label: `Not in 2B (${result.missingIn2B.length})` },
    { value: "ignored", label: `Ignored (${result.ignored.length})` },
    { value: "other", label: `Imports/ISD (${result.other.length})` },
    { value: "all", label: "All" },
  ];

  const matchOf = (rowId: string): Gstr2bMatch | undefined =>
    matches.find((m) => m.id === `${imp.id}:${rowId}`);

  const decide = async (
    row: Gstr2bRow,
    decision: Parameters<typeof overrideRecord>[2],
    done: string,
  ) => {
    try {
      await saveGstr2bMatch(overrideRecord(imp.id, row, decision));
      toast.success(done);
    } catch {
      /* reported by guardedWrite */
    }
  };
  const undo = async (row: Gstr2bRow) => {
    try {
      await deleteGstr2bMatch(`${imp.id}:${row.id}`);
    } catch {
      /* reported */
    }
  };
  const setIms = async (row: Gstr2bRow, action: ImsAction) => {
    try {
      await saveGstr2bImport({
        ...imp,
        rows: imp.rows.map((r) => (r.id === row.id ? { ...r, imsAction: action } : r)),
      });
    } catch {
      /* reported */
    }
  };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (filter === "all" || filter === "attention" || filter === "matched")
      for (const m of pairs) {
        const attn = m.status === "probable" || m.status === "mismatch";
        if (filter === "attention" && !attn) continue;
        if (filter === "matched" && attn) continue;
        out.push({ kind: "pair", row: m.row, pair: m });
      }
    if (filter === "all" || filter === "missingInBooks")
      for (const r of result.missingInBooks) out.push({ kind: "missingInBooks", row: r });
    if (filter === "all" || filter === "ignored")
      for (const r of result.ignored) out.push({ kind: "ignored", row: r });
    if (filter === "all" || filter === "other")
      for (const r of result.other) out.push({ kind: "other", row: r });
    return out;
  }, [filter, pairs, result]);

  const candidates = (row: Gstr2bRow): BookDoc[] =>
    [...result.missingIn2B].sort(
      (a, b) => Number(b.gstin === row.supplierGstin) - Number(a.gstin === row.supplierGstin),
    );

  const taxLine = (r: Gstr2bRow) => {
    const s = rowSign(r);
    const sign = s < 0 ? "−" : "";
    return `Taxable ${f.money(r.taxable)} · Tax ${sign}${f.money(rowTax(r).toFixed(2))}${
      r.rcm ? " · Reverse charge" : ""
    }${r.itcAvailable ? "" : " · ITC not available"}`;
  };
  const rowTitle = (r: Gstr2bRow) =>
    `${r.supplierName || r.supplierGstin || "Unknown supplier"} · ${r.docNo || "no number"}`;
  const rowSub = (r: Gstr2bRow) =>
    [
      r.supplierGstin,
      r.docType === "credit_note" ? "Credit note" : r.docType === "debit_note" ? "Debit note" : "",
      r.section.toUpperCase(),
      r.docDate ? f.date(r.docDate) : "",
    ]
      .filter(Boolean)
      .join(" · ");

  const imsSelect = (row: Gstr2bRow) => (
    <Select
      size="sm"
      aria-label={`IMS action for ${row.docNo}`}
      value={row.imsAction}
      onValueChange={(v) => void setIms(row, v)}
      options={IMS_ACTIONS.map((a) => ({ value: a, label: IMS_LABELS[a] }))}
      className="w-40"
    />
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Documents"
        description="Each GSTR-2B document against your purchase bills and GST expenses. Matching uses supplier GSTIN, invoice number, date and amounts."
      />
      <div className="-mx-1 mt-3 overflow-x-auto px-5 pb-3 sm:px-6">
        <Segmented
          aria-label="Filter documents"
          size="sm"
          value={filter}
          onValueChange={setFilter}
          options={options}
          className="min-w-max"
        />
      </div>
      <ul className="divide-y divide-border border-t border-border">
        {filter === "missingIn2B"
          ? result.missingIn2B.map((b) => (
              <RowShell
                key={b.key}
                title={`${b.name || b.gstin || "Unknown supplier"} · ${b.docNo || "no number"}`}
                sub={[b.gstin || "No GSTIN", b.label.split(" ")[0], b.date ? f.date(b.date) : ""]
                  .filter(Boolean)
                  .join(" · ")}
                badge={<Badge tone="warning">Not in 2B</Badge>}
                amounts={`Taxable ${f.money(b.taxable)} · Tax ${f.money(bookTax(b).toFixed(2))}`}
              >
                <p className="mt-1 text-xs text-muted-foreground">
                  {b.gstin
                    ? "Ask the supplier to report this bill in their GSTR-1. Until it shows in 2B, hold this ITC back."
                    : "No supplier GSTIN is recorded, so it cannot appear in 2B. Add the GSTIN or do not claim ITC."}
                </p>
              </RowShell>
            ))
          : items.map((it) => {
              const { row } = it;
              const saved = matchOf(row.id);
              if (it.kind === "pair" && it.pair) {
                const m = it.pair;
                const badge = STATUS_BADGE[m.status];
                return (
                  <RowShell
                    key={`${row.id}`}
                    title={rowTitle(row)}
                    sub={rowSub(row)}
                    badge={<Badge tone={badge.tone}>{badge.label}</Badge>}
                    amounts={taxLine(row)}
                    actions={
                      <>
                        {(m.status === "probable" || m.status === "mismatch") && (
                          <Button
                            size="xs"
                            variant="primary"
                            onClick={() =>
                              void decide(row, { kind: "accept", book: m.book }, "Match confirmed")
                            }
                          >
                            <Check /> Accept match
                          </Button>
                        )}
                        {saved ? (
                          <Button size="xs" variant="ghost" onClick={() => void undo(row)}>
                            <Undo2 /> Reset
                          </Button>
                        ) : null}
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => void decide(row, { kind: "unlink" }, "Match removed")}
                        >
                          <Link2Off /> Unlink
                        </Button>
                        {imsSelect(row)}
                      </>
                    }
                  >
                    <p className="mt-1 text-xs text-muted-foreground">
                      Your books: {m.book.label}
                      {m.book.date ? ` · ${f.date(m.book.date)}` : ""} · Taxable{" "}
                      {f.money(m.book.taxable)} · Tax {f.money(bookTax(m.book).toFixed(2))}
                    </p>
                    {m.reasons.length > 0 && (
                      <ul className="mt-1 list-disc pl-5 text-xs text-warning-foreground">
                        {m.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </RowShell>
                );
              }
              if (it.kind === "missingInBooks") {
                const list = candidates(row);
                return (
                  <RowShell
                    key={row.id}
                    title={rowTitle(row)}
                    sub={rowSub(row)}
                    badge={<Badge tone="danger">Not in your books</Badge>}
                    amounts={taxLine(row)}
                    actions={
                      <>
                        {list.length > 0 && (
                          <Select
                            size="sm"
                            aria-label={`Link ${row.docNo} to a bill`}
                            value=""
                            placeholder="Link to a bill…"
                            onValueChange={(key) => {
                              const book = list.find((b) => b.key === key);
                              if (book)
                                void decide(row, { kind: "accept", book }, "Linked to your bill");
                            }}
                            options={list.map((b) => ({
                              value: b.key,
                              label: `${b.docNo || "no no."} · ${b.name || b.gstin} · ${f.money(
                                bookTax(b).toFixed(2),
                              )}`,
                            }))}
                            className="w-56"
                          />
                        )}
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => void decide(row, { kind: "ignore" }, "Row ignored")}
                        >
                          <EyeOff /> Ignore
                        </Button>
                        {saved && (
                          <Button size="xs" variant="ghost" onClick={() => void undo(row)}>
                            <Undo2 /> Reset
                          </Button>
                        )}
                        {imsSelect(row)}
                      </>
                    }
                  >
                    <p className="mt-1 text-xs text-muted-foreground">
                      Record this purchase in Money or Bills to claim the ITC, or ignore it if it is
                      not yours.
                    </p>
                  </RowShell>
                );
              }
              return (
                <RowShell
                  key={row.id}
                  title={rowTitle(row)}
                  sub={rowSub(row)}
                  badge={
                    <Badge tone={it.kind === "ignored" ? "neutral" : "info"}>
                      {it.kind === "ignored" ? "Ignored" : "Not matched here"}
                    </Badge>
                  }
                  amounts={taxLine(row)}
                  actions={
                    it.kind === "ignored" ? (
                      <Button size="xs" variant="ghost" onClick={() => void undo(row)}>
                        <Undo2 /> Restore
                      </Button>
                    ) : null
                  }
                >
                  {it.kind === "other" && (
                    <p className={cn("mt-1 text-xs text-muted-foreground")}>
                      {row.section === "impg"
                        ? "Import of goods. Claim through 3B Table 4A(1)."
                        : "ISD credit. Claim through 3B Table 4A(4)."}
                    </p>
                  )}
                </RowShell>
              );
            })}
        {((filter === "missingIn2B" && result.missingIn2B.length === 0) ||
          (filter !== "missingIn2B" && items.length === 0)) && (
          <li className="px-5 py-6 text-sm text-muted-foreground sm:px-6">
            Nothing here. {filter === "attention" ? "No documents need a second look." : ""}
          </li>
        )}
      </ul>
    </Card>
  );
}
