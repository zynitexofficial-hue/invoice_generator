import { describe, expect, it } from "vitest";
import { buildInsights, dashboardInsights } from "./insights";
import { computeMetrics, type PeriodMetrics } from "./metrics";
import { data, exp, inv } from "./fixtures.test-utils";

const TODAY = "2026-11-05";
const empty = computeMetrics(data(), "2026-10", TODAY);
const m = (patch: Partial<PeriodMetrics>): PeriodMetrics => ({ ...empty, ...patch });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("insights", () => {
  it("returns nothing for empty data", () => {
    expect(buildInsights({ current: empty, previous: empty, todayISO: TODAY })).toEqual([]);
  });

  it("revenue change fires only above 20%", () => {
    const prev = m({ salesRevenue: "1000.00" });
    const run = (cur: string) =>
      ids(buildInsights({ current: m({ salesRevenue: cur }), previous: prev, todayISO: TODAY }));
    expect(run("1200.00")).toEqual([]);
    expect(run("1200.01")).toEqual(["revenue-up"]);
    expect(run("800.00")).toEqual([]);
    expect(run("799.99")).toEqual(["revenue-down"]);
    const up = buildInsights({
      current: m({ salesRevenue: "1500" }),
      previous: prev,
      todayISO: TODAY,
      previousLabel: "last month",
    });
    expect(up[0]).toMatchObject({ severity: "positive", title: "Sales up 50% vs last month" });
    // previous zero → no growth insight
    expect(
      ids(
        buildInsights({ current: m({ salesRevenue: "1500" }), previous: empty, todayISO: TODAY }),
      ),
    ).toEqual([]);
  });

  it("expense increase above 20% warns; decreases don't", () => {
    const prev = m({ expenses: "1000.00" });
    const run = (cur: string) =>
      ids(buildInsights({ current: m({ expenses: cur }), previous: prev, todayISO: TODAY }));
    expect(run("1200.00")).toEqual([]);
    expect(run("1200.01")).toEqual(["expenses-up"]);
    expect(run("100.00")).toEqual([]);
  });

  it("flags negative profit as critical", () => {
    const cur = computeMetrics(
      data([inv({ amount: "100" })], [exp({ amount: "1000" })]),
      "2026-10",
      TODAY,
    );
    expect(buildInsights({ current: cur, todayISO: TODAY })[0]).toMatchObject({
      id: "profit-negative",
      severity: "critical",
    });
    expect(ids(buildInsights({ current: m({ netProfit: "0.00" }), todayISO: TODAY }))).toEqual([]);
  });

  it("customer concentration fires above 40%", () => {
    const run = (share: string) =>
      ids(
        buildInsights({
          current: m({ topCustomer: { key: "a", name: "A", amount: "1", share } }),
          todayISO: TODAY,
        }),
      );
    expect(run("40.00")).toEqual([]);
    expect(run("40.01")).toEqual(["customer-concentration"]);
  });

  it("overdue share fires above 30%", () => {
    const run = (overdue: string) =>
      ids(
        buildInsights({
          current: m({ receivablesOutstanding: "1000.00", receivablesOverdue: overdue }),
          todayISO: TODAY,
        }),
      );
    expect(run("300.00")).toEqual([]);
    expect(run("300.01")).toEqual(["overdue-share"]);
  });

  it("filing due within 5 days (inclusive) and overdue filings", () => {
    const run = (dueDate: string, status = "not_started") =>
      buildInsights({
        current: empty,
        todayISO: TODAY,
        deadlines: [{ label: "GSTR-1", dueDate, status }],
      });
    expect(run("2026-11-10")[0]).toMatchObject({
      severity: "warning",
      title: "GSTR-1 is due in 5 days",
    });
    expect(run("2026-11-11")).toEqual([]);
    expect(run("2026-11-05")[0].title).toBe("GSTR-1 is due today");
    expect(run("2026-11-04")[0].severity).toBe("critical");
    expect(run("2026-11-06", "filed")).toEqual([]);
  });

  it("reports records excluded for missing data", () => {
    const cur = computeMetrics(
      data([inv({ docType: "export", currency: "USD", exchangeRate: "", country: "USA" })]),
      "2026-10",
      TODAY,
    );
    expect(buildInsights({ current: cur, todayISO: TODAY })[0]).toMatchObject({
      id: "missing-data",
      title: "1 invoice left out of these figures",
    });
  });

  it("sorts by severity and caps for the dashboard", () => {
    const cur = m({
      netProfit: "-1.00",
      salesRevenue: "2000.00",
      topCustomer: { key: "a", name: "A", amount: "1", share: "90.00" },
      receivablesOutstanding: "100.00",
      receivablesOverdue: "90.00",
    });
    const all = buildInsights({
      current: cur,
      previous: m({ salesRevenue: "1000.00" }),
      todayISO: TODAY,
    });
    expect(ids(all)).toEqual([
      "profit-negative",
      "overdue-share",
      "revenue-up",
      "customer-concentration",
    ]);
    expect(
      dashboardInsights({
        current: cur,
        previous: m({ salesRevenue: "1000.00" }),
        todayISO: TODAY,
      }),
    ).toHaveLength(3);
    expect(all.every((i) => i.action?.href.startsWith("/"))).toBe(true);
  });
});
