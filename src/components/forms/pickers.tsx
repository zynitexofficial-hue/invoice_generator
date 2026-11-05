"use client";

import { useState, type FormEvent } from "react";
import { CURRENCIES, currencySymbol } from "@/lib/currency";
import { OTHER_COUNTRY_CODE, SELECTABLE_STATES } from "@/lib/gst/states";
import { Combobox } from "@/components/ui/combobox";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";

export function StateSelect({
  value,
  onChange,
  id,
  allowOutsideIndia,
  placeholder = "Select state",
  autoLabel,
}: {
  value: string;
  onChange: (code: string) => void;
  id?: string;
  allowOutsideIndia?: boolean;
  placeholder?: string;
  /** When set, adds an "Auto" option (empty value) with this label. */
  autoLabel?: string;
}) {
  const items = [
    ...(autoLabel ? [{ code: "", name: autoLabel }] : []),
    ...SELECTABLE_STATES.map((s) => ({ code: s.code, name: s.name })),
    ...(allowOutsideIndia ? [{ code: OTHER_COUNTRY_CODE, name: "Outside India" }] : []),
  ];
  return (
    <Combobox
      id={id}
      items={items}
      getKey={(s) => s.code || "auto"}
      getLabel={(s) => (s.code ? `${s.name} (${s.code})` : s.name)}
      getKeywords={(s) => [s.code]}
      selectedKey={value || (autoLabel ? "auto" : undefined)}
      onSelect={(s) => onChange(s.code)}
      placeholder={placeholder}
      searchPlaceholder="Search states…"
    />
  );
}

export function CurrencySelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (code: string) => void;
  id?: string;
}) {
  return (
    <Combobox
      id={id}
      items={CURRENCIES}
      getKey={(c) => c.code}
      getLabel={(c) => `${c.code} — ${c.name}`}
      getDescription={(c) => currencySymbol(c.code)}
      selectedKey={value}
      onSelect={(c) => onChange(c.code)}
      searchPlaceholder="Search currencies…"
    />
  );
}

export function GstRateSelect({
  value,
  onChange,
  rates,
  id,
  size,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (rate: string) => void;
  rates: string[];
  id?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const normalized = rates.map((r) => String(Number(r)));
  const current = value === "" ? "0" : String(Number(value));

  const standardOptions = Array.from(new Set([...normalized, current]))
    .filter((r) => r !== "NaN")
    .sort((a, b) => Number(a) - Number(b))
    .map((r) => ({
      value: r,
      label: `${r}%`,
      description: normalized.includes(r) ? undefined : "Custom",
    }));

  const options = [
    ...standardOptions,
    { value: "__custom__", label: "Custom rate…", description: "Enter integer %" },
  ];

  const handleSelect = (selectedVal: string) => {
    if (selectedVal === "__custom__") {
      setCustomInput(current !== "NaN" && Number(current) > 0 ? current : "");
      setCustomError(null);
      setCustomOpen(true);
      return;
    }
    onChange(selectedVal);
  };

  const handleApplyCustom = (e?: FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = customInput.trim();
    if (!trimmed) {
      setCustomError("Please enter an integer rate (0–100)");
      return;
    }
    const num = parseInt(trimmed, 10);
    if (!/^\d+$/.test(trimmed) || Number.isNaN(num) || num < 0 || num > 100) {
      setCustomError("Please enter a valid integer between 0 and 100");
      return;
    }
    onChange(String(num));
    setCustomOpen(false);
  };

  return (
    <>
      <Select
        id={id}
        size={size}
        value={current}
        onValueChange={handleSelect}
        options={options}
        aria-label={ariaLabel}
      />

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent size="sm">
          <form onSubmit={handleApplyCustom}>
            <DialogHeader
              title="Custom GST Rate"
              description="Enter a custom integer percentage for GST"
            />
            <DialogBody className="space-y-4 py-2">
              <Field
                label="GST Percentage"
                hint="Whole integer numbers only (0 to 100)"
                error={customError}
              >
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={3}
                  value={customInput}
                  onChange={(e) => {
                    const onlyInt = e.target.value.replace(/\D/g, "");
                    setCustomInput(onlyInt);
                    if (customError) setCustomError(null);
                  }}
                  placeholder="e.g. 12"
                  trailing={<span className="text-xs font-semibold text-muted-foreground">%</span>}
                  autoFocus
                />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCustomOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Apply Rate
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
