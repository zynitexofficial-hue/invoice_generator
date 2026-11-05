"use client";

import { Landmark } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { invoiceHasTax } from "@/lib/gst/tax";
import { sanitizeDecimalInput } from "@/lib/money";
import {
  EXPORT_WITH_PAYMENT_DECLARATION,
  SEZ_UNDER_LUT_DECLARATION,
  SEZ_WITH_PAYMENT_DECLARATION,
} from "@/lib/render/view-model";
import type { DocType, ExportType, Invoice, SupplyNature } from "@/lib/schema";
import { fieldId } from "@/lib/validation";
import { useEditor } from "@/stores/editor-store";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SwitchRow } from "@/components/ui/switch";
import { useEditorContext, useFieldIssue } from "./editor-context";
import { EditorSection } from "./section";

export const SUPPLY_NATURE_LABELS: Record<SupplyNature, string> = {
  taxable: "Taxable",
  nil: "Nil-rated",
  exempt: "Exempt",
  non_gst: "Non-GST",
  zero_rated: "Zero-rated (export/SEZ)",
};

const SUPPLY_NATURE_HELP: Record<SupplyNature, string> = {
  taxable: "Normal sale with GST.",
  nil: "Goods or services with a 0% GST rate (e.g. fresh vegetables). Use 0% on the items.",
  exempt: "Supplies exempt from GST by notification. Use 0% on the items.",
  non_gst: "Outside GST altogether (e.g. petrol, alcohol for drinking). Use 0% on the items.",
  zero_rated: "Exports and supplies to SEZ units — no GST, or IGST that can be refunded.",
};

/** Document types where GST details mean something (not quotations or non-GST invoices). */
export function hasGstDetails(docType: DocType) {
  return docType !== "invoice" && docType !== "proforma";
}

/**
 * Advanced GST facts of a document — supply nature, reverse charge, SEZ and
 * export details. Rarely changed, so it rests collapsed as a one-line summary.
 */
