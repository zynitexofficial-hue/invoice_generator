"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { amountInWords, integerToWords } from "@/lib/calc/words";
import { formatMoney } from "@/lib/format";
import { roundTo, toDec } from "@/lib/money";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Field } from "@/components/ui/field";

/** Rupees → words, in the invoice style plus plain Indian and international forms. */
export function AmountInWords() {
  const [amount, setAmount] = useState("125000.50");
  const value = roundTo(toDec(amount || "0").abs(), 2);
  const [rupees, paise] = value.toFixed(2).split(".");
  const paiseWords = Number(paise) ? ` and ${integerToWords(BigInt(paise), "indian")} Paise` : "";

  const outputs = [
    {
      label: "On an invoice",
      hint: "The format printed under the invoice total",
      text: amountInWords(value.toFixed(2), "INR"),
    },
    {
      label: "Indian system (lakh, crore)",
      hint: "For cheques and receipts",
      text: `Rupees ${integerToWords(BigInt(rupees), "indian")}${paiseWords} Only`,
    },
    {
      label: "International system (million, billion)",
      hint: "For export documents and foreign clients",
      text: `${integerToWords(BigInt(rupees), "international")} Rupees${
        Number(paise) ? ` and ${integerToWords(BigInt(paise), "international")} Paise` : ""
      }`,
    },
  ];

  return (
    <div className="mx-auto grid max-w-3xl overflow-hidden rounded-3xl border border-border bg-surface shadow-md">
      <div className="grid gap-3 p-6 sm:p-8">
        <Field label="Amount in rupees">
          <DecimalInput
            value={amount}
            onValueChange={setAmount}
            maxDecimals={2}
            leading={<span className="text-[13px]">₹</span>}
            className="[&_input]:h-12 [&_input]:text-lg"
            aria-label="Amount in rupees"
          />
        </Field>
        <p className="text-sm text-muted-foreground tabular-nums">
          {formatMoney(value.toFixed(2), "INR", "indian")}
          <span className="mx-2 text-subtle-foreground">·</span>
          {formatMoney(value.toFixed(2), "INR", "international")}
        </p>
      </div>
      <ul
        className="divide-y divide-border border-t border-border bg-surface-2/60"
        aria-live="polite"
      >
        {outputs.map((o) => (
          <Output key={o.label} {...o} />
        ))}
      </ul>
    </div>
  );
}

function Output({ label, hint, text }: { label: string; hint: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select the text and copy it instead");
    }
  };
  return (
    <li className="flex items-start gap-4 p-5 sm:px-8">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="mt-1.5 text-[15px] leading-7 font-medium break-words">{text}</p>
        <p className="mt-1 text-xs text-subtle-foreground">{hint}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground shadow-xs transition-colors hover:text-foreground focus-visible:focus-ring [&_svg]:size-4"
      >
        {copied ? <Check className="text-success" /> : <Copy />}
      </button>
    </li>
  );
}
