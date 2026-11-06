"use client";

import { ChevronDown, Info } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { saveExpense } from "@/db/expenses";
import { useVendors } from "@/db/hooks";
import { saveVendor } from "@/db/vendors";
import { newId } from "@/lib/invoice-factory";
import {
  AttachmentPanel,
  useDiscardUnsavedAttachments,
} from "@/components/attachments/attachment-panel";
import { useMediaQuery } from "@/hooks/use-media-query";
import { objectKey, useRetained } from "@/hooks/use-retained";
import { currencySymbol } from "@/lib/currency";
import { todayISO } from "@/lib/dates";
import { PAYMENT_MODE_LABELS } from "@/lib/documents";
import { computeExpenseSummary, suggestGstMode } from "@/lib/expense-calc";
import { formatMoney } from "@/lib/format";
import { checkGstin, normalizeGstin, stateFromGstin } from "@/lib/gst/gstin";
import { stateName } from "@/lib/gst/states";
import { toDec } from "@/lib/money";
import {
  ITC_TYPES,
  PAYMENT_MODES,
  type AppSettings,
  type Expense,
  type ExpenseCategory,
  type ExpenseGstMode,
  type ItcType,
  type PaymentMode,
} from "@/lib/schema";
import { cn } from "@/lib/utils";
import { GstRateSelect, StateSelect } from "@/components/forms/pickers";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { DatePicker } from "@/components/ui/date-picker";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SwitchRow } from "@/components/ui/switch";
import {
  categoryOptions,
  ITC_TYPE_LABELS,
  PAYMENT_STATUS_LABELS,
  type PaymentStatus,
  type VendorSuggestion,
} from "./money-data";
import { ResponsiveSheet, SheetForm } from "./sheet-form";

/** What the sheet edits: an existing expense (with id) or a new/duplicated one. */
export type ExpenseDraft = Partial<Expense>;

type Supply = "auto" | "intra" | "inter";

interface Form {
  date: string;
  amount: string;
  category: string;
  vendorName: string;
  description: string;
  notes: string;
  paymentStatus: PaymentStatus;
  paymentDate: string;
  paymentMode: PaymentMode;
  hasGst: boolean;
  vendorGstin: string;
  vendorStateCode: string;
  invoiceNo: string;
  invoiceDate: string;
  gstRate: string;
  amountIncludesGst: boolean;
  supply: Supply;
  /** The user's wish to claim; only applies when the bill qualifies (see canClaim). */
  itcWanted: boolean;
  itcType: ItcType;
  reverseCharge: boolean;
}

export function sellerStateCode(settings: AppSettings): string {
  return settings.profile.stateCode || stateFromGstin(settings.profile.gstin) || "";
}

function initialForm(draft: ExpenseDraft, settings: AppSettings): Form {
  const sellerState = sellerStateCode(settings);
  const mode = draft.gstMode ?? "none";
  const vendorState = draft.vendorStateCode ?? "";
  const cat = settings.expenseCategories.find((c) => c.name === draft.category);
  const gstin = draft.vendorGstin ?? "";
  const qualifies = mode !== "none" && checkGstin(gstin).valid && Boolean(draft.invoiceNo?.trim());
  return {
    date: draft.date || todayISO(),
    amount: draft.amount ?? "",
    category: draft.category ?? "",
    vendorName: draft.vendorName ?? "",
    description: draft.description ?? "",
    notes: draft.notes ?? "",
    paymentStatus: draft.paymentStatus ?? "paid",
    paymentDate: draft.paymentDate ?? "",
    paymentMode: draft.paymentMode ?? "",
    hasGst: mode !== "none",
    vendorGstin: gstin,
    vendorStateCode: vendorState,
    invoiceNo: draft.invoiceNo ?? "",
    invoiceDate: draft.invoiceDate ?? "",
    gstRate: draft.gstRate || settings.gst.defaultRate,
    amountIncludesGst: draft.amountIncludesGst ?? true,
    supply: mode === "none" || mode === suggestGstMode(vendorState, sellerState) ? "auto" : mode,
    // A saved claim stands; otherwise follow the category default once the bill qualifies.
    itcWanted: draft.itcEligible || (!qualifies && cat?.defaultItc !== "ineligible"),
    itcType: draft.itcType ?? "inputs",
    reverseCharge: draft.reverseCharge ?? false,
  };
}

