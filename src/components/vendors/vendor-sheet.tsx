"use client";

import { useState } from "react";
import { toast } from "sonner";
import { saveVendor } from "@/db/vendors";
import { objectKey, useRetained } from "@/hooks/use-retained";
import { currencySymbol } from "@/lib/currency";
import { checkGstin, normalizeGstin } from "@/lib/gst/gstin";
import { stateName } from "@/lib/gst/states";
import type { AppSettings, Vendor } from "@/lib/schema";
import { StateSelect } from "@/components/forms/pickers";
import { ResponsiveSheet, SheetForm } from "@/components/money/sheet-form";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { SwitchRow } from "@/components/ui/switch";

export type VendorDraft = Partial<Vendor>;

export function VendorSheet({
  draft,
  settings,
  onClose,
  onSaved,
}: {
  draft: VendorDraft | null;
  settings: AppSettings;
  onClose: () => void;
  /** Called with the saved vendor (e.g. to select it in a bill). */
  onSaved?: (v: Vendor) => void;
}) {
  const shown = useRetained(draft);
  return (
    <ResponsiveSheet
      open={Boolean(draft)}
      onClose={onClose}
      title={shown?.id ? "Edit vendor" : "Add vendor"}
      description="Someone you buy from. Saved here, they can be picked on bills and expenses."
    >
      {shown && (
        <VendorForm
          key={objectKey(shown)}
          draft={shown}
          settings={settings}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </ResponsiveSheet>
  );
}

function VendorForm({
  draft,
  settings,
  onClose,
  onSaved,
}: {
  draft: VendorDraft;
  settings: AppSettings;
  onClose: () => void;
  onSaved?: (v: Vendor) => void;
}) {
  const [f, setF] = useState({
    name: draft.name ?? "",
    gstin: draft.gstin ?? "",
    stateCode: draft.stateCode ?? "",
    billingAddress: draft.billingAddress ?? "",
    city: draft.city ?? "",
    pincode: draft.pincode ?? "",
    email: draft.email ?? "",
    phone: draft.phone ?? "",
    paymentTermsDays: String(draft.paymentTermsDays ?? settings.purchases.defaultPaymentDays),
    openingBalance: draft.openingBalance ?? "",
    openingBalanceDate: draft.openingBalanceDate ?? "",
    msme: draft.msme ?? false,
    notes: draft.notes ?? "",
  });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));

  const check = checkGstin(f.gstin);
  const gstinError =
    f.gstin && !check.valid && (touched || f.gstin.length >= 15) ? `${check.message}.` : null;
  const nameError = f.name.trim() ? null : "Enter the vendor's name.";

  const setGstin = (raw: string) => {
    const gstin = normalizeGstin(raw).slice(0, 15);
    const c = checkGstin(gstin);
    set(c.valid && c.stateCode ? { gstin, stateCode: c.stateCode } : { gstin });
  };

  const save = async () => {
    setTouched(true);
    if (nameError || (f.gstin && !check.valid)) return;
    setBusy(true);
    try {
      const days = Math.min(365, Math.max(0, Math.round(Number(f.paymentTermsDays) || 0)));
      const v = await saveVendor({
        ...draft,
        name: f.name.trim(),
        gstin: f.gstin,
        stateCode: f.stateCode,
        billingAddress: f.billingAddress.trim(),
        city: f.city.trim(),
        pincode: f.pincode.trim(),
        email: f.email.trim(),
        phone: f.phone.trim(),
        paymentTermsDays: days,
        openingBalance: f.openingBalance,
        openingBalanceDate: f.openingBalance ? f.openingBalanceDate : "",
        msme: f.msme,
        notes: f.notes.trim(),
      });
      toast.success(draft.id ? "Vendor updated" : "Vendor added");
      onSaved?.(v);
      onClose();
    } catch {
      // storage error dialog already shown
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
            {draft.id ? "Save changes" : "Add vendor"}
          </Button>
        </>
      }
    >
      <Field label="Vendor name" required error={touched ? nameError : null}>
        <Input value={f.name} onChange={(e) => set({ name: e.target.value })} maxLength={160} />
      </Field>
      <Field
        label="GSTIN"
        optional
        error={gstinError}
        hint={
          check.valid && check.stateCode ? `Registered in ${stateName(check.stateCode)}` : undefined
        }
      >
        <Input
          value={f.gstin}
          onChange={(e) => setGstin(e.target.value)}
          placeholder="15-character GSTIN"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="font-mono uppercase"
        />
      </Field>
      <Field label="State" optional hint="Decides CGST + SGST or IGST on their bills.">
        <StateSelect value={f.stateCode} onChange={(stateCode) => set({ stateCode })} />
      </Field>
      <SwitchRow
        label="Micro or small enterprise (MSME)"
        description="Their bills must be paid within 45 days. You get a warning before the deadline."
        checked={f.msme}
        onCheckedChange={(msme) => set({ msme })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Payment terms (days)">
          <DecimalInput
            value={f.paymentTermsDays}
            onValueChange={(paymentTermsDays) => set({ paymentTermsDays })}
            maxDecimals={0}
          />
        </Field>
        <Field label="Phone" optional>
          <Input
            value={f.phone}
            onChange={(e) => set({ phone: e.target.value })}
            inputMode="tel"
            maxLength={40}
          />
        </Field>
      </div>
      <Field label="Email" optional>
        <Input
          type="email"
          value={f.email}
          onChange={(e) => set({ email: e.target.value })}
          maxLength={160}
        />
      </Field>
      <Field label="Address" optional>
        <Textarea
          value={f.billingAddress}
          onChange={(e) => set({ billingAddress: e.target.value })}
          rows={2}
          maxLength={500}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" optional>
          <Input value={f.city} onChange={(e) => set({ city: e.target.value })} maxLength={80} />
        </Field>
        <Field label="Pincode" optional>
          <Input
            value={f.pincode}
            onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            inputMode="numeric"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Opening balance"
          optional
          hint="What you already owed them. Leave blank if none."
        >
          <DecimalInput
            value={f.openingBalance}
            onValueChange={(openingBalance) => set({ openingBalance })}
            leading={
              <span className="text-[13px]">
                {currencySymbol(settings.invoiceDefaults.currency)}
              </span>
            }
          />
        </Field>
        <Field label="As on" optional>
          <DatePicker
            value={f.openingBalanceDate}
            onChange={(openingBalanceDate) => set({ openingBalanceDate })}
            dateFormat={settings.formats.dateFormat}
            clearable
          />
        </Field>
      </div>
      <Field label="Notes" optional>
        <Textarea
          value={f.notes}
          onChange={(e) => set({ notes: e.target.value })}
          rows={2}
          maxLength={1000}
        />
      </Field>
    </SheetForm>
  );
}
