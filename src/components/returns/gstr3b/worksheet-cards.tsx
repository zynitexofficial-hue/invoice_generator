"use client";

import { Lock, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { savePeriodInput } from "@/db/period-inputs";
import {
  HEADS,
  INPUT_ROWS,
  WORKSHEET_FLAGS,
  inputKey,
  readInputHeads,
  type Gstr3bWorksheet,
  type Head,
  type Heads,
  type InputRowId,
} from "@/lib/gst/gstr3b";
import type { PeriodInput } from "@/lib/schema";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Formatters } from "../gstr1-tab";

const HEAD_LABEL: Record<Head, string> = { igst: "IGST", cgst: "CGST", sgst: "SGST", cess: "Cess" };

function HeadsTable({
  rows,
  f,
  caption,
  first = "Row",
}: {
  rows: {
    key: string;
    label: string;
    heads: Heads;
    bold?: boolean;
    muted?: boolean;
    note?: string;
  }[];
  f: Formatters;
  caption: string;
  first?: string;
}) {
  return (
    <div className="overflow-x-auto border-t border-border">
      <table className="w-full min-w-[520px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-2/60 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-5 py-2 text-left font-medium sm:px-6">
              {first}
            </th>
            {HEADS.map((h) => (
              <th
                key={h}
                scope="col"
                className="px-3 py-2 text-right font-medium last:pr-5 sm:last:pr-6"
              >
                {HEAD_LABEL[h]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border tabular-nums">
          {rows.map((r) => (
            <tr
              key={r.key}
              className={cn(r.bold && "font-semibold", r.muted && "text-muted-foreground")}
            >
              <th scope="row" className="px-5 py-2 text-left font-normal sm:px-6">
                <span className={cn(r.bold && "font-semibold")}>{r.label}</span>
                {r.note && <span className="block text-xs text-muted-foreground">{r.note}</span>}
              </th>
              {HEADS.map((h) => (
                <td
                  key={h}
                  className="px-3 py-2 text-right whitespace-nowrap last:pr-5 sm:last:pr-6"
                >
                  {f.money(r.heads[h])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ItcTableCard({ ws, f }: { ws: Gstr3bWorksheet; f: Formatters }) {
  const sourceNote = {
    books: "From your records",
    manual: "Entered by you below",
    calculated: "",
    reference: "",
  } as const;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="4 Eligible ITC"
        description="4A from your bills and expenses plus the figures you enter below. 4B reversals reduce it."
      />
      <div className="mt-3" />
      <HeadsTable
        caption="Table 4 eligible ITC"
        rows={ws.itcRows.map((r) => ({
          key: r.id,
          label: `${r.id}  ${r.label}`,
          heads: r.heads,
          bold: r.id === "4A" || r.id === "4B" || r.id === "4C",
          muted: r.id.startsWith("4D"),
          note: [sourceNote[r.source], r.note].filter(Boolean).join(" · ") || undefined,
        }))}
        f={f}
      />
      <div className="border-t border-border px-5 py-3 text-[13px] text-muted-foreground sm:px-6">
        GST on bills not marked ITC-eligible (already left out of 4A, for reference):{" "}
        {HEADS.filter((h) => Number(ws.ineligibleInBooks[h]) !== 0)
          .map((h) => `${HEAD_LABEL[h]} ${f.money(ws.ineligibleInBooks[h])}`)
          .join(", ") || "none"}
        .
      </div>
      {ws.gstr2bAvailable && ws.gstr2bDifference && (
        <div className="border-t border-border">
          <HeadsTable
            caption="4A(5) against GSTR-2B"
            first="4A(5) against your imported GSTR-2B"
            rows={[
              {
                key: "books",
                label: "All other ITC in your books",
                heads: ws.itcRows.find((r) => r.id === "4A(5)")!.heads,
              },
              { key: "2b", label: "Available in imported GSTR-2B", heads: ws.gstr2bAvailable },
              {
                key: "d",
                label: "Difference (books − 2B)",
                heads: ws.gstr2bDifference,
                bold: true,
              },
            ]}
            f={f}
          />
        </div>
      )}
    </Card>
  );
}

export function Table31dCard({ ws, f }: { ws: Gstr3bWorksheet; f: Formatters }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Reverse charge and amendments"
        description="Inward supplies where you pay the tax, and outward amendments."
      />
      <div className="mt-3" />
      <HeadsTable
        caption="Reverse charge and amendments"
        rows={[
          {
            key: "31d",
            label: "3.1(d) Inward supplies liable to reverse charge",
            heads: ws.table31d.heads,
            note: `Taxable value ${f.money(ws.table31d.taxable)}. Paid in cash; ITC taken in 4A(3) once paid.`,
          },
          {
            key: "amend",
            label: ws.amendments.label,
            heads: ws.amendments.heads,
            note: "Reads zero until amendments are wired in. Added to your output tax.",
          },
        ]}
        f={f}
      />
    </Card>
  );
}

const headName = (h: Head) => HEAD_LABEL[h];

export function SetOffCard({ ws, f }: { ws: Gstr3bWorksheet; f: Formatters }) {
  const s = ws.setOff;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Tax payable: credit ledger and cash"
        description="An estimate of how ITC is set off and how much cash you may need. The portal does the final set-off."
      />
      <div className="mt-3" />
      <HeadsTable
        caption="Tax payable estimate"
        first="Estimate"
        rows={[
          { key: "out", label: "Output tax (3.1(a) + 3.1(b) + amendments)", heads: ws.outputTax },
          { key: "rcm", label: "Reverse-charge tax (cash only)", heads: ws.rcmTax },
          {
            key: "credit",
            label: "ITC available (opening balance + net ITC 4C)",
            heads: s.creditAvailable,
          },
          { key: "paid", label: "Paid using ITC", heads: s.paidByItc },
          { key: "cash", label: "Tax payable in cash", heads: s.payableCash, bold: true },
          {
            key: "ledger",
            label: "Cash ledger balance (entered by you)",
            heads: s.cashBalance,
            muted: true,
          },
          { key: "short", label: "Extra cash to deposit", heads: s.cashShortfall, bold: true },
          { key: "left", label: "ITC left after set-off", heads: s.creditLeft },
        ]}
        f={f}
      />
      <div className="border-t border-border px-5 py-4 sm:px-6">
        <h3 className="text-sm font-semibold">Set-off notes</h3>
        {s.steps.length === 0 ? (
          <p className="mt-1 text-[13px] text-muted-foreground">
            No ITC is used against output tax this period.
          </p>
        ) : (
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[13px]">
            {s.steps.map((st, i) => (
              <li key={i}>
                {headName(st.from)} credit pays {headName(st.to)} tax: {f.money(st.amount)}
              </li>
            ))}
          </ol>
        )}
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
          {ws.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function LockedRowsAlert({ ws }: { ws: Gstr3bWorksheet }) {
  return (
    <Alert
      tone="info"
      title="Why some rows are locked on the portal"
      icon={<Lock className="size-4" />}
    >
      <ul className="list-disc space-y-1 pl-4">
        {ws.lockedRowNotes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </Alert>
  );
}

/* ---------------- manual inputs ---------------- */

const IMPORT_HEADS: Head[] = ["igst", "cess"];

export function InputsCard({
  periodKey,
  input,
  suggested,
}: {
  periodKey: string;
  input: PeriodInput | null;
  suggested: { "4A1": Heads; "4A4": Heads } | null;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const current = (row: InputRowId, h: Head) =>
    drafts[inputKey(row, h)] ??
    (() => {
      const v = input?.values[inputKey(row, h)];
      return v && Number(v) !== 0 ? v : "";
    })();

  const persist = async (patch: {
    values?: Record<string, string>;
    flags?: Record<string, boolean>;
    setOffNotes?: string;
  }) => {
    try {
      await savePeriodInput({
        ...(input ?? {}),
        id: periodKey,
        periodKey,
        values: { ...(input?.values ?? {}), ...patch.values },
        flags: { ...(input?.flags ?? {}), ...patch.flags },
        setOffNotes: patch.setOffNotes ?? input?.setOffNotes ?? "",
      });
    } catch {
      /* reported by guardedWrite */
    }
  };
  const commit = (row: InputRowId, h: Head) => {
    const key = inputKey(row, h);
    if (!(key in drafts)) return;
    const value = drafts[key];
    setDrafts((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
    void persist({ values: { [key]: value === "" ? "0" : value } });
  };
  const fillFrom2b = (row: "4A1" | "4A4") => {
    if (!suggested) return;
    const values: Record<string, string> = {};
    for (const h of HEADS) values[inputKey(row, h)] = suggested[row][h];
    void persist({ values });
    toast.success("Filled from your imported GSTR-2B");
  };

  return (
    <Card>
      <CardHeader
        title="Your figures for this period"
        description="The app cannot see these on the portal, so enter them from your own records. They are saved on this device."
      />
      <div className="space-y-5 px-5 pt-4 pb-5 sm:px-6">
        {INPUT_ROWS.map((r) => {
          const heads = r.id === "4A1" || r.id === "4A2" ? IMPORT_HEADS : HEADS;
          const canSuggest = suggested && (r.id === "4A1" || r.id === "4A4");
          const readNow = readInputHeads(input, r.id);
          return (
            <fieldset key={r.id} className="min-w-0">
              <legend className="mb-1.5 flex flex-wrap items-center gap-2 text-sm font-medium">
                {r.label}
                {canSuggest && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => fillFrom2b(r.id as "4A1" | "4A4")}
                  >
                    <Wand2 /> Use GSTR-2B figures
                  </Button>
                )}
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {heads.map((h) => (
                  <label key={h} className="min-w-0 text-xs text-muted-foreground">
                    {HEAD_LABEL[h]}
                    <DecimalInput
                      aria-label={`${r.label} ${HEAD_LABEL[h]}`}
                      className="mt-0.5 text-foreground"
                      align="right"
                      placeholder={readNow[h]}
                      value={current(r.id, h)}
                      onValueChange={(v) => setDrafts((d) => ({ ...d, [inputKey(r.id, h)]: v }))}
                      onBlur={() => commit(r.id, h)}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}

        <div className="space-y-2 border-t border-border pt-4">
          {(
            [
              [WORKSHEET_FLAGS.reconciled2b, "I compared my ITC with GSTR-2B"],
              [
                WORKSHEET_FLAGS.imsReviewed,
                "I reviewed the invoices in IMS (accept / reject / pending)",
              ],
            ] as const
          ).map(([flag, label]) => (
            <label key={flag} className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={Boolean(input?.flags[flag])}
                onCheckedChange={(c) => void persist({ flags: { [flag]: c === true } })}
              />
              {label}
            </label>
          ))}
        </div>

        <label className="block text-sm font-medium">
          Your set-off note
          <Textarea
            className="mt-1.5 font-normal"
            rows={2}
            maxLength={2000}
            value={note ?? input?.setOffNotes ?? ""}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if (note !== null) void persist({ setOffNotes: note });
              setNote(null);
            }}
            placeholder="For example: paid 4,000 from the cash ledger on 18 Nov (PMT-06)"
          />
        </label>
      </div>
    </Card>
  );
}
