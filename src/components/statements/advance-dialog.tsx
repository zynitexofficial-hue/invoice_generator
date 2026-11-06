"use client";

import { Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PaymentError, recordAdvance } from "@/db/payments";
import { todayISO } from "@/lib/dates";
import { PAYMENT_MODE_LABELS } from "@/lib/documents";
import { PAYMENT_MODES, type AppSettings, type PaymentMode } from "@/lib/schema";
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

/** Record money received before an invoice exists. It can be applied to an invoice later. */
export function AdvanceDialog({
  open,
  customerId,
  customerName,
  settings,
  onClose,
}: {
  open: boolean;
  customerId: string;
  customerName: string;
  settings: AppSettings;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        {open && (
          <AdvanceForm
            customerId={customerId}
            customerName={customerName}
            settings={settings}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AdvanceForm({
  customerId,
  customerName,
  settings,
  onClose,
}: {
  customerId: string;
  customerName: string;
  settings: AppSettings;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState<PaymentMode>(settings.payments.defaultMode);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const adv = await recordAdvance({ customerId, customerName, amount, date, mode, reference });
      toast.success("Advance recorded", { description: `Receipt ${adv.receiptNo}` });
      onClose();
    } catch (e) {
      setError(e instanceof PaymentError ? e.message : "Couldn't save the advance.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader
        icon={<Wallet />}
        title="Record an advance"
        description={`Money received from ${customerName} before an invoice. Apply it to an invoice later from Payments.`}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <DialogBody className="grid gap-4">
          <Field label="Amount received">
            <DecimalInput
              value={amount}
              onValueChange={setAmount}
              maxDecimals={2}
              leading={<span className="text-[13px]">₹</span>}
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
            <Field label="Mode" optional>
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
          <Field label="Reference" optional>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={80}
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-danger-foreground">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={busy} disabled={!amount}>
            Save advance
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
