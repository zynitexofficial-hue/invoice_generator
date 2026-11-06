"use client";

import { Pencil, Printer, Trash2, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useInvoices, usePayments, usePaymentsForInvoice } from "@/db/hooks";
import {
  allocateAdvance,
  deletePayment,
  ensureOpeningPayment,
  PaymentError,
  recordInvoicePayment,
  recordRefund,
  updatePayment,
} from "@/db/payments";
import { currencyPrecision, currencySymbol } from "@/lib/currency";
import { formatDate, todayISO } from "@/lib/dates";
import { PAYMENT_MODE_LABELS } from "@/lib/documents";
import { formatMoney } from "@/lib/format";
import { Dec, toDec } from "@/lib/money";
import {
  invoiceLedgerView,
  isOpeningPayment,
  netReceived,
  planAllocation,
} from "@/lib/payments/ledger";
import {
  PAYMENT_MODES,
  type AppSettings,
  type Invoice,
  type PaymentEntry,
  type PaymentMode,
} from "@/lib/schema";
import { objectKey, useRetained } from "@/hooks/use-retained";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/ui/confirm";
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
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { useReceiptPrint } from "./receipt";

/** Payment history for one invoice: add, edit, delete, refund, apply advances, print receipts. */
export function PaymentsDialog({
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
      <DialogContent size="lg">
        {shown && (
          <PaymentsPanel
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

type FormKind = "payment" | "refund";

function PaymentsPanel({
  invoice: given,
  settings,
  onClose,
}: {
  invoice: Invoice;
  settings: AppSettings;
  onClose: () => void;
}) {
  const invoices = useInvoices();
  const invoice = useMemo(
    () => invoices?.find((i) => i.id === given.id) ?? given,
    [invoices, given],
  );
  const rows = usePaymentsForInvoice(invoice.id);
  const allPayments = usePayments();
  const { printReceipt, portal } = useReceiptPrint(settings);

  const currency = invoice.currency;
  const dp = currencyPrecision(currency);
  const money = (v: string) => formatMoney(v, currency, settings.formats.numberGrouping);
  const view = invoiceLedgerView(invoice, rows ?? []);

  const [kind, setKind] = useState<FormKind>("payment");
  const [editing, setEditing] = useState<PaymentEntry | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState<PaymentMode>(settings.payments.defaultMode);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setEditing(null);
    setKind("payment");
    setAmount("");
    setReference("");
    setNotes("");
    setError("");
    setDate(todayISO());
  };

  // Overpayment (spec B13): never clamped silently.
  const plan = planAllocation({
    total: view.total,
    received: netReceived(view.payments.filter((r) => r.id !== editing?.id)).toFixed(dp),
    amount,
    currency,
  });
  const excess = kind === "payment" ? toDec(plan.excess) : new Dec(0);
  const hasExcess = excess.greaterThan(0);
  const held = netReceived(view.payments);
  const refundTooMuch = kind === "refund" && toDec(amount).greaterThan(held);

  const advances = (allPayments ?? []).filter(
    (p) =>
      !p.invoiceId &&
      p.kind === "advance" &&
      ((invoice.customer.customerId && p.customerId === invoice.customer.customerId) ||
        (!p.customerId &&
          p.customerName.trim().toLowerCase() ===
            (invoice.customer.company || invoice.customer.name).trim().toLowerCase())),
  );

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError("");
    try {
      await work();
      toast.success(done);
      reset();
    } catch (e) {
      setError(e instanceof PaymentError ? e.message : "Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (editing) {
      return run(
        () => updatePayment(editing.id, { amount, date, mode, reference, notes }),
        "Payment updated",
      );
    }
    if (kind === "refund") {
      return run(
        () => recordRefund({ invoice, amount, date, mode, reference, notes }),
        "Refund recorded",
      );
    }
    return run(async () => {
      const r = await recordInvoicePayment({
        invoice,
        amount,
        date,
        mode,
        reference,
        notes,
        excess: "advance",
      });
      if (r.advance)
        toast.info(`${money(r.advance.amount)} kept as an advance`, {
          description: "You can apply it to another invoice later.",
        });
    }, "Payment recorded");
  };

  const startEdit = async (p: PaymentEntry) => {
    if (view.legacy && isOpeningPayment(p)) await ensureOpeningPayment(invoice);
    setEditing(p);
    setKind(p.kind === "refund" ? "refund" : "payment");
    setAmount(p.amount);
    setDate(p.date);
    setMode(p.mode);
    setReference(p.reference);
    setNotes(p.notes);
    setError("");
  };

  const remove = async (p: PaymentEntry) => {
    if (view.legacy && isOpeningPayment(p)) await ensureOpeningPayment(invoice);
    const ok = await confirm({
      title: "Delete this payment?",
      description: `${money(p.amount)} on ${formatDate(p.date, settings.formats.dateFormat)} will be removed and the invoice balance will go back up.`,
      confirmLabel: "Delete payment",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deletePayment(p.id);
      toast.success("Payment deleted");
      if (editing?.id === p.id) reset();
    } catch {
      toast.error("Couldn't delete the payment.");
    }
  };

  const statusTone =
    view.status === "paid" ? "success" : view.status === "partial" ? "warning" : "neutral";
  const statusLabel =
    view.status === "paid" ? "Paid" : view.status === "partial" ? "Partly paid" : "Unpaid";
  const canSubmit =
    toDec(amount).greaterThan(0) && !refundTooMuch && !(editing && hasExcess) && !busy;

  return (
    <>
      <DialogHeader
        icon={<Wallet />}
        title="Payments"
        description={`${invoice.number} · ${invoice.customer.company || invoice.customer.name || "Customer"}`}
      />
      <DialogBody className="grid gap-5">
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2/60 p-3 text-sm">
          <Stat label="Invoice total" value={money(view.total)} />
          <Stat label="Received" value={money(view.received)} />
          <Stat label="Balance due" value={money(view.balance)} strong />
          <div className="col-span-3 flex flex-wrap items-center gap-2">
            <Badge tone={statusTone} size="sm" dot>
              {statusLabel}
            </Badge>
            {toDec(view.overpaid).greaterThan(0) && (
              <span className="text-xs text-warning-foreground">
                {money(view.overpaid)} received above the total. Refund it or move it to an advance.
              </span>
            )}
          </div>
        </div>

        <section aria-label="Payment history">
          <h3 className="mb-2 text-sm font-semibold">History</h3>
          {rows === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : view.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {view.payments.map((p) => {
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <div className="min-w-0 flex-1 basis-40">
                      <div className="text-sm font-medium tabular-nums">
                        {p.kind === "refund" ? "−" : ""}
                        {money(p.amount)}
                        {p.kind === "refund" && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            Refund
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[
                          formatDate(p.date, settings.formats.dateFormat),
                          p.mode ? PAYMENT_MODE_LABELS[p.mode] : "",
                          p.reference,
                          p.receiptNo,
                          isOpeningPayment(p) ? "Recorded earlier" : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {p.receiptNo && (
                        <Button
                          size="xs"
                          variant="ghost"
                          aria-label={`Print receipt ${p.receiptNo}`}
                          onClick={() => void printReceipt(p)}
                        >
                          <Printer />
                          Receipt
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="ghost"
                        aria-label={`Edit payment of ${money(p.amount)}`}
                        onClick={() => void startEdit(p)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        aria-label={`Delete payment of ${money(p.amount)}`}
                        onClick={() => void remove(p)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {view.legacy && view.payments.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              This payment was entered on the invoice before the payment history existed. It is kept
              as the first entry when you edit it or add another payment.
            </p>
          )}
        </section>

        {advances.length > 0 && toDec(view.balance).greaterThan(0) && (
          <section aria-label="Advances from this customer">
            <h3 className="mb-2 text-sm font-semibold">Advances from this customer</h3>
            <ul className="grid gap-2">
              {advances.map((a) => {
                const use = Dec.min(toDec(a.amount), toDec(view.balance)).toFixed(dp);
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    <span>
                      {money(a.amount)} received {formatDate(a.date, settings.formats.dateFormat)}
                    </span>
                    <Button
                      size="xs"
                      variant="soft"
                      loading={busy}
                      onClick={() =>
                        void run(() => allocateAdvance(a.id, invoice, use), "Advance applied")
                      }
                    >
                      Apply {money(use)}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <form
          className="grid gap-3 rounded-xl border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          aria-label={editing ? "Edit payment" : "Add payment"}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{editing ? "Edit payment" : "Add a payment"}</h3>
            {!editing && (
              <Segmented<FormKind>
                size="sm"
                aria-label="Entry type"
                value={kind}
                onValueChange={setKind}
                options={[
                  { value: "payment", label: "Money received" },
                  { value: "refund", label: "Refund" },
                ]}
              />
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={kind === "refund" ? "Amount refunded" : "Amount received"}
              action={
                kind === "payment" && toDec(view.balance).greaterThan(0) && !editing ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setAmount(view.balance)}
                  >
                    Full balance
                  </button>
                ) : undefined
              }
              error={
                refundTooMuch ? `Only ${money(held.toFixed(dp))} has been received.` : undefined
              }
            >
              <DecimalInput
                value={amount}
                onValueChange={setAmount}
                maxDecimals={dp}
                leading={<span className="text-[13px]">{currencySymbol(currency)}</span>}
                placeholder="0.00"
              />
            </Field>
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
            <Field label="Reference" optional hint="UPI ref, cheque no. or bank UTR">
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={80}
              />
            </Field>
          </div>
          <Field label="Note" optional>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} />
          </Field>

          {hasExcess && (
            <Alert
              tone="warning"
              title={`${money(excess.toFixed(dp))} is more than the balance`}
              action={
                !editing ? (
                  <Button
                    size="xs"
                    variant="secondary"
                    type="button"
                    onClick={() => setAmount(plan.applied)}
                  >
                    Use only {money(plan.applied)}
                  </Button>
                ) : undefined
              }
            >
              {editing
                ? "Lower the amount, or delete this payment and record the excess as an advance."
                : `Saving will record ${money(plan.applied)} against this invoice and keep the remaining ${money(excess.toFixed(dp))} as an advance from this customer.`}
            </Alert>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger-foreground">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {editing && (
              <Button type="button" variant="secondary" onClick={reset}>
                Cancel edit
              </Button>
            )}
            <Button type="submit" variant="primary" loading={busy} disabled={!canSubmit}>
              {editing
                ? "Update payment"
                : kind === "refund"
                  ? "Save refund"
                  : hasExcess
                    ? "Save and keep excess as advance"
                    : "Save payment"}
            </Button>
          </div>
        </form>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
      {portal}
    </>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={strong ? "truncate font-semibold tabular-nums" : "truncate tabular-nums"}>
        {value}
      </div>
    </div>
  );
}
