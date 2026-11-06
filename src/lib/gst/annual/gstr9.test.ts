import { describe, expect, it } from "vitest";
import { buildGstr3b } from "@/lib/gst/returns";
import {
  fixtureExpenses,
  fixtureInvoices,
  fixtureSettings,
} from "@/lib/gst/returns/fixtures/october-2026";
import { annualApplicability } from "./applicability";
import { buildGstr9, gstr9Row } from "./gstr9";
import { buildGstr9c } from "./gstr9c";

const FY = "FY2026-27";
const base = {
  invoices: fixtureInvoices(),
  expenses: fixtureExpenses(),
  settings: fixtureSettings(),
  fyKey: FY,
};
const r = buildGstr9(base);
const v = (id: string, head = "taxable") => gstr9Row(r, id).values[head];

describe("GSTR-9 worksheet", () => {
  it("Table 4 tax equals the GSTR-3B output tax for the whole year", () => {
    const b = buildGstr3b({ ...base, periodKey: FY });
    const out = b.payable.outputTax;
    expect(r.checks.find((c) => c.id === "tax-vs-3b")!.ok).toBe(true);
    const tax = (h: "igst" | "cgst" | "sgst") =>
      ["4A", "4B", "4C", "4D", "4J"].reduce((a, id) => a + Number(v(id, h)), 0) -
      Number(v("4I", h));
    expect(tax("igst").toFixed(2)).toBe(out.igst);
    expect(tax("cgst").toFixed(2)).toBe(out.cgst);
  });

  it("ITC in Table 6 matches the GSTR-3B build", () => {
    expect(r.checks.find((c) => c.id === "itc-vs-6")!.ok).toBe(true);
  });

  it("keeps reverse-charge inward supplies in 4G and outward RCM in 5C", () => {
    expect(v("4G")).toBe("20000.00");
    expect(v("4G", "cgst")).toBe("1800.00");
    expect(v("5C")).toBe("10000.00");
  });

  it("4N = 4H + 4M and 5N = 4N + 5M - 4G", () => {
    const n4 = Number(v("4N"));
    expect((Number(v("4H")) + Number(v("4M"))).toFixed(2)).toBe(n4.toFixed(2));
    expect((n4 + Number(v("5M")) - Number(v("4G"))).toFixed(2)).toBe(r.totalTurnover);
  });

  it("books rows with a value have records to drill into", () => {
    for (const id of ["4A", "4B", "4C", "4G", "6B1"]) {
      const row = gstr9Row(r, id);
      const value = Number(row.values.taxable ?? row.values.cgst);
      if (value !== 0) expect(row.drill.length).toBeGreaterThan(0);
    }
  });

  it("applies manual overrides and flows them into totals", () => {
    const o = buildGstr9({ ...base, inputs: { "4F.taxable": "1,000", "4B.taxable": "5" } });
    expect(gstr9Row(o, "4F").values.taxable).toBe("1000.00");
    expect(gstr9Row(o, "4F").source).toBe("manual");
    expect(gstr9Row(o, "4B").overridden).toEqual(["taxable"]);
    expect(gstr9Row(o, "4B").books?.taxable).toBe(v("4B"));
    expect(Number(gstr9Row(o, "4H").values.taxable)).toBeCloseTo(
      Number(v("4H")) - Number(v("4B")) + 5 + 1000,
      2,
    );
  });

  it("7J = 6O - 7I and 8D = 8A - 8B with manual entries", () => {
    const o = buildGstr9({ ...base, inputs: { "7A.cgst": "100", "8A.cgst": "7000" } });
    expect(Number(gstr9Row(o, "7J").values.cgst)).toBeCloseTo(
      Number(gstr9Row(o, "6O").values.cgst) - 100,
      2,
    );
    expect(Number(gstr9Row(o, "8D").values.cgst)).toBeCloseTo(
      7000 - Number(gstr9Row(o, "8B").values.cgst),
      2,
    );
  });

  it("HSN table has drill-down", () => {
    expect(r.hsnOutward.length).toBeGreaterThan(0);
    expect(r.hsnOutward.every((h) => h.drill.length > 0)).toBe(true);
  });

  it("is empty-safe", () => {
    const e = buildGstr9({ invoices: [], expenses: [], settings: fixtureSettings(), fyKey: FY });
    expect(e.totalTurnover).toBe("0.00");
    expect(e.checks.every((c) => c.ok)).toBe(true);
  });

  it("due date is 31 December after the year", () => {
    expect(r.dueDate).toBe("2027-12-31");
  });
});

describe("applicability", () => {
  it("marks thresholds", () => {
    const a = (bookTurnover: string) =>
      annualApplicability({ bookTurnover, settingsAato: "", dueDate: null });
    expect(a("1000000").gstr9).toBe("optional");
    expect(a("60000000").gstr9).toBe("mandatory");
    expect(a("60000000").gstr9c).toBe("mandatory");
    expect(a("0").gstr9).toBe("unknown");
  });
});

describe("GSTR-9C worksheet", () => {
  const mk = (values: Record<string, string> = {}) =>
    buildGstr9c({ gstr9: r, booksTurnover: r.totalTurnover, values, checklist: { cert: true } });
  it("reconciles when accounts equal books", () => {
    const c = mk();
    expect(c.unreconciledTurnover).toBe("0.00");
    expect(c.checklistDone).toBe(1);
  });
  it("shows manual adjustments in the unreconciled difference", () => {
    const c = mk({ A2: "100", A9: "-10" });
    expect(c.unreconciledTurnover).toBe((100 - 10 - Number(r.totalTurnover)).toFixed(2));
  });
  it("tax liability ties to Table 9 payable from books", () => {
    expect(mk().rows.find((x) => x.id === "B3")!.value).toBe("0.00");
  });
});
