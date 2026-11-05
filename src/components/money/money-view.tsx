"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  HandCoins,
  ListFilter,
  Plus,
  ReceiptText,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteExpense } from "@/db/expenses";
import { useDataHealth, useExpenses, useIncomes, useSettings } from "@/db/hooks";
import { deleteIncome } from "@/db/incomes";
import { downloadCsv } from "@/lib/csv";
import { formatDate, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import type { Expense, Income } from "@/lib/schema";
import { cn, plural } from "@/lib/utils";
import { Page } from "@/components/layout/page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirm } from "@/components/ui/confirm";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { ExpenseSheet, type ExpenseDraft } from "./expense-sheet";
import { INCOME_INFO, IncomeSheet, type IncomeDraft } from "./income-sheet";
import {
  categoryOptions,
  DEFAULT_PERIOD,
  EXPENSE_CSV_HEADERS,
  expenseCsvRow,
  expenseTotals,
  filterExpenses,
  filterIncomes,
  INCOME_CSV_HEADERS,
  incomeCsvRow,
  incomeTotals,
  PAYMENT_STATUS_LABELS,
  periodSlug,
  periodText,
  resolvePeriod,
  vendorSuggestions,
  type PaymentStatus,
  type PeriodSelection,
} from "./money-data";
import { ExpenseList, IncomeList } from "./money-lists";
import { findMoneyExtraTab, MONEY_EXTRA_TABS } from "./money-tabs";
import { PeriodFilter } from "./period-filter";

type Tab = "out" | "in";

/** Copy of an expense as a new entry dated today (a new bill, so no bill number). */
function duplicateExpense(e: Expense): ExpenseDraft {
  const today = todayISO();
  return {
    ...e,
    id: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    date: today,
    invoiceNo: "",
    invoiceDate: "",
    paymentDate: e.paymentStatus === "unpaid" ? "" : today,
  };
}

function duplicateIncome(i: Income): IncomeDraft {
  return { ...i, id: undefined, createdAt: undefined, updatedAt: undefined, date: todayISO() };
}

export function MoneyView() {
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab = params.get("tab") === "in" ? "in" : "out";
  // Extra tabs (Bills & vendors, Recurring) bring their own content and toolbar.
  const extraTab = findMoneyExtraTab(params.get("tab"));
  const activeTab = extraTab?.id ?? tab;
  const wantsNew = params.get("new") === "1";
  const editId = params.get("edit");

  const expenses = useExpenses();
  const incomes = useIncomes();
  const settings = useSettings();
  const health = useDataHealth();

  const [period, setPeriod] = useState<PeriodSelection>(DEFAULT_PERIOD);
  const [category, setCategory] = useState("");
  const [gstOnly, setGstOnly] = useState(false);
  const [itcOnly, setItcOnly] = useState(false);
  const [status, setStatus] = useState<PaymentStatus | "all">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseDraft | null>(null);
  const [editingIncome, setEditingIncome] = useState<IncomeDraft | null>(null);
  const filtersId = useId();

  // "?new=1" (command palette, dashboard quick add) opens the add sheet once.
  const [handledNew, setHandledNew] = useState(false);
  if (wantsNew && !handledNew && settings) {
    setHandledNew(true);
    if (tab === "in") setEditingIncome({});
    else setEditingExpense({});
  } else if (!wantsNew && handledNew) {
    setHandledNew(false);
  }
  useEffect(() => {
    if (wantsNew && handledNew) router.replace(`/money?tab=${tab}`, { scroll: false });
  }, [wantsNew, handledNew, router, tab]);

  // "?edit=ID" (links from GST Returns) opens that record's edit sheet once.
  const [handledEdit, setHandledEdit] = useState<string | null>(null);
  if (editId && handledEdit !== editId && expenses && incomes) {
    setHandledEdit(editId);
    const expense = expenses.find((e) => e.id === editId);
    const income = incomes.find((i) => i.id === editId);
    if (expense) setEditingExpense({ ...expense });
    else if (income) setEditingIncome({ ...income });
  }
  useEffect(() => {
    if (editId && handledEdit === editId) router.replace(`/money?tab=${tab}`, { scroll: false });
  }, [editId, handledEdit, router, tab]);

  const today = todayISO();
  const resolved = useMemo(() => resolvePeriod(period, today), [period, today]);

  const usedExpenseCategories = useMemo(
    () => [...new Set((expenses ?? []).map((e) => e.category))],
    [expenses],
  );
  const usedIncomeCategories = useMemo(
    () => [...new Set((incomes ?? []).map((i) => i.category))],
    [incomes],
  );
  const vendors = useMemo(() => vendorSuggestions(expenses ?? []), [expenses]);

  const expenseRows = useMemo(
    () =>
      filterExpenses(expenses ?? [], {
        period: resolved,
        category,
        gstOnly,
        itcOnly,
        status,
      }),
    [expenses, resolved, category, gstOnly, itcOnly, status],
  );
  const incomeRows = useMemo(
    () => filterIncomes(incomes ?? [], { period: resolved, category }),
    [incomes, resolved, category],
  );
  const eTotals = useMemo(() => expenseTotals(expenseRows), [expenseRows]);
  const iTotals = useMemo(() => incomeTotals(incomeRows), [incomeRows]);

  if (!expenses || !incomes || !settings) {
    return (
      <Page title="Money" width="wide">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="mt-4 h-12 w-full rounded-xl" />
        <Skeleton className="mt-4 h-96 w-full rounded-2xl" />
      </Page>
    );
  }

  const out = tab === "out";
  const money = (v: string) =>
    formatMoney(v, settings.invoiceDefaults.currency, settings.formats.numberGrouping);
  const fmtDate = (iso: string) => formatDate(iso, settings.formats.dateFormat);
  const periodName = periodText(resolved, fmtDate);
  const extraFilters =
    (category ? 1 : 0) +
    (out ? (gstOnly ? 1 : 0) + (itcOnly ? 1 : 0) + (status !== "all" ? 1 : 0) : 0);
  const categories = out
    ? categoryOptions(
        settings.expenseCategories.map((c) => c.name),
        usedExpenseCategories,
      )
    : categoryOptions(settings.incomeCategories, usedIncomeCategories);

  const clearExtraFilters = () => {
    setCategory("");
    setGstOnly(false);
    setItcOnly(false);
    setStatus("all");
  };
  const switchTab = (next: string) => {
    if (next === activeTab) return;
    setCategory(""); // categories differ between the tabs
    router.replace(`/money?tab=${next}`, { scroll: false });
  };
  const addNew = () => (out ? setEditingExpense({}) : setEditingIncome({}));

  const exportCsv = () => {
    const slug = periodSlug(resolved);
    if (out) {
      downloadCsv(`expenses-${slug}`, EXPENSE_CSV_HEADERS, expenseRows.map(expenseCsvRow));
      toast.success(`Exported ${plural(expenseRows.length, "expense")}`);
    } else {
      downloadCsv(`income-${slug}`, INCOME_CSV_HEADERS, incomeRows.map(incomeCsvRow));
      toast.success(`Exported ${plural(incomeRows.length, "income entry", "income entries")}`);
    }
  };

  const removeExpense = async (e: Expense) => {
    const ok = await confirm({
      title: "Delete this expense?",
      description: `${e.vendorName || e.category || "Expense"} · ${money(e.summary.total)} on ${fmtDate(e.date)}. This can't be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteExpense(e.id);
      toast.success("Expense deleted");
    } catch {
      /* storage error dialog already shown */
    }
  };
  const removeIncome = async (i: Income) => {
    const ok = await confirm({
      title: "Delete this income entry?",
      description: `${i.source || i.category || "Income"} · ${money(i.amount)} on ${fmtDate(i.date)}. This can't be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteIncome(i.id);
      toast.success("Income entry deleted");
    } catch {
      /* storage error dialog already shown */
    }
  };

  const invalid = (health?.expenses ?? 0) + (health?.incomes ?? 0);
  const hasAny = out ? expenses.length > 0 : incomes.length > 0;
  const rowsCount = out ? expenseRows.length : incomeRows.length;

  return (
    <Page
      title="Money"
      width="wide"
      description={
        extraTab ? (
          extraTab.label
        ) : (
          <>
            {out ? "Spent" : "Other income"} in {periodName}:{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {money(out ? eTotals.total : iTotals.total)}
            </span>
            {out && eTotals.itc !== "0.00" && (
              <>
                {" "}
                · ITC{" "}
                <span className="font-medium text-success-foreground tabular-nums">
                  {money(eTotals.itc)}
                </span>
              </>
            )}
          </>
        )
      }
      actions={
        extraTab ? undefined : (
          <Button variant="primary" onClick={addNew}>
            <Plus />
            {out ? "Add expense" : "Add income"}
          </Button>
        )
      }
    >
      {invalid > 0 && (
        <Alert
          tone="warning"
          className="mb-4"
          title="Some entries couldn't be read"
          action={
            <Button variant="secondary" size="sm" asChild>
              <Link href="/settings?section=data">Open Settings → Data</Link>
            </Button>
          }
        >
          {[
            health?.expenses ? plural(health.expenses, "expense") : "",
            health?.incomes ? plural(health.incomes, "income entry", "income entries") : "",
          ]
            .filter(Boolean)
            .join(" and ")}{" "}
          {invalid === 1 ? "is" : "are"} damaged and hidden from this page. You can download the raw
          rows in Settings → Data.
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={switchTab}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList
            aria-label="Money sections"
            value={activeTab}
            className="mb-4 min-w-max"
            tabs={[
              { value: "out", label: "Money out", icon: <ArrowUpRight /> },
              { value: "in", label: "Money in", icon: <ArrowDownLeft /> },
              ...MONEY_EXTRA_TABS.map((t) => ({ value: t.id, label: t.label })),
            ]}
          />
        </div>
        <TabsContent value={activeTab} className="outline-none">
          {extraTab ? (
            <extraTab.Component />
          ) : !hasAny ? (
            <Card>
              {out ? (
                <EmptyState
                  icon={<ReceiptText />}
                  title="No expenses yet"
                  description="Add your first expense to see profit and ITC."
                  action={
                    <Button variant="primary" onClick={addNew}>
                      <Plus />
                      Add expense
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<HandCoins />}
                  title="No other income yet"
                  description={INCOME_INFO}
                  action={
                    <Button variant="primary" onClick={addNew}>
                      <Plus />
                      Add income
                    </Button>
                  }
                />
              )}
            </Card>
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center">
                <div className="flex items-start gap-2">
                  <PeriodFilter
                    value={period}
                    onChange={setPeriod}
                    dateFormat={settings.formats.dateFormat}
                    className="min-w-0 flex-1 lg:flex-none"
                  />
                  <Button
                    className="sm:hidden"
                    onClick={() => setFiltersOpen((o) => !o)}
                    aria-expanded={filtersOpen}
                    aria-controls={filtersId}
                  >
                    <ListFilter />
                    Filters
                    {extraFilters > 0 && (
                      <Badge size="sm" tone="primary">
                        {extraFilters}
                      </Badge>
                    )}
                  </Button>
                  <Button
                    size="icon"
                    className="sm:hidden"
                    onClick={exportCsv}
                    disabled={rowsCount === 0}
                    aria-label="Export CSV"
                  >
                    <Download />
                  </Button>
                </div>
                <div
                  id={filtersId}
                  className={cn(
                    filtersOpen ? "grid" : "hidden",
                    "grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center",
                  )}
                >
                  <Select
                    value={category || "__all"}
                    onValueChange={(v) => setCategory(v === "__all" ? "" : v)}
                    options={[
                      { value: "__all", label: "All categories" },
                      ...categories.map((c) => ({ value: c, label: c })),
                    ]}
                    className={cn("sm:w-48", !out && "col-span-2")}
                    aria-label="Filter by category"
                  />
                  {out && (
                    <>
                      <Select<PaymentStatus | "all">
                        value={status}
                        onValueChange={setStatus}
                        options={[
                          { value: "all", label: "Any payment" },
                          ...(["paid", "unpaid", "partial"] as const).map((s) => ({
                            value: s,
                            label: PAYMENT_STATUS_LABELS[s],
                          })),
                        ]}
                        className="sm:w-36"
                        aria-label="Filter by payment status"
                      />
                      <Button
                        variant={gstOnly ? "soft" : "secondary"}
                        aria-pressed={gstOnly}
                        onClick={() => setGstOnly((v) => !v)}
                      >
                        With GST only
                      </Button>
                      <Button
                        variant={itcOnly ? "soft" : "secondary"}
                        aria-pressed={itcOnly}
                        onClick={() => setItcOnly((v) => !v)}
                      >
                        ITC only
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 lg:ml-auto">
                  {extraFilters > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearExtraFilters}>
                      <X />
                      Clear filters
                    </Button>
                  )}
                  <Button className="max-sm:hidden" onClick={exportCsv} disabled={rowsCount === 0}>
                    <Download />
                    Export CSV
                  </Button>
                </div>
              </div>

              <Card className="overflow-hidden">
                {rowsCount === 0 ? (
                  <EmptyState
                    icon={<Search />}
                    title={`Nothing in ${periodName}`}
                    description={
                      extraFilters > 0
                        ? "Try another period or clear the filters."
                        : "Try another period, or add an entry."
                    }
                    action={
                      extraFilters > 0 ? (
                        <Button variant="secondary" onClick={clearExtraFilters}>
                          Clear filters
                        </Button>
                      ) : (
                        <Button variant="secondary" onClick={addNew}>
                          <Plus />
                          {out ? "Add expense" : "Add income"}
                        </Button>
                      )
                    }
                  />
                ) : out ? (
                  <ExpenseList
                    // Remount on filter change so paging starts over.
                    key={`${resolved.start}|${resolved.end}|${category}|${gstOnly}|${itcOnly}|${status}`}
                    rows={expenseRows}
                    totals={eTotals}
                    settings={settings}
                    onEdit={(e) => setEditingExpense({ ...e })}
                    onDuplicate={(e) => setEditingExpense(duplicateExpense(e))}
                    onDelete={(e) => void removeExpense(e)}
                  />
                ) : (
                  <IncomeList
                    key={`${resolved.start}|${resolved.end}|${category}`}
                    rows={incomeRows}
                    total={iTotals.total}
                    settings={settings}
                    onEdit={(i) => setEditingIncome({ ...i })}
                    onDuplicate={(i) => setEditingIncome(duplicateIncome(i))}
                    onDelete={(i) => void removeIncome(i)}
                  />
                )}
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <ExpenseSheet
        draft={editingExpense}
        settings={settings}
        vendors={vendors}
        usedCategories={usedExpenseCategories}
        onClose={() => setEditingExpense(null)}
      />
      <IncomeSheet
        draft={editingIncome}
        settings={settings}
        usedCategories={usedIncomeCategories}
        onClose={() => setEditingIncome(null)}
      />
    </Page>
  );
}
