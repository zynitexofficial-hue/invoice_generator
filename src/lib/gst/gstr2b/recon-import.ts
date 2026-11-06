import { periodRange } from "@/lib/period";
import type { Gstr2bImport, Gstr2bMatch } from "@/lib/schema";
import type { BookDoc } from "./books";
import { reconcile, type MatchOptions, type ReconResult } from "./match";

/**
 * Reconcile one stored import against the books, applying the user's saved
 * decisions. Books reported as "missing in 2B" are those dated in the import's
 * return month; matching itself looks at every book document.
 */
export function reconcileImport(
  imp: Pick<Gstr2bImport, "id" | "periodKey" | "rows">,
  books: BookDoc[],
  matches: Gstr2bMatch[],
  options?: Partial<MatchOptions>,
): ReconResult {
  const window = imp.periodKey ? periodRange(imp.periodKey) : undefined;
  return reconcile({
    rows: imp.rows,
    books,
    overrides: matches.filter((m) => m.importId === imp.id),
    options,
    missingWindow: window ? { start: window.start, end: window.end } : undefined,
  });
}
