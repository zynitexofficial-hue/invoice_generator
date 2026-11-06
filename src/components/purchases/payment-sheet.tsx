"use client";

import { Trash } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { addPurchasePayment, removePurchasePayment } from "@/db/purchases";
import { objectKey, useRetained } from "@/hooks/use-retained";
import { currencySymbol } from "@/lib/currency";
import { formatDate, todayISO } from "@/lib/dates";
import { PAYMENT_MODE_LABELS } from "@/lib/documents";
import { formatMoney } from "@/lib/format";
import { toDec } from "@/lib/money";
import { PAYMENT_MODES, type AppSettings, type PaymentMode, type Purchase } from "@/lib/schema";
import { ResponsiveSheet, SheetForm } from "@/components/money/sheet-form";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/ui/confirm";
import { DatePicker } from "@/components/ui/date-picker";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/** Record (and review) payments made against one bill. */
export function PaymentSheet({
  bill,
  settings,
  onClose,
}: {
  bill: Purchase | null;
  settings: AppSettings;
  onClose: () => void;
}) {
  const shown = useRetained(bill);
  return (
    <ResponsiveSheet
      open={Boolean(bill)}
      onClose={onClose}
      title="Payments on this bill"
      description={
        shown ? `${shown.vendorName}${shown.billNo ? ` · bill ${shown.billNo}` : ""}` : ""
      }
    >
      {shown && (
        <PaymentForm key={objectKey(shown)} bill={shown} settings={settings} onClose={onClose} />
      )}
    </ResponsiveSheet>
  );
}

function PaymentForm({
  bill,
  settings,
  onClose,
}: {
  bill: Purchase;
  settings: AppSettings;
  onClose: () => void;
}) {
  const money = (v: string) =>
    formatMoney(v, settings.invoiceDefaults.currency, settings.formats.numberGrouping);
  const [current, setCurrent] = useState(bill);
  const [amount, setAmount] = useState(bill.summary.balance === "0.00" ? "" : bill.summary.balance);
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState<PaymentMode>("");
  const [reference, setReference] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const amountError = toDec(amount).greaterThan(0) ? null : "Enter an amount more than 0.";
  const dateError = date ? null : "Pick the payment date.";
  const over = toDec(amount).greaterThan(current.summary.balance);

  const save = async () => {
    setTouched(true);
    if (amountError || dateError) return;
    setBusy(true);
    try {
      const updated = await addPurchasePayment(current.id, {
        date,
        amount,
        mode,
        reference: reference.trim(),
      });
      setCurrent(updated);
      toast.success("Payment recorded");
      setAmount(updated.summary.balance === "0.00" ? "" : updated.summary.balance);
      setReference("");
      setTouched(false);
      if (updated.paymentStatus === "paid") onClose();
    } catch {
      // storage error dialog already shown
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: "Remove this payment?",
      description: "The bill's balance goes back up.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    try {
      setCurrent(await removePurchasePayment(current.id, id));
    } catch {
      /* storage error dialog already shown */
    }
  };

  return (
    <SheetForm
      onSubmit={() => void save()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
          <Button variant="primary" type="submit" loading={busy}>
            Record payment
          </Button>
        </>
      }
    >
      <dl className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2/70 px-4 py-3 text-sm ring-1 ring-border">
        <div>
          <dt className="text-xs text-muted-foreground">Bill total</dt>
          <dd className="font-medium tabular-nums">{money(current.summary.total)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Paid</dt>
          <dd className="font-medium tabular-nums">{money(current.summary.paid)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Balance</dt>
          <dd className="font-semibold tabular-nums">{money(current.summary.balance)}</dd>
        </div>
      </dl>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Amount paid"
          required
          error={touched ? amountError : null}
          warning={over ? "More than the balance on this bill." : null}
        >
          <DecimalInput
            value={amount}
            onValueChange={setAmount}
            leading={
              <span className="text-[13px]">
                {currencySymbol(settings.invoiceDefaults.currency)}
              </span>
            }
          />
        </Field>
        <Field label="Paid on" required error={touched ? dateError : null}>
          <DatePicker value={date} onChange={setDate} dateFormat={settings.formats.dateFormat} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Paid by" optional>
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
        <Field label="Reference" optional>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
        </Field>
      </div>

      {current.payments.length > 0 && (
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Payments so far</span>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {[...current.payments]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((p) => (
                <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm tabular-nums">{money(p.amount)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatDate(p.date, settings.formats.dateFormat)}
                      {p.mode ? ` · ${PAYMENT_MODE_LABELS[p.mode]}` : ""}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    type="button"
                    aria-label={`Remove payment of ${money(p.amount)}`}
                    onClick={() => void remove(p.id)}
                  >
                    <Trash />
                  </Button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </SheetForm>
  );
}
