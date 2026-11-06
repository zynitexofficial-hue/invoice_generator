import { buildExpenseInput, buildInvoiceDraft, templateDocType } from "@/lib/recurring/build";
import {
  advanceNextRun,
  AUTO_RUN_LIMIT,
  CATCH_UP_CAP,
  computeDue,
  firstOnOrAfter,
  nextAfter,
  specOf,
} from "@/lib/recurring/schedule";
import { todayISO } from "@/lib/dates";
import type { Recurring, RecurringRun } from "@/lib/schema";
import { defineCrud, type DeepPartial } from "./crud";
import { getDb } from "./db";
import { saveExpense } from "./expenses";
import { peekNumber, saveInvoice } from "./invoices";
import { loadSettings } from "./settings";

/**
 * [C] Recurring templates — owner: feature C.
 *
 * Static app, no background jobs: due documents are created when the app is
 * opened (see RecurringBoot) or when the user asks on the Recurring tab.
 * Generated invoices are always DRAFTS and take their number from the normal
 * numbering rules; generated expenses are plain entries.
 */

export type RecurringInput = DeepPartial<Recurring>;

const MAX_RUN_HISTORY = 200;

/** Keep schedule fields consistent: nextRunDate follows the schedule, "" once it has finished. */
function prepareRecurring(r: Recurring): Recurring {
  const spec = specOf(r);
  const finished = r.maxRuns > 0 && r.runCount >= r.maxRuns;
  let nextRunDate = r.nextRunDate;
  if (finished) nextRunDate = "";
  else if (!nextRunDate) {
    // Never scheduled yet: first occurrence. Otherwise continue after the last handled one.
    nextRunDate = r.lastRunDate
      ? nextAfter(spec, r.lastRunDate)
      : firstOnOrAfter(spec, r.startDate);
  }
  return { ...r, nextRunDate, runs: r.runs.slice(-MAX_RUN_HISTORY) };
}

export const recurringCrud = defineCrud({
  table: "recurring",
  entity: "recurring",
  what: "the recurring template",
  describe: (r) => `recurring ${r.kind} ${r.name}`.trim(),
  auditFields: {
    name: (r) => r.name,
    kind: (r) => r.kind,
    active: (r) => String(r.active),
    mode: (r) => r.mode,
    frequency: (r) => r.frequency,
    interval: (r) => String(r.interval),
    nextRunDate: (r) => r.nextRunDate,
    endDate: (r) => r.endDate,
  },
  prepare: prepareRecurring,
});

export const saveRecurring = recurringCrud.save;
export const getRecurring = recurringCrud.get;
export const deleteRecurring = recurringCrud.remove;
export const listRecurring = recurringCrud.list;

/* ---------------- Generating due documents ---------------- */

export interface RunReport {
  /** Template name. */
  name: string;
  kind: Recurring["kind"];
  created: number;
  /** Occurrences still due after this run (cap reached). */
  remaining: number;
  numbers: string[];
  error?: string;
}

export interface RunOptions {
  today?: string;
  /** Most documents to create now (default: the catch-up cap). */
  cap?: number;
  /** Create the next scheduled occurrence now, even if it isn't due yet. */
  early?: boolean;
}

/** Runs in progress per template id, so two callers can't create the same occurrence twice. */
const inFlight = new Map<string, Promise<RunReport>>();

/**
 * Create the documents that are due for one template, oldest first, advancing
 * the schedule after each one. Stops at the first failure and reports it.
 */
export function runRecurring(id: string, opts: RunOptions = {}): Promise<RunReport> {
  const running = inFlight.get(id);
  if (running) return running;
  const promise = runRecurringNow(id, opts).finally(() => inFlight.delete(id));
  inFlight.set(id, promise);
  return promise;
}

