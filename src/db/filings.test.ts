import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "./db";
import {
  filedPeriodFor,
  getFiledPeriodForDate,
  isPeriodFiledForDate,
  upsertFiling,
} from "./filings";

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
});

beforeEach(async () => {
  const db = getDb();
  await Promise.all(db.tables.map((t) => t.clear()));
  memory.clear();
});

describe("isPeriodFiledForDate", () => {
  it("is false when nothing is filed", async () => {
    expect(await isPeriodFiledForDate("2026-10-05", "monthly")).toBe(false);
  });

  it("checks the month's GSTR-1 for monthly filers", async () => {
    await upsertFiling({
      periodKey: "2026-10",
      periodKind: "month",
      returnType: "GSTR-1",
      status: "filed",
      filedAt: "2026-11-11T10:00:00.000Z",
    });
    expect(await isPeriodFiledForDate("2026-10-31", "monthly")).toBe(true);
    expect(await isPeriodFiledForDate("2026-11-01", "monthly")).toBe(false);
    expect((await getFiledPeriodForDate("2026-10-01", "monthly"))?.filedAt).toBe(
      "2026-11-11T10:00:00.000Z",
    );
  });

  it("ignores returns that are only exported, and other return types", async () => {
    await upsertFiling({
      periodKey: "2026-10",
      periodKind: "month",
      returnType: "GSTR-1",
      status: "exported",
    });
    await upsertFiling({
      periodKey: "2026-10",
      periodKind: "month",
      returnType: "GSTR-3B",
      status: "filed",
    });
    expect(await isPeriodFiledForDate("2026-10-10", "monthly")).toBe(false);
  });

  it("checks the FY quarter for QRMP filers (Jan–Mar is Q4 of the previous FY start)", async () => {
    await upsertFiling({
      periodKey: "2025-Q4",
      periodKind: "quarter",
      returnType: "GSTR-1",
      status: "filed",
    });
    expect(await isPeriodFiledForDate("2026-02-14", "qrmp")).toBe(true);
    expect(await isPeriodFiledForDate("2026-04-01", "qrmp")).toBe(false);
    // A monthly filer's month isn't covered by a quarterly row.
    expect(await isPeriodFiledForDate("2026-02-14", "monthly")).toBe(false);
  });

  it("treats a filed IFF as locking that month for QRMP filers", () => {
    const iff = {
      id: "2026-07:IFF",
      periodKey: "2026-07",
      periodKind: "month" as const,
      returnType: "IFF" as const,
      status: "filed" as const,
      dueDate: "",
      exportedAt: "",
      filedAt: "",
      arn: "",
      lateFee: "",
      interest: "",
      notes: "",
      createdAt: "",
      updatedAt: "",
    };
    expect(filedPeriodFor([iff], "2026-07-20", "qrmp")).toBe(iff);
    expect(filedPeriodFor([iff], "2026-08-20", "qrmp")).toBeUndefined();
    expect(filedPeriodFor([iff], "", "qrmp")).toBeUndefined();
  });
});
