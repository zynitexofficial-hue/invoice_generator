import { describe, expect, it } from "vitest";
import { autoBackupFileName, filesToDelete, isAutoBackupDue, localDateKey } from "./auto-backup";

describe("auto-backup rotation", () => {
  it("keeps the newest N matching files and ignores everything else", () => {
    const names = [
      "invoice-backup-2026-11-01.json",
      "invoice-backup-2026-11-05.json",
      "invoice-backup-2026-10-30.json",
      "invoice-backup-2026-11-03.json",
      "notes.txt",
      "invoice-backup-2026-11-04.json.crswap",
      "invoice-generator-backup-2026-01-01.json",
      "Invoice-Backup-2020-01-01.json",
    ];
    expect(filesToDelete(names, 2)).toEqual([
      "invoice-backup-2026-11-01.json",
      "invoice-backup-2026-10-30.json",
    ]);
    expect(filesToDelete(names, 14)).toEqual([]);
  });

  it("always keeps at least one file", () => {
    expect(
      filesToDelete(["invoice-backup-2026-11-01.json", "invoice-backup-2026-11-02.json"], 0),
    ).toEqual(["invoice-backup-2026-11-01.json"]);
  });

  it("names files by the local date", () => {
    const d = new Date(2026, 0, 9, 23, 30);
    expect(localDateKey(d)).toBe("2026-01-09");
    expect(autoBackupFileName(d)).toBe("invoice-backup-2026-01-09.json");
  });
});

describe("auto-backup schedule", () => {
  const now = new Date(2026, 10, 5, 15, 0);
  const today = new Date(2026, 10, 5, 9, 0).toISOString();
  const yesterday = new Date(2026, 10, 4, 9, 0).toISOString();

  it("runs only when data changed since the last covered change", () => {
    expect(isAutoBackupDue({ lastChangeAt: "", coveredChangeAt: "", lastRunAt: "", now })).toBe(
      false,
    );
    expect(
      isAutoBackupDue({ lastChangeAt: yesterday, coveredChangeAt: yesterday, lastRunAt: "", now }),
    ).toBe(false);
    expect(
      isAutoBackupDue({ lastChangeAt: today, coveredChangeAt: yesterday, lastRunAt: "", now }),
    ).toBe(true);
  });

  it("writes at most once per day", () => {
    const changed = { lastChangeAt: "2026-11-05T12:00:00.000Z", coveredChangeAt: "" };
    expect(isAutoBackupDue({ ...changed, lastRunAt: today, now })).toBe(false);
    expect(isAutoBackupDue({ ...changed, lastRunAt: yesterday, now })).toBe(true);
  });
});
