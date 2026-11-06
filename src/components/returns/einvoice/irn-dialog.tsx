"use client";

import { useState } from "react";
import { toast } from "sonner";
import { saveInvoice } from "@/db/invoices";
import {
  ackNoError,
  cancelWindow,
  irnError,
  parseAckDate,
  withIrnCancelled,
} from "@/lib/gst/einvoice";
import type { EInvoiceStatus, Invoice } from "@/lib/schema";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const STATUS_OPTIONS: { value: EInvoiceStatus; label: string }[] = [
  { value: "pending", label: "Waiting for IRN" },
  { value: "generated", label: "IRN generated" },
  { value: "cancelled", label: "IRN cancelled" },
];

/** Enter or correct the IRN details of one document by hand (copied from the portal). */
export function IrnDialog({
  invoice,
  nowMs,
  onClose,
}: {
  invoice: Invoice;
  nowMs: number;
  onClose: () => void;
}) {
  const e = invoice.eInvoice;
  const [irn, setIrn] = useState(e.irn);
  const [ackNo, setAckNo] = useState(e.ackNo);
  const [ackDate, setAckDate] = useState(e.ackDate);
  const [qr, setQr] = useState(e.qr);
  const [status, setStatus] = useState<EInvoiceStatus>(
    e.status === "not_applicable" ? "pending" : e.status,
  );
  const [cancelReason, setCancelReason] = useState(e.cancelReason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const irnProblem = irnError(irn);
  const ackProblem = ackNoError(ackNo);
  const dateProblem =
    ackDate.trim() && Number.isNaN(parseAckDate(ackDate))
      ? "Use a date like 2026-10-05 14:32:10."
      : null;
  const window = cancelWindow(ackDate, nowMs);

  const save = async () => {
    setError(null);
    if (irnProblem || ackProblem || dateProblem) return setError("Fix the highlighted fields.");
    if (status === "generated" && !irn.trim())
      return setError("Enter the IRN, or choose 'Waiting for IRN'.");
    if (status === "cancelled" && !cancelReason.trim())
      return setError("Say why the IRN was cancelled.");
    setBusy(true);
    try {
      let next: Invoice = {
        ...invoice,
        eInvoice: {
          ...invoice.eInvoice,
          irn: irn.trim(),
          ackNo: ackNo.trim(),
          ackDate: ackDate.trim(),
          qr: qr.trim(),
          status,
        },
      };
      if (status === "cancelled" && !e.cancelledAt)
        next = withIrnCancelled(next, new Date(nowMs).toISOString(), cancelReason);
      else next.eInvoice.cancelReason = cancelReason.trim();
      if (status !== "cancelled") next.eInvoice.cancelledAt = "";
      await saveInvoice(next);
      toast.success("E-invoice details saved");
      onClose();
    } catch {
      /* reported by guardedWrite */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader
          title={`E-invoice details: ${invoice.number}`}
          description="Copy these from the e-invoice portal after it generates the IRN. Nothing is sent anywhere."
        />
        <DialogBody className="space-y-4">
          {window.state === "open" && (
            <Alert tone="info" title={`IRN can still be cancelled for about ${window.hoursLeft}h`}>
              The portal allows cancelling an IRN within 24 hours of generating it (verify on the
              portal). After that, issue a credit note instead.
            </Alert>
          )}
          {window.state === "closed" && status !== "cancelled" && (
            <Alert tone="warning" title="The 24-hour cancel window has passed">
              If this document is wrong, issue a credit note rather than cancelling the IRN.
            </Alert>
          )}
          <Field label="Status">
            <Select value={status} onValueChange={setStatus} options={STATUS_OPTIONS} />
          </Field>
          <Field label="IRN" error={irnProblem} hint="64 characters">
            <Input value={irn} maxLength={64} onChange={(ev) => setIrn(ev.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Acknowledgement number" error={ackProblem}>
              <Input
                inputMode="numeric"
                value={ackNo}
                maxLength={30}
                onChange={(ev) => setAckNo(ev.target.value)}
              />
            </Field>
            <Field label="Acknowledgement date and time" error={dateProblem}>
              <Input
                value={ackDate}
                placeholder="2026-10-05 14:32:10"
                maxLength={40}
                onChange={(ev) => setAckDate(ev.target.value)}
              />
            </Field>
          </div>
          <Field
            label="Signed QR code text"
            optional
            hint="Paste the long text from the portal's response."
          >
            <Textarea
              value={qr}
              rows={3}
              maxLength={6000}
              onChange={(ev) => setQr(ev.target.value)}
            />
          </Field>
          {status === "cancelled" && (
            <Field label="Why was the IRN cancelled?" required>
              <Input
                value={cancelReason}
                maxLength={300}
                onChange={(ev) => setCancelReason(ev.target.value)}
                placeholder="e.g. Duplicate, data entry mistake"
              />
            </Field>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger-foreground">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
