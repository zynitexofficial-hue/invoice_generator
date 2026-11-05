import { describe, expect, it } from "vitest";
import type { PaymentStage } from "@/lib/schema";
import { computeSchedule } from "./schedule";

const stage = (
  id: string,
  value: string,
  kind: PaymentStage["kind"] = "percent",
): PaymentStage => ({
  id,
  label: "",
  due: "",
  kind,
  value,
});

describe("computeSchedule", () => {
  it("splits the total by percentage", () => {
    const r = computeSchedule([stage("a", "50"), stage("b", "50")], "25000.00", 2);
    expect(r.stages.map((s) => s.amount)).toEqual(["12500.00", "12500.00"]);
    expect(r.unscheduled).toBe("0.00");
  });

  it("gives the rounding remainder to the last stage when the plan covers the total", () => {
    const r = computeSchedule(
      [stage("a", "33.33"), stage("b", "33.33"), stage("c", "33.34")],
      "1000.01",
      2,
    );
    expect(r.stages.map((s) => s.amount)).toEqual(["333.30", "333.30", "333.41"]);
    expect(r.scheduled).toBe("1000.01");
    expect(r.unscheduled).toBe("0.00");
  });

  it("mixes flat and percent stages and reports what is left", () => {
    const r = computeSchedule([stage("a", "5000", "flat"), stage("b", "50")], "20000.00", 2);
    expect(r.stages.map((s) => s.amount)).toEqual(["5000.00", "10000.00"]);
    expect(r.stages[0].percent).toBe("25");
    expect(r.unscheduled).toBe("5000.00");
  });

  it("flags an over-planned schedule with a negative remainder", () => {
    const r = computeSchedule([stage("a", "60"), stage("b", "60")], "100.00", 2);
    expect(r.unscheduled).toBe("-20.00");
  });

  it("applies money received to instalments in order", () => {
    const r = computeSchedule(
      [stage("a", "30"), stage("b", "40"), stage("c", "30")],
      "10000.00",
      2,
      "5000.00",
    );
    expect(r.stages.map((s) => s.status)).toEqual(["paid", "partial", "due"]);
    expect(r.stages.map((s) => s.paid)).toEqual(["3000.00", "2000.00", "0.00"]);
  });
});
