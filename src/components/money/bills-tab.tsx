"use client";

import { Download, Plus, ReceiptText, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { usePurchases, useSettings, useVendors } from "@/db/hooks";
import { useAttachmentOwners } from "@/db/hooks-purchases";
import { deletePurchase } from "@/db/purchases";
import { downloadCsv } from "@/lib/csv";
import { formatDate, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import {
  BILL_CSV_HEADERS,
  BILL_STATUS_LABELS,
  billCsvRow,
  billTotals,
  billVendorKey,
  filterBills,
} from "@/lib/purchases/list";
import {
  PURCHASE_PAYMENT_STATUSES,
  type Purchase,
  type PurchasePaymentStatus,
  type Vendor,
} from "@/lib/schema";
import { plural } from "@/lib/utils";
import { BillSheet, type BillDraft } from "@/components/purchases/bill-sheet";
import { BillsList } from "@/components/purchases/bills-list";
import { PaymentSheet } from "@/components/purchases/payment-sheet";
import { VendorSheet, type VendorDraft } from "@/components/vendors/vendor-sheet";
import { VendorsPanel } from "@/components/vendors/vendors-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirm } from "@/components/ui/confirm";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import {
  DEFAULT_PERIOD,
  periodSlug,
  periodText,
  resolvePeriod,
  type PeriodSelection,
} from "./money-data";
import { PeriodFilter } from "./period-filter";

type View = "bills" | "vendors";

/** Money > Bills & vendors: purchase bills (what you owe) and the vendor master. */
export function BillsTab() {
  const [view, setView] = useState<View>("bills");
  return (
    <div>
      <Segmented<View>
        value={view}
        onValueChange={setView}
        options={[
          { value: "bills", label: "Purchase bills" },
          { value: "vendors", label: "Vendors" },
        ]}
        className="mb-4"
        aria-label="Bills or vendors"
      />
      {view === "bills" ? <BillsView /> : <VendorsPanel />}
    </div>
  );
}

function BillsView() {
  const settings = useSettings();
  const bills = usePurchases();
  const vendors = useVendors();
  const withFiles = useAttachmentOwners("purchase");
  const today = todayISO();

  const [period, setPeriod] = useState<PeriodSelection>({ ...DEFAULT_PERIOD, preset: "this_fy" });
  const [vendorKey, setVendorKey] = useState("");
  const [status, setStatus] = useState<PurchasePaymentStatus | "all">("all");
  const [editing, setEditing] = useState<BillDraft | null>(null);
  const [paying, setPaying] = useState<Purchase | null>(null);
  const [vendorDraft, setVendorDraft] = useState<VendorDraft | null>(null);
  const [onVendorSaved, setOnVendorSaved] = useState<((v: Vendor) => void) | null>(null);

  const resolved = useMemo(() => resolvePeriod(period, today), [period, today]);
  const rows = useMemo(
    () => filterBills(bills ?? [], { period: resolved, vendorKey, status }),
    [bills, resolved, vendorKey, status],
  );
  const totals = useMemo(() => billTotals(rows), [rows]);
  const vendorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of bills ?? []) map.set(billVendorKey(b), b.vendorName || "Unnamed vendor");
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [bills]);

  if (!bills || !vendors || !settings) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const money = (v: string) =>
    formatMoney(v, settings.invoiceDefaults.currency, settings.formats.numberGrouping);
  const fmtDate = (iso: string) => formatDate(iso, settings.formats.dateFormat);
  const periodName = periodText(resolved, fmtDate);
  const filtered = Boolean(vendorKey) || status !== "all";

  const exportCsv = () => {
    downloadCsv(`purchase-bills-${periodSlug(resolved)}`, BILL_CSV_HEADERS, rows.map(billCsvRow));
    toast.success(`Exported ${plural(rows.length, "bill")}`);
  };

  const remove = async (b: Purchase) => {
    const ok = await confirm({
      title: "Delete this bill?",
      description: `${b.vendorName || "Bill"}${b.billNo ? ` ${b.billNo}` : ""} · ${money(b.summary.total)}. Its payments and attached files are deleted too. This can't be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deletePurchase(b.id);
      toast.success("Bill deleted");
    } catch {
      /* storage error dialog already shown */
    }
  };

  const addBill = () => setEditing({});

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center">
        <Button variant="primary" onClick={addBill} className="self-start">
          <Plus />
          Add bill
        </Button>
        <PeriodFilter
          value={period}
          onChange={setPeriod}
          dateFormat={settings.formats.dateFormat}
          className="min-w-0"
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Select
            value={vendorKey || "__all"}
            onValueChange={(v) => setVendorKey(v === "__all" ? "" : v)}
            options={[
              { value: "__all", label: "All vendors" },
              ...vendorOptions.map(([value, label]) => ({ value, label })),
            ]}
            className="sm:w-48"
            aria-label="Filter by vendor"
          />
          <Select<PurchasePaymentStatus | "all">
            value={status}
            onValueChange={setStatus}
            options={[
              { value: "all", label: "Any payment" },
              ...PURCHASE_PAYMENT_STATUSES.map((s) => ({ value: s, label: BILL_STATUS_LABELS[s] })),
            ]}
            className="sm:w-36"
            aria-label="Filter by payment status"
          />
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setVendorKey("");
                setStatus("all");
              }}
            >
              <X />
              Clear filters
            </Button>
          )}
          <Button onClick={exportCsv} disabled={rows.length === 0}>
            <Download />
            Export CSV
          </Button>
        </div>
      </div>

      <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
        Billed in {periodName}:{" "}
        <span className="font-semibold text-foreground tabular-nums">{money(totals.total)}</span>
        {" · "}You still owe{" "}
        <span className="font-semibold text-foreground tabular-nums">{money(totals.balance)}</span>
      </p>

      <Card className="overflow-hidden">
        {bills.length === 0 ? (
          <EmptyState
            icon={<ReceiptText />}
            title="No purchase bills yet"
            description="Record bills from your vendors to track what you owe, when it's due, and the GST credit (ITC) you can claim."
            action={
              <Button variant="primary" onClick={addBill}>
                <Plus />
                Add bill
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Search />}
            title={`No bills in ${periodName}`}
            description="Try another period or clear the filters."
          />
        ) : (
          <BillsList
            key={`${resolved.start}|${resolved.end}|${vendorKey}|${status}`}
            rows={rows}
            totals={totals}
            settings={settings}
            today={today}
            attachmentOwners={withFiles}
            onEdit={(b) => setEditing({ ...b })}
            onPay={setPaying}
            onDelete={(b) => void remove(b)}
          />
        )}
      </Card>

      <BillSheet
        draft={editing}
        settings={settings}
        vendors={vendors}
        onClose={() => setEditing(null)}
        onAddVendor={(cb) => {
          setOnVendorSaved(() => cb);
          setVendorDraft({});
        }}
      />
      <PaymentSheet bill={paying} settings={settings} onClose={() => setPaying(null)} />
      <VendorSheet
        draft={vendorDraft}
        settings={settings}
        onClose={() => setVendorDraft(null)}
        onSaved={(v) => onVendorSaved?.(v)}
      />
    </div>
  );
}
