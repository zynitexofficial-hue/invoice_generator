"use client";

import { FileUp } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { deleteGstr2bImportWithMatches, saveGstr2bImport } from "@/db/gstr2b";
import { nowISO } from "@/lib/dates";
import { parseGstr2bCsv, parseGstr2bJson, type ParsedGstr2b } from "@/lib/gst/gstr2b";
import type { Gstr2bImport } from "@/lib/schema";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { confirm } from "@/components/ui/confirm";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const MAX_BYTES = 15 * 1024 * 1024;

const SECTION_NAMES: Record<string, string> = {
  b2b: "B2B invoices",
  b2ba: "B2B amendments",
  cdnr: "Credit/debit notes",
  cdnra: "Note amendments",
  isd: "ISD credit",
  impg: "Imports of goods",
};

export function ImportCard({
  defaultPeriod,
  gstin,
  existing,
  onImported,
}: {
  /** Month "YYYY-MM" to preselect. */
  defaultPeriod: string;
  gstin: string;
  existing: Gstr2bImport[];
  onImported: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [period, setPeriod] = useState(defaultPeriod);
  const [parsed, setParsed] = useState<{
    name: string;
    source: "json" | "csv";
    data: ParsedGstr2b;
  }>();
  const [busy, setBusy] = useState(false);
  const periodId = useId();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("That file is too large (over 15 MB). Download the month's 2B again.");
      return;
    }
    const text = await file.text();
    const isJson = /\.json$/i.test(file.name) || /^\s*[{[]/.test(text);
    const data = isJson ? parseGstr2bJson(text) : parseGstr2bCsv(text, { periodKey: period });
    setParsed({ name: file.name, source: isJson ? "json" : "csv", data });
    if (data.periodKey) setPeriod(data.periodKey);
  };

  const save = async () => {
    if (!parsed || !parsed.data.rows.length || !/^\d{4}-\d{2}$/.test(period)) return;
    const same = existing.filter((i) => i.periodKey === period);
    if (same.length) {
      const ok = await confirm({
        title: `Replace the ${period} import?`,
        description:
          "Importing again replaces the earlier import for this month, including the matches you confirmed, unlinked or ignored.",
        confirmLabel: "Replace",
        tone: "danger",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      for (const i of same) await deleteGstr2bImportWithMatches(i.id);
      const saved = await saveGstr2bImport({
        periodKey: period,
        source: parsed.source,
        fileName: parsed.name.slice(0, 200),
        gstin: parsed.data.gstin || gstin,
        importedAt: nowISO(),
        rows: parsed.data.rows,
      });
      toast.success(`Imported ${parsed.data.rows.length} documents for ${period}`);
      setParsed(undefined);
      if (fileRef.current) fileRef.current.value = "";
      onImported(saved.id);
    } catch {
      /* storage errors are reported by guardedWrite */
    } finally {
      setBusy(false);
    }
  };

  const gstinMismatch =
    parsed?.data.gstin && gstin && parsed.data.gstin.toUpperCase() !== gstin.toUpperCase();

  return (
    <Card>
      <CardHeader
        title="Import GSTR-2B"
        description="Download the JSON from the GST portal (Returns > GSTR-2B > Download) and open it here. A CSV also works. The file is read on this device only."
        icon={<FileUp />}
      />
      <div className="space-y-4 px-5 pt-3 pb-5 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Return month" hint="The month the GSTR-2B is for" id={periodId}>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </Field>
          <Field label="GSTR-2B file" hint="JSON (preferred) or CSV">
            <input
              ref={fileRef}
              type="file"
              accept=".json,.csv,application/json,text/csv"
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="block w-full min-w-0 text-sm file:mr-3 file:h-9 file:rounded-lg file:border file:border-border file:bg-surface-2 file:px-3 file:text-sm file:font-medium"
            />
          </Field>
        </div>

        {parsed && (
          <div className="space-y-3">
            <p className="text-sm">
              <strong>{parsed.data.rows.length}</strong> documents read from{" "}
              <span className="break-all">{parsed.name}</span>
              {Object.keys(parsed.data.sectionCounts).length > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  (
                  {Object.entries(parsed.data.sectionCounts)
                    .map(([k, n]) => `${SECTION_NAMES[k] ?? k}: ${n}`)
                    .join(", ")}
                  )
                </span>
              )}
            </p>
            {gstinMismatch && (
              <Alert tone="warning">
                The file is for GSTIN {parsed.data.gstin}, but your profile GSTIN is {gstin}. Check
                that you picked the right file.
              </Alert>
            )}
            {parsed.data.warnings.length > 0 && (
              <Alert tone="warning" title="Please check">
                <ul className="list-disc pl-4">
                  {parsed.data.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                loading={busy}
                disabled={!parsed.data.rows.length || !/^\d{4}-\d{2}$/.test(period)}
                onClick={() => void save()}
              >
                Save import for {period || "…"}
              </Button>
              <Button variant="ghost" onClick={() => setParsed(undefined)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Field names follow the portal file as we understand it and should be verified against your
          download. If something looks wrong, use the CSV option or tell your CA.
        </p>
      </div>
    </Card>
  );
}
