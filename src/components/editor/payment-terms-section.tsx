"use client";

import { CalendarClock, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { computeSchedule } from "@/lib/calc/schedule";
import { currencySymbol } from "@/lib/currency";
import { formatMoney, formatPercent } from "@/lib/format";
import { newId } from "@/lib/invoice-factory";
import { HUNDRED, sumDec, toDec } from "@/lib/money";
import type { PaymentStage } from "@/lib/schema";
import { fieldId } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { useEditor } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditorContext, useEditorTotals, useFieldIssue } from "./editor-context";
import { DiscountInput } from "./items-section";
import { AddFieldLink, EditorSection } from "./section";

const MAX_STAGES = 12;

type Draft = Omit<PaymentStage, "id">;

const PRESETS: { label: string; hint: string; stages: Draft[] }[] = [
  {
    label: "Advance + balance",
    hint: "50% now, 50% on delivery",
    stages: [
      { label: "Advance", due: "On order confirmation", kind: "percent", value: "50" },
      { label: "Balance", due: "On delivery", kind: "percent", value: "50" },
    ],
  },
  {
    label: "Milestones",
    hint: "30% · 40% · 30%",
    stages: [
      { label: "Advance", due: "On order confirmation", kind: "percent", value: "30" },
      { label: "Milestone payment", due: "On mid-project review", kind: "percent", value: "40" },
      { label: "Final payment", due: "On delivery", kind: "percent", value: "30" },
    ],
  },
  {
    label: "Custom",
    hint: "Set your own instalments",
    stages: [{ label: "Advance", due: "", kind: "percent", value: "" }],
  },
];

const withIds = (stages: Draft[]): PaymentStage[] => stages.map((s) => ({ ...s, id: newId() }));

/** Optional advance / milestone plan, on quotations and invoices alike. */
export function PaymentTermsSection() {
  const { settings } = useEditorContext();
  const totals = useEditorTotals();
  const { stages, currency } = useEditor(
    useShallow((s) => ({
      stages: s.invoice!.paymentSchedule,
      currency: s.invoice!.currency,
    })),
  );
  const patch = useEditor((s) => s.patch);
  const issue = useFieldIssue(fieldId.paymentSchedule);
  const money = (v: string) => formatMoney(v, currency, settings.formats.numberGrouping);
  const plan = computeSchedule(stages, totals.grandTotal, totals.precision);
  const left = toDec(plan.unscheduled);
  const hasTotal = toDec(totals.grandTotal).greaterThan(0);

  const set = (paymentSchedule: PaymentStage[]) => patch({ paymentSchedule });
  const update = (id: string, partial: Partial<PaymentStage>) =>
    set(stages.map((s) => (s.id === id ? { ...s, ...partial } : s)));
  const addStage = (draft?: Partial<Draft>) =>
    set([...stages, { id: newId(), label: "", due: "", kind: "percent", value: "", ...draft }]);
  /** Plans the rest of the total as one more instalment (as a % when the plan is all %). */
  const addBalance = () => {
    const allPercent = stages.every((s) => s.kind === "percent");
    const pct = HUNDRED.minus(sumDec(stages.map((s) => toDec(s.value))));
    addStage(
      allPercent
        ? { label: "Balance", kind: "percent", value: pct.toString() }
        : { label: "Balance", kind: "flat", value: left.toString() },
    );
  };

  const summary = stages.length
    ? stages
        .map((s, i) => {
          const share = plan.stages[i] ? formatPercent(plan.stages[i].percent) : "";
          return `${share} ${s.label.trim() || `Instalment ${i + 1}`}`.trim();
        })
        .join(" · ")
    : "Advance or milestone payments — optional";

  return (
    <EditorSection
      id={fieldId.paymentSchedule}
      title="Payment terms"
      icon={<CalendarClock />}
      collapsible
      defaultOpen={stages.length > 0}
      hasIssue={Boolean(issue.error || issue.warning)}
      fields={[fieldId.paymentSchedule]}
      summary={summary}
      action={
        stages.length > 0 ? (
          <Button variant="ghost" size="xs" onClick={() => set([])}>
            Remove
          </Button>
        ) : undefined
      }
    >
      {stages.length === 0 ? (
        <div className="grid gap-2 min-[420px]:grid-cols-3">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => set(withIds(p.stages))}
              className="rounded-xl border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-primary/50 hover:bg-primary-soft/40 focus-visible:focus-ring"
            >
              <span className="block text-sm font-medium">{p.label}</span>
              <span className="block text-xs text-muted-foreground">{p.hint}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="@container grid gap-2">
          <div
            className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground @[44rem]:grid @[44rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_6.5rem_1.75rem]"
            aria-hidden
          >
            <span>Milestone</span>
            <span>When</span>
            <span>Share</span>
            <span className="text-right">Amount</span>
          </div>
          {stages.map((s, i) => (
            <div
              key={s.id}
              className="grid grid-cols-[minmax(0,1fr)_7rem_1.75rem] items-center gap-2 rounded-xl border border-border bg-surface-2/40 p-2 @[44rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_6.5rem_1.75rem] @[44rem]:border-0 @[44rem]:bg-transparent @[44rem]:p-0"
            >
              <Input
                value={s.label}
                onChange={(e) => update(s.id, { label: e.target.value })}
                maxLength={80}
                placeholder={i === 0 ? "Advance" : `Instalment ${i + 1}`}
                aria-label={`Instalment ${i + 1} name`}
              />
              <div className="@[44rem]:order-3">
                <DiscountInput
                  kind={s.kind}
                  value={s.value}
                  symbol={currencySymbol(currency)}
                  onChange={(d) => update(s.id, d)}
                  label={`Instalment ${i + 1} share`}
                  noun="share"
                />
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                className="@[44rem]:order-5"
                aria-label={`Remove instalment ${i + 1}`}
                onClick={() => set(stages.filter((x) => x.id !== s.id))}
              >
                <X />
              </Button>
              <div className="@[44rem]:order-2">
                <Input
                  value={s.due}
                  onChange={(e) => update(s.id, { due: e.target.value })}
                  maxLength={120}
                  placeholder={i === 0 ? "On order confirmation" : "When it's due"}
                  aria-label={`Instalment ${i + 1} due`}
                />
              </div>
              <span className="col-span-2 pr-1 text-right text-sm font-medium tabular-nums @[44rem]:order-4 @[44rem]:col-span-1 @[44rem]:pr-0">
                {money(plan.stages[i]?.amount ?? "0")}
              </span>
            </div>
          ))}

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
            {stages.length < MAX_STAGES && (
              <AddFieldLink onClick={() => addStage()}>Add instalment</AddFieldLink>
            )}
            {hasTotal && (
              <span
                className={cn(
                  "ml-auto text-xs font-medium",
                  left.isZero()
                    ? "text-success-foreground"
                    : left.isNegative()
                      ? "text-danger-foreground"
                      : "text-warning-foreground",
                )}
              >
                {left.isZero()
                  ? `Covers the full ${money(totals.grandTotal)}`
                  : left.isNegative()
                    ? `${money(left.abs().toString())} more than the total`
                    : `${money(plan.unscheduled)} not planned yet`}
              </span>
            )}
            {hasTotal && left.greaterThan(0) && stages.length < MAX_STAGES && (
              <Button variant="soft" size="xs" onClick={addBalance}>
                Add as balance
              </Button>
            )}
          </div>
          {issue.error && <p className="text-xs text-danger-foreground">{issue.error}</p>}
        </div>
      )}
    </EditorSection>
  );
}
