"use client";

import { Check, CircleCheck, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { saveSnapshot, upsertFiling } from "@/db/filings";
import { todayISO } from "@/lib/dates";
import { daysFromTo, estimateLateFee } from "@/lib/gst/returns";
import { sanitizeDecimalInput } from "@/lib/money";
import { periodKind } from "@/lib/period";
import { filingId, type DateFormatId, type Filing, type SnapshotRecord } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { confirm } from "@/components/ui/confirm";
import { DatePicker } from "@/components/ui/date-picker";
import { DecimalInput } from "@/components/ui/decimal-input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { SwitchRow } from "@/components/ui/switch";
import type { Formatters } from "./gstr1-tab";
import { arnError, FILING_STEPS, type FilingStep, type PageReturn } from "./returns-data";

export interface FilingItem {
  type: PageReturn;
  title: string;
  due: string | null;
  step: FilingStep;
  filing: Filing | undefined;
  /** Snapshot of the return as built from today's records. */
  snapshot: () => { records: SnapshotRecord[]; totals: Record<string, string> };
  /** Prefill for the interest estimate (net tax paid in cash). */
  cashTax: string;
}

function Stepper({ step }: { step: FilingStep }) {
  const at = FILING_STEPS.findIndex((s) => s.id === step);
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Filing progress">
      {FILING_STEPS.map((s, i) => {
        const done = i <= at;
        return (
          <li key={s.id} aria-current={i === at ? "step" : undefined} className="min-w-0">
            <div className={cn("h-1.5 rounded-full", done ? "bg-primary" : "bg-surface-3")} />
            <div
              className={cn(
                "mt-1.5 text-[11px] leading-4 sm:text-xs",
                i === at ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function MarkFiledDialog({
  item,
  period,
  open,
  onOpenChange,
  dateFormat,
}: {
  item: FilingItem;
  period: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dateFormat: DateFormatId;
}) {
  const [arn, setArn] = useState(item.filing?.arn ?? "");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState(item.filing?.notes ?? "");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const error = arnError(arn);

  const save = async () => {
    setTouched(true);
    if (error || !date) return;
    setSaving(true);
    try {
      const snap = item.snapshot();
      await upsertFiling({
        periodKey: period,
        periodKind: periodKind(period),
        returnType: item.type,
        status: "filed",
        filedAt: `${date}T00:00:00.000Z`,
        arn,
        notes: notes.trim(),
        dueDate: item.due ?? "",
      });
      await saveSnapshot({
        filingId: filingId(period, item.type),
        periodKey: period,
        returnType: item.type,
        totals: snap.totals,
        records: snap.records,
      });
      toast.success(`${item.title} marked as filed`);
      onOpenChange(false);
    } catch {
      /* reported by guardedWrite */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader
          title={`Mark ${item.title} as filed`}
          description="Record what you filed on the GST portal. A copy of today's figures is kept so later edits can be spotted."
          icon={<CircleCheck />}
        />
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <DialogBody>
            <FieldGroup>
              <Field
                label="ARN"
                optional
                error={touched ? error : null}
                hint="Acknowledgement Reference Number from the portal — recommended, 15 characters."
              >
                <Input
                  value={arn}
                  maxLength={15}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="AA271026012345X"
                  className="font-mono uppercase"
                  onChange={(e) => setArn(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                  onBlur={() => setTouched(true)}
                />
              </Field>
              <Field label="Filed on" required>
                <DatePicker value={date} onChange={setDate} dateFormat={dateFormat} />
              </Field>
              <Field label="Notes" optional>
                <Textarea
                  value={notes}
                  rows={2}
                  maxLength={1000}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. filed by CA, challan number"
                />
              </Field>
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!date}>
              <Check />
              Mark as filed
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LateFeeCard({
  item,
  aato,
  today,
  f,
}: {
  item: FilingItem;
  aato: string;
  today: string;
  f: Formatters;
}) {
  const filedOn = item.step === "filed" ? (item.filing?.filedAt ?? "").slice(0, 10) : "";
  const [nil, setNil] = useState(false);
  const [cash, setCash] = useState(item.type === "GSTR-3B" ? item.cashTax : "0");
  const est = estimateLateFee({
    dueDate: item.due ?? "",
    filedDate: filedOn || today,
    nil,
    aato,
    netCashTax: item.type === "GSTR-3B" ? cash : "0",
  });
  return (
    <div className="rounded-xl border border-warning/30 bg-warning-soft/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Late fee & interest</h4>
        <Badge size="sm" tone="warning">
          Estimate
        </Badge>
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {filedOn ? `Filed ${est.daysLate} day(s) late.` : `${est.daysLate} day(s) late so far.`}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <SwitchRow
          label="Nil return"
          description="No sales and no tax for the period"
          checked={nil}
          onCheckedChange={setNil}
        />
        {item.type === "GSTR-3B" && (
          <Field label="Tax paid in cash" hint="Prefilled from the GSTR-3B estimate">
            <DecimalInput
              value={cash}
              onValueChange={(v) => setCash(sanitizeDecimalInput(v, 2))}
              leading="₹"
            />
          </Field>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Late fee (CGST + SGST)</dt>
        <dd className="text-right tabular-nums">{f.money(est.lateFee.total)}</dd>
        {item.type === "GSTR-3B" && (
          <>
            <dt className="text-muted-foreground">Interest at 18% a year</dt>
            <dd className="text-right tabular-nums">{f.money(est.interest)}</dd>
          </>
        )}
        <dt className="font-semibold">Estimated total</dt>
        <dd className="text-right font-semibold tabular-nums">{f.money(est.total)}</dd>
      </dl>
      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
        {est.notes
          .filter((n) => item.type === "GSTR-3B" || !n.startsWith("Interest"))
          .map((n) => (
            <li key={n}>{n}</li>
          ))}
      </ul>
    </div>
  );
}

function FilingCard({
  item,
  period,
  today,
  aato,
  dateFormat,
  f,
}: {
  item: FilingItem;
  period: string;
  today: string;
  aato: string;
  dateFormat: DateFormatId;
  f: Formatters;
}) {
  const [open, setOpen] = useState(false);
  const filed = item.step === "filed";
  const filing = item.filing;
  const filedOn = filed ? (filing?.filedAt ?? "").slice(0, 10) : "";
  const late = item.due
    ? filed
      ? Boolean(filedOn) && filedOn > item.due
      : daysFromTo(item.due, today) > 0
    : false;

  const undo = async () => {
    const ok = await confirm({
      title: `Undo "filed" for ${item.title}?`,
      description:
        "The return goes back to Exported. Use this only if it was marked filed by mistake.",
      confirmLabel: "Undo filed",
    });
    if (!ok) return;
    try {
      await upsertFiling({
        periodKey: period,
        periodKind: periodKind(period),
        returnType: item.type,
        status: "exported",
        filedAt: "",
      });
      toast.success(`${item.title} set back to Exported`);
    } catch {
      /* reported by guardedWrite */
    }
  };

  return (
    <Card>
      <CardHeader
        title={item.title}
        description={item.due ? `Due ${f.date(item.due)}` : "No due date for this period"}
        action={
          filed ? (
            <Button variant="ghost" size="sm" onClick={() => void undo()}>
              <Undo2 />
              Undo filed
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
              Mark as filed
            </Button>
          )
        }
      />
      <CardContent className="space-y-4">
        <Stepper step={item.step} />
        {filed && filing && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Filed on</dt>
            <dd>{filedOn ? f.date(filedOn) : "—"}</dd>
            <dt className="text-muted-foreground">ARN</dt>
            <dd className="font-mono break-all">{filing.arn || "Not recorded"}</dd>
            {filing.notes && (
              <>
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="break-words whitespace-pre-line">{filing.notes}</dd>
              </>
            )}
          </dl>
        )}
        {late && <LateFeeCard item={item} aato={aato} today={today} f={f} />}
      </CardContent>
      {open && (
        <MarkFiledDialog
          item={item}
          period={period}
          open={open}
          onOpenChange={setOpen}
          dateFormat={dateFormat}
        />
      )}
    </Card>
  );
}

export function FilingTab({
  items,
  period,
  today,
  aato,
  dateFormat,
  f,
}: {
  items: FilingItem[];
  period: string;
  today: string;
  aato: string;
  dateFormat: DateFormatId;
  f: Formatters;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        File on the GST portal, then record it here. File GSTR-1 first — GSTR-3B is filled from it.
      </p>
      {items.map((item) => (
        <FilingCard
          key={item.type}
          item={item}
          period={period}
          today={today}
          aato={aato}
          dateFormat={dateFormat}
          f={f}
        />
      ))}
    </div>
  );
}
