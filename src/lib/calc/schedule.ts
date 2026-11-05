import { HUNDRED, ZERO, clampDec, roundTo, sumDec, toDec, type Dec } from "@/lib/money";
import type { PaymentStage } from "@/lib/schema";

export type StageStatus = "paid" | "partial" | "due";

export interface ScheduledStage {
  id: string;
  /** Instalment amount at the currency's precision. */
  amount: string;
  /** Share of the grand total, e.g. "50" (2 dp at most). */
  percent: string;
  /** Part of the amount received that covers this instalment. */
  paid: string;
  status: StageStatus;
}

export interface ScheduleTotals {
  stages: ScheduledStage[];
  /** Sum of all instalments. */
  scheduled: string;
  /** Grand total minus scheduled: positive = not yet planned, negative = over-planned. */
  unscheduled: string;
}

/**
 * Splits the grand total into instalments. Percent stages are shares of the
 * grand total; flat stages are fixed amounts. When the plan covers the total
 * exactly, the rounding remainder goes to the last stage so the instalments
 * always add up to the paisa. Money received is applied to instalments in order.
 */
export function computeSchedule(
  stages: readonly PaymentStage[],
  grandTotal: string,
  precision: number,
  amountReceived = "0",
): ScheduleTotals {
  const grand = toDec(grandTotal);
  const exact = stages.map((s) =>
    s.kind === "percent" ? grand.mul(toDec(s.value)).div(HUNDRED) : toDec(s.value),
  );
  const amounts = exact.map((v) => roundTo(v, precision));
  if (amounts.length > 0 && sumDec(exact).equals(grand)) {
    const last = amounts.length - 1;
    amounts[last] = grand.minus(sumDec(amounts.slice(0, last)));
  }

  let remaining: Dec = toDec(amountReceived);
  const result = amounts.map((amount, i): ScheduledStage => {
    const paid = amount.isNegative() ? ZERO : clampDec(remaining, ZERO, amount);
    remaining = remaining.minus(paid);
    const status: StageStatus =
      amount.greaterThan(0) && paid.greaterThanOrEqualTo(amount)
        ? "paid"
        : paid.greaterThan(0)
          ? "partial"
          : "due";
    return {
      id: stages[i].id,
      amount: amount.toFixed(precision),
      percent: grand.isZero() ? "0" : roundTo(amount.div(grand).mul(HUNDRED), 2).toString(),
      paid: paid.toFixed(precision),
      status,
    };
  });

  const scheduled = sumDec(amounts);
  return {
    stages: result,
    scheduled: scheduled.toFixed(precision),
    unscheduled: grand.minus(scheduled).toFixed(precision),
  };
}

/** Instalments with anything filled in; untouched blank rows are ignored. */
export function activeStages(stages: readonly PaymentStage[]): PaymentStage[] {
  return stages.filter((s) => s.label.trim() || s.due.trim() || toDec(s.value).greaterThan(0));
}
