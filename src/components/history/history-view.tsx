"use client";

import {
  ArrowDown,
  ArrowUp,
  Braces,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Ellipsis,
  FileText,
  Pencil,
  Plus,
  ScrollText,
  Search,
  Trash,
  Wallet,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { exportInvoiceFile } from "@/db/backup";
import { useInvoices, useSettings } from "@/db/hooks";
import { deleteInvoice } from "@/db/invoices";
import { DOC_TYPE_META } from "@/lib/documents";
import { formatDate, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { displayStatus, type DisplayStatus } from "@/lib/invoice-calc";
import { toDec } from "@/lib/money";
import { DOC_TYPES, type AppSettings, type DocType, type Invoice } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { Page } from "@/components/layout/page";
import { OpenInvoiceFileButton } from "@/components/open-invoice-file";
import { StatusBadge, STATUS_LABELS } from "@/components/status-badge";
import { printInvoice } from "@/components/editor/use-download";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirm } from "@/components/ui/confirm";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { RecordPaymentDialog } from "./record-payment-dialog";

type SortKey = "number" | "customer" | "date" | "due" | "total" | "balance" | "updated";
const PAGE_SIZE = 15;

export function HistoryView() {
  const invoices = useInvoices();
  const settings = useSettings();
  const router = useRouter();
  const today = todayISO();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<DocType | "all">("all");
  const [status, setStatus] = useState<DisplayStatus | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "updated",
    dir: "desc",
  });
  const [page, setPage] = useState(0);
  const [paying, setPaying] = useState<Invoice | null>(null);

  const rows = useMemo(() => {
    if (!invoices) return [];
    const q = query.trim().toLowerCase();
    const filtered = invoices.filter((inv) => {
      if (type !== "all" && inv.docType !== type) return false;
      if (status !== "all" && displayStatus(inv, today) !== status) return false;
      if (from && inv.invoiceDate < from) return false;
      if (to && inv.invoiceDate > to) return false;
      if (q) {
        const hay =
          `${inv.number} ${inv.customer.name} ${inv.customer.company} ${inv.customer.gstin} ${inv.referenceNo}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    const value = (inv: Invoice): string | number => {
      switch (sort.key) {
        case "number":
          return inv.number.toLowerCase();
        case "customer":
          return (inv.customer.name || inv.customer.company).toLowerCase();
        case "date":
          return inv.invoiceDate;
        case "due":
          return inv.dueDate || "9999";
        case "total":
          return toDec(inv.summary.grandTotal).toNumber();
        case "balance":
          return toDec(inv.summary.balanceDue).toNumber();
        default:
          return inv.updatedAt;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [invoices, query, type, status, from, to, sort, today]);

  if (!invoices || !settings) {
    return (
      <Page title="History" description="Every document saved in this browser.">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="mt-4 h-96 w-full rounded-2xl" />
      </Page>
    );
  }

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = rows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const filtersActive = query || type !== "all" || status !== "all" || from || to;
  const clearFilters = () => {
    setQuery("");
    setType("all");
    setStatus("all");
    setFrom("");
    setTo("");
    setPage(0);
  };
  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "customer" || key === "number" ? "asc" : "desc" },
    );

  return (
    <Page
      title="History"
      description={`${invoices.length} ${invoices.length === 1 ? "document" : "documents"} saved in this browser.`}
      width="wide"
      actions={
        <>
          <OpenInvoiceFileButton />
          <Button variant="primary" asChild>
            <Link href="/invoice?new=1">
              <Plus />
              New invoice
            </Link>
          </Button>
        </>
      }
    >
      {invoices.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ScrollText />}
            title="Your history is empty"
            description="Documents you create are saved here automatically. You can also open an invoice file you saved earlier."
            action={
              <>
                <OpenInvoiceFileButton label="Open invoice file" />
                <Button variant="primary" asChild>
                  <Link href="/invoice?new=1">
                    <Plus />
                    Create invoice
                  </Link>
                </Button>
              </>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search number, customer, GSTIN…"
              leading={<Search />}
              className="lg:max-w-xs lg:flex-1"
              aria-label="Search documents"
              trailing={
                query ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <X />
                  </Button>
                ) : undefined
              }
            />
            <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
              <Select<DocType | "all">
                value={type}
                onValueChange={(v) => {
                  setType(v);
                  setPage(0);
                }}
                options={[
                  { value: "all", label: "All types" },
                  ...DOC_TYPES.map((t) => ({ value: t, label: DOC_TYPE_META[t].label })),
                ]}
                className="sm:w-44"
                aria-label="Filter by type"
              />
              <Select<DisplayStatus | "all">
                value={status}
                onValueChange={(v) => {
                  setStatus(v);
                  setPage(0);
                }}
                options={[
                  { value: "all", label: "Any status" },
                  ...(
                    ["draft", "unpaid", "partial", "paid", "overdue", "quote"] as DisplayStatus[]
                  ).map((s) => ({
                    value: s,
                    label: s === "quote" ? "Sent quotation" : STATUS_LABELS[s],
                  })),
                ]}
                className="sm:w-44"
                aria-label="Filter by status"
              />
              <DatePicker
                value={from}
                onChange={(v) => {
                  setFrom(v);
                  setPage(0);
                }}
                placeholder="From date"
                clearable
                dateFormat={settings.formats.dateFormat}
                className="sm:w-40"
              />
              <DatePicker
                value={to}
                onChange={(v) => {
                  setTo(v);
                  setPage(0);
                }}
                placeholder="To date"
                clearable
                min={from}
                dateFormat={settings.formats.dateFormat}
                className="sm:w-40"
              />
            </div>
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="lg:ml-auto">
                <X />
                Clear filters
              </Button>
            )}
          </div>

          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <EmptyState
                icon={<Search />}
                title="No matches"
                description="Try a different search or clear the filters."
                action={
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-2/60 text-left text-xs font-medium text-muted-foreground">
                        <SortHeader label="Number" k="number" sort={sort} onSort={toggleSort} />
                        <SortHeader label="Customer" k="customer" sort={sort} onSort={toggleSort} />
                        <SortHeader label="Date" k="date" sort={sort} onSort={toggleSort} />
                        <SortHeader label="Due" k="due" sort={sort} onSort={toggleSort} />
                        <SortHeader
                          label="Total"
                          k="total"
                          sort={sort}
                          onSort={toggleSort}
                          align="right"
                        />
                        <SortHeader
                          label="Balance"
                          k="balance"
                          sort={sort}
                          onSort={toggleSort}
                          align="right"
                        />
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="w-12 px-2 py-3">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence initial={false}>
                        {visible.map((inv) => (
                          <motion.tr
                            key={inv.id}
                            layout="position"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="group cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/60"
                            onClick={() => router.push(`/invoice?id=${inv.id}`)}
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium tabular-nums">{inv.number || "—"}</div>
                              <div className="text-xs text-muted-foreground">
                                {DOC_TYPE_META[inv.docType].shortLabel}
                              </div>
                            </td>
                            <td className="max-w-56 px-4 py-3">
                              <div className="truncate">
                                {inv.customer.name || inv.customer.company || (
                                  <span className="text-subtle-foreground">—</span>
                                )}
                              </div>
                              {inv.customer.name && inv.customer.company && (
                                <div className="truncate text-xs text-muted-foreground">
                                  {inv.customer.company}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                              {formatDate(inv.invoiceDate, settings.formats.dateFormat)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                              {inv.dueDate
                                ? formatDate(inv.dueDate, settings.formats.dateFormat)
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-medium whitespace-nowrap tabular-nums">
                              {formatMoney(
                                inv.summary.grandTotal,
                                inv.currency,
                                settings.formats.numberGrouping,
                              )}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                              {DOC_TYPE_META[inv.docType].hasPayment
                                ? formatMoney(
                                    inv.summary.balanceDue,
                                    inv.currency,
                                    settings.formats.numberGrouping,
                                  )
                                : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={displayStatus(inv, today)} />
                            </td>
                            <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                              <RowActions invoice={inv} settings={settings} onPay={setPaying} />
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <ul className="divide-y divide-border md:hidden">
                  {visible.map((inv) => (
                    <li key={inv.id} className="flex items-start gap-3 px-4 py-3.5">
                      <Link
                        href={`/invoice?id=${inv.id}`}
                        className="min-w-0 flex-1 rounded-lg focus-visible:focus-ring"
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">
                            {inv.customer.name || inv.customer.company || "No customer"}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                          {inv.number} · {formatDate(inv.invoiceDate, settings.formats.dateFormat)}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <StatusBadge status={displayStatus(inv, today)} />
                          <span className="text-sm font-semibold tabular-nums">
                            {formatMoney(
                              inv.summary.grandTotal,
                              inv.currency,
                              settings.formats.numberGrouping,
                            )}
                          </span>
                        </div>
                      </Link>
                      <RowActions invoice={inv} settings={settings} onPay={setPaying} />
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
                  <span className="tabular-nums">
                    {currentPage * PAGE_SIZE + 1}–
                    {Math.min(rows.length, (currentPage + 1) * PAGE_SIZE)} of {rows.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Previous page"
                      disabled={currentPage === 0}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      <ChevronLeft />
                    </Button>
                    <span className="min-w-16 text-center tabular-nums">
                      {currentPage + 1} / {pageCount}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Next page"
                      disabled={currentPage >= pageCount - 1}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </>
      )}
      <RecordPaymentDialog invoice={paying} settings={settings} onClose={() => setPaying(null)} />
    </Page>
  );
}

function SortHeader({
  label,
  k,
  sort,
  onSort,
  align,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
  align?: "right";
}) {
  const active = sort.key === k;
  return (
    <th
      className={cn("px-4 py-3 font-medium", align === "right" && "text-right")}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:focus-ring",
          active && "text-foreground",
        )}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )
        ) : (
          <span className="size-3.5" />
        )}
      </button>
    </th>
  );
}

function RowActions({
  invoice: inv,
  settings,
  onPay,
}: {
  invoice: Invoice;
  settings: AppSettings;
  onPay: (inv: Invoice) => void;
}) {
  const router = useRouter();
  const meta = DOC_TYPE_META[inv.docType];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${inv.number}`}>
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuItem icon={<Pencil />} onSelect={() => router.push(`/invoice?id=${inv.id}`)}>
          Open
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={<Download />}
          onSelect={() => {
            void printInvoice(inv, settings).catch(() => toast.error("Couldn't prepare the PDF"));
          }}
        >
          Download PDF
        </DropdownMenuItem>
        {meta.hasPayment && (
          <DropdownMenuItem icon={<Wallet />} onSelect={() => onPay(inv)}>
            Record payment
          </DropdownMenuItem>
        )}
        <DropdownMenuItem icon={<Copy />} onSelect={() => router.push(`/invoice?from=${inv.id}`)}>
          Duplicate
        </DropdownMenuItem>
        {inv.docType === "proforma" && (
          <DropdownMenuItem
            icon={<FileText />}
            onSelect={() => router.push(`/invoice?from=${inv.id}&as=tax_invoice`)}
          >
            Convert to tax invoice
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          icon={<Braces />}
          onSelect={() => {
            exportInvoiceFile(inv);
            toast.success("Invoice file downloaded");
          }}
        >
          Save invoice file
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={<Trash />}
          tone="danger"
          onSelect={async () => {
            const ok = await confirm({
              title: `Delete ${inv.number || "this document"}?`,
              description:
                "It will be removed from this browser. PDFs and invoice files you downloaded are not affected.",
              confirmLabel: "Delete",
              tone: "danger",
            });
            if (ok) {
              await deleteInvoice(inv.id);
              toast.success("Document deleted");
            }
          }}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