async function runRecurringNow(id: string, opts: RunOptions): Promise<RunReport> {
  const today = opts.today ?? todayISO();
  const cap = opts.cap ?? CATCH_UP_CAP;
  const first = await getRecurring(id);
  const report: RunReport = {
    name: first?.name ?? "",
    kind: first?.kind ?? "invoice",
    created: 0,
    remaining: 0,
    numbers: [],
  };
  if (!first) return { ...report, error: "This recurring item no longer exists." };

  const settings = await loadSettings();
  const designs = await getDb().designs.toArray();

  let dates: string[];
  let total: number;
  if (opts.early) {
    const next = first.nextRunDate || firstOnOrAfter(specOf(first), first.startDate);
    dates = next ? [next] : [];
    total = dates.length;
  } else {
    const due = computeDue(first, today, cap);
    dates = due.dates;
    total = due.total;
  }

  try {
    for (const date of dates) {
      // Re-read each time: another tab may have run this occurrence already.
      const rec = await getRecurring(id);
      if (!rec) break;
      if (rec.runs.some((r) => r.date === date)) continue;
      const documentDate = date > today ? today : date;
      let recordId: string;
      let recordNumber = "";
      if (rec.kind === "invoice") {
        // Numbered from today's series; the sequence is consumed when the draft is saved.
        const generated = await peekNumber(settings, templateDocType(rec), new Date());
        const draft = buildInvoiceDraft(rec, documentDate, { settings, designs, generated });
        const saved = await saveInvoice(draft);
        recordId = saved.id;
        recordNumber = saved.number;
      } else {
        const saved = await saveExpense(buildExpenseInput(rec, documentDate));
        recordId = saved.id;
      }
      const run: RecurringRun = { date, recordId, recordNumber };
      const runCount = rec.runCount + 1;
      await saveRecurring({
        ...rec,
        runs: [...rec.runs, run],
        runCount,
        lastRunDate: date,
        nextRunDate: advanceNextRun(rec, date, runCount),
      });
      report.created++;
      if (recordNumber) report.numbers.push(recordNumber);
    }
  } catch (error) {
    report.error = error instanceof Error ? error.message : "Something went wrong.";
  }
  report.remaining = Math.max(0, total - report.created);
  return report;
}

/** Skip every missed occurrence without creating anything; the schedule resumes from the next future date. */
export async function skipMissed(id: string, today = todayISO()): Promise<number> {
  const rec = await getRecurring(id);
  if (!rec) return 0;
  const missed = computeDue(rec, today, Number.MAX_SAFE_INTEGER).dates;
  if (!missed.length) return 0;
  const last = missed[missed.length - 1]!;
  // lastRunDate marks "handled up to here" without counting a run.
  await saveRecurring({
    ...rec,
    lastRunDate: last,
    nextRunDate: nextAfter(specOf(rec), last),
  });
  return missed.length;
}

export interface DueItem {
  recurring: Recurring;
  /** Missed occurrences up to today. */
  total: number;
}

export interface DueSummary {
  items: DueItem[];
  /** Total missed occurrences across all active templates. */
  count: number;
}

/** What is due today, from a list of templates (pure; used by the hook and the runner). */
export function summarizeDue(list: Recurring[], today = todayISO()): DueSummary {
  const items: DueItem[] = [];
  let count = 0;
  for (const recurring of list) {
    const total = computeDue(recurring, today, 0).total;
    if (total > 0) {
      items.push({ recurring, total });
      count += total;
    }
  }
  return { items, count };
}

export interface AutoRunReport {
  reports: RunReport[];
  /** Occurrences left for the user to confirm (ask-me templates and big catch-ups). */
  waiting: number;
}

/**
 * Run on app open: "auto" templates whose backlog is small (up to
 * AUTO_RUN_LIMIT) create their drafts now. Everything else waits for the user.
 */
export async function runAutoOnOpen(today = todayISO()): Promise<AutoRunReport> {
  const rows = await listRecurring();
  const list = rows.rows;
  const { items } = summarizeDue(list, today);
  const reports: RunReport[] = [];
  let waiting = 0;
  for (const { recurring, total } of items) {
    if (recurring.mode === "auto" && total <= AUTO_RUN_LIMIT) {
      reports.push(await runRecurring(recurring.id, { today }));
    } else {
      waiting += total;
    }
  }
  return { reports, waiting };
}
