"use client";

import { FileText, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { DOC_TYPE_META, PROFORMA_TITLES } from "@/lib/documents";
import { addDaysISO, formatDate } from "@/lib/dates";
import { DOC_TYPES, type DocType } from "@/lib/schema";
import { fieldId } from "@/lib/validation";
import { useEditor } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import { CurrencySelect } from "@/components/forms/pickers";
import { useEditorContext, useFieldIssue } from "./editor-context";
import { AddFieldLink, EditorSection } from "./section";
import { useEditorActions } from "./use-editor-actions";

export function DocumentSection() {
  const { settings } = useEditorContext();
  const d = useEditor(
    useShallow((s) => ({
      docType: s.invoice!.docType,
      docTitle: s.invoice!.docTitle,
      number: s.invoice!.number,
      invoiceDate: s.invoice!.invoiceDate,
      dueDate: s.invoice!.dueDate,
      currency: s.invoice!.currency,
      referenceNo: s.invoice!.referenceNo,
      poNo: s.invoice!.poNo,
    })),
  );
  const patch = useEditor((s) => s.patch);
  const { changeDocType, regenerateNumber, setInvoiceDate } = useEditorActions();
  const numberIssue = useFieldIssue(fieldId.number);
  const dateIssue = useFieldIssue(fieldId.invoiceDate);
  const dueIssue = useFieldIssue(fieldId.dueDate);
  const meta = DOC_TYPE_META[d.docType];
  // Currency, reference and PO are rarely changed; they open automatically when in use.
  const [showMore, setShowMore] = useState(false);
  const moreOpen =
    showMore || d.docType === "export" || d.currency !== "INR" || Boolean(d.referenceNo || d.poNo);
  const fmt = settings.formats.dateFormat;
  // Number and dates are filled in automatically, so the section rests as a one-line summary.
  const summary = [
    d.docType === "proforma" ? d.docTitle || "Quotation" : meta.label,
    d.number,
    d.invoiceDate &&
      `${formatDate(d.invoiceDate, fmt)}${d.dueDate ? ` → ${formatDate(d.dueDate, fmt)}` : ""}`,
    d.currency !== "INR" && d.currency,
  ]
    .filter(Boolean)
    .join(" · ");
  const hasIssue = Boolean(
    numberIssue.error || numberIssue.warning || dateIssue.error || dueIssue.error,
  );

  const duePresets = d.invoiceDate
    ? d.docType === "proforma"
      ? [7, 15, 30].map((n) => ({ label: `${n} days`, iso: addDaysISO(d.invoiceDate, n) }))
      : [
          { label: "On receipt", iso: d.invoiceDate },
          ...[7, 15, 30, 45].map((n) => ({ label: `Net ${n}`, iso: addDaysISO(d.invoiceDate, n) })),
        ]
    : undefined;

  return (
    <EditorSection
      title="Document"
      icon={<FileText />}
      collapsible
      defaultOpen={d.docType === "export"}
      hasIssue={hasIssue}
      fields={[fieldId.number, fieldId.invoiceDate, fieldId.dueDate]}
      summary={summary}
    >
      <div className="grid gap-2.5 sm:gap-3">
        <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
          <Field label="Type">
            <Select<DocType>
              value={d.docType}
              onValueChange={(v) => void changeDocType(v)}
              options={DOC_TYPES.map((t) => ({
                value: t,
                label: DOC_TYPE_META[t].label,
                description: DOC_TYPE_META[t].description,
              }))}
              renderValue={(v) => DOC_TYPE_META[v].label}
            />
          </Field>
          <Field
            label={`${meta.shortLabel} number`}
            id={fieldId.number}
            error={numberIssue.error}
            warning={numberIssue.warning}
          >
            <Input
              value={d.number}
              onChange={(e) => patch({ number: e.target.value, autoNumber: null })}
              className="font-medium tabular"
              spellCheck={false}
              maxLength={60}
              trailing={
                <Tooltip content="Generate a new number">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void regenerateNumber()}
                    aria-label="Generate a new number"
                  >
                    <RefreshCw />
                  </Button>
                </Tooltip>
              }
            />
          </Field>
        </div>

        {d.docType === "proforma" && (
          <Field label="Title on document">
            <Segmented
              fullWidth
              value={
                (PROFORMA_TITLES as readonly string[]).includes(d.docTitle)
                  ? d.docTitle
                  : "Quotation"
              }
              onValueChange={(v) => patch({ docTitle: v })}
              options={PROFORMA_TITLES.map((t) => ({ value: t, label: t }))}
            />
          </Field>
        )}

        <div className="grid gap-2.5 min-[360px]:grid-cols-2 sm:gap-3">
          <Field label="Date" id={fieldId.invoiceDate} error={dateIssue.error}>
            <DatePicker value={d.invoiceDate} onChange={setInvoiceDate} dateFormat={fmt} />
          </Field>
          <Field label={meta.dueLabel} id={fieldId.dueDate} error={dueIssue.error} optional>
            <DatePicker
              value={d.dueDate}
              onChange={(iso) => patch({ dueDate: iso })}
              dateFormat={fmt}
              clearable
              min={d.invoiceDate}
              presets={duePresets}
              placeholder="None"
            />
          </Field>
        </div>

        {!moreOpen && (
          <div>
            <AddFieldLink onClick={() => setShowMore(true)}>Currency, reference, PO</AddFieldLink>
          </div>
        )}
        <Collapse open={moreOpen}>
          <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
            <Field label="Currency" className="sm:col-span-2">
              <CurrencySelect
                value={d.currency}
                onChange={(c) =>
                  patch({ currency: c, roundOff: c === "INR" ? settings.gst.roundOff : false })
                }
              />
            </Field>
            <Field label={d.docType === "export" ? "Reference / Project" : "Reference"} optional>
              <Input
                value={d.referenceNo}
                onChange={(e) => patch({ referenceNo: e.target.value })}
                maxLength={60}
                placeholder="e.g. Project Phoenix"
              />
            </Field>
            <Field label="PO number" optional>
              <Input
                value={d.poNo}
                onChange={(e) => patch({ poNo: e.target.value })}
                maxLength={60}
                placeholder="Customer's purchase order"
              />
            </Field>
          </div>
        </Collapse>
      </div>
    </EditorSection>
  );
}
