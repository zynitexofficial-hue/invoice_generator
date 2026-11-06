"use client";

import {
  CalendarClock,
  Ellipsis,
  FastForward,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Trash,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useRecurring, useSettings } from "@/db/hooks";
import { useDueRecurring } from "@/db/hooks-recurring";
import {
  deleteRecurring,
  runRecurring,
  saveRecurring,
  skipMissed,
  type RunReport,
} from "@/db/recurring";
import { formatDate, todayISO } from "@/lib/dates";
import { templateSummary } from "@/lib/recurring/build";
import {
  AUTO_RUN_LIMIT,
  CATCH_UP_CAP,
  computeDue,
  describeSchedule,
} from "@/lib/recurring/schedule";
import type { Recurring } from "@/lib/schema";
import { plural } from "@/lib/utils";
import { RecurringForm } from "@/components/recurring/recurring-form";
import { toastRunReports } from "@/components/recurring/run-toast";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirm } from "@/components/ui/confirm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, Skeleton } from "@/components/ui/misc";

type FormState = { editing?: Recurring } | null;

export function RecurringTab() {
  const list = useRecurring();
  const due = useDueRecurring();
  const settings = useSettings();
  const [form, setForm] = useState<FormState>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const today = todayISO();
  const dateFormat = settings?.formats.dateFormat ?? "dd/MM/yyyy";

  const guard = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } catch {
      toast.error("Something went wrong. Nothing was lost; try again.");
    } finally {
      setBusy(null);
    }
  };

  const createDue = (r: Recurring) =>
    guard(r.id, async () => {
      const { total } = computeDue(r, today, CATCH_UP_CAP);
      if (total > AUTO_RUN_LIMIT) {
        const all = computeDue(r, today, Number.MAX_SAFE_INTEGER).total;
        const ok = await confirm({
          title: `Create ${plural(Math.min(all, CATCH_UP_CAP), r.kind === "invoice" ? "draft invoice" : "expense")}?`,
          description:
            all > CATCH_UP_CAP
              ? `"${r.name}" has ${all} missed dates. Up to ${CATCH_UP_CAP} are created now; the rest stay due so you can check these first.`
              : `"${r.name}" has ${all} missed dates. One is created for each, dated on its schedule day.`,
          confirmLabel: "Create them",
        });
        if (!ok) return;
      }
      toastRunReports([await runRecurring(r.id, { today })]);
    });

  const createAllDue = () =>
    guard("all", async () => {
      const items = due?.items ?? [];
      const count = items.reduce((n, i) => n + Math.min(i.total, CATCH_UP_CAP), 0);
      if (count > AUTO_RUN_LIMIT) {
        const ok = await confirm({
          title: `Create ${count} items now?`,
          description: `This covers ${plural(items.length, "recurring item")}. Invoices are saved as drafts; nothing is sent or issued.`,
          confirmLabel: "Create them",
        });
        if (!ok) return;
      }
      const reports: RunReport[] = [];
      for (const { recurring } of items) reports.push(await runRecurring(recurring.id, { today }));
      toastRunReports(reports);
    });

  const runNow = (r: Recurring) =>
    guard(r.id, async () => {
      const ok = await confirm({
        title: `Create one ${r.kind === "invoice" ? "draft invoice" : "expense"} now?`,
        description: `It uses the next scheduled run of "${r.name}" but is dated today, and the schedule moves on.`,
        confirmLabel: "Create now",
      });
      if (!ok) return;
      toastRunReports([await runRecurring(r.id, { today, early: true })]);
    });

  const skip = (r: Recurring) =>
    guard(r.id, async () => {
      const n = computeDue(r, today, Number.MAX_SAFE_INTEGER).total;
      const ok = await confirm({
        title: `Skip ${plural(n, "missed date")}?`,
        description: `Nothing is created for them. "${r.name}" carries on from its next date.`,
        confirmLabel: "Skip them",
      });
      if (!ok) return;
      await skipMissed(r.id, today);
      toast.success("Skipped the missed dates");
    });

  const togglePause = (r: Recurring) =>
    guard(r.id, async () => {
      await saveRecurring({ ...r, active: !r.active });
      toast.success(r.active ? "Paused" : "Resumed");
    });

  const remove = (r: Recurring) =>
    guard(r.id, async () => {
      const ok = await confirm({
        title: `Delete "${r.name}"?`,
        description: `Invoices and expenses it already created are kept. No new ones will be made.`,
        confirmLabel: "Delete",
        tone: "danger",
      });
      if (!ok) return;
      await deleteRecurring(r.id);
      toast.success("Deleted");
    });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Repeat an invoice or expense on a schedule. This app runs only in your browser, so due
          items are created when you open it. Invoices are always saved as drafts.
        </p>
        <Button variant="primary" onClick={() => setForm({})}>
          <Plus />
          New recurring item
        </Button>
      </div>

      {due && due.count > 0 && (
        <Alert
          tone="warning"
          title={`${plural(due.count, "recurring item is", "recurring items are")} due`}
          action={
            <Button size="sm" variant="primary" onClick={createAllDue} loading={busy === "all"}>
              <Zap />
              Create all due
            </Button>
          }
        >
          Check the list, then create them. Invoices stay drafts until you issue them.
        </Alert>
      )}

      {list === undefined ? (
        <Skeleton className="h-40 w-full" />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Repeat />}
            title="Nothing repeats yet"
            description="Set up rent, a monthly retainer or a subscription once, and create it each period with one tap."
            action={
              <Button variant="primary" onClick={() => setForm({})}>
                <Plus />
                New recurring item
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-3" aria-label="Recurring items">
          {list.map((r) => {
            const total = computeDue(r, today, 0).total;
            const finished = r.active && !r.nextRunDate;
            return (
              <li key={r.id}>
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">{r.name}</h3>
                        <Badge size="sm" tone="outline">
                          {r.kind === "invoice" ? "Invoice" : "Expense"}
                        </Badge>
                        {!r.active && (
                          <Badge size="sm" tone="neutral">
                            Paused
                          </Badge>
                        )}
                        {finished && (
                          <Badge size="sm" tone="neutral">
                            Finished
                          </Badge>
                        )}
                        {total > 0 && (
                          <Badge size="sm" tone="warning">
                            {total} due
                          </Badge>
                        )}
                        {r.mode === "auto" && r.active && (
                          <Badge size="sm" tone="info">
                            Automatic
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-[13px] text-muted-foreground">
                        {templateSummary(r)} · {describeSchedule(r)}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="size-3.5" aria-hidden />
                          {r.nextRunDate
                            ? `Next: ${formatDate(r.nextRunDate, dateFormat)}`
                            : "No more dates"}
                        </span>
                        <span>
                          {r.lastRunDate
                            ? `Last: ${formatDate(r.lastRunDate, dateFormat)}`
                            : "Not run yet"}
                        </span>
                        <span>{plural(r.runCount, "created item")}</span>
                        {r.kind === "invoice" && r.runs.length > 0 && (
                          <Link
                            href="/history"
                            className="font-medium text-primary hover:underline focus-visible:focus-ring"
                          >
                            See drafts
                          </Link>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {total > 0 && (
                        <Button
                          size="sm"
                          variant="soft"
                          onClick={() => createDue(r)}
                          loading={busy === r.id}
                        >
                          Create {total > 1 ? Math.min(total, CATCH_UP_CAP) : ""}
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${r.name}`}
                          >
                            <Ellipsis />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            onSelect={() => setForm({ editing: r })}
                            icon={<Pencil />}
                          >
                            Edit
                          </DropdownMenuItem>
                          {r.active && r.nextRunDate && (
                            <DropdownMenuItem onSelect={() => runNow(r)} icon={<Zap />}>
                              Create one now
                            </DropdownMenuItem>
                          )}
                          {total > 0 && (
                            <DropdownMenuItem onSelect={() => skip(r)} icon={<FastForward />}>
                              Skip missed dates
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onSelect={() => togglePause(r)}
                            icon={r.active ? <Pause /> : <Play />}
                          >
                            {r.active ? "Pause" : "Resume"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            tone="danger"
                            onSelect={() => remove(r)}
                            icon={<Trash />}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {form && (
        <RecurringForm
          key={form.editing?.id ?? "new"}
          editing={form.editing}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
