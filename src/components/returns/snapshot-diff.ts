import type { SnapshotRecord } from "@/lib/schema";

/**
 * "Changed since filed" (spec F8): compare the record hashes of a return as
 * it was filed with the hashes of the same return built from today's records.
 * Pure — no React or Dexie.
 */

export type ChangeKind = "added" | "changed" | "removed";

export interface RecordChange {
  change: ChangeKind;
  kind: SnapshotRecord["kind"];
  id: string;
}

export interface SnapshotDiff {
  added: SnapshotRecord[];
  changed: SnapshotRecord[];
  removed: SnapshotRecord[];
  /** added + changed + removed. */
  count: number;
}

const keyOf = (r: Pick<SnapshotRecord, "kind" | "id">) => `${r.kind}:${r.id}`;

/**
 * Records added, changed (different hash) or removed in `current` compared
 * with `previous`. `changed` and `added` carry the current record, `removed`
 * the previous one. Order follows the input arrays.
 */
export function diffSnapshot(
  previous: readonly SnapshotRecord[],
  current: readonly SnapshotRecord[],
): SnapshotDiff {
  const before = new Map(previous.map((r) => [keyOf(r), r]));
  const now = new Map(current.map((r) => [keyOf(r), r]));
  const added: SnapshotRecord[] = [];
  const changed: SnapshotRecord[] = [];
  const removed: SnapshotRecord[] = [];
  for (const [key, r] of now) {
    const old = before.get(key);
    if (!old) added.push(r);
    else if (old.hash !== r.hash) changed.push(r);
  }
  for (const [key, r] of before) if (!now.has(key)) removed.push(r);
  return { added, changed, removed, count: added.length + changed.length + removed.length };
}

/** Flatten one or more diffs into a de-duplicated change list (first occurrence wins). */
export function mergeChanges(diffs: readonly SnapshotDiff[]): RecordChange[] {
  const seen = new Set<string>();
  const out: RecordChange[] = [];
  const push = (change: ChangeKind, r: SnapshotRecord) => {
    const key = keyOf(r);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ change, kind: r.kind, id: r.id });
  };
  for (const d of diffs) {
    d.changed.forEach((r) => push("changed", r));
    d.added.forEach((r) => push("added", r));
    d.removed.forEach((r) => push("removed", r));
  }
  return out;
}
