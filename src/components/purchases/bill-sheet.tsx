"use client";

import { Info, Plus, Trash } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { savePurchase } from "@/db/purchases";
import { objectKey, useRetained } from "@/hooks/use-retained";
import { currencySymbol } from "@/lib/currency";
import { todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { checkGstin, normalizeGstin, stateFromGstin } from "@/lib/gst/gstin";
import { stateName } from "@/lib/gst/states";
import { newId } from "@/lib/invoice-factory";
import { toDec } from "@/lib/money";
import {
  canClaimItc,
  computeLineAmounts,
  computePurchaseSummary,
  dueDateFrom,
  purchaseGstMode,
} from "@/lib/purchases/calc";
import {
  ITC_TYPES,
  type AppSettings,
  type ExpenseGstMode,
  type ItcType,
  type Purchase,
  type Vendor,
} from "@/lib/schema";
import { cn } from "@/lib/utils";
import {
  AttachmentPanel,
  useDiscardUnsavedAttachments,
} from "@/components/attachments/attachment-panel";
import { GstRateSelect, StateSelect } from "@/components/forms/pickers";
import { sellerStateCode } from "@/components/money/expense-sheet";
import { categoryOptions, ITC_TYPE_LABELS } from "@/components/money/money-data";
import { ResponsiveSheet, SheetForm } from "@/components/money/sheet-form";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SwitchRow } from "@/components/ui/switch";

export type BillDraft = Partial<Purchase>;

type Supply = "auto" | "intra" | "inter";
const NEW_VENDOR = "__new__";

interface LineForm {
  id: string;
  description: string;
  hsn: string;
  quantity: string;
  unitPrice: string;
  gstRate: string;
}

export function BillSheet({
  draft,
  settings,
  vendors,
  onClose,
  onAddVendor,
}: {
  draft: BillDraft | null;
  settings: AppSettings;
  vendors: Vendor[];
  onClose: () => void;
  /** Opens the vendor form; `onSaved` receives the new vendor. */
  onAddVendor: (onSaved: (v: Vendor) => void) => void;
}) {
  const shown = useRetained(draft);
  return (
    <ResponsiveSheet
      open={Boolean(draft)}
      onClose={onClose}
      title={shown?.id ? "Edit bill" : "Add purchase bill"}
      description="A bill from a vendor that you owe, or have already paid."
    >
      {shown && (
        <BillForm
          key={objectKey(shown)}
          draft={shown}
          settings={settings}
          vendors={vendors}
          onClose={onClose}
          onAddVendor={onAddVendor}
        />
      )}
    </ResponsiveSheet>
  );
}

