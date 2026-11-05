"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { INDIAN_STATES, OTHER_COUNTRY_CODE } from "@/lib/gst/states";
import { Input } from "@/components/ui/input";

interface Row {
  code: string;
  name: string;
  kind: string;
  tax: string;
  note?: string;
}

/** UTs with their own legislature charge SGST, not UTGST, so the utgst flag alone can't tell. */
const UT_WITH_LEGISLATURE = new Set(["01", "07", "34"]);

const kindOf = (code: string, utgst: boolean) =>
  code === "97"
    ? "Other territory"
    : UT_WITH_LEGISLATURE.has(code)
      ? "Union Territory (with legislature)"
      : utgst
        ? "Union Territory"
        : "State";

/** Every code from the shared state list, plus 96 for supplies outside India. */
const ROWS: Row[] = [
  ...INDIAN_STATES.map((s) => ({
    code: s.code,
    name: s.name,
    kind: kindOf(s.code, s.utgst),
    tax: s.utgst ? "CGST + UTGST" : "CGST + SGST",
    note:
      s.code === "25"
        ? "Old code — Daman and Diu merged into 26 in 2020."
        : s.code === "28"
          ? "Old code for Andhra Pradesh before its 2014 division. Current Andhra Pradesh GSTINs use 37."
          : s.code === "97"
            ? "For supplies in Indian territory outside any state or UT, such as offshore areas."
            : undefined,
  })),
  {
    code: OTHER_COUNTRY_CODE,
    name: "Other country (outside India)",
    kind: "Place of supply only",
    tax: "IGST (or zero-rated under LUT)",
    note: "Used as the place of supply for exports. Not part of any GSTIN.",
  },
].sort((a, b) => a.code.localeCompare(b.code));

/** Searchable table of GST state codes; rendered in full on the server for search engines. */
export function StateCodeTable() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = q
    ? ROWS.filter((r) => r.code.includes(q) || r.name.toLowerCase().includes(q))
    : ROWS;

  return (
    <div className="mx-auto max-w-3xl">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by state name or code"
        aria-label="Search states"
        leading={<Search />}
        inputClassName="h-11 text-base"
      />
      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[520px] text-left text-sm">
          <caption className="sr-only">GST state codes</caption>
          <thead className="bg-surface-2/70 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="w-20 px-4 py-3">
                Code
              </th>
              <th scope="col" className="px-4 py-3">
                State / UT
              </th>
              <th scope="col" className="px-4 py-3">
                Type
              </th>
              <th scope="col" className="px-4 py-3">
                Tax within the state
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.code} className="align-top">
                <td className="px-4 py-3 font-mono text-[15px] font-semibold tabular-nums">
                  {r.code}
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium">{r.name}</span>
                  {r.note && (
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      {r.note}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.kind}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.tax}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No state or code matches “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
