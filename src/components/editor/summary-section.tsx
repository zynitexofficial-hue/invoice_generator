"use client";

import { Calculator, ChevronDown, CircleCheck, NotebookPen, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { currencyPrecision, currencySymbol } from "@/lib/currency";
import { DOC_TYPE_META, PAYMENT_MODE_LABELS } from "@/lib/documents";
import { formatMoney } from "@/lib/format";
import { formatRate, halfRate, sellerStateCode, stateTaxLabel } from "@/lib/gst/tax";
import { toDec } from "@/lib/money";
import { PAYMENT_MODES, type GstMode, type PaymentMode, type SupplyType } from "@/lib/schema";
import { fieldId } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { useEditor } from "@/stores/editor-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { DatePicker } from "@/components/ui/date-picker";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SwitchRow } from "@/components/ui/switch";
import { useEditorContext, useEditorTotals, useFieldIssue } from "./editor-context";
import { DiscountInput } from "./items-section";
import { EditorSection } from "./section";

/* ---------------- Totals & adjustments ---------------- */

export function SummarySection() {
  const { settings } = useEditorContext();
  const totals = useEditorTotals();
  const inv = useEditor(
    useShallow((s) => ({
      currency: s.invoice!.currency,
      docType: s.invoice!.docType,
      invoiceDiscount: s.invoice!.invoiceDiscount,
      pricesIncludeGst: s.invoice!.pricesIncludeGst,
      gstMode: s.invoice!.gstMode,
      supplyType: s.invoice!.supplyType,
      roundOff: s.invoice!.roundOff,
      seller: s.invoice!.seller,
    })),
  );
  const patch = useEditor((s) => s.patch);
  const discountIssue = useFieldIssue(fieldId.invoiceDiscount);
  const modeIssue = useFieldIssue("field-gst-mode");
  const [advanced, setAdvanced] = useState(
    Boolean(inv.invoiceDiscount.value) || inv.pricesIncludeGst || inv.supplyType !== "auto",
  );
  const money = (v: string) => formatMoney(v, inv.currency, settings.formats.numberGrouping);
  const hasTax = DOC_TYPE_META[inv.docType].hasTax;
  const stateTax = stateTaxLabel(sellerStateCode(inv.seller));
  const kindLabel =
    totals.taxKind === "intra"
      ? `CGST + ${stateTax}`
      : totals.taxKind === "inter"
        ? "IGST"
        : totals.taxKind === "single"
          ? "GST"
          : "No tax";

  const rows: { label: string; value: string; tone?: "muted" | "discount" }[] = [
    {
      label: totals.pricesIncludeGst ? "Subtotal (incl. GST)" : "Subtotal",
      value: money(totals.subtotal),
    },
  ];
  if (toDec(totals.invoiceDiscount).greaterThan(0))
    rows.push({ label: "Discount", value: `−${money(totals.invoiceDiscount)}`, tone: "discount" });
  if (hasTax && (totals.pricesIncludeGst || toDec(totals.invoiceDiscount).greaterThan(0)))
    rows.push({ label: "Taxable value", value: money(totals.taxableTotal), tone: "muted" });
  for (const r of totals.taxSummary) {
    if (toDec(r.rate).isZero()) continue;
    if (totals.taxKind === "intra") {
      rows.push({ label: `CGST ${halfRate(r.rate)}%`, value: money(r.cgst), tone: "muted" });
      rows.push({ label: `${stateTax} ${halfRate(r.rate)}%`, value: money(r.sgst), tone: "muted" });
    } else if (totals.taxKind === "inter")
      rows.push({ label: `IGST ${formatRate(r.rate)}%`, value: money(r.igst), tone: "muted" });
    else rows.push({ label: `GST ${formatRate(r.rate)}%`, value: money(r.gst), tone: "muted" });
  }
  if (!toDec(totals.roundOff).isZero())
    rows.push({ label: "Round off", value: money(totals.roundOff), tone: "muted" });

  return (
    <EditorSection
      title="Summary"
      icon={<Calculator />}
      action={
        hasTax ? (
          <Badge tone="primary" size="sm">
            {kindLabel}
          </Badge>
        ) : (
          <Badge size="sm">No GST</Badge>
        )
      }
    >
      <div className="space-y-1.5 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4">
            <span className={cn(r.tone === "muted" && "text-muted-foreground")}>{r.label}</span>
            <span
              className={cn(
                "tabular-nums",
                r.tone === "discount" && "text-success-foreground",
                r.tone === "muted" && "text-muted-foreground",
              )}
            >
              {r.value}
            </span>
          </div>
        ))}
        <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-border pt-3">
          <span className="font-semibold">Total</span>
          <AnimatedAmount
            value={money(totals.grandTotal)}
            className="text-xl font-semibold tracking-[-0.02em]"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        aria-expanded={advanced}
        className="mt-4 flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:focus-ring"
      >
        Discount, tax & rounding
        <ChevronDown
          className={cn("size-4 transition-transform duration-200", advanced && "rotate-180")}
        />
      </button>
      <Collapse open={advanced}>
        <div className="mt-2 grid gap-3 rounded-xl border border-border bg-surface-2/40 p-3 sm:p-4">
          <Field
            label="Invoice discount"
            optional
            id={fieldId.invoiceDiscount}
            error={discountIssue.error}
            hint="Applied before tax, spread across items."
          >
            <DiscountInput
              kind={inv.invoiceDiscount.kind}
              value={inv.invoiceDiscount.value}
              symbol={currencySymbol(inv.currency)}
              onChange={(invoiceDiscount) => patch({ invoiceDiscount })}
              label="Invoice discount"
            />
          </Field>
          {hasTax && (
            <>
              <SwitchRow
                label="Prices include GST"
                description="Rates you enter already contain tax; the taxable value is worked out for you."
                checked={inv.pricesIncludeGst}
                onCheckedChange={(v) => patch({ pricesIncludeGst: v })}
              />
              <Field label="GST display" id="field-gst-mode" warning={modeIssue.warning}>
                <Segmented<GstMode>
                  fullWidth
                  value={inv.gstMode}
                  onValueChange={(v) => patch({ gstMode: v })}
                  options={[
                    { value: "split", label: "CGST + SGST / IGST" },
                    { value: "single", label: "Single GST" },
                  ]}
                />
              </Field>
              {inv.gstMode === "split" && (
                <Field
                  label="Supply type"
                  hint="Auto compares your state with the place of supply. Pick Inter-state for SEZ customers — they always get IGST."
                >
                  <Segmented<SupplyType>
                    fullWidth
                    value={inv.supplyType}
                    onValueChange={(v) => patch({ supplyType: v })}
                    options={[
                      { value: "auto", label: "Auto" },
                      { value: "intra", label: "Same state" },
                      { value: "inter", label: "Inter-state" },
                    ]}
                  />
                </Field>
              )}
            </>
          )}
          {currencyPrecision(inv.currency) > 0 && (
            <SwitchRow
              label="Round off total"
              description="Round the grand total to the nearest whole unit."
              checked={inv.roundOff}
              onCheckedChange={(v) => patch({ roundOff: v })}
            />
          )}
        </div>
      </Collapse>
    </EditorSection>
  );
}