function BillForm({
  draft,
  settings,
  vendors,
  onClose,
  onAddVendor,
}: {
  draft: BillDraft;
  settings: AppSettings;
  vendors: Vendor[];
  onClose: () => void;
  onAddVendor: (onSaved: (v: Vendor) => void) => void;
}) {
  const isNew = !draft.id;
  const [billId] = useState(() => draft.id || newId());
  const savedRef = useRef(false);
  useDiscardUnsavedAttachments("purchase", billId, isNew, savedRef);

  const sellerState = sellerStateCode(settings);
  const initialMode = draft.gstMode ?? "intra";
  const [f, setF] = useState(() => ({
    vendorId: draft.vendorId ?? "",
    vendorName: draft.vendorName ?? "",
    vendorGstin: draft.vendorGstin ?? "",
    vendorStateCode: draft.vendorStateCode ?? "",
    billNo: draft.billNo ?? "",
    billDate: draft.billDate || todayISO(),
    dueDate: draft.dueDate ?? "",
    dueTouched: Boolean(draft.dueDate),
    hasGst: (draft.gstMode ?? "intra") !== "none",
    supply: (initialMode === "none" ||
    initialMode === purchaseGstMode(draft.vendorStateCode ?? "", sellerState, true)
      ? "auto"
      : initialMode) as Supply,
    pricesIncludeGst: draft.pricesIncludeGst ?? false,
    reverseCharge: draft.reverseCharge ?? false,
    itcWanted: draft.itcEligible ?? true,
    itcType: (draft.itcType ?? "inputs") as ItcType,
    category: draft.category ?? "",
    notes: draft.notes ?? "",
  }));
  const [lines, setLines] = useState<LineForm[]>(() =>
    draft.lines?.length
      ? draft.lines.map((l) => ({
          id: l.id,
          description: l.description ?? "",
          hsn: l.hsn ?? "",
          quantity: l.quantity ?? "1",
          unitPrice: l.unitPrice ?? "",
          gstRate: l.gstRate ?? settings.gst.defaultRate,
        }))
      : [blankLine(settings)],
  );
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));
  const setLine = (id: string, p: Partial<LineForm>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));

  const money = (v: string) =>
    formatMoney(v, settings.invoiceDefaults.currency, settings.formats.numberGrouping);
  const symbol = currencySymbol(settings.invoiceDefaults.currency);

  const autoMode = purchaseGstMode(f.vendorStateCode, sellerState, true);
  const gstMode: ExpenseGstMode = !f.hasGst
    ? "none"
    : f.supply === "auto"
      ? autoMode === "none"
        ? "intra"
        : autoMode
      : f.supply;
  const gstinCheck = checkGstin(f.vendorGstin);
  const canClaim = canClaimItc({ gstMode, vendorGstin: f.vendorGstin, billNo: f.billNo });
  const itcOn = canClaim && f.itcWanted && f.itcType !== "ineligible";

  const summary = useMemo(
    () =>
      computePurchaseSummary({
        lines: lines.map((l) => ({
          ...l,
          itemType: "goods" as const,
          unit: "",
        })),
        pricesIncludeGst: f.pricesIncludeGst,
        gstMode,
        reverseCharge: f.reverseCharge,
        payments: draft.payments ?? [],
      }),
    [lines, f.pricesIncludeGst, gstMode, f.reverseCharge, draft.payments],
  );
  const gst = toDec(summary.cgst).plus(summary.sgst).plus(summary.igst).toFixed(2);

  const categories = useMemo(
    () =>
      categoryOptions(
        settings.expenseCategories.map((c) => c.name),
        [draft.category ?? ""],
      ),
    [settings.expenseCategories, draft.category],
  );

  const pickVendor = (v: Vendor) => {
    set({
      vendorId: v.id,
      vendorName: v.name,
      vendorGstin: v.gstin,
      vendorStateCode: v.stateCode || stateFromGstin(v.gstin) || "",
      dueDate: f.dueTouched ? f.dueDate : dueDateFrom(f.billDate, v.paymentTermsDays),
      category: f.category || v.defaultCategory,
    });
  };
  const onVendorSelect = (id: string) => {
    if (id === NEW_VENDOR) {
      onAddVendor(pickVendor);
      return;
    }
    const v = vendors.find((x) => x.id === id);
    if (v) pickVendor(v);
  };

  const setBillDate = (billDate: string) => {
    const terms =
      vendors.find((v) => v.id === f.vendorId)?.paymentTermsDays ??
      settings.purchases.defaultPaymentDays;
    set({ billDate, dueDate: f.dueTouched ? f.dueDate : dueDateFrom(billDate, terms) });
  };

  const setGstin = (raw: string) => {
    const vendorGstin = normalizeGstin(raw).slice(0, 15);
    const c = checkGstin(vendorGstin);
    set(c.valid && c.stateCode ? { vendorGstin, vendorStateCode: c.stateCode } : { vendorGstin });
  };

  const vendorError = f.vendorName.trim() ? null : "Choose a vendor or type a name.";
  const dateError = f.billDate ? null : "Pick the bill date.";
  const linesError = lines.some(
    (l) => toDec(l.quantity).greaterThan(0) && toDec(l.unitPrice).greaterThan(0),
  )
    ? null
    : "Add at least one line with a quantity and rate.";
  const gstinError =
    f.hasGst && f.vendorGstin && !gstinCheck.valid && (touched || f.vendorGstin.length >= 15)
      ? `${gstinCheck.message}.`
      : null;

  const save = async () => {
    setTouched(true);
    if (vendorError || dateError || linesError) return;
    if (f.hasGst && f.vendorGstin && !gstinCheck.valid) return;
    setBusy(true);
    try {
      await savePurchase({
        ...draft,
        id: billId,
        vendorId: f.vendorId,
        vendorName: f.vendorName.trim(),
        vendorGstin: f.vendorGstin,
        vendorStateCode: f.vendorStateCode,
        billNo: f.billNo.trim(),
        billDate: f.billDate,
        dueDate: f.dueDate || f.billDate,
        lines: lines
          .filter((l) => toDec(l.quantity).greaterThan(0) || toDec(l.unitPrice).greaterThan(0))
          .map((l) => ({
            id: l.id,
            description: l.description.trim(),
            hsn: l.hsn.trim(),
            itemType: "goods" as const,
            quantity: l.quantity,
            unit: "",
            unitPrice: l.unitPrice,
            gstRate: f.hasGst ? l.gstRate : "0",
          })),
        pricesIncludeGst: f.pricesIncludeGst,
        gstMode,
        reverseCharge: f.hasGst && f.reverseCharge,
        itcEligible: itcOn,
        itcType: f.itcType,
        category: f.category,
        notes: f.notes.trim(),
      });
      savedRef.current = true;
      toast.success(isNew ? "Bill added" : "Bill updated");
      onClose();
    } catch {
      // storage error dialog already shown
    } finally {
      setBusy(false);
    }
  };

  const autoHint = !sellerState
    ? "Add your business state in Settings → Business profile to pick this automatically."
    : !f.vendorStateCode
      ? "Add the vendor's state (or GSTIN) to pick this automatically. Assuming intra-state."
      : autoMode === "intra"
        ? `Both you and the vendor are in ${stateName(sellerState)} — CGST + SGST.`
        : `Vendor is in ${stateName(f.vendorStateCode)}, you are in ${stateName(sellerState)} — IGST.`;

  return (
    <SheetForm
      onSubmit={() => void save()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={busy}>
            {isNew ? "Add bill" : "Save changes"}
          </Button>
        </>
      }
    >
      <Field label="Vendor" required error={touched ? vendorError : null}>
        <div className="grid gap-2">
          <Select
            value={f.vendorId}
            onValueChange={onVendorSelect}
            placeholder="Choose a saved vendor"
            options={[
              ...vendors
                .filter((v) => !v.archived || v.id === f.vendorId)
                .map((v) => ({ value: v.id, label: v.name, description: v.gstin || undefined })),
              { value: NEW_VENDOR, label: "Add a new vendor…" },
            ]}
          />
          {!f.vendorId && (
            <Input
              value={f.vendorName}
              onChange={(e) => set({ vendorName: e.target.value.slice(0, 160) })}
              placeholder="…or type a name (not saved as a vendor)"
              aria-label="Vendor name"
            />
          )}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Bill no." optional hint={f.hasGst ? "Needed to claim ITC" : undefined}>
          <Input
            value={f.billNo}
            onChange={(e) => set({ billNo: e.target.value })}
            maxLength={60}
          />
        </Field>
        <Field label="Bill date" required error={touched ? dateError : null}>
          <DatePicker
            value={f.billDate}
            onChange={setBillDate}
            dateFormat={settings.formats.dateFormat}
          />
        </Field>
      </div>
      <Field label="Due date" hint="Filled from the vendor's payment terms.">
        <DatePicker
          value={f.dueDate}
          onChange={(dueDate) => set({ dueDate, dueTouched: true })}
          dateFormat={settings.formats.dateFormat}
          min={f.billDate}
          clearable
          placeholder="Same as bill date"
        />
      </Field>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Items</span>
          <Button
            size="sm"
            variant="secondary"
            type="button"
            onClick={() => setLines((ls) => [...ls, blankLine(settings)])}
          >
            <Plus />
            Add line
          </Button>
        </div>
        {touched && linesError && <p className="text-xs text-danger-foreground">{linesError}</p>}
        {lines.map((l, i) => {
          const amounts = computeLineAmounts(l, {
            pricesIncludeGst: f.pricesIncludeGst,
            gstMode,
            reverseCharge: f.reverseCharge,
          });
          return (
            <div key={l.id} className="grid gap-2 rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={l.description}
                  onChange={(e) => setLine(l.id, { description: e.target.value })}
                  placeholder={`Item ${i + 1} description`}
                  aria-label={`Item ${i + 1} description`}
                  maxLength={300}
                />
                {lines.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    type="button"
                    aria-label={`Remove item ${i + 1}`}
                    onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                  >
                    <Trash />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Qty">
                  <DecimalInput
                    value={l.quantity}
                    onValueChange={(quantity) => setLine(l.id, { quantity })}
                    maxDecimals={3}
                    aria-label={`Item ${i + 1} quantity`}
                  />
                </Field>
                <Field label="Rate">
                  <DecimalInput
                    value={l.unitPrice}
                    onValueChange={(unitPrice) => setLine(l.id, { unitPrice })}
                    leading={<span className="text-[13px]">{symbol}</span>}
                    aria-label={`Item ${i + 1} rate`}
                  />
                </Field>
                <Field label="HSN/SAC" optional>
                  <Input
                    value={l.hsn}
                    onChange={(e) =>
                      setLine(l.id, { hsn: e.target.value.replace(/\D/g, "").slice(0, 8) })
                    }
                    inputMode="numeric"
                    aria-label={`Item ${i + 1} HSN or SAC`}
                  />
                </Field>
              </div>
              <div className="flex items-end justify-between gap-3">
                {f.hasGst ? (
                  <Field label="GST rate" className="w-28">
                    <GstRateSelect
                      value={l.gstRate}
                      onChange={(gstRate) => setLine(l.id, { gstRate })}
                      rates={settings.gst.rates}
                      aria-label={`Item ${i + 1} GST rate`}
                    />
                  </Field>
                ) : (
                  <span />
                )}
                <span className="pb-2 text-sm font-medium tabular-nums">
                  {money(amounts.amount)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <SwitchRow
        label="This bill has GST"
        description="Turn on if the vendor charged GST."
        checked={f.hasGst}
        onCheckedChange={(hasGst) => set({ hasGst })}
      />
      {f.hasGst && (
        <>
          <Field label="Vendor GSTIN" optional error={gstinError}>
            <Input
              value={f.vendorGstin}
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
              value={f.vendorStateCode}
              onChange={(vendorStateCode) => set({ vendorStateCode })}
            />
          </Field>
          <Field label="Supply" hint={f.supply === "auto" ? autoHint : undefined}>
            <Segmented<Supply>
              value={f.supply}
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
            label="Rates include GST"
            description={
              f.reverseCharge
                ? "Not used on reverse charge: GST is added on top."
                : f.pricesIncludeGst
                  ? "Rates above already include GST."
                  : "GST is added on top of the rates."
            }
            checked={f.pricesIncludeGst && !f.reverseCharge}
            disabled={f.reverseCharge}
            onCheckedChange={(pricesIncludeGst) => set({ pricesIncludeGst })}
          />
          <SwitchRow
            label="Claim input tax credit (ITC)"
            description={
              !canClaim
                ? "Add the vendor's valid GSTIN and the bill number to claim ITC."
                : itcOn
                  ? "The GST on this bill reduces the GST you pay."
                  : "Turn on to reduce your GST payable by the GST on this bill."
            }
            checked={itcOn}
            disabled={!canClaim}
            onCheckedChange={(on) =>
              set({
                itcWanted: on,
                ...(on && f.itcType === "ineligible" ? { itcType: "inputs" as ItcType } : {}),
              })
            }
          />
          <Field label="Credit type">
            <Select<ItcType>
              value={f.itcType}
              onValueChange={(itcType) =>
                set(itcType === "ineligible" ? { itcType, itcWanted: false } : { itcType })
              }
              options={ITC_TYPES.map((t) => ({ value: t, label: ITC_TYPE_LABELS[t] }))}
            />
          </Field>
          <SwitchRow
            label="Reverse charge"
            description="Turn on if you (not the vendor) pay this GST to the government. The bill total then excludes GST."
            checked={f.reverseCharge}
            onCheckedChange={(reverseCharge) => set({ reverseCharge })}
          />
        </>
      )}

      <Field label="Category" optional>
        <Select
          value={f.category}
          onValueChange={(category) => set({ category })}
          options={categories.map((c) => ({ value: c, label: c }))}
          placeholder="Choose a category"
        />
      </Field>
      <Field label="Notes" optional>
        <Textarea
          value={f.notes}
          onChange={(e) => set({ notes: e.target.value })}
          rows={2}
          maxLength={1000}
        />
      </Field>

      <AttachmentPanel ownerType="purchase" ownerId={billId} />

      <div
        className="rounded-xl bg-surface-2/70 px-4 py-3 text-sm ring-1 ring-border"
        aria-live="polite"
      >
        <dl className="grid gap-1.5" aria-label="Bill summary">
          <Row label="Taxable value" value={money(summary.taxable)} />
          {gstMode === "intra" && (
            <>
              <Row label="CGST" value={money(summary.cgst)} />
              <Row label="SGST" value={money(summary.sgst)} />
            </>
          )}
          {gstMode === "inter" && <Row label="IGST" value={money(summary.igst)} />}
          <Row label="Bill total" value={money(summary.total)} strong />
          {gstMode !== "none" && (
            <Row
              label="ITC you can claim"
              value={money(itcOn ? gst : "0")}
              tone={itcOn ? "success" : undefined}
            />
          )}
        </dl>
        {f.reverseCharge && gstMode !== "none" && (
          <p className="mt-2 flex gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            You pay {money(gst)} GST to the government yourself; the vendor is paid the taxable
            value.
          </p>
        )}
      </div>
    </SheetForm>
  );
}

function blankLine(settings: AppSettings): LineForm {
  return {
    id: newId(),
    description: "",
    hsn: "",
    quantity: "1",
    unitPrice: "",
    gstRate: settings.gst.defaultRate,
  };
}

function Row({
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
