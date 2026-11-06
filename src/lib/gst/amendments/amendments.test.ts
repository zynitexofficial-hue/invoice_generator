import { describe, expect, it } from "vitest";
import { buildGstr1 } from "@/lib/gst/returns";
import { PERIOD, fixtureInvoices, fixtureSettings } from "@/lib/gst/returns/fixtures/october-2026";
import { amendmentSchema, type Amendment } from "@/lib/schema";
import {
  amendmentJson,
  amendmentsForPeriod,
  b2csMonthsNeeded,
  buildAmendmentSections,
  currentDoc,
  draftAmendment,
  pendingAmendments,
  refreshAfter,
} from "./index";

const settings = fixtureSettings();
const invoices = fixtureInvoices();
const byId = (id: string) => invoices.find((i) => i.id === id)!;

function draft(id: string, over: Record<string, unknown> = {}): Amendment {
  const d = draftAmendment({
    invoice: byId(id),
    invoices,
    settings,
    originalPeriodKey: PERIOD,
    amendInPeriodKey: "2026-11",
  });
  return amendmentSchema.parse({ id: `am-${id}`, ...d, ...over });
}

describe("currentDoc", () => {
  it("matches the GSTR-1 placement and amounts", () => {
    const b2b = currentDoc(byId("inv-b2b-intra"), invoices, settings);
    expect(b2b.section).toBe("b2b");
    expect(b2b.doc).toMatchObject({ number: "INV/26-27/001", value: "17700.00", pos: "27" });
    const r = buildGstr1({ invoices, settings, periodKey: PERIOD });
    expect(b2b.doc!.items).toEqual(r.sections.b2b[0].items);
    expect(currentDoc(byId("inv-b2cl"), invoices, settings).section).toBe("b2cl");
    expect(currentDoc(byId("inv-b2cs-intra"), invoices, settings).section).toBe("b2cs");
  });

  it("reports a cancelled document as it was, flagged cancelled", () => {
    const c = currentDoc(byId("inv-cancelled"), invoices, settings);
    expect(c.cancelled).toBe(true);
    expect(c.section).toBe("b2cs");
    expect(c.doc?.items[0].taxable).toBe("500.00");
  });

  it("returns no doc for drafts", () => {
    expect(currentDoc(byId("inv-draft"), invoices, settings).doc).toBeNull();
  });
});

describe("draftAmendment", () => {
  it("a cancellation has confirmed original values and no after document", () => {
    const a = draft("inv-cancelled");
    expect(a.kind).toBe("cancellation");
    expect(a.beforeConfirmed).toBe(true);
    expect(a.afterDoc).toBeNull();
    expect(a.after).toMatchObject({ status: "Cancelled", taxable: "0.00" });
    expect(a.before).toMatchObject({ number: "INV/26-27/008", taxable: "500.00" });
  });

  it("an edit starts unconfirmed with today's values", () => {
    const a = draft("inv-b2b-intra");
    expect(a.kind).toBe("invoice_amendment");
    expect(a.beforeConfirmed).toBe(false);
    expect(a.section).toBe("b2b");
    expect(a.status).toBe("draft");
  });

  it("refreshAfter follows later edits of the invoice", () => {
    const a = draft("inv-b2b-intra");
    const edited = {
      ...byId("inv-b2b-intra"),
      lines: byId("inv-b2b-intra").lines.slice(0, 1),
    };
    const r = refreshAfter(a, edited, invoices, settings);
    expect(r.afterDoc?.items[0].taxable).toBe("10000.00");
    expect(r.after.taxable).toBe("10000.00");
  });
});

