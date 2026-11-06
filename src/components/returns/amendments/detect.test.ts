import { describe, expect, it } from "vitest";
import { buildGstr1 } from "@/lib/gst/returns";
import { PERIOD, fixtureInvoices, fixtureSettings } from "@/lib/gst/returns/fixtures/october-2026";
import { amendmentSchema, filingSchema, returnSnapshotSchema, filingId } from "@/lib/schema";
import { gstr1SnapshotRecords } from "../returns-data";
import { detectCandidates } from "./detect";

const settings = fixtureSettings();
const original = fixtureInvoices();
const filing = filingSchema.parse({
  id: filingId(PERIOD, "GSTR-1"),
  periodKey: PERIOD,
  periodKind: "month",
  returnType: "GSTR-1",
  status: "filed",
  filedAt: "2026-11-10T10:00:00.000Z",
});
const snapshot = returnSnapshotSchema.parse({
  id: "s1",
  filingId: filing.id,
  periodKey: PERIOD,
  returnType: "GSTR-1",
  totals: { _stage: "filed" },
  records: gstr1SnapshotRecords(buildGstr1({ invoices: original, settings, periodKey: PERIOD })),
  createdAt: "2026-11-10T10:00:00.000Z",
});

const run = (invoices = original, amendments: ReturnType<typeof amendmentSchema.parse>[] = []) =>
  detectCandidates({ invoices, settings, filings: [filing], snapshots: [snapshot], amendments });

describe("detectCandidates", () => {
  it("finds nothing when nothing changed", () => {
    expect(run()).toEqual([]);
  });

  it("flags edits, cancellations and date moves after filing", () => {
    const changed = original.map((i) => {
      if (i.id === "inv-b2b-intra") return { ...i, lines: i.lines.slice(0, 1) };
      if (i.id === "inv-b2b-inter") return { ...i, status: "cancelled" as const };
      if (i.id === "inv-b2cs-intra") return { ...i, invoiceDate: "2026-11-02" };
      return i;
    });
    const res = run(changed);
    const by = Object.fromEntries(res.map((c) => [c.invoiceId, c.change]));
    expect(by).toEqual({
      "inv-b2b-inter": "cancelled",
      "inv-b2b-intra": "changed",
      "inv-b2cs-intra": "moved",
    });
    expect(res[0].change).toBe("cancelled");
    expect(res.every((c) => c.periodKey === PERIOD)).toBe(true);
  });

  it("links an existing unreported amendment and ignores reported ones", () => {
    const changed = original.map((i) =>
      i.id === "inv-b2b-intra" ? { ...i, lines: i.lines.slice(0, 1) } : i,
    );
    const open = amendmentSchema.parse({
      id: "a1",
      originalInvoiceId: "inv-b2b-intra",
      originalPeriodKey: PERIOD,
    });
    expect(run(changed, [open])[0].amendment?.id).toBe("a1");
    const done = amendmentSchema.parse({ ...open, status: "reported" });
    expect(run(changed, [done])[0].amendment).toBeUndefined();
  });

  it("ignores periods that are not filed", () => {
    const res = detectCandidates({
      invoices: original,
      settings,
      filings: [{ ...filing, status: "exported" }],
      snapshots: [snapshot],
      amendments: [],
    });
    expect(res).toEqual([]);
  });
});
