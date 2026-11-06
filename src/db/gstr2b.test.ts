import { beforeEach, describe, expect, it, vi } from "vitest";
import { overrideRecord } from "@/lib/gst/gstr2b";
import { getDb } from "./db";
import {
  deleteGstr2bImportWithMatches,
  deleteGstr2bMatch,
  getGstr2bImport,
  listMatchesForImport,
  saveGstr2bImport,
  saveGstr2bMatch,
} from "./gstr2b";
import { getPeriodInput, savePeriodInput } from "./period-inputs";

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
});

beforeEach(async () => {
  await Promise.all(getDb().tables.map((t) => t.clear()));
  memory.clear();
});

const row = {
  id: "r1",
  supplierGstin: "27AABCU9603R1ZX",
  docNo: "INV-1",
  docDate: "2026-10-05",
  taxable: "1000.00",
  cgst: "90.00",
  sgst: "90.00",
};

describe("GSTR-2B storage", () => {
  it("stores an import with embedded rows and fills the new row fields", async () => {
    const imp = await saveGstr2bImport({ periodKey: "2026-10", source: "json", rows: [row] });
    const back = await getGstr2bImport(imp.id);
    expect(back?.rows).toHaveLength(1);
    expect(back?.rows[0]).toMatchObject({ section: "b2b", origDocNo: "", itcAvailable: true });
  });

  it("keeps one decision per row (upsert by id) and removes it on reset", async () => {
    const imp = await saveGstr2bImport({ periodKey: "2026-10", rows: [row] });
    const full = (await getGstr2bImport(imp.id))!;
    const r = full.rows[0];
    await saveGstr2bMatch(overrideRecord(imp.id, r, { kind: "ignore" }));
    await saveGstr2bMatch(overrideRecord(imp.id, r, { kind: "unlink" }));
    const list = await listMatchesForImport(imp.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: `${imp.id}:r1`, status: "unmatched", targetId: "" });
    await deleteGstr2bMatch(`${imp.id}:r1`);
    expect(await listMatchesForImport(imp.id)).toHaveLength(0);
  });

  it("deletes an import together with its decisions", async () => {
    const imp = await saveGstr2bImport({ periodKey: "2026-10", rows: [row] });
    const r = (await getGstr2bImport(imp.id))!.rows[0];
    await saveGstr2bMatch(overrideRecord(imp.id, r, { kind: "ignore" }));
    await deleteGstr2bImportWithMatches(imp.id);
    expect(await getGstr2bImport(imp.id)).toBeUndefined();
    expect(await getDb().gstr2bMatches.count()).toBe(0);
  });
});

describe("period inputs", () => {
  it("saves worksheet values, flags and notes keyed by period", async () => {
    await savePeriodInput({
      id: "2026-10",
      periodKey: "2026-10",
      values: { "open.igst": "1000", "4B1.cgst": "25.50" },
      flags: { ims_reviewed: true },
      setOffNotes: "paid via PMT-06",
    });
    const back = await getPeriodInput("2026-10");
    expect(back?.values["4B1.cgst"]).toBe("25.50");
    expect(back?.flags.ims_reviewed).toBe(true);
    expect(back?.setOffNotes).toBe("paid via PMT-06");
  });
});