export function GstDetailsSection() {
  const { settings } = useEditorContext();
  const d = useEditor(
    useShallow((s) => ({
      docType: s.invoice!.docType,
      currency: s.invoice!.currency,
      supplyNature: s.invoice!.supplyNature,
      reverseCharge: s.invoice!.reverseCharge,
      sez: s.invoice!.sez,
      exportDetails: s.invoice!.exportDetails,
      declaration: s.invoice!.declaration,
      hasTax: invoiceHasTax(s.invoice!),
    })),
  );
  const patch = useEditor((s) => s.patch);
  const typeIssue = useFieldIssue(fieldId.exportType);
  const lutIssue = useFieldIssue(fieldId.lutNumber);
  const rateIssue = useFieldIssue(fieldId.exchangeRate);
  if (!hasGstDetails(d.docType)) return null;

  const isExport = d.docType === "export";
  const ex = d.exportDetails;
  const canSez = !isExport && d.docType !== "bill_of_supply";
  const canReverseCharge = !isExport && d.docType !== "bill_of_supply";
  const setExport = (partial: Partial<Invoice["exportDetails"]>) =>
    patch({ exportDetails: { ...ex, ...partial } });
  const fmt = settings.formats.dateFormat;

  const setExportType = (type: ExportType) => {
    const lut = ex.lutNumber || settings.declarations.lutNumber.trim();
    patch({
      exportDetails: { ...ex, type, lutNumber: type === "wopay" ? lut : ex.lutNumber },
      supplyNature: "zero_rated",
      // Swap the printed declaration to match (the user can still edit it under Notes & terms).
      declaration:
        type === "wpay"
          ? EXPORT_WITH_PAYMENT_DECLARATION
          : d.declaration === EXPORT_WITH_PAYMENT_DECLARATION || !d.declaration.trim()
            ? settings.declarations.exportText
            : d.declaration,
    });
  };

  const setSez = (sez: Invoice["sez"]) => {
    const sezTexts = [SEZ_WITH_PAYMENT_DECLARATION, SEZ_UNDER_LUT_DECLARATION];
    const ownText = d.declaration.trim() && !sezTexts.includes(d.declaration);
    patch({
      sez,
      supplyNature: sez.enabled
        ? "zero_rated"
        : d.supplyNature === "zero_rated"
          ? "taxable"
          : d.supplyNature,
      declaration: ownText
        ? d.declaration
        : !sez.enabled
          ? ""
          : sez.withPayment
            ? SEZ_WITH_PAYMENT_DECLARATION
            : SEZ_UNDER_LUT_DECLARATION,
      // SEZ supplies under LUT print the LUT number too.
      exportDetails:
        sez.enabled && !sez.withPayment && !ex.lutNumber
          ? { ...ex, lutNumber: settings.declarations.lutNumber.trim() }
          : ex,
    });
  };

  const summary = [
    isExport
      ? ex.type === "wpay"
        ? "Export with IGST"
        : ex.type === "wopay"
          ? "Export under LUT"
          : "Export type not chosen"
      : SUPPLY_NATURE_LABELS[d.supplyNature],
    d.sez.enabled && (d.sez.withPayment ? "SEZ with IGST" : "SEZ under LUT"),
    canReverseCharge && d.reverseCharge && "Reverse charge",
    isExport && d.currency !== "INR" && ex.exchangeRate && `1 ${d.currency} = ₹${ex.exchangeRate}`,
    isExport && ex.shippingBillNo && `Shipping bill ${ex.shippingBillNo}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const hasIssue = Boolean(
    typeIssue.warning || lutIssue.error || rateIssue.error || rateIssue.warning,
  );

  return (
    <EditorSection
      title="GST details"
      icon={<Landmark />}
      collapsible
      defaultOpen={false}
      hasIssue={hasIssue}
      fields={[fieldId.exportType, fieldId.lutNumber, fieldId.exchangeRate]}
      summary={summary}
    >
      <div className="grid gap-3 sm:gap-4">
        {isExport ? (
          <>
            <Field
              label="Export type"
              id={fieldId.exportType}
              warning={typeIssue.warning}
              hint={
                ex.type === "wpay"
                  ? "IGST is charged on the items and can be claimed back as a refund."
                  : "No GST is charged. You need a Letter of Undertaking (LUT) filed on the GST portal."
              }
            >
              <Segmented<ExportType>
                fullWidth
                value={ex.type}
                onValueChange={setExportType}
                options={[
                  { value: "wopay", label: "Under LUT (no GST)" },
                  { value: "wpay", label: "With IGST payment" },
                ]}
                aria-label="Export type"
              />
            </Field>
            {d.currency !== "INR" && (
              <Field
                label="Exchange rate"
                id={fieldId.exchangeRate}
                error={rateIssue.error}
                hint="Rupee value of one unit of the invoice currency on the invoice date — GST returns are in rupees."
              >
                <Input
                  value={ex.exchangeRate}
                  onChange={(e) =>
                    setExport({ exchangeRate: sanitizeDecimalInput(e.target.value, 4) })
                  }
                  inputMode="decimal"
                  placeholder="0.00"
                  className="tabular"
                  leading={
                    <span className="text-[13px] whitespace-nowrap">1 {d.currency} = ₹</span>
                  }
                />
              </Field>
            )}
            {ex.type !== "wpay" && (
              <Field
                label="LUT / bond number"
                id={fieldId.lutNumber}
                error={lutIssue.error}
                hint="Printed with the export declaration."
              >
                <Input
                  value={ex.lutNumber}
                  onChange={(e) => setExport({ lutNumber: e.target.value.slice(0, 60) })}
                  placeholder={settings.declarations.lutNumber || "e.g. AD2705260001234"}
                  spellCheck={false}
                />
              </Field>
            )}
            <div className="grid gap-3 min-[360px]:grid-cols-2">
              <Field label="Shipping bill no." optional>
                <Input
                  value={ex.shippingBillNo}
                  onChange={(e) => setExport({ shippingBillNo: e.target.value.slice(0, 20) })}
                  spellCheck={false}
                />
              </Field>
              <Field label="Shipping bill date" optional>
                <DatePicker
                  value={ex.shippingBillDate}
                  onChange={(shippingBillDate) => setExport({ shippingBillDate })}
                  dateFormat={fmt}
                  clearable
                  placeholder="None"
                />
              </Field>
            </div>
            <Field
              label="Port code"
              optional
              hint="6-character code of the port of export, e.g. INBOM4. Leave empty for services."
            >
              <Input
                value={ex.portCode}
                onChange={(e) =>
                  setExport({
                    portCode: e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 10),
                  })
                }
                className="font-mono uppercase sm:max-w-40"
                spellCheck={false}
              />
            </Field>
          </>
        ) : (
          <Field label="Type of supply" hint={SUPPLY_NATURE_HELP[d.supplyNature]}>
            <Select<SupplyNature>
              value={d.supplyNature}
              onValueChange={(supplyNature) => patch({ supplyNature })}
              options={(Object.keys(SUPPLY_NATURE_LABELS) as SupplyNature[]).map((v) => ({
                value: v,
                label: SUPPLY_NATURE_LABELS[v],
              }))}
            />
          </Field>
        )}

        {canReverseCharge && (
          <SwitchRow
            label="Reverse charge"
            description="The customer pays the GST instead of you (e.g. legal or GTA services to a business). The document will say “Tax payable on reverse charge: Yes”."
            checked={d.reverseCharge}
            onCheckedChange={(reverseCharge) => patch({ reverseCharge })}
          />
        )}

        {canSez && (
          <div className="grid gap-2.5">
            <SwitchRow
              label="Supply to an SEZ"
              description="The customer is a unit or developer in a Special Economic Zone. It always counts as inter-state."
              checked={d.sez.enabled}
              onCheckedChange={(enabled) => setSez({ ...d.sez, enabled })}
            />
            {d.sez.enabled && (
              <Segmented<"lut" | "pay">
                fullWidth
                value={d.sez.withPayment ? "pay" : "lut"}
                onValueChange={(v) => setSez({ enabled: true, withPayment: v === "pay" })}
                options={[
                  { value: "lut", label: "Under LUT (no GST)" },
                  { value: "pay", label: "With IGST payment" },
                ]}
                aria-label="SEZ supply with or without payment of IGST"
              />
            )}
            {d.sez.enabled && !d.sez.withPayment && (
              <Field label="LUT / bond number" optional>
                <Input
                  value={ex.lutNumber}
                  onChange={(e) => setExport({ lutNumber: e.target.value.slice(0, 60) })}
                  placeholder={settings.declarations.lutNumber || "e.g. AD2705260001234"}
                  spellCheck={false}
                />
              </Field>
            )}
          </div>
        )}

        {!d.hasTax && d.docType !== "bill_of_supply" && (
          <p className="text-xs text-muted-foreground">No GST is charged on this document.</p>
        )}
      </div>
    </EditorSection>
  );
}
