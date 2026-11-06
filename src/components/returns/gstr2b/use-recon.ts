"use client";

import { useMemo } from "react";
import { useExpenses, useGstr2bImports, useGstr2bMatches, usePurchases } from "@/db/hooks";
import { buildBookDocs, reconcileImport, type BookDoc, type ReconResult } from "@/lib/gst/gstr2b";
import type { Gstr2bImport, Gstr2bMatch } from "@/lib/schema";

export interface ImportRecon {
  imp: Gstr2bImport;
  result: ReconResult;
}

export interface ReconData {
  loading: boolean;
  imports: Gstr2bImport[];
  matches: Gstr2bMatch[];
  books: BookDoc[];
  recons: ImportRecon[];
}

/** Imports, saved decisions and the books, reconciled. Shared by the GSTR-2B tab and the ITC tab. */
export function useReconData(): ReconData {
  const imports = useGstr2bImports();
  const matches = useGstr2bMatches();
  const purchases = usePurchases();
  const expenses = useExpenses();
  const loading = !imports || !matches || !purchases || !expenses;
  const books = useMemo(
    () => (loading ? [] : buildBookDocs({ purchases, expenses })),
    [loading, purchases, expenses],
  );
  const recons = useMemo(
    () =>
      loading ? [] : imports.map((imp) => ({ imp, result: reconcileImport(imp, books, matches) })),
    [loading, imports, matches, books],
  );
  return {
    loading,
    imports: imports ?? [],
    matches: matches ?? [],
    books,
    recons,
  };
}
