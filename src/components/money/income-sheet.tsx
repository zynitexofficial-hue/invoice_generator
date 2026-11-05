"use client";

import { Info } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { saveIncome } from "@/db/incomes";
import { useMediaQuery } from "@/hooks/use-media-query";
import { objectKey, useRetained } from "@/hooks/use-retained";
import { currencySymbol } from "@/lib/currency";
import { todayISO } from "@/lib/dates";
import { toDec } from "@/lib/money";
import type { AppSettings, Income } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { categoryOptions } from "./money-data";
import { ResponsiveSheet, SheetForm } from "./sheet-form";

export type IncomeDraft = Partial<Income>;

export const INCOME_INFO =
  "Sales come from your invoices — use this only for income without an invoice.";

export function IncomeSheet({
  draft,
  settings,
  usedCategories,
  onClose,
}: {
  draft: IncomeDraft | null;
  settings: AppSettings;
  usedCategories: string[];
  onClose: () => void;
}) {
  const shown = useRetained(draft);
  return (
    <ResponsiveSheet
      open={Boolean(draft)}
      onClose={onClose}
      title={shown?.id ? "Edit income" : "Add income"}
      description="Money you received without an invoice."
    >
      {shown && (
        <IncomeForm
          key={objectKey(shown)}
          draft={shown}
          settings={settings}
          usedCategories={usedCategories}
          onClose={onClose}
        />
      )}
    </ResponsiveSheet>
  );
}

function IncomeForm({
  draft,
  settings,
  usedCategories,
  onClose,
}: {
  draft: IncomeDraft;
  settings: AppSettings;
  usedCategories: string[];
  onClose: () => void;
}) {
  const [date, setDate] = useState(draft.date || todayISO());
  const [amount, setAmount] = useState(draft.amount ?? "");
  const [category, setCategory] = useState(draft.category ?? "");
  const [source, setSource] = useState(draft.source ?? "");
  const [notes, setNotes] = useState(draft.notes ?? "");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const wide = useMediaQuery("(min-width: 640px)");
  const amountRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (wide) amountRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, []);

  const categories = useMemo(
    () => categoryOptions(settings.incomeCategories, [draft.category ?? "", ...usedCategories]),
    [settings.incomeCategories, draft.category, usedCategories],
  );
  const amountError = toDec(amount).greaterThan(0) ? null : "Enter an amount more than 0.";
  const dateError = date ? null : "Pick the date you received it.";

  const save = async () => {
    setTouched(true);
    if (amountError || dateError) return;
    setBusy(true);
    try {
      await saveIncome({
        ...draft,
        date,
        amount,
        category,
        source: source.trim(),
        notes: notes.trim(),
      });
      toast.success(draft.id ? "Income updated" : "Income added");
      onClose();
    } catch {
      // guardedWrite already shows the storage error dialog; keep the form open.
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetForm
      onSubmit={() => void save()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={busy}>
            {draft.id ? "Save changes" : "Add income"}
          </Button>
        </>
      }
    >
      <p className="flex gap-2 rounded-xl bg-info-soft px-3.5 py-2.5 text-[13px] leading-5 text-muted-foreground ring-1 ring-info/25">
        <Info className="mt-0.5 size-4 shrink-0 text-info-foreground" aria-hidden />
        {INCOME_INFO}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" required error={touched ? amountError : null}>
          <DecimalInput
            ref={amountRef}
            value={amount}
            onValueChange={setAmount}
            leading={
              <span className="text-[13px]">
                {currencySymbol(settings.invoiceDefaults.currency)}
              </span>
            }
            placeholder="0.00"
          />
        </Field>
        <Field label="Date" required error={touched ? dateError : null}>
          <DatePicker value={date} onChange={setDate} dateFormat={settings.formats.dateFormat} />
        </Field>
      </div>
      <Field label="Category">
        <Select
          value={category}
          onValueChange={setCategory}
          options={categories.map((c) => ({ value: c, label: c }))}
          placeholder="Choose a category"
        />
      </Field>
      <Field label="Received from" optional>
        <Input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          maxLength={160}
          placeholder="Bank, person or company"
        />
      </Field>
      <Field label="Notes" optional>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={1000}
        />
      </Field>
    </SheetForm>
  );
}
