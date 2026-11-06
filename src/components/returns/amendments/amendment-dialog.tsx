"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { saveAmendment } from "@/db/amendments";
import { docSummary, refreshAfter } from "@/lib/gst/amendments";
import { isValidDecimal, toDec } from "@/lib/money";
import { periodLabel, shiftPeriod } from "@/lib/period";
import {
  amendDocSchema,
  type Amendment,
  type AmendDoc,
  type AmendItem,
  type AppSettings,
  type Invoice,
} from "@/lib/schema";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const EMPTY_ITEM: AmendItem = {
  rate: "18",
  taxable: "0.00",
  igst: "0.00",
  cgst: "0.00",
  sgst: "0.00",
  cess: "0.00",
};

const emptyDoc = (a: Amendment): AmendDoc =>
  amendDocSchema.parse({ number: a.originalNumber, date: a.originalDate, items: [EMPTY_ITEM] });

const HEADS = ["taxable", "igst", "cgst", "sgst"] as const;
const HEAD_LABEL = { taxable: "Taxable value", igst: "IGST", cgst: "CGST", sgst: "SGST" };

/** Periods offered for "report in": the viewed period and the next three. */
export function reportPeriods(period: string): string[] {
  return [0, 1, 2, 3].map((n) => shiftPeriod(period, n));
}

export function AmendmentDialog({
  amendment,
  invoice,
  invoices,
  settings,
  period,
  open,
  onOpenChange,
}: {
  amendment: Amendment;
  invoice: Invoice | undefined;
  invoices: Invoice[];
  settings: AppSettings;
  /** Period shown on the page; the report-in choices start here. */
  period: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState(amendment.reason);
  const [target, setTarget] = useState(amendment.amendInPeriodKey || period);
  const [doc, setDoc] = useState<AmendDoc>(amendment.beforeDoc ?? emptyDoc(amendment));
  const [confirmed, setConfirmed] = useState(amendment.beforeConfirmed);
  const [notes, setNotes] = useState(amendment.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = Array.from(new Set([target, ...reportPeriods(period)])).map((p) => ({
    value: p,
    label: periodLabel(p),
  }));
  const setItem = (i: number, patch: Partial<AmendItem>) =>
    setDoc((d) => ({ ...d, items: d.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) }));

  const save = async (status: Amendment["status"]) => {
    setError(null);
    if (!reason.trim()) return setError("Say why the document is being corrected.");
    if (status !== "draft" && !confirmed)
      return setError("Confirm that the original values match what you filed.");
    for (const it of doc.items)
      for (const k of HEADS)
        if (!isValidDecimal(it[k], { allowNegative: false }))
          return setError("Amounts must be numbers (for example 1250.00).");
    const clean: AmendDoc = {
      ...doc,
      items: doc.items.map((it) => ({
        ...it,
        taxable: toDec(it.taxable).toFixed(2),
        igst: toDec(it.igst).toFixed(2),
        cgst: toDec(it.cgst).toFixed(2),
        sgst: toDec(it.sgst).toFixed(2),
      })),
      value: toDec(doc.value || "0").toFixed(2),
    };
    setBusy(true);
    try {
      const after = refreshAfter(amendment, invoice, invoices, settings);
      await saveAmendment({
        ...amendment,
        ...after,
        reason: reason.trim(),
        amendInPeriodKey: target,
        originalNumber: clean.number || amendment.originalNumber,
        originalDate: clean.date || amendment.originalDate,
        beforeDoc: clean,
        beforeConfirmed: confirmed,
        before: docSummary(clean),
        notes,
        status,
        reportedAt: status === "reported" ? new Date().toISOString() : "",
      });
      toast.success(status === "draft" ? "Amendment saved" : "Amendment is ready to report");
      onOpenChange(false);
    } catch {
      /* storage errors are reported by guardedWrite */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title={`Amendment: ${amendment.originalNumber || "document"}`}
          description={`Originally reported in ${periodLabel(amendment.originalPeriodKey || period)}.`}
        />
        <DialogBody className="space-y-4">
          {!amendment.beforeConfirmed && amendment.kind !== "cancellation" && (
            <Alert tone="warning" title="Enter what you actually filed">
              The app only remembers that this document changed, not what it said when you filed.
              The values below start as today&apos;s values. Change them to match the filed return
              (the GST portal shows it under your filed GSTR-1).
            </Alert>
          )}
          <Field label="Why is it being corrected?" required>
            <Input
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Wrong GSTIN on the invoice"
            />
          </Field>
          <Field
            label="Report the correction in"
            hint="Corrections go in a return that is still open, not the one you already filed."
          >
            <Select value={target} onValueChange={setTarget} options={options} />
          </Field>

          <fieldset className="space-y-3 rounded-xl border border-border p-3">
            <legend className="px-1 text-sm font-medium">As originally filed</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Number">
                <Input
                  value={doc.number}
                  maxLength={60}
                  onChange={(e) => setDoc({ ...doc, number: e.target.value })}
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={doc.date}
                  onChange={(e) => setDoc({ ...doc, date: e.target.value })}
                />
              </Field>
              <Field label="Document value (₹)">
                <Input
                  inputMode="decimal"
                  value={doc.value}
                  onChange={(e) => setDoc({ ...doc, value: e.target.value })}
                />
              </Field>
            </div>
            {doc.items.map((it, i) => (
              <div key={i} className="rounded-lg bg-surface-2/60 p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Field label="GST rate (%)" className="w-28">
                    <Input
                      inputMode="decimal"
                      value={it.rate}
                      onChange={(e) => setItem(i, { rate: e.target.value })}
                    />
                  </Field>
                  {doc.items.length > 1 && (
                    <Button
                      variant="danger-ghost"
                      size="icon-sm"
                      aria-label={`Remove rate row ${i + 1}`}
                      onClick={() => setDoc({ ...doc, items: doc.items.filter((_, k) => k !== i) })}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {HEADS.map((k) => (
                    <Field key={k} label={HEAD_LABEL[k]}>
                      <Input
                        inputMode="decimal"
                        value={it[k]}
                        onChange={(e) => setItem(i, { [k]: e.target.value })}
                      />
                    </Field>
                  ))}
                </div>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDoc({ ...doc, items: [...doc.items, { ...EMPTY_ITEM }] })}
            >
              <Plus />
              Add another rate
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
              These match what I filed
            </label>
          </fieldset>

          <Field
            label="Corrected values"
            hint="Taken from the document as it stands now. They update automatically when you save."
          >
            <p className="text-sm">
              {invoice?.status === "cancelled"
                ? "The document is cancelled, so it is reported with zero values."
                : `Taxable ₹${docSummary(refreshAfter(amendment, invoice, invoices, settings).afterDoc).taxable}`}
            </p>
          </Field>
          <Field label="Notes" optional>
            <Input value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-danger-foreground">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button loading={busy} onClick={() => void save("draft")}>
            Save draft
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save("ready")}>
            Ready to report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
