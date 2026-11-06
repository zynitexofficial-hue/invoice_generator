import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureInvoices, fixtureSettings } from "@/lib/gst/returns/fixtures/october-2026";
import {
  findPendingAmendment,
  listAmendmentsForInvoice,
  recordCancellationAmendment,
} from "./amendments";
import { getDb } from "./db";
import { cancelInvoice } from "./invoices";

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

describe("cancelling a document in a filed period", () => {
  it("creates one draft cancellation amendment with the original values", async () => {
    const settings = fixtureSettings();
    for (const inv of fixtureInvoices()) await getDb().invoices.put(inv);
    const target = fixtureInvoices().find((i) => i.id === "inv-b2b-inter")!;
    const cancelled = await cancelInvoice(target, "Issued by mistake");

    const a = await recordCancellationAmendment({
      cancelled,
      settings,
      originalPeriodKey: "2026-10",
      today: "2026-11-05",
    });
    expect(a).toMatchObject({
      kind: "cancellation",
      status: "draft",
      originalNumber: "INV/26-27/002",
      originalPeriodKey: "2026-10",
      amendInPeriodKey: "2026-11",
      section: "b2b",
      beforeConfirmed: true,
      afterDoc: null,
      reason: "Issued by mistake",
    });
    expect(a?.beforeDoc?.items[0]).toMatchObject({ taxable: "50000.00", igst: "2500.00" });

    // Cancelling again / re-recording does not duplicate.
    expect(
      await recordCancellationAmendment({
        cancelled,
        settings,
        originalPeriodKey: "2026-10",
        today: "2026-11-05",
      }),
    ).toBeUndefined();
    expect(await listAmendmentsForInvoice(target.id)).toHaveLength(1);
    expect((await findPendingAmendment(target.id, "2026-10"))?.id).toBe(a?.id);
  });
});