export function ExpenseSheet({
  draft,
  settings,
  vendors,
  usedCategories,
  onClose,
}: {
  draft: ExpenseDraft | null;
  settings: AppSettings;
  vendors: VendorSuggestion[];
  usedCategories: string[];
  onClose: () => void;
}) {
  const shown = useRetained(draft);
  return (
    <ResponsiveSheet
      open={Boolean(draft)}
      onClose={onClose}
      title={shown?.id ? "Edit expense" : "Add expense"}
      description="Money you spent on the business."
    >
      {shown && (
        <ExpenseForm
          key={objectKey(shown)}
          draft={shown}
          settings={settings}
          vendors={vendors}
          usedCategories={usedCategories}
          onClose={onClose}
        />
      )}
    </ResponsiveSheet>
  );
}

function ExpenseForm({
  draft,
  settings,
  vendors,
  usedCategories,
  onClose,
}: {
  draft: ExpenseDraft;
  settings: AppSettings;
  vendors: VendorSuggestion[];
  usedCategories: string[];
  onClose: () => void;
}) {
  const [form, setForm] = useState<Form>(() => initialForm(draft, settings));
  // [D] Receipts: the id exists before the first save so files can be attached right away.
  const isNew = !draft.id;
  const [expenseId] = useState(() => draft.id || newId());
  const savedRef = useRef(false);
  useDiscardUnsavedAttachments("expense", expenseId, isNew, savedRef);
  // [D] Saved vendors from the vendor master join the "Paid to" suggestions.
  const masterVendors = useVendors();
  const allVendors = useMemo<VendorSuggestion[]>(() => {
    const master = (masterVendors ?? [])
      .filter((v) => !v.archived)
      .map((v) => ({ name: v.name, gstin: v.gstin, stateCode: v.stateCode }));
    const names = new Set(master.map((v) => v.name.toLowerCase()));
    return [...master, ...vendors.filter((v) => !names.has(v.name.toLowerCase()))];
  }, [masterVendors, vendors]);
  const canSaveVendor =
    form.vendorName.trim().length > 0 &&
    masterVendors !== undefined &&
    !masterVendors.some((v) => v.name.toLowerCase() === form.vendorName.trim().toLowerCase());
  const quickAddVendor = async () => {
    try {
      await saveVendor({
        name: form.vendorName.trim(),
        gstin: gstinCheck.valid ? form.vendorGstin : "",
        stateCode: form.vendorStateCode,
        paymentTermsDays: settings.purchases.defaultPaymentDays,
      });
      toast.success("Saved to your vendors");
    } catch {
      /* storage error dialog already shown */
    }
  };
  const [gstOpen, setGstOpen] = useState(form.hasGst);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const wide = useMediaQuery("(min-width: 640px)");
  const gstSectionId = useId();
  const amountRef = useRef<HTMLInputElement>(null);
  // Focus the amount on open (desktop only: on phones the keyboard would cover the sheet).
  // Runs before the sheet's focus scope, which then keeps focus here.
  useEffect(() => {
    if (wide) amountRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, []);
  const set = (partial: Partial<Form>) => setForm((f) => ({ ...f, ...partial }));

  const currency = settings.invoiceDefaults.currency;
  const grouping = settings.formats.numberGrouping;
  const money = (v: string) => formatMoney(v, currency, grouping);
  const sellerState = sellerStateCode(settings);
  const categories = useMemo(
    () =>
      categoryOptions(
        settings.expenseCategories.map((c) => c.name),
        [draft.category ?? "", ...usedCategories],
      ),
    [settings.expenseCategories, draft.category, usedCategories],
  );

  const gstinCheck = checkGstin(form.vendorGstin);
  const showGstinError =
    form.hasGst && Boolean(form.vendorGstin) && (touched || form.vendorGstin.length >= 15);
  const gstinError = showGstinError && !gstinCheck.valid ? `${gstinCheck.message}.` : null;
  const canClaim = form.hasGst && gstinCheck.valid && Boolean(form.invoiceNo.trim());
  const itcOn = canClaim && form.itcWanted;
  const autoMode = suggestGstMode(form.vendorStateCode, sellerState);
  const gstMode: ExpenseGstMode = !form.hasGst
    ? "none"
    : form.supply === "auto"
      ? autoMode
      : form.supply;
  const summary = computeExpenseSummary({
    amount: form.amount,
    amountIncludesGst: form.amountIncludesGst,
    gstRate: form.gstRate,
    gstMode,
  });
  const tax = toDec(summary.cgst).plus(summary.sgst).plus(summary.igst).toFixed(2);

  const amountError = toDec(form.amount).greaterThan(0) ? null : "Enter an amount more than 0.";
  const dateError = form.date ? null : "Pick the date of the expense.";

  const applyCategory = (name: string) => {
    const cat: ExpenseCategory | undefined = settings.expenseCategories.find(
      (c) => c.name === name,
    );
    const next: Partial<Form> = { category: name };
    if (cat?.defaultItc === "no_gst") next.hasGst = false;
    if (cat?.defaultItc === "ineligible") {
      next.itcWanted = false;
      next.itcType = "ineligible";
    }
    if (cat?.defaultItc === "eligible") {
      next.itcWanted = true;
      if (form.itcType === "ineligible") next.itcType = "inputs";
    }
    set(next);
  };

  const setGstin = (raw: string) => {
    const vendorGstin = normalizeGstin(raw).slice(0, 15);
    const check = checkGstin(vendorGstin);
    set(
      check.valid && check.stateCode
        ? { vendorGstin, vendorStateCode: check.stateCode }
        : { vendorGstin },
    );
  };

  const save = async () => {
    setTouched(true);
    if (amountError || dateError) return;
    if (form.hasGst && form.vendorGstin && !gstinCheck.valid) {
      setGstOpen(true);
      return;
    }
    setBusy(true);
    try {
      const paid = form.paymentStatus !== "unpaid";
      await saveExpense({
        ...draft,
        id: expenseId,
        date: form.date,
        amount: form.amount,
        category: form.category,
        vendorName: form.vendorName.trim(),
        description: form.description.trim(),
        notes: form.notes.trim(),
        paymentStatus: form.paymentStatus,
        paymentDate: paid ? form.paymentDate || form.date : "",
        paymentMode: paid ? form.paymentMode : "",
        vendorGstin: form.vendorGstin,
        vendorStateCode: form.vendorStateCode,
        invoiceNo: form.invoiceNo.trim(),
        invoiceDate: form.invoiceDate,
        gstRate: form.gstRate,
        amountIncludesGst: form.amountIncludesGst,
        gstMode,
        itcEligible: itcOn,
        itcType: form.itcType,
        reverseCharge: form.hasGst && form.reverseCharge,
      });
      savedRef.current = true;
      toast.success(draft.id ? "Expense updated" : "Expense added");
      onClose();
    } catch {
      // guardedWrite already shows the storage error dialog; keep the form open.
    } finally {
      setBusy(false);
    }
  };

  const autoHint = !sellerState
    ? "Add your business state in Settings → Business profile to pick this automatically."
    : !form.vendorStateCode
      ? "Add the vendor's state (or GSTIN) to pick this automatically. Assuming intra-state."
      : autoMode === "intra"
        ? `Both you and the vendor are in ${stateName(sellerState)} — CGST + SGST.`
        : `Vendor is in ${stateName(form.vendorStateCode)}, you are in ${stateName(sellerState)} — IGST.`;

  const itcHint = !form.hasGst
    ? undefined
    : !canClaim
      ? "Add the vendor's valid GSTIN and the bill number to claim ITC."
      : itcOn
        ? "The GST on this bill reduces the GST you pay."
        : "Turn on to reduce your GST payable by the GST on this bill.";

  const blockedCategory =
    settings.expenseCategories.find((c) => c.name === form.category)?.defaultItc === "ineligible";

  return (
    <SheetForm
      onSubmit={() => void save()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={busy}>
            {draft.id ? "Save changes" : "Add expense"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Amount"
          required
          error={touched ? amountError : null}
          hint={form.hasGst ? (form.amountIncludesGst ? "Including GST" : "Before GST") : undefined}
        >
          <DecimalInput
            value={form.amount}
            onValueChange={(amount) => set({ amount })}
            leading={<span className="text-[13px]">{currencySymbol(currency)}</span>}
            placeholder="0.00"
            ref={amountRef}
          />
        </Field>
        <Field label="Date" required error={touched ? dateError : null}>
          <DatePicker
            value={form.date}
            onChange={(date) => set({ date })}
            dateFormat={settings.formats.dateFormat}
          />
        </Field>
      </div>

      <Field label="Category">
        <Select
          value={form.category}
          onValueChange={applyCategory}
          options={categories.map((c) => ({ value: c, label: c }))}
          placeholder="Choose a category"
        />
      </Field>

      <Field label="Paid to" optional>
        <AutocompleteInput<VendorSuggestion>
          value={form.vendorName}
          onChange={(vendorName) => set({ vendorName: vendorName.slice(0, 160) })}
          suggestions={allVendors}
          getKey={(v) => v.name.toLowerCase()}
          getLabel={(v) => v.name}
          getDescription={(v) => v.gstin || undefined}
          onPick={(v) =>
            set({
              vendorName: v.name,
              ...(v.gstin && !form.vendorGstin
                ? {
                    vendorGstin: v.gstin,
                    vendorStateCode: v.stateCode || stateFromGstin(v.gstin) || "",
                  }
                : {}),
            })
          }
          placeholder="Vendor or person"
          heading="Your vendors"
        />
        {canSaveVendor && (
          <Button
            variant="ghost"
            size="xs"
            type="button"
            className="mt-1.5"
            onClick={() => void quickAddVendor()}
          >
            Save &ldquo;{form.vendorName.trim()}&rdquo; as a vendor
          </Button>
        )}
      </Field>

      <Field label="Payment">
        <Segmented<PaymentStatus>
          value={form.paymentStatus}
          onValueChange={(paymentStatus) => set({ paymentStatus })}
          options={(["paid", "unpaid", "partial"] as const).map((s) => ({
            value: s,
            label: PAYMENT_STATUS_LABELS[s],
          }))}
          fullWidth
          aria-label="Payment status"
        />
      </Field>
      {form.paymentStatus !== "unpaid" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid on">
            <DatePicker
              value={form.paymentDate}
              onChange={(paymentDate) => set({ paymentDate })}
              placeholder="Same as date"
              dateFormat={settings.formats.dateFormat}
              clearable
            />
          </Field>
          <Field label="Paid by">
            <Select<PaymentMode>
              value={form.paymentMode}
              onValueChange={(paymentMode) => set({ paymentMode })}
              options={PAYMENT_MODES.filter(Boolean).map((m) => ({
                value: m,
                label: PAYMENT_MODE_LABELS[m],
              }))}
              placeholder="Not specified"
            />
          </Field>
        </div>
      )}

      <Field label="Description" optional>
        <Input
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
          maxLength={500}
          placeholder="What was it for?"
        />
      </Field>

      {/* GST & ITC — collapsed unless the bill already has GST. */}
      <div className="rounded-xl border border-border">
        <button
          type="button"
          onClick={() => setGstOpen((o) => !o)}
          aria-expanded={gstOpen}
          aria-controls={gstSectionId}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left focus-visible:focus-ring"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">GST & input tax credit</span>
            <span className="block truncate text-xs text-muted-foreground">
              {form.hasGst
                ? `${form.gstRate || 0}% GST${itcOn ? " · ITC claimed" : ""}${form.reverseCharge ? " · Reverse charge" : ""}`
                : "No GST on this bill"}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              gstOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        <Collapse open={gstOpen} id={gstSectionId}>
          <div className="grid gap-4 border-t border-border px-4 pt-3.5 pb-4">
            <SwitchRow
              label="This bill has GST"
              description="Turn on if the vendor charged GST on the bill."
              checked={form.hasGst}
              onCheckedChange={(hasGst) => set({ hasGst })}
            />
            {form.hasGst && (
              <>
                <Field
                  label="Vendor GSTIN"
                  optional
                  error={gstinError}
                  hint={
                    gstinCheck.valid && gstinCheck.stateCode
                      ? `Registered in ${stateName(gstinCheck.stateCode)}`
                      : undefined
                  }
                >
                  <Input
                    value={form.vendorGstin}
                    onChange={(e) => setGstin(e.target.value)}
                    placeholder="15-character GSTIN"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono uppercase"
                  />
                </Field>
                <Field label="Vendor state" optional>
                  <StateSelect
                    value={form.vendorStateCode}
                    onChange={(vendorStateCode) => set({ vendorStateCode })}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Bill / invoice no." optional>
                    <Input
                      value={form.invoiceNo}
                      onChange={(e) => set({ invoiceNo: e.target.value })}
                      maxLength={60}
                    />
                  </Field>
                  <Field label="Bill date" optional>
                    <DatePicker
                      value={form.invoiceDate}
                      onChange={(invoiceDate) => set({ invoiceDate })}
                      dateFormat={settings.formats.dateFormat}
                      placeholder="Same as above"
                      clearable
                    />
                  </Field>
                </div>
                <Field label="GST rate">
                  <GstRateSelect
                    value={form.gstRate}
                    onChange={(gstRate) => set({ gstRate })}
                    rates={settings.gst.rates}
                  />
                </Field>
                <SwitchRow
                  label="Amount includes GST"
                  description={
                    form.amountIncludesGst
                      ? "The amount above is the bill total."
                      : "GST is added on top of the amount above."
                  }
                  checked={form.amountIncludesGst}
                  onCheckedChange={(amountIncludesGst) => set({ amountIncludesGst })}
                />
                <Field label="Supply" hint={form.supply === "auto" ? autoHint : undefined}>
                  <Segmented<Supply>
                    value={form.supply}
                    onValueChange={(supply) => set({ supply })}
                    options={[
                      { value: "auto", label: "Auto" },
                      { value: "intra", label: "Intra-state" },
                      { value: "inter", label: "Inter-state" },
                    ]}
                    fullWidth
                    aria-label="Supply type"
                  />
                </Field>
                <SwitchRow
                  label="Claim input tax credit (ITC)"
                  description={
                    <>
                      {itcHint}
                      {canClaim && blockedCategory && form.itcWanted && (
                        <span className="mt-1 block text-warning-foreground">
                          This category is usually blocked under section 17(5) — check before
                          claiming.
                        </span>
                      )}
                    </>
                  }
                  checked={itcOn}
                  disabled={!canClaim}
                  onCheckedChange={(on) =>
                    set({
                      itcWanted: on,
                      ...(on && form.itcType === "ineligible" ? { itcType: "inputs" } : {}),
                    })
                  }
                />
                <Field label="Credit type">
                  <Select<ItcType>
                    value={form.itcType}
                    onValueChange={(itcType) =>
                      set(itcType === "ineligible" ? { itcType, itcWanted: false } : { itcType })
                    }
                    options={ITC_TYPES.map((t) => ({ value: t, label: ITC_TYPE_LABELS[t] }))}
                  />
                </Field>
                <SwitchRow
                  label="Reverse charge"
                  description="Turn on if you (not the vendor) must pay this GST to the government — e.g. legal fees, goods transport, or services from abroad."
                  checked={form.reverseCharge}
                  onCheckedChange={(reverseCharge) => set({ reverseCharge })}
                />
              </>
            )}
          </div>
        </Collapse>
      </div>

      <Field label="Notes" optional>
        <Textarea
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
          rows={2}
          maxLength={1000}
        />
      </Field>

      <AttachmentPanel ownerType="expense" ownerId={expenseId} />

      <div
        className="rounded-xl bg-surface-2/70 px-4 py-3 text-sm ring-1 ring-border"
        aria-live="polite"
      >
        <dl className="grid gap-1.5" aria-label="Summary">
          {gstMode !== "none" && (
            <>
              <SummaryRow label="Taxable value" value={money(summary.taxable)} />
              {gstMode === "intra" ? (
                <>
                  <SummaryRow label="CGST" value={money(summary.cgst)} />
                  <SummaryRow label="SGST" value={money(summary.sgst)} />
                </>
              ) : (
                <SummaryRow label="IGST" value={money(summary.igst)} />
              )}
            </>
          )}
          <SummaryRow label="Total" value={money(summary.total)} strong />
          {gstMode !== "none" && (
            <SummaryRow
              label="ITC you can claim"
              value={money(itcOn ? tax : "0")}
              tone={itcOn ? "success" : undefined}
            />
          )}
        </dl>
        {gstMode !== "none" && form.reverseCharge && (
          <p className="mt-2 flex gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Under reverse charge you pay this GST yourself in your GST return.
          </p>
        )}
      </div>
    </SheetForm>
  );
}

function SummaryRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "success";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        strong && "border-t border-border pt-1.5 font-semibold",
      )}
    >
      <dt className={cn(!strong && "text-muted-foreground")}>{label}</dt>
      <dd className={cn("tabular-nums", tone === "success" && "text-success-foreground")}>
        {value}
      </dd>
    </div>
  );
}
