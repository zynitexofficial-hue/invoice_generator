import { describe, expect, it } from "vitest";
import type { SnapshotRecord } from "@/lib/schema";
import { diffSnapshot, mergeChanges } from "./snapshot-diff";

const inv = (id: string, hash: string): SnapshotRecord => ({ kind: "invoice", id, hash });
const exp = (id: string, hash: string): SnapshotRecord => ({ kind: "expense", id, hash });

describe("diffSnapshot", () => {
  it("finds nothing when hashes match (order does not matter)", () => {
    const d = diffSnapshot([inv("a", "1"), inv("b", "2")], [inv("b", "2"), inv("a", "1")]);
    expect(d).toEqual({ added: [], changed: [], removed: [], count: 0 });
  });

  it("reports added, changed and removed records", () => {
    const d = diffSnapshot(
      [inv("a", "1"), inv("b", "2"), exp("e1", "x")],
      [inv("a", "1"), inv("b", "3"), inv("c", "4")],
    );
    expect(d.changed).toEqual([inv("b", "3")]);
    expect(d.added).toEqual([inv("c", "4")]);
    expect(d.removed).toEqual([exp("e1", "x")]);
    expect(d.count).toBe(3);
  });

  it("keeps invoices and expenses with the same id apart", () => {
    const d = diffSnapshot([inv("same", "1")], [exp("same", "1")]);
    expect(d.added).toEqual([exp("same", "1")]);
    expect(d.removed).toEqual([inv("same", "1")]);
  });

  it("treats an empty snapshot as everything added", () => {
    expect(diffSnapshot([], [inv("a", "1")]).added).toHaveLength(1);
  });
});

describe("mergeChanges", () => {
  it("de-duplicates records that appear in several returns", () => {
    const g1 = diffSnapshot([inv("a", "1")], [inv("a", "2")]);
    const g3b = diffSnapshot([inv("a", "1"), exp("e", "1")], [inv("a", "2")]);
    expect(mergeChanges([g1, g3b])).toEqual([
      { change: "changed", kind: "invoice", id: "a" },
      { change: "removed", kind: "expense", id: "e" },
    ]);
  });
});