/** Amount that cross-fades when it changes (no layout shift). */
export function AnimatedAmount({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("relative inline-flex tabular-nums", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ---------------- Payment ---------------- */

export function PaymentSection() {
  const { settings } = useEditorContext();
  const totals = useEditorTotals();
  const { payment, currency, docType } = useEditor(
    useShallow((s) => ({
      payment: s.invoice!.payment,
      currency: s.invoice!.currency,
      docType: s.invoice!.docType,
    })),
  );
  const patchPayment = useEditor((s) => s.patchPayment);
  const issue = useFieldIssue(fieldId.amountReceived);
  if (!DOC_TYPE_META[docType].hasPayment) return null;
  const money = (v: string) => formatMoney(v, currency, settings.formats.numberGrouping);
  const status = totals.paymentStatus;

  return (
    <EditorSection
      title="Payment"
      icon={<Wallet />}
      collapsible
      defaultOpen={Boolean(payment.amountReceived)}
      summary={
        status === "unpaid"
          ? "Not paid yet"
          : status === "paid"
            ? "Fully paid"
            : `Balance ${money(totals.balanceDue)}`
      }
      action={
        <Badge
          tone={status === "paid" ? "success" : status === "partial" ? "warning" : "neutral"}
          size="sm"
          dot
        >
          {status === "paid" ? "Paid" : status === "partial" ? "Partially paid" : "Unpaid"}
        </Badge>
      }
    >
      <div className="grid gap-2.5 sm:gap-3">
        <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
          <Field label="Amount received" id={fieldId.amountReceived} error={issue.error}>
            <DecimalInput
              value={payment.amountReceived}
              onValueChange={(v) => patchPayment({ amountReceived: v })}
              maxDecimals={currencyPrecision(currency)}
              leading={<span className="text-[13px]">{currencySymbol(currency)}</span>}
              placeholder="0.00"
            />
          </Field>
          <Field label="Received on" optional>
            <DatePicker
              value={payment.date}
              onChange={(iso) => patchPayment({ date: iso })}
              dateFormat={settings.formats.dateFormat}
              clearable
              placeholder="Payment date"
            />
          </Field>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
          <Field label="Mode" optional>
            <Select<PaymentMode>
              value={payment.mode}
              onValueChange={(v) => patchPayment({ mode: v })}
              options={PAYMENT_MODES.filter(Boolean).map((m) => ({
                value: m,
                label: PAYMENT_MODE_LABELS[m],
              }))}
              placeholder="Not specified"
            />
          </Field>
          <Field label="Note" optional>
            <Input
              value={payment.note}
              onChange={(e) => patchPayment({ note: e.target.value })}
              maxLength={200}
              placeholder="Txn ID, cheque no…"
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2/60 px-4 py-3 text-sm">
          <div>
            <div className="text-muted-foreground">Balance due</div>
            <AnimatedAmount value={money(totals.balanceDue)} className="text-lg font-semibold" />
          </div>
          {status !== "paid" && toDec(totals.grandTotal).greaterThan(0) && (
            <Button
              size="sm"
              variant="soft"
              onClick={() => patchPayment({ amountReceived: totals.grandTotal })}
            >
              <CircleCheck />
              Mark fully paid
            </Button>
          )}
        </div>
      </div>
    </EditorSection>
  );
}

/* ---------------- Notes & terms ---------------- */

export function NotesSection() {
  const n = useEditor(
    useShallow((s) => ({
      notes: s.invoice!.notes,
      terms: s.invoice!.terms,
      footer: s.invoice!.footer,
      declaration: s.invoice!.declaration,
      docType: s.invoice!.docType,
    })),
  );
  const patch = useEditor((s) => s.patch);
  const showDeclaration =
    n.docType === "export" || n.docType === "bill_of_supply" || Boolean(n.declaration);
  return (
    <EditorSection
      title="Notes & terms"
      icon={<NotebookPen />}
      collapsible
      defaultOpen={false}
      summary={
        [n.notes && "Notes", n.terms && "Terms", n.footer && "Footer"]
          .filter(Boolean)
          .join(" · ") || "Nothing added"
      }
    >
      <div className="grid gap-2.5 sm:gap-3">
        <Field label="Notes" optional>
          <Textarea
            value={n.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            rows={2}
            maxLength={2000}
            placeholder="Thank you for your business!"
          />
        </Field>
        <Field label="Terms & conditions" optional>
          <Textarea
            value={n.terms}
            onChange={(e) => patch({ terms: e.target.value })}
            rows={3}
            maxLength={2000}
            placeholder="Payment due within 15 days…"
          />
        </Field>
        {showDeclaration && (
          <Field
            label="Declaration"
            hint={
              n.docType === "export"
                ? "LUT statement printed on export invoices."
                : "Printed near the totals."
            }
          >
            <Textarea
              value={n.declaration}
              onChange={(e) => patch({ declaration: e.target.value })}
              rows={2}
              maxLength={500}
            />
          </Field>
        )}
        <Field label="Footer" optional>
          <Input
            value={n.footer}
            onChange={(e) => patch({ footer: e.target.value })}
            maxLength={300}
            placeholder="e.g. This is a computer-generated invoice."
          />
        </Field>
      </div>
    </EditorSection>
  );
}
