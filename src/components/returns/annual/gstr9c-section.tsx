"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { patchAnnualGroup, setAnnualValue } from "@/db/annual-inputs";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/input";
import {
  GSTR9C_CHECKLIST,
  type Applicability,
  type Gstr9cResult,
  type Gstr9cRow,
} from "@/lib/gst/annual";
import type { AnnualInput } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { ManualInput } from "./annual-table";

const SECTIONS: Record<Gstr9cRow["section"], { title: string; help: string }> = {
  A: {
    title: "A · Turnover: books vs GSTR-9",
    help: "Start from the turnover in your final accounts, add the usual reconciling items, and compare with Table 5N of GSTR-9.",
  },
  B: {
    title: "B · Tax paid",
    help: "Tax liability declared in GSTR-9 against tax payable, and any extra tax found while reconciling.",
  },
  C: {
    title: "C · Input tax credit",
    help: "ITC in GSTR-9 against your expense records, your accounts and GSTR-2B.",
  },
};

export function Gstr9cSection({
  fyKey,
  result,
  annual,
  applicability,
  format,
}: {
  fyKey: string;
  result: Gstr9cResult;
  annual: AnnualInput | null | undefined;
  applicability: Applicability;
  format: (v: string) => string;
}) {
  const checklist = annual?.gstr9c.checklist ?? {};
  const [notes, setNotes] = useState<string | null>(null);
  const savedNotes = annual?.gstr9c.notes ?? "";
  return (
    <div className="space-y-4">
      <Alert tone="warning" title="Needs your CA where applicable">
        This is a reconciliation worksheet, not a GSTR-9C. Where a CA or cost accountant certificate
        (older years) or a self-certified statement (recent years) is required, it is prepared and
        filed on the GST portal by you or your CA, outside this app. Applicability for this year:{" "}
        <strong>
          {applicability === "mandatory"
            ? "likely required (turnover above ₹5 crore)"
            : applicability === "optional"
              ? "likely not required (turnover up to ₹5 crore)"
              : "unknown (no turnover found)"}
        </strong>{" "}
        (verify).
      </Alert>

      {(["A", "B", "C"] as const).map((s) => (
        <Card key={s}>
          <CardHeader title={SECTIONS[s].title} description={SECTIONS[s].help} />
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[520px] border-collapse text-xs">
                <caption className="sr-only">{SECTIONS[s].title}</caption>
                <tbody>
                  {result.rows
                    .filter((r) => r.section === s)
                    .map((r) => (
                      <tr
                        key={r.id}
                        className="border-t border-border/70 align-top first:border-t-0"
                      >
                        <th
                          scope="row"
                          className="w-10 px-2.5 py-2 text-left font-medium text-muted-foreground"
                        >
                          {r.id}
                        </th>
                        <td className="px-2.5 py-2">
                          <div className={cn(r.kind === "derived" && "font-medium")}>{r.label}</div>
                          {r.note && (
                            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                              {r.note}
                            </p>
                          )}
                        </td>
                        <td className="w-36 px-2.5 py-1.5 text-right">
                          {r.editable ? (
                            <ManualInput
                              label={`${r.id} ${r.label}`}
                              value={annual?.gstr9c.values[r.id] ?? ""}
                              placeholder={r.value}
                              edited={Boolean(annual?.gstr9c.values[r.id])}
                              onCommit={(v) => void setAnnualValue(fyKey, "gstr9cValues", r.id, v)}
                            />
                          ) : (
                            <span className="tabular-nums">{format(r.value)}</span>
                          )}
                        </td>
                        <td className="w-24 px-2.5 py-2 text-[11px]">
                          {r.reconciled === undefined ? null : r.reconciled ? (
                            <span className="inline-flex items-center gap-1 text-success-foreground">
                              <CircleCheck className="size-3.5" aria-hidden />
                              Matches
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-warning-foreground">
                              <TriangleAlert className="size-3.5" aria-hidden />
                              Explain
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader
          title="Reasons for differences"
          description="Write why the books and GSTR-9 differ (timing, credit notes after year-end, rate changes…). Your CA will want this."
        />
        <CardContent>
          <Textarea
            aria-label="Reasons for differences"
            value={notes ?? savedNotes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== null && notes !== savedNotes)
                void patchAnnualGroup(fyKey, "gstr9c", { notes });
              setNotes(null);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Checklist"
          description={`${result.checklistDone} of ${result.checklistTotal} done. Your own tick-list; nothing is sent anywhere.`}
        />
        <CardContent>
          <ul className="space-y-2">
            {GSTR9C_CHECKLIST.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <Checkbox
                    checked={Boolean(checklist[c.id])}
                    onCheckedChange={(v) =>
                      void patchAnnualGroup(fyKey, "gstr9c", {
                        checklist: { ...checklist, [c.id]: v === true },
                      })
                    }
                    className="mt-0.5"
                  />
                  <span>{c.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
