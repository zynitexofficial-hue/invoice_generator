"use client";

import { useMemo, useState } from "react";
import {
  expenseRegister,
  hsnSummary,
  incomeRegister,
  notesRegister,
  receivablesRegister,
  salesRegister,
  type Register,
} from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type { TabContext } from "./context";
import { RegisterTable } from "./shared";

const REGISTERS = ["sales", "notes", "expenses", "income", "hsn", "receivables"] as const;
type RegisterId = (typeof REGISTERS)[number];

const LABELS: Record<RegisterId, string> = {
  sales: "Sales register",
  notes: "Credit & debit notes",
  expenses: "Expense register",
  income: "Income register",
  hsn: "HSN/SAC summary",
  receivables: "Receivables (as of today)",
};

const DESCRIPTIONS: Record<RegisterId, string> = {
  sales:
    "Issued sales documents in the period. Drafts, quotations and cancelled ones are left out.",
  notes: "Credit and debit notes issued in the period.",
  expenses: "Bills and expenses in the period. Cost = total − eligible ITC.",
  income: "Other income entries (interest, commission, rent…) in the period.",
  hsn: "Taxable value and tax by HSN/SAC and rate, net of credit notes.",
  receivables: "Every issued invoice with a balance due today, whatever period is selected.",
};

export function RegistersTab({ ctx }: { ctx: TabContext }) {
  const { data, period, today, money, settings } = ctx;
  const [id, setId] = useState<RegisterId>("sales");
  const sel = period.selector;

  const register: Register = useMemo(() => {
    switch (id) {
      case "sales":
        return salesRegister(data, sel, today);
      case "notes":
        return notesRegister(data, sel);
      case "expenses":
        return expenseRegister(data, sel);
      case "income":
        return incomeRegister(data, sel);
      case "hsn":
        return hsnSummary(data, sel);
      case "receivables":
        return receivablesRegister(data, today);
    }
  }, [id, data, sel, today]);

  const slug = id === "receivables" ? today : period.param;
  const asOf = formatDate(today, settings.formats.dateFormat);

  return (
    <Card>
      <CardHeader
        title={LABELS[id]}
        description={DESCRIPTIONS[id]}
        action={
          <Select<RegisterId>
            value={id}
            onValueChange={setId}
            options={REGISTERS.map((r) => ({ value: r, label: LABELS[r] }))}
            className="w-48 sm:w-56"
            aria-label="Register"
          />
        }
        className="flex-col sm:flex-row"
      />
      <CardContent>
        <RegisterTable
          key={id}
          register={register}
          format={money}
          csvName={`${id}-register-${slug}`}
          onPrint={() =>
            ctx.print({
              title: id === "receivables" ? `Receivables as of ${asOf}` : register.title,
              landscape: register.headers.length > 8,
              coverage: id === "receivables" ? undefined : ctx.current.dataCoverage,
              sections: [register],
            })
          }
        />
      </CardContent>
    </Card>
  );
}
