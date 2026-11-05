"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Building,
  ChevronDown,
  CircleCheck,
  Circle,
  DatabaseBackup,
  FileText,
  Landmark,
  Plus,
  Receipt,
  TrendingUp,
  Wallet,
  Clock,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo } from "react";
import { useInvoices, useSettings } from "@/db/hooks";
import { DOC_TYPE_META } from "@/lib/documents";
import { formatDate, relativeTime, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { displayStatus } from "@/lib/invoice-calc";
import { toDec, ZERO, type Dec } from "@/lib/money";
import { DOC_TYPES, type Invoice } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { Page } from "@/components/layout/page";
import { OpenInvoiceFileButton } from "@/components/open-invoice-file";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, Skeleton } from "@/components/ui/misc";

export function HomeView() {
  const settings = useSettings();
  const invoices = useInvoices();
  const today = todayISO();

  const stats = useMemo(() => {
    if (!invoices) return null;
    const byCurrency = new Map<
      string,
      { invoiced: Dec; received: Dec; outstanding: Dec; overdue: number; count: number }
    >();
    let drafts = 0;
    for (const inv of invoices) {
      if (!inv.downloadedAt) {
        drafts++;
        continue;
      }
      if (!DOC_TYPE_META[inv.docType].hasPayment) continue;
      const entry = byCurrency.get(inv.currency) ?? {
        invoiced: ZERO,
        received: ZERO,
        outstanding: ZERO,
        overdue: 0,
        count: 0,
      };
      const total = toDec(inv.summary.grandTotal);
      const balance = toDec(inv.summary.balanceDue);
      entry.invoiced = entry.invoiced.plus(total);
      entry.outstanding = entry.outstanding.plus(balance);
      entry.received = entry.received.plus(total.minus(balance));
      entry.count++;
      if (displayStatus(inv, today) === "overdue") entry.overdue++;
      byCurrency.set(inv.currency, entry);
    }
    const currencies = [...byCurrency.entries()].sort((a, b) =>
      a[0] === "INR" ? -1 : b[0] === "INR" ? 1 : b[1].count - a[1].count,
    );
    return { currencies, drafts };
  }, [invoices, today]);

  if (!settings || !invoices || !stats) return <HomeSkeleton />;

  const name = settings.profile.name.trim();
  const draft = invoices.find((i) => !i.downloadedAt);
  const recent = invoices.slice(0, 6);
  const [primaryCurrency, primary] = stats.currencies[0] ?? ["INR", null];
  const grouping = settings.formats.numberGrouping;
  const money = (d: Dec, c = primaryCurrency) => formatMoney(d.toFixed(2), c, grouping);

  return (
    <Page
      title={name ? `Welcome back${name ? `, ${name.split(" ")[0]}` : ""}` : "Welcome"}
      description="Here's what's happening with your invoices in this browser."
      actions={
        <>
          <OpenInvoiceFileButton />
          <NewDocumentButton />
        </>
      }
    >
      <SetupChecklist settings={settings} hasInvoices={invoices.length > 0} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          icon={<Receipt />}
          label="Invoiced"
          value={primary ? money(primary.invoiced) : money(ZERO)}
          hint={primary ? `${primary.count} issued` : "Nothing issued yet"}
        />
        <StatCard
          index={1}
          icon={<Wallet />}
          label="Received"
          value={primary ? money(primary.received) : money(ZERO)}
          hint="Payments recorded"
          tone="success"
        />
        <StatCard
          index={2}
          icon={<TrendingUp />}
          label="Outstanding"
          value={primary ? money(primary.outstanding) : money(ZERO)}
          hint={primary?.overdue ? `${primary.overdue} overdue` : "Nothing overdue"}
          tone={primary?.overdue ? "danger" : "default"}
        />
        <StatCard
          index={3}
          icon={<FileText />}
          label="Drafts"
          value={String(stats.drafts)}
          hint="Not downloaded yet"
        />
      </div>
      {stats.currencies.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {stats.currencies.slice(1).map(([code, s]) => (
            <span
              key={code}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground"
            >
              {code}: invoiced <b className="text-foreground">{money(s.invoiced, code)}</b> ·
              outstanding <b className="text-foreground">{money(s.outstanding, code)}</b>
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-subtle-foreground">
        Figures include downloaded invoices saved in this browser (quotations excluded).
      </p>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader
            title="Recent documents"
            action={
              invoices.length > 0 ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/history">
                    View all
                    <ArrowRight />
                  </Link>
                </Button>
              ) : undefined
            }
          />
          <CardContent className="px-2 pb-2 sm:px-3">
            {recent.length === 0 ? (
              <EmptyState
                icon={<Receipt />}
                title="No invoices yet"
                description="Create your first invoice — it takes about a minute."
                action={
                  <Button variant="primary" asChild>
                    <Link href="/invoice?new=1">
                      <Plus />
                      Create invoice
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((inv, i) => (
                  <motion.li
                    key={inv.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.03 * i, duration: 0.25 }}
                  >
                    <RecentRow
                      invoice={inv}
                      grouping={grouping}
                      dateFormat={settings.formats.dateFormat}
                      today={today}
                    />
                  </motion.li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {draft && (
            <Card className="overflow-hidden">
              <div className="bg-[linear-gradient(135deg,var(--primary-soft),transparent)] p-5">
                <div className="flex items-center gap-2 text-xs font-medium text-primary-soft-foreground">
                  <Clock className="size-3.5" />
                  Continue where you left off
                </div>
                <div className="mt-2 text-base font-semibold">
                  {draft.number || "Untitled draft"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {draft.customer.name || "No customer yet"} · edited{" "}
                  {relativeTime(draft.updatedAt)}
                </div>
                <Button variant="primary" size="sm" className="mt-4" asChild>
                  <Link href={`/invoice?id=${draft.id}`}>
                    Resume draft
                    <ArrowRight />
                  </Link>
                </Button>
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Quick links" />
            <CardContent className="grid gap-1 px-3 pb-3">
              <QuickLink
                href="/customers"
                icon={<Building />}
                label="Customers"
                hint="Save details once, reuse everywhere"
              />
              <QuickLink
                href="/templates"
                icon={<Receipt />}
                label="Templates & branding"
                hint="6 templates, colours and fonts"
              />
              <QuickLink
                href="/settings?section=data"
                icon={<DatabaseBackup />}
                label="Back up your data"
                hint={
                  settings.backup.lastBackupAt
                    ? `Last backup ${relativeTime(settings.backup.lastBackupAt)}`
                    : "No backup yet"
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function NewDocumentButton() {
  return (
    <div className="flex">
      <Button variant="primary" asChild className="rounded-r-none">
        <Link href="/invoice?new=1">
          <Plus />
          New invoice
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="primary"
            className="rounded-l-none border-l border-white/20 px-2"
            aria-label="Choose document type"
          >
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72">
          <DropdownMenuLabel>New document</DropdownMenuLabel>
          {DOC_TYPES.map((t) => (
            <DropdownMenuItem key={t} asChild>
              <Link href={`/invoice?new=1&type=${t}`} className="!items-start">
                <span>
                  <span className="block font-medium">{DOC_TYPE_META[t].label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {DOC_TYPE_META[t].description}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
  index,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "success" | "danger";
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * index, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-border bg-surface p-5 shadow-xs"
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg [&_svg]:size-4",
            tone === "success"
              ? "bg-success-soft text-success-foreground"
              : tone === "danger"
                ? "bg-danger-soft text-danger-foreground"
                : "bg-primary-soft text-primary-soft-foreground",
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3 truncate text-2xl font-semibold tracking-[-0.02em] tabular-nums">
        {value}
      </div>
      <div
        className={cn(
          "mt-1 text-xs",
          tone === "danger" ? "text-danger-foreground" : "text-muted-foreground",
        )}
      >
        {hint}
      </div>
    </motion.div>
  );
}

function RecentRow({
  invoice: inv,
  grouping,
  dateFormat,
  today,
}: {
  invoice: Invoice;
  grouping: "indian" | "international";
  dateFormat: Parameters<typeof formatDate>[1];
  today: string;
}) {
  return (
    <Link
      href={`/invoice?id=${inv.id}`}
      className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-surface-2 focus-visible:focus-ring"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xs font-semibold text-muted-foreground ring-1 ring-border">
        {(inv.customer.name || inv.customer.company || "?").slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {inv.customer.name || inv.customer.company || "No customer"}
          </span>
          <StatusBadge status={displayStatus(inv, today)} />
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {inv.number} · {DOC_TYPE_META[inv.docType].shortLabel} ·{" "}
          {formatDate(inv.invoiceDate, dateFormat)}
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold tabular-nums">
          {formatMoney(inv.summary.grandTotal, inv.currency, grouping)}
        </div>
      </div>
      <ArrowUpRight className="size-4 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

function QuickLink({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-2 focus-visible:focus-ring"
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground ring-1 ring-border transition-colors group-hover:text-primary [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      <ArrowRight className="size-4 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function SetupChecklist({
  settings,
  hasInvoices,
}: {
  settings: NonNullable<ReturnType<typeof useSettings>>;
  hasInvoices: boolean;
}) {
  const p = settings.profile;
  const steps = [
    {
      done: Boolean(p.name.trim() && p.address.trim()),
      label: "Add your business details",
      href: "/settings?section=business",
      icon: <Building />,
    },
    {
      done: Boolean(p.bank.accountNumber.trim() || p.upiId.trim()),
      label: "Add bank or UPI details",
      href: "/settings?section=payments",
      icon: <Landmark />,
    },
    {
      done: hasInvoices,
      label: "Create your first invoice",
      href: "/invoice?new=1",
      icon: <Receipt />,
    },
    {
      done: Boolean(settings.backup.lastBackupAt),
      label: "Download a backup",
      href: "/settings?section=data",
      icon: <DatabaseBackup />,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="sm:w-56">
          <div className="text-sm font-semibold">Get set up</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {done} of {steps.length} done
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${(done / steps.length) * 100}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>
        <ul className="grid flex-1 gap-2 sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.label}>
              <Link
                href={s.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors focus-visible:focus-ring",
                  s.done
                    ? "border-transparent bg-surface-2/60 text-muted-foreground line-through decoration-subtle-foreground/50"
                    : "border-border hover:border-primary/40 hover:bg-primary-soft/40",
                )}
              >
                {s.done ? (
                  <CircleCheck className="size-4 text-success" />
                ) : (
                  <Circle className="size-4 text-subtle-foreground" />
                )}
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function HomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 lg:px-10 lg:pt-10">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-80" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-8 h-80 rounded-2xl" />
    </div>
  );
}
