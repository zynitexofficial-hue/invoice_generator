"use client";

import { Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { saveInvoice } from "@/db/invoices";
import { currencyPrecision, currencySymbol } from "@/lib/currency";
import { todayISO } from "@/lib/dates";
import { PAYMENT_MODE_LABELS } from "@/lib/documents";
import { formatMoney } from "@/lib/format";
import { toDec } from "@/lib/money";
import { PAYMENT_MODES, type AppSettings, type Invoice, type PaymentMode } from "@/lib/schema";
import { objectKey, useRetained } from "@/hooks/use-retained";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DecimalInput } from "@/components/ui/decimal-input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/** Update the amount received on a saved invoice without opening the editor. */
export function RecordPaymentDialog({
  invoice,
  settings,
  onClose,
}: {
  invoice: Invoice | null;
  settings: AppSettings;
  onClose: () => void;
}) {
  const shown = useRetained(invoice);
  return (
    <Dialog open={Boolean(invoice)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        {shown && (
          <PaymentForm
            key={objectKey(shown)}
            invoice={shown}
            settings={settings}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({
  invoice,
  settings,
  onClose,
}: {
  invoice: Invoice;
  settings: AppSettings;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(invoice.payment.amountReceived);
  const [date, setDate] = useState(() => invoice.payment.date || todayISO());
  const [mode, setMode] = useState<PaymentMode>(invoice.payment.mode);
  const [note, setNote] = useState(invoice.payment.note);
  const [busy, setBusy] = useState(false);

  const total = toDec(invoice.summary.grandTotal);
  const tooMuch = toDec(amount).greaterThan(total);
  const money = (v: string) => formatMoney(v, invoice.currency, settings.formats.numberGrouping);

  const save = async () => {
    if (tooMuch) return;
    setBusy(true);
    try {
      await saveInvoice({ ...invoice, payment: { amountReceived: amount, date, mode, note } });
      toast.success("Payment recorded", {
        description: `${invoice.number} updated. Re-download the PDF to share the new status.`,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader
        icon={<Wallet />}
        title="Record payment"
        description={`${invoice.number} · total ${money(invoice.summary.grandTotal)}`}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <DialogBody className="grid gap-4">
          <Field
            label="Total amount received"
            error={tooMuch ? "That's more than the invoice total." : undefined}
            action={
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setAmount(total.toFixed(currencyPrecision(invoice.currency)))}
              >
                Full amount
              </button>
            }
          >
            <DecimalInput
              value={amount}
              onValueChange={setAmount}
              maxDecimals={currencyPrecision(invoice.currency)}
              leading={<span className="text-[13px]">{currencySymbol(invoice.currency)}</span>}
              placeholder="0.00"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <DatePicker
                value={date}
                onChange={setDate}
                dateFormat={settings.formats.dateFormat}
              />
            </Field>
            <Field label="Mode">
              <Select<PaymentMode>
                value={mode}
                onValueChange={setMode}
                options={PAYMENT_MODES.filter(Boolean).map((m) => ({
                  value: m,
                  label: PAYMENT_MODE_LABELS[m],
                }))}
                placeholder="Not specified"
              />
            </Field>
          </div>
          <Field label="Note" optional>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="Txn ID, cheque no…"
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={busy} disabled={tooMuch}>
            Save payment
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
