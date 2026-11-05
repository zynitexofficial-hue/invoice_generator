"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { calculateInvoice } from "@/lib/calc/engine";
import { formatMoney } from "@/lib/format";
import { halfRate } from "@/lib/gst/tax";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";

const RATES = ["0", "0.25", "3", "5", "12", "18", "28", "40"];
type Mode = "add" | "remove";
type Supply = "intra" | "inter";

/** Interactive GST calculator — uses the same engine as the invoice generator. */
export function GstCalculator() {
  const [amount, setAmount] = useState("10000");
  const [rate, setRate] = useState("18");
  const [mode, setMode] = useState<Mode>("add");
  const [supply, setSupply] = useState<Supply>("intra");

  const t = useMemo(
    () =>
      calculateInvoice({
        currency: "INR",
        lines: [
          {
            id: "x",
            quantity: "1",
            unitPrice: amount || "0",
            gstRate: rate,
            discount: { kind: "percent", value: "" },
          },
        ],
        invoiceDiscount: { kind: "percent", value: "" },
        pricesIncludeGst: mode === "remove",
        taxKind: supply,
        roundOff: false,
        amountReceived: "",
      }),
    [amount, rate, mode, supply],
  );
  const money = (v: string) => formatMoney(v, "INR", "indian");

  return (
    <div className="grid overflow-hidden rounded-3xl border border-border bg-surface shadow-md md:grid-cols-2">
      <div className="grid gap-5 p-6 sm:p-8">
        <Field label={mode === "add" ? "Amount (before GST)" : "Amount (including GST)"}>
          <DecimalInput
            value={amount}
            onValueChange={setAmount}
            leading={<span className="text-[13px]">₹</span>}
            className="[&_input]:h-12 [&_input]:text-lg"
            aria-label="Amount"
          />
        </Field>
        <Field label="GST rate">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="GST rate">
            {RATES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={rate === r}
                onClick={() => setRate(r)}
                className={
                  rate === r
                    ? "h-9 min-w-12 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm"
                    : "h-9 min-w-12 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                }
              >
                {r}%
              </button>
            ))}
          </div>
        </Field>
        <Field label="Calculation">
          <Segmented<Mode>
            fullWidth
            value={mode}
            onValueChange={setMode}
            options={[
              { value: "add", label: "Add GST" },
              { value: "remove", label: "Remove GST" },
            ]}
          />
        </Field>
        <Field label="Supply">
          <Segmented<Supply>
            fullWidth
            value={supply}
            onValueChange={setSupply}
            options={[
              { value: "intra", label: "Same state" },
              { value: "inter", label: "Other state" },
            ]}
          />
        </Field>
      </div>

      <div className="flex flex-col bg-surface-2/60 p-6 sm:p-8" aria-live="polite">
        <dl className="grid gap-3 text-sm">
          <Row label="Taxable value" value={money(t.taxableTotal)} />
          {supply === "intra" ? (
            <>
              <Row label={`CGST @ ${halfRate(rate)}%`} value={money(t.cgstTotal)} />
              <Row label={`SGST @ ${halfRate(rate)}%`} value={money(t.sgstTotal)} />
            </>
          ) : (
            <Row label={`IGST @ ${rate}%`} value={money(t.igstTotal)} />
          )}
          <Row label="Total GST" value={money(t.taxTotal)} />
        </dl>
        <div className="mt-5 border-t border-border pt-5">
          <div className="text-sm text-muted-foreground">Total amount</div>
          <div className="text-3xl font-semibold tracking-[-0.02em] tabular-nums">
            {money(t.grandTotal)}
          </div>
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pt-6">
          <Button variant="primary" asChild>
            <Link href="/invoice?new=1">
              Make an invoice with this
              <ArrowRight />
            </Link>
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setAmount("10000");
              setRate("18");
              setMode("add");
              setSupply("intra");
            }}
          >
            <RotateCcw />
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
