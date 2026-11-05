"use client";

import { Hash, Plus, Sparkles, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { DATE_FORMAT_LABELS } from "@/lib/dates";
import { DOC_TYPE_META, PROFORMA_TITLES } from "@/lib/documents";
import { formatMoney } from "@/lib/format";
import {
  checkGstNumberRules,
  DEFAULT_NUMBER_PATTERN,
  RANDOM_NUMBER_PATTERN,
  formatDocumentNumber,
  gstSeriesUsingRandom,
  NUMBER_TOKENS,
  unknownTokens,
} from "@/lib/numbering";
import { sanitizeDecimalInput, toDec } from "@/lib/money";
import {
  CREATABLE_DOC_TYPES,
  DATE_FORMAT_IDS,
  DOC_TYPES,
  type AppSettings,
  type CreatableDocType,
  type DateFormatId,
  type GstMode,
} from "@/lib/schema";
import { ThemeSegmented } from "@/components/layout/theme-toggle";
import { CurrencySelect, GstRateSelect } from "@/components/forms/pickers";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SwitchRow } from "@/components/ui/switch";
import type { SettingsUpdate } from "./use-settings-draft";

interface SectionProps {
  draft: AppSettings;
  update: SettingsUpdate;
}

const clampInt = (v: string, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.parseInt(v || "0", 10) || 0));

/* ---------------- Invoice defaults ---------------- */

