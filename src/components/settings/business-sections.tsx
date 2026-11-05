"use client";

import { QrCode } from "lucide-react";
import {
  IFSC_PATTERN,
  PAN_PATTERN,
  UPI_PATTERN,
  checkGstin,
  normalizeGstin,
  stateFromGstin,
} from "@/lib/gst/gstin";
import type { AppSettings, Seller } from "@/lib/schema";
import { gstinStateMismatch } from "@/lib/gst/tax";
import { buildUpiUri } from "@/lib/upi";
import { QrCodeSvg } from "@/components/document/qr-code";
import { ImageUpload } from "@/components/forms/image-upload";
import { StateSelect } from "@/components/forms/pickers";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { SwitchRow } from "@/components/ui/switch";
import type { SettingsUpdate } from "./use-settings-draft";

interface SectionProps {
  draft: AppSettings;
  update: SettingsUpdate;
}

export function BusinessSection({ draft, update }: SectionProps) {
  const p = draft.profile;
  const set = (partial: Partial<Seller>) => update("profile", (prev) => ({ ...prev, ...partial }));
  const gstin = p.gstin ? checkGstin(p.gstin) : null;
  const panInvalid = p.pan && !PAN_PATTERN.test(p.pan);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Identity" description="Shown at the top of every new document." />
        <CardContent className="grid gap-5">
          <ImageUpload label="Logo" value={p.logo} onChange={(logo) => set({ logo })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business or your name" required>
              <Input
                value={p.name}
                onChange={(e) => set({ name: e.target.value })}
                maxLength={160}
                autoComplete="organization"
              />
            </Field>
            <Field label="Email" optional>
              <Input
                type="email"
                value={p.email}
                onChange={(e) => set({ email: e.target.value })}
                maxLength={160}
                autoComplete="email"
              />
            </Field>
          </div>
          <Field label="Address">
            <Textarea
              value={p.address}
              onChange={(e) => set({ address: e.target.value })}
              rows={3}
              maxLength={500}
              autoComplete="street-address"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="State"
              hint="Used to decide CGST + SGST vs IGST."
              warning={gstinStateMismatch(p.gstin, p.stateCode) ?? undefined}
            >
              <StateSelect value={p.stateCode} onChange={(stateCode) => set({ stateCode })} />
            </Field>
            <Field label="Country">
              <Input
                value={p.country}
                onChange={(e) => set({ country: e.target.value })}
                maxLength={80}
                autoComplete="country-name"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" optional>
              <Input
                type="tel"
                value={p.phone}
                onChange={(e) => set({ phone: e.target.value })}
                maxLength={40}
                autoComplete="tel"
              />
            </Field>
            <Field label="Website" optional>
              <Input
                value={p.website}
                onChange={(e) => set({ website: e.target.value })}
                maxLength={160}
                placeholder="example.com"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Tax registration"
          description="Leave empty if you're not GST-registered."
        />
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="GSTIN"
            optional
            warning={gstin && !gstin.valid ? gstin.message : undefined}
            hint={gstin?.valid ? "Looks valid ✓" : undefined}
          >
            <Input
              value={p.gstin}
              onChange={(e) => {
                const value = normalizeGstin(e.target.value);
                const derived = stateFromGstin(value);
                set({ gstin: value, ...(derived && !p.stateCode ? { stateCode: derived } : {}) });
              }}
              maxLength={15}
              className="font-mono tracking-wide uppercase"
              spellCheck={false}
            />
          </Field>
          <Field
            label="PAN"
            optional
            warning={panInvalid ? "PAN format looks incorrect (ABCDE1234F)." : undefined}
          >
            <Input
              value={p.pan}
              onChange={(e) => set({ pan: e.target.value.toUpperCase().replace(/\s/g, "") })}
              maxLength={10}
              className="font-mono tracking-wide uppercase"
              spellCheck={false}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Signature"
          description="Optional image printed above “Authorised signatory”."
        />
        <CardContent className="grid gap-5">
          <ImageUpload
            label="Signature"
            value={p.signature}
            onChange={(signature) => set({ signature })}
            hint="Transparent PNG works best"
          />
          <Field label="Signatory name" optional>
            <Input
              value={p.signatoryName}
              onChange={(e) => set({ signatoryName: e.target.value })}
              maxLength={120}
            />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}

export function PaymentsSection({ draft, update }: SectionProps) {
  const p = draft.profile;
  const set = (partial: Partial<Seller>) => update("profile", (prev) => ({ ...prev, ...partial }));
  const setBank = (partial: Partial<Seller["bank"]>) =>
    update("profile", (prev) => ({ ...prev, bank: { ...prev.bank, ...partial } }));
  const ifscInvalid = p.bank.ifsc && !IFSC_PATTERN.test(p.bank.ifsc);
  const upiInvalid = p.upiId && !UPI_PATTERN.test(p.upiId);
  const upiPreview = buildUpiUri({
    upiId: p.upiId,
    payeeName: p.upiName || p.name,
    amount: draft.upi.includeAmount ? "1180" : undefined,
    note: "Invoice INV-001",
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Preferred method"
          description="When both bank and UPI are on a document, the preferred one is listed first and highlighted. Both stay valid."
        />
        <CardContent>
          <Segmented<Seller["preferredPayment"]>
            fullWidth
            value={p.preferredPayment}
            onValueChange={(preferredPayment) => set({ preferredPayment })}
            options={[
              { value: "", label: "No preference" },
              { value: "upi", label: "UPI" },
              { value: "bank", label: "Bank transfer" },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Bank account" description="Printed in the payment details block." />
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account name">
              <Input
                value={p.bank.accountName}
                onChange={(e) => setBank({ accountName: e.target.value })}
                maxLength={120}
              />
            </Field>
            <Field label="Account number">
              <Input
                value={p.bank.accountNumber}
                onChange={(e) => setBank({ accountNumber: e.target.value.replace(/\s/g, "") })}
                maxLength={40}
                inputMode="numeric"
                className="font-mono"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="IFSC"
              warning={ifscInvalid ? "IFSC looks incorrect (e.g. HDFC0001234)." : undefined}
            >
              <Input
                value={p.bank.ifsc}
                onChange={(e) => setBank({ ifsc: e.target.value.toUpperCase().replace(/\s/g, "") })}
                maxLength={11}
                className="font-mono uppercase"
              />
            </Field>
            <Field label="Bank name">
              <Input
                value={p.bank.bankName}
                onChange={(e) => setBank({ bankName: e.target.value })}
                maxLength={120}
              />
            </Field>
            <Field label="Branch" optional>
              <Input
                value={p.bank.branch}
                onChange={(e) => setBank({ branch: e.target.value })}
                maxLength={120}
              />
            </Field>
          </div>
          <Field label="SWIFT / BIC" optional hint="Shown on non-INR (export) invoices.">
            <Input
              value={p.bank.swift}
              onChange={(e) => setBank({ swift: e.target.value.toUpperCase().replace(/\s/g, "") })}
              maxLength={11}
              className="font-mono uppercase sm:max-w-xs"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="UPI"
          description="Adds a scan-to-pay QR code to INR invoices with a balance due."
          icon={<QrCode />}
        />
        <CardContent>
          <div className="flex flex-col gap-6 sm:flex-row">
            <div className="grid flex-1 gap-4">
              <Field
                label="UPI ID"
                warning={upiInvalid ? "UPI IDs look like name@bank." : undefined}
              >
                <Input
                  value={p.upiId}
                  onChange={(e) => set({ upiId: e.target.value.trim() })}
                  maxLength={120}
                  placeholder="yourname@okhdfcbank"
                  spellCheck={false}
                />
              </Field>
              <Field
                label="Payee name"
                optional
                hint="Enter the name on your bank account; payers are asked to check it matches. Defaults to your business name."
              >
                <Input
                  value={p.upiName}
                  onChange={(e) => set({ upiName: e.target.value })}
                  maxLength={120}
                />
              </Field>
              <ImageUpload
                label="Your QR code"
                aspect="square"
                maxDimension={900}
                value={p.paymentQr}
                onChange={(paymentQr) => set({ paymentQr })}
                hint="Optional. Printed as-is instead of the automatic QR, without an amount."
              />
              <SwitchRow
                label="Include amount in QR"
                description="The payer's app fills in the balance due automatically."
                checked={draft.upi.includeAmount}
                onCheckedChange={(includeAmount) => update("upi", { includeAmount })}
              />
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-2/50 p-5 sm:w-52">
              {upiPreview ? (
                <>
                  <div className="rounded-xl bg-white p-2 shadow-sm">
                    <QrCodeSvg value={upiPreview} className="size-32" />
                  </div>
                  <span className="mt-2 text-xs text-muted-foreground">Preview (₹1,180)</span>
                </>
              ) : (
                <>
                  <QrCode className="size-10 text-subtle-foreground" />
                  <span className="mt-2 text-center text-xs text-muted-foreground">
                    Enter a valid UPI ID to preview the QR code
                  </span>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
