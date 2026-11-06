"use client";

import type { AppSettings, Invoice } from "@/lib/schema";
import { PaymentsDialog } from "@/components/payments/payments-dialog";

/**
 * Payments for a saved invoice without opening the editor. Now backed by the
 * payment ledger (feature A): several payments, refunds, advances and receipts.
 * The old single "amount received" is kept as the first (opening) payment.
 */
export function RecordPaymentDialog({
  invoice,
  settings,
  onClose,
}: {
  invoice: Invoice | null;
  settings: AppSettings;
  onClose: () => void;
}) {
  return <PaymentsDialog invoice={invoice} settings={settings} onClose={onClose} />;
}