export function DefaultsSection({ draft, update }: SectionProps) {
  const d = draft.invoiceDefaults;
  const set = (partial: Partial<AppSettings["invoiceDefaults"]>) =>
    update("invoiceDefaults", (prev) => ({ ...prev, ...partial }));
  const decl = draft.declarations;
  const setDecl = (partial: Partial<AppSettings["declarations"]>) =>
    update("declarations", (prev) => ({ ...prev, ...partial }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="New documents"
          description="Applied when you create a document. Existing ones keep their values."
        />
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default document type">
              <Select<CreatableDocType>
                value={d.docType}
                onValueChange={(docType) => set({ docType })}
                options={CREATABLE_DOC_TYPES.map((t) => ({
                  value: t,
                  label: DOC_TYPE_META[t].label,
                }))}
              />
            </Field>
            <Field label="Quotation title">
              <Select
                value={d.proformaTitle}
                onValueChange={(proformaTitle) => set({ proformaTitle })}
                options={PROFORMA_TITLES.map((t) => ({ value: t, label: t }))}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Currency">
              <CurrencySelect value={d.currency} onChange={(currency) => set({ currency })} />
            </Field>
            <Field label="Export invoice currency">
              <CurrencySelect
                value={d.exportCurrency}
                onChange={(exportCurrency) => set({ exportCurrency })}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payment terms (days)" hint="Due date = invoice date + this many days.">
              <Input
                inputMode="numeric"
                value={String(d.paymentDays)}
                onChange={(e) => set({ paymentDays: clampInt(e.target.value, 0, 365) })}
                trailing={<span className="pr-2 text-xs">days</span>}
              />
            </Field>
            <Field label="Quotation valid for">
              <Input
                inputMode="numeric"
                value={String(d.quoteValidityDays)}
                onChange={(e) => set({ quoteValidityDays: clampInt(e.target.value, 0, 365) })}
                trailing={<span className="pr-2 text-xs">days</span>}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Default text"
          description="New documents start with this. It updates automatically when you change notes or terms on a document."
        />
        <CardContent className="grid gap-4">
          <Field label="Notes">
            <Textarea
              value={d.notes}
              onChange={(e) => set({ notes: e.target.value })}
              rows={2}
              maxLength={2000}
            />
          </Field>
          <Field label="Terms & conditions">
            <Textarea
              value={d.terms}
              onChange={(e) => set({ terms: e.target.value })}
              rows={3}
              maxLength={2000}
            />
          </Field>
          <Field label="Payment instructions">
            <Textarea
              value={d.paymentInstructions}
              onChange={(e) => set({ paymentInstructions: e.target.value })}
              rows={2}
              maxLength={1000}
            />
          </Field>
          <Field label="Footer">
            <Input
              value={d.footer}
              onChange={(e) => set({ footer: e.target.value })}
              maxLength={300}
              placeholder="This is a computer-generated invoice."
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Declarations" description="Legal statements printed near the totals." />
        <CardContent className="grid gap-4">
          <Field
            label="LUT / Bond number"
            optional
            hint="For exports of services without payment of IGST."
          >
            <Input
              value={decl.lutNumber}
              onChange={(e) => setDecl({ lutNumber: e.target.value })}
              maxLength={60}
              className="sm:max-w-sm"
            />
          </Field>
          <Field label="Export invoice declaration">
            <Textarea
              value={decl.exportText}
              onChange={(e) => setDecl({ exportText: e.target.value })}
              rows={2}
              maxLength={500}
            />
          </Field>
          <Field label="Bill of supply declaration">
            <Textarea
              value={decl.billOfSupplyText}
              onChange={(e) => setDecl({ billOfSupplyText: e.target.value })}
              rows={2}
              maxLength={500}
            />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- GST ---------------- */

export function GstSection({ draft, update }: SectionProps) {
  const g = draft.gst;
  const set = (partial: Partial<AppSettings["gst"]>) =>
    update("gst", (prev) => ({ ...prev, ...partial }));
  const [newRate, setNewRate] = useState("");
  const sortedRates = [...g.rates].sort((a, b) => Number(a) - Number(b));

  const addRate = () => {
    const value = String(Number(newRate));
    if (!newRate || Number.isNaN(Number(value)) || Number(value) > 100) return;
    if (!g.rates.map((r) => String(Number(r))).includes(value)) set({ rates: [...g.rates, value] });
    setNewRate("");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-5 pt-5">
          <SwitchRow
            label="I'm registered for GST"
            description="When off, new documents default to a simple Invoice without GST."
            checked={g.registered}
            onCheckedChange={(registered) =>
              set({
                registered,
                registrationType: registered
                  ? g.registrationType === "unregistered"
                    ? "regular"
                    : g.registrationType
                  : "unregistered",
              })
            }
          />
          <Field
            label="How GST is shown"
            hint={
              g.mode === "split"
                ? "Same state: CGST + SGST (half each). Other state: IGST. You always enter one rate, like 18%."
                : "One “GST” line with the full rate. Simpler, but registered tax invoices normally show the split."
            }
          >
            <Segmented<GstMode>
              fullWidth
              value={g.mode}
              onValueChange={(mode) => set({ mode })}
              options={[
                { value: "split", label: "CGST + SGST / IGST" },
                { value: "single", label: "Single GST %" },
              ]}
            />
          </Field>
          <div className="rounded-xl border border-border bg-surface-2/50 p-4 text-sm">
            <div className="mb-2 text-xs font-medium tracking-wide text-subtle-foreground uppercase">
              Example · ₹10,000 at 18%
            </div>
            {g.mode === "split" ? (
              <div className="grid gap-1 sm:grid-cols-2 sm:gap-6">
                <div>
                  <div className="font-medium">Same state</div>
                  <div className="text-muted-foreground">CGST 9% ₹900 + SGST 9% ₹900</div>
                </div>
                <div>
                  <div className="font-medium">Other state</div>
                  <div className="text-muted-foreground">IGST 18% ₹1,800</div>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">GST 18% ₹1,800</div>
            )}
          </div>
        </CardContent>
      </Card>

      <FilingProfileCard draft={draft} update={update} />

      <Card>
        <CardHeader title="Rates" description="Rates offered on each line item." />
        <CardContent className="grid gap-4">
          <Field label="Default rate for new items">
            <GstRateSelect
              value={g.defaultRate}
              onChange={(defaultRate) => set({ defaultRate })}
              rates={g.rates}
            />
          </Field>
          <div>
            <div className="mb-2 text-[13px] font-medium">Available rates</div>
            <div className="flex flex-wrap gap-2">
              {sortedRates.map((r) => (
                <span
                  key={r}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-surface pr-1 pl-3 text-sm tabular-nums"
                >
                  {Number(r)}%
                  <button
                    type="button"
                    className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger-foreground disabled:opacity-30"
                    aria-label={`Remove ${r}%`}
                    disabled={g.rates.length <= 1}
                    onClick={() => set({ rates: g.rates.filter((x) => x !== r) })}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  addRate();
                }}
              >
                <Input
                  value={newRate}
                  onChange={(e) => setNewRate(sanitizeDecimalInput(e.target.value, 3))}
                  placeholder="e.g. 12"
                  inputMode="decimal"
                  className="h-8 w-24"
                  aria-label="New GST rate"
                  trailing={<span className="pr-1.5 text-xs">%</span>}
                />
                <Button
                  type="submit"
                  size="icon-sm"
                  variant="secondary"
                  aria-label="Add rate"
                  disabled={!newRate}
                >
                  <Plus />
                </Button>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-5 pt-5">
          <SwitchRow
            label="Prices include GST by default"
            description="Rates you type already contain tax; the taxable value is calculated backwards."
            checked={g.pricesIncludeGst}
            onCheckedChange={(pricesIncludeGst) => set({ pricesIncludeGst })}
          />
          <SwitchRow
            label="Round off totals (INR)"
            description="Round the grand total to the nearest rupee with a “Round off” line."
            checked={g.roundOff}
            onCheckedChange={(roundOff) => set({ roundOff })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** ₹5 crore: above this, HSN needs 6 digits and e-invoicing is mandatory. */
const FIVE_CRORE = "50000000";

function FilingProfileCard({ draft, update }: SectionProps) {
  const g = draft.gst;
  const set = (partial: Partial<AppSettings["gst"]>) =>
    update("gst", (prev) => ({ ...prev, ...partial }));
  const aatoKnown = g.aato.trim() !== "" && toDec(g.aato).greaterThan(0);
  const large = aatoKnown && toDec(g.aato).greaterThan(FIVE_CRORE);
  const suggestedHsn: 4 | 6 = large ? 6 : 4;
  const registered = g.registrationType !== "unregistered";

  const setAato = (raw: string) => {
    const aato = sanitizeDecimalInput(raw, 2);
    const isLarge = aato.trim() !== "" && toDec(aato).greaterThan(FIVE_CRORE);
    // HSN digits follow the turnover automatically; the user can still pick the other value.
    set({ aato, hsnDigits: isLarge ? 6 : 4 });
  };

  return (
    <Card>
      <CardHeader
        title="Filing profile"
        description="Tells the app which GST rules apply to you. Ask your CA if unsure."
      />
      <CardContent className="grid gap-5">
        <Field
          label="Registration type"
          hint={
            g.registrationType === "composition"
              ? "Composition dealers pay a flat rate and issue a Bill of Supply — they can't charge GST."
              : g.registrationType === "unregistered"
                ? "Not registered under GST: issue plain invoices without GST."
                : "Regular GST registration: you charge GST and file GSTR-1 and GSTR-3B."
          }
        >
          <Segmented<AppSettings["gst"]["registrationType"]>
            fullWidth
            value={g.registrationType}
            onValueChange={(registrationType) =>
              set({ registrationType, registered: registrationType !== "unregistered" })
            }
            options={[
              { value: "regular", label: "Regular" },
              { value: "composition", label: "Composition" },
              { value: "unregistered", label: "Not registered" },
            ]}
          />
        </Field>
        {g.registrationType === "regular" && (
          <Field
            label="How often you file GSTR-1"
            hint={
              g.filingFrequency === "qrmp"
                ? "Quarterly (QRMP): GSTR-1 and GSTR-3B every quarter, with optional monthly IFF for B2B invoices. Allowed up to ₹5 crore turnover."
                : "Monthly: GSTR-1 by the 11th and GSTR-3B by the 20th of the next month."
            }
          >
            <Segmented<AppSettings["gst"]["filingFrequency"]>
              fullWidth
              value={g.filingFrequency}
              onValueChange={(filingFrequency) => set({ filingFrequency })}
              options={[
                { value: "monthly", label: "Monthly" },
                { value: "qrmp", label: "Quarterly (QRMP)" },
              ]}
            />
          </Field>
        )}
        {registered && (
          <>
            <Field
              label="Annual turnover last year"
              optional
              hint="Total sales of the previous financial year across all GSTINs on your PAN (AATO). It decides HSN digits and e-invoicing."
            >
              <Input
                value={g.aato}
                onChange={(e) => setAato(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 4500000"
                className="tabular sm:max-w-xs"
                leading={<span className="text-[13px]">₹</span>}
              />
            </Field>
            <Field
              label="HSN/SAC digits on invoices"
              hint={
                g.hsnDigits === suggestedHsn
                  ? `${suggestedHsn} digits — ${large ? "turnover above" : "turnover up to"} ₹5 crore.`
                  : `You chose ${g.hsnDigits} digits; ${suggestedHsn} is the usual minimum for your turnover.`
              }
            >
              <Segmented<"4" | "6">
                value={String(g.hsnDigits) as "4" | "6"}
                onValueChange={(v) => set({ hsnDigits: v === "6" ? 6 : 4 })}
                options={[
                  { value: "4", label: "4 digits" },
                  { value: "6", label: "6 digits" },
                ]}
                aria-label="Minimum HSN/SAC digits"
              />
            </Field>
            <SwitchRow
              label="E-invoicing applies to me"
              description={
                large && !g.eInvoiceApplicable
                  ? "Your turnover is above ₹5 crore, so B2B invoices need an IRN from the e-invoice portal. Turn this on."
                  : "Needed when turnover crossed ₹5 crore in any year since 2017-18. B2B invoices then need an IRN from the e-invoice portal."
              }
              checked={g.eInvoiceApplicable}
              onCheckedChange={(eInvoiceApplicable) => set({ eInvoiceApplicable })}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Numbering ---------------- */

const RAND_NOTICE_KEY = "invoice-generator:rand-numbering-notice-dismissed";
const noticeListeners = new Set<() => void>();

function readNoticeDismissed() {
  try {
    return localStorage.getItem(RAND_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

function dismissNotice() {
  try {
    localStorage.setItem(RAND_NOTICE_KEY, "1");
  } catch {
    // Storage unavailable: the notice simply comes back next time.
  }
  noticeListeners.forEach((l) => l());
}

function useNoticeDismissed() {
  return useSyncExternalStore(
    (onChange) => {
      noticeListeners.add(onChange);
      return () => noticeListeners.delete(onChange);
    },
    readNoticeDismissed,
    () => true,
  );
}

/** One-time notice for GST series that still use random numbers (A3). */
function RandomNumberingNotice({ draft, update }: SectionProps) {
  const dismissed = useNoticeDismissed();
  const affected = gstSeriesUsingRandom(draft.numbering);
  if (dismissed || affected.length === 0) return null;
  const switchAll = () => {
    update("numbering", (prev) => {
      const next = { ...prev };
      for (const t of affected) next[t] = { ...next[t], pattern: DEFAULT_NUMBER_PATTERN };
      return next;
    });
    dismissNotice();
  };
  return (
    <Alert
      tone="warning"
      title="GST law needs consecutive invoice numbers"
      icon={<Hash />}
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={switchAll}>
            Switch
          </Button>
          <Button size="sm" variant="ghost" onClick={dismissNotice}>
            Not now
          </Button>
        </div>
      }
    >
      {affected.map((t) => DOC_TYPE_META[t].label).join(", ")}{" "}
      {affected.length === 1 ? "uses" : "use"} random digits. Switch to INV/26-27/001 style — a
      running number per financial year.
    </Alert>
  );
}

export function NumberingSection({ draft, update }: SectionProps) {
  const now = new Date();
  return (
    <div className="space-y-4">
      <RandomNumberingNotice draft={draft} update={update} />
      <Alert tone="info" title="GST tip" icon={<Sparkles />}>
        Tax invoice numbers should be consecutive, unique per financial year and at most 16
        characters. The default{" "}
        <code className="rounded bg-surface px-1 font-mono text-foreground">
          {DEFAULT_NUMBER_PATTERN}
        </code>{" "}
        → INV/26-27/001 does this. Patterns with random digits are unique but not consecutive.
      </Alert>
      {DOC_TYPES.map((t) => {
        const rule = draft.numbering[t];
        const set = (partial: Partial<typeof rule>) =>
          update("numbering", (prev) => ({ ...prev, [t]: { ...prev[t], ...partial } }));
        const example = formatDocumentNumber(rule.pattern, {
          prefix: rule.prefix,
          date: now,
          seq: 1,
          business: draft.profile.name,
          // Stable sample digits so the preview doesn't flicker while typing.
          random: (n) => "4827913".padEnd(n, "0").slice(0, n),
        });
        const unknown = unknownTokens(rule.pattern);
        const gst = checkGstNumberRules(example);
        const warning = unknown.length
          ? `Unknown token${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`
          : t !== "proforma" && t !== "invoice" && (gst.tooLong || gst.invalidChars)
            ? gst.tooLong
              ? `This gives ${example.length} characters — GST allows at most 16.`
              : "Use only letters, digits, “-” and “/”."
            : undefined;
        return (
          <Card key={t}>
            <CardHeader
              title={DOC_TYPE_META[t].label}
              action={
                <span className="rounded-lg bg-surface-2 px-2.5 py-1 font-mono text-[13px] font-medium tabular-nums ring-1 ring-border">
                  {example || "—"}
                </span>
              }
            />
            <CardContent className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                <Field label="Prefix">
                  <Input
                    value={rule.prefix}
                    onChange={(e) => set({ prefix: e.target.value.slice(0, 20) })}
                    className="font-mono"
                  />
                </Field>
                <Field label="Pattern" warning={warning}>
                  <Input
                    value={rule.pattern}
                    onChange={(e) => set({ pattern: e.target.value.slice(0, 80) })}
                    className="font-mono"
                    spellCheck={false}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {NUMBER_TOKENS.map((tok) => (
                  <button
                    key={tok.token}
                    type="button"
                    title={tok.description}
                    onClick={() => set({ pattern: (rule.pattern + tok.token).slice(0, 80) })}
                    className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary-soft-foreground"
                  >
                    {tok.token}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => set({ pattern: DEFAULT_NUMBER_PATTERN })}
                >
                  Use default GST sequence (…/26-27/001)
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => set({ pattern: RANDOM_NUMBER_PATTERN })}
                >
                  Use business code + date + random
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------------- Formats ---------------- */

export function FormatsSection({ draft, update }: SectionProps) {
  const f = draft.formats;
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-5 pt-5">
          <Field label="Date format">
            <Select<DateFormatId>
              value={f.dateFormat}
              onValueChange={(dateFormat) => update("formats", (prev) => ({ ...prev, dateFormat }))}
              options={DATE_FORMAT_IDS.map((id) => ({ value: id, label: DATE_FORMAT_LABELS[id] }))}
              className="sm:max-w-xs"
            />
          </Field>
          <Field label="Number grouping">
            <Segmented
              value={f.numberGrouping}
              onValueChange={(numberGrouping) =>
                update("formats", (prev) => ({ ...prev, numberGrouping }))
              }
              options={[
                { value: "indian", label: formatMoney("1234567", "INR", "indian") },
                { value: "international", label: formatMoney("1234567", "INR", "international") },
              ]}
            />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          title="Appearance"
          description="App theme only — invoices always print on white."
        />
        <CardContent>
          <ThemeSegmented withLabels className="sm:max-w-sm" />
        </CardContent>
      </Card>
    </div>
  );
}
