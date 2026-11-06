"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useExpenses, useInvoices, useSettings } from "@/db/hooks";
import { saveRecurring } from "@/db/recurring";
import { formatDate, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { templateFromExpense, templateFromInvoice, templateSummary } from "@/lib/recurring/build";
import {
  addDays,
  describeSchedule,
  firstOnOrAfter,
  FREQUENCY_LABELS,
  occurrencesBetween,
  ordinal,
  parseYmd,
  specOf,
} from "@/lib/recurring/schedule";
import {
  RECURRENCE_FREQUENCIES,
  type Expense,
  type Invoice,
  type Recurring,
  type RecurrenceFrequency,
  type RecurringKind,
} from "@/lib/schema";
import { ResponsiveSheet, SheetForm } from "@/components/money/sheet-form";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";

export interface RecurringFormProps {
  /** Existing template to edit; undefined = create. */
  editing?: Recurring;
  /** Start with this kind when creating. */
  initialKind?: RecurringKind;
  onClose: () => void;
}

const DAY_OPTIONS = [
  { value: "0", label: "Same day as the start date" },
  ...Array.from({ length: 30 }, (_, i) => ({
    value: String(i + 1),
    label: `${ordinal(i + 1)} of the month`,
  })),
  { value: "31", label: "Last day of the month" },
];

function numberOr(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function RecurringForm({ editing, initialKind = "invoice", onClose }: RecurringFormProps) {
  const settings = useSettings();
  const invoices = useInvoices();
  const expenses = useExpenses();
  const today = todayISO();

  const [kind, setKind] = useState<RecurringKind>(editing?.kind ?? initialKind);
  const [template, setTemplate] = useState<Record<string, unknown> | undefined>(editing?.template);
  const [name, setName] = useState(editing?.name ?? "");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(editing?.frequency ?? "monthly");
  const [interval, setIntervalText] = useState(String(editing?.interval ?? 1));
  const [startDate, setStartDate] = useState(editing?.startDate ?? today);
  const [endDate, setEndDate] = useState(editing?.endDate ?? "");
  const [dayOfMonth, setDayOfMonth] = useState(String(editing?.dayOfMonth ?? 0));
  const [mode, setMode] = useState<"auto" | "ask">(editing?.mode ?? "ask");
  const [maxRuns, setMaxRuns] = useState(editing?.maxRuns ? String(editing.maxRuns) : "");
  const [sourceId, setSourceId] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const dateFormat = settings?.formats.dateFormat ?? "dd/MM/yyyy";
  const grouping = settings?.formats.numberGrouping ?? "indian";

  const sourceInvoices = useMemo(
    () =>
      (invoices ?? []).filter(
        (i) =>
          i.status !== "cancelled" && i.docType !== "credit_note" && i.docType !== "debit_note",
      ),
    [invoices],
  );

  const pickInvoice = (inv: Invoice) => {
    setSourceId(inv.id);
    setTemplate(templateFromInvoice(inv));
    if (!name.trim())
      setName(`${inv.customer.company || inv.customer.name || "Invoice"} (recurring)`);
  };
  const pickExpense = (e: Expense) => {
    setSourceId(e.id);
    setTemplate(templateFromExpense(e));
    if (!name.trim()) setName(`${e.vendorName || e.category || "Expense"} (recurring)`);
  };

  const intervalNum = Math.min(12, Math.max(1, numberOr(interval, 1)));
  const maxRunsNum = Math.max(0, numberOr(maxRuns, 0));
  const spec = {
    frequency,
    interval: intervalNum,
    startDate,
    endDate,
    dayOfMonth: frequency === "weekly" ? 0 : numberOr(dayOfMonth, 0),
  };

  const errors = {
    template: template ? null : "Choose the invoice or expense to copy.",
    name: name.trim() ? null : "Give it a name you will recognise.",
    start: parseYmd(startDate) ? null : "Pick a start date.",
    end: endDate && endDate < startDate ? "The end date is before the start date." : null,
    interval:
      /^\d+$/.test(interval) && Number(interval) >= 1 && Number(interval) <= 12
        ? null
        : "Use a number from 1 to 12.",
  };
  const valid = Object.values(errors).every((e) => !e);

  const preview = useMemo(() => {
    if (!parseYmd(startDate)) return [];
    const from = editing?.lastRunDate ? addDays(editing.lastRunDate, 1) : startDate;
    const begin = from > startDate ? from : startDate;
    const horizon = addDays(begin, 366 * 6);
    return occurrencesBetween(spec, begin, horizon, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frequency, intervalNum, startDate, endDate, dayOfMonth, editing?.lastRunDate]);

  const scheduleChanged =
    !!editing &&
    (editing.frequency !== frequency ||
      editing.interval !== intervalNum ||
      editing.startDate !== startDate ||
      editing.endDate !== endDate ||
      editing.dayOfMonth !== spec.dayOfMonth);

  const submit = async () => {
    setSubmitted(true);
    if (!valid || !template || saving) return;
    setSaving(true);
    try {
      let nextRunDate = editing?.nextRunDate ?? "";
      if (scheduleChanged || (editing && !nextRunDate && !editing.lastRunDate)) {
        const after = editing?.lastRunDate ? addDays(editing.lastRunDate, 1) : startDate;
        nextRunDate = firstOnOrAfter(specOf(spec), after > startDate ? after : startDate);
      }
      await saveRecurring({
        ...(editing ?? {}),
        kind,
        name: name.trim(),
        template,
        frequency,
        interval: intervalNum,
        startDate,
        endDate,
        dayOfMonth: spec.dayOfMonth,
        mode,
        maxRuns: maxRunsNum,
        nextRunDate,
      });
      toast.success(editing ? "Recurring item updated" : "Recurring item created");
      onClose();
    } catch {
      toast.error("Couldn't save this recurring item");
    } finally {
      setSaving(false);
    }
  };

  const showErr = (msg: string | null) => (submitted ? msg : null);
  const summary = template ? templateSummary({ kind, template }) : "";

  return (
    <ResponsiveSheet
      open
      onClose={onClose}
      title={editing ? "Edit recurring item" : "New recurring item"}
      description="Copies an invoice or expense on a schedule. New invoices are always saved as drafts for you to review."
    >
      <SheetForm
        onSubmit={submit}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {editing ? "Save changes" : "Create"}
            </Button>
          </>
        }
      >
        {!editing && (
          <Field label="What repeats?">
            <Segmented
              fullWidth
              value={kind}
              onValueChange={(k) => {
                setKind(k);
                setTemplate(undefined);
                setSourceId("");
              }}
              options={[
                { value: "invoice", label: "Invoice" },
                { value: "expense", label: "Expense" },
              ]}
            />
          </Field>
        )}

        <Field
          label={
            editing
              ? "Copies from"
              : kind === "invoice"
                ? "Copy an existing invoice"
                : "Copy an existing expense"
          }
          error={showErr(errors.template)}
          hint={
            template
              ? `${summary} — change it to copy a different one.`
              : kind === "invoice"
                ? "Customer, items, taxes and notes are copied. Number and dates are new each time."
                : "Vendor, amount, GST and category are copied. The date is new each time."
          }
        >
          {kind === "invoice" ? (
            <Combobox
              items={sourceInvoices}
              getKey={(i) => i.id}
              getLabel={(i) =>
                `${i.number || "Draft"} · ${i.customer.company || i.customer.name || "No customer"}`
              }
              getDescription={(i) =>
                `${formatDate(i.invoiceDate, dateFormat)} · ${formatMoney(i.summary.grandTotal, i.currency, grouping)}`
              }
              getKeywords={(i) => [i.number, i.customer.name, i.customer.company]}
              selectedKey={sourceId}
              onSelect={pickInvoice}
              placeholder={template ? summary : "Choose an invoice"}
              searchPlaceholder="Search by number or customer"
              emptyText="No invoices yet. Create one first, then repeat it."
            />
          ) : (
            <Combobox
              items={expenses ?? []}
              getKey={(e) => e.id}
              getLabel={(e) => e.vendorName || e.description || e.category || "Expense"}
              getDescription={(e) =>
                `${formatDate(e.date, dateFormat)} · ${formatMoney(e.summary.total, settings?.invoiceDefaults.currency ?? "INR", grouping)}`
              }
              getKeywords={(e) => [e.vendorName, e.category, e.description]}
              selectedKey={sourceId}
              onSelect={pickExpense}
              placeholder={template ? summary : "Choose an expense"}
              searchPlaceholder="Search by vendor or category"
              emptyText="No expenses yet. Add one first, then repeat it."
            />
          )}
        </Field>

        <Field label="Name" error={showErr(errors.name)}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Repeats">
            <Select
              value={frequency}
              onValueChange={setFrequency}
              options={RECURRENCE_FREQUENCIES.map((f) => ({
                value: f,
                label: FREQUENCY_LABELS[f],
              }))}
            />
          </Field>
          <Field
            label="Every"
            error={showErr(errors.interval)}
            hint={frequency === "weekly" ? "weeks" : "times the period"}
          >
            <Input
              inputMode="numeric"
              value={interval}
              onChange={(e) => setIntervalText(e.target.value.replace(/\D/g, "").slice(0, 2))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" error={showErr(errors.start)}>
            <DatePicker value={startDate} onChange={setStartDate} dateFormat={dateFormat} />
          </Field>
          <Field label="Ends" optional error={showErr(errors.end)}>
            <DatePicker
              value={endDate}
              onChange={setEndDate}
              dateFormat={dateFormat}
              clearable
              min={startDate}
              placeholder="Never"
            />
          </Field>
        </div>

        {frequency !== "weekly" && (
          <Field
            label="Day of the month"
            hint="Pick the last day to bill on month-end, even in short months."
          >
            <Select value={dayOfMonth} onValueChange={setDayOfMonth} options={DAY_OPTIONS} />
          </Field>
        )}

        <Field label="Stop after" optional hint="Leave empty to repeat until you stop it.">
          <Input
            inputMode="numeric"
            value={maxRuns}
            placeholder="No limit"
            onChange={(e) => setMaxRuns(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </Field>

        <Field
          label="When it's due"
          hint={
            mode === "auto"
              ? "Created automatically when you open the app (a few at a time). Bigger catch-ups still ask you first."
              : "Nothing is created until you press the button on the Recurring tab."
          }
        >
          <Segmented
            fullWidth
            value={mode}
            onValueChange={setMode}
            options={[
              { value: "ask", label: "Ask me" },
              { value: "auto", label: "Create automatically" },
            ]}
          />
        </Field>

        {parseYmd(startDate) && (
          <div
            className="rounded-lg border border-border bg-surface-2/60 p-3 text-sm"
            aria-live="polite"
          >
            <p className="font-medium">{describeSchedule({ ...spec, startDate })}</p>
            <p className="mt-1 text-muted-foreground">
              {preview.length
                ? `Next: ${preview.map((d) => formatDate(d, dateFormat)).join(", ")}`
                : "No upcoming dates with these settings."}
            </p>
          </div>
        )}
      </SheetForm>
    </ResponsiveSheet>
  );
}