describe("buildAmendmentSections", () => {
  it("amended B2B: revised values and the signed change", () => {
    // Filed 15000 taxable; now corrected to 10000 (one line removed).
    const base = draft("inv-b2b-intra");
    const edited = { ...byId("inv-b2b-intra"), lines: byId("inv-b2b-intra").lines.slice(0, 1) };
    const afterDoc = currentDoc(edited, invoices, settings).doc!;
    const a = amendmentSchema.parse({ ...base, afterDoc, beforeConfirmed: true, status: "ready" });
    const s = buildAmendmentSections({ amendments: [a] });
    expect(s.count).toBe(1);
    const row = s.rows.b2ba[0];
    expect(row.original).toEqual({ number: "INV/26-27/001", date: "2026-10-01" });
    expect(row.revised.items[0].taxable).toBe("10000.00");
    expect(row.delta).toMatchObject({ taxable: "-5000.00", cgst: "-450.00", sgst: "-450.00" });
    expect(s.totals.b2ba).toMatchObject({ count: 1, taxable: "-5000.00" });
    expect(s.net.taxable).toBe("-5000.00");
    expect(s.warnings).toEqual([]);
  });

  it("a cancelled document is reported with zero values", () => {
    const a = draft("inv-b2b-inter", { status: "ready" });
    const cancelled = amendmentSchema.parse({ ...a, afterDoc: null });
    const s = buildAmendmentSections({ amendments: [cancelled] });
    const row = s.rows.b2ba[0];
    expect(row.cancelled).toBe(true);
    expect(row.revised.value).toBe("0.00");
    expect(row.revised.items[0]).toMatchObject({ taxable: "0.00", igst: "0.00" });
    expect(row.delta).toMatchObject({ taxable: "-50000.00", igst: "-2500.00" });
  });

  it("warns when original values are unconfirmed or the table is not amendable", () => {
    const s = buildAmendmentSections({ amendments: [draft("inv-b2b-intra")] });
    expect(s.warnings[0].message).toMatch(/not confirmed/);
    const nil = amendmentSchema.parse({ ...draft("inv-b2b-intra"), section: "" });
    expect(buildAmendmentSections({ amendments: [nil] }).warnings[0].message).toMatch(
      /not in a GSTR-1 table/,
    );
  });

  it("credit notes change the section total with a negative sign", () => {
    const a = amendmentSchema.parse({
      ...draft("inv-b2b-intra"),
      section: "cdnr",
      beforeConfirmed: true,
      beforeDoc: { ...draft("inv-b2b-intra").beforeDoc!, noteType: "C" },
      afterDoc: { ...draft("inv-b2b-intra").beforeDoc!, noteType: "C", items: [] },
    });
    const s = buildAmendmentSections({ amendments: [a] });
    expect(s.rows.cdnra).toHaveLength(1);
    // before = -15000, after = 0 -> +15000
    expect(s.rows.cdnra[0].delta.taxable).toBe("15000.00");
  });

  it("B2CS amendments use the current totals of the original month", () => {
    const a = draft("inv-b2cs-intra", { status: "ready", beforeConfirmed: true });
    expect(b2csMonthsNeeded([a])).toEqual(["2026-10"]);
    const r = buildGstr1({ invoices, settings, periodKey: PERIOD });
    const s = buildAmendmentSections({
      amendments: [a],
      b2csByMonth: new Map([["2026-10", r.sections.b2cs]]),
    });
    expect(s.b2csa).toHaveLength(1);
    expect(s.b2csa[0]).toMatchObject({
      month: "2026-10",
      supplyType: "INTRA",
      pos: "27",
      rate: "18",
    });
    const cur = r.sections.b2cs.find(
      (x) => x.supplyType === "INTRA" && x.pos === "27" && x.rate === "18",
    )!;
    expect(s.b2csa[0].taxable).toBe(cur.taxable);
    const missing = buildAmendmentSections({ amendments: [a] });
    expect(missing.warnings.some((w) => /revised totals/.test(w.message))).toBe(true);
  });
});

describe("amendmentJson", () => {
  it("emits portal-style amended tables and omits empty ones", () => {
    const a = draft("inv-b2b-intra", { status: "ready", beforeConfirmed: true });
    const n = draft("inv-b2cl", { status: "ready", beforeConfirmed: true });
    const json = amendmentJson(buildAmendmentSections({ amendments: [a, n] }));
    expect(Object.keys(json).sort()).toEqual(["b2ba", "b2cla"]);
    const b2ba = json.b2ba as { ctin: string; inv: Record<string, unknown>[] }[];
    expect(b2ba[0].inv[0]).toMatchObject({
      oinum: "INV/26-27/001",
      oidt: "01-10-2026",
      inum: "INV/26-27/001",
      val: 17700,
      pos: "27",
      rchrg: "N",
      inv_typ: "R",
    });
    expect(JSON.stringify(b2ba[0].inv[0].itms)).toContain('"camt":1350');
  });
});

describe("period helpers", () => {
  it("filters by target period and status", () => {
    const list = [
      draft("inv-b2b-intra", { status: "ready" }),
      draft("inv-b2b-inter", { status: "draft" }),
      draft("inv-b2cl", { status: "reported", amendInPeriodKey: "2026-11" }),
      draft("inv-b2cs-intra", { status: "ready", amendInPeriodKey: "2026-12" }),
    ];
    expect(amendmentsForPeriod(list, "2026-11").map((a) => a.originalNumber)).toEqual([
      "INV/26-27/001",
    ]);
    expect(amendmentsForPeriod(list, "2026-11", ["draft", "ready"])).toHaveLength(2);
    expect(pendingAmendments(list)).toHaveLength(3);
  });
});
