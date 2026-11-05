"use client";

import { CircleAlert, CircleCheck, ExternalLink, Info } from "lucide-react";
import { useState } from "react";
import { checkGstin, gstinCheckChar, GSTIN_PATTERN, normalizeGstin } from "@/lib/gst/gstin";
import { stateName } from "@/lib/gst/states";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** The 4th character of a PAN says what kind of holder it belongs to. */
const PAN_HOLDER: Record<string, string> = {
  P: "Individual",
  C: "Company",
  H: "Hindu Undivided Family (HUF)",
  F: "Firm / LLP",
  A: "Association of Persons (AOP)",
  T: "Trust",
  B: "Body of Individuals (BOI)",
  L: "Local authority",
  J: "Artificial juridical person",
  G: "Government",
};

const EXAMPLE_BODY = "27AAPFU0939F1Z";
const EXAMPLE = EXAMPLE_BODY + gstinCheckChar(EXAMPLE_BODY);

export const GST_PORTAL_SEARCH = "https://services.gst.gov.in/services/searchtp";

const SEGMENTS = [
  { from: 0, to: 2, label: "State code", tone: "bg-primary-soft text-primary-soft-foreground" },
  { from: 2, to: 12, label: "PAN", tone: "bg-info-soft text-info-foreground" },
  { from: 12, to: 13, label: "Entity no.", tone: "bg-warning-soft text-warning-foreground" },
  { from: 13, to: 14, label: "Default Z", tone: "bg-surface-2 text-muted-foreground" },
  { from: 14, to: 15, label: "Check", tone: "bg-success-soft text-success-foreground" },
];

/** Offline GSTIN validator: format, state code and check digit, with a breakdown. */
export function GstinChecker() {
  const [raw, setRaw] = useState("");
  const value = normalizeGstin(raw).slice(0, 15);
  const result = value.length === 15 ? checkGstin(value) : null;
  const formatOk = value.length === 15 && GSTIN_PATTERN.test(value);
  const expectedCheck = formatOk ? gstinCheckChar(value.slice(0, 14)) : null;
  const state = value.length >= 2 ? stateName(value.slice(0, 2)) : "";
  const holder = value.length >= 6 ? PAN_HOLDER[value[5]] : undefined;

  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-border bg-surface shadow-md">
      <div className="grid gap-5 p-6 sm:p-8">
        <Field
          label="GSTIN"
          action={
            <button
              type="button"
              onClick={() => setRaw(EXAMPLE)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Try an example
            </button>
          }
        >
          <Input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="e.g. 27AAPFU0939F1ZV"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            aria-invalid={result ? !result.valid : undefined}
            className="h-12 font-mono text-lg tracking-[0.08em] uppercase"
          />
        </Field>

        {/* Character-by-character breakdown of the 15 positions. */}
        <div aria-hidden className="flex flex-wrap gap-1.5">
          {SEGMENTS.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1">
              <div className="flex gap-0.5">
                {Array.from({ length: s.to - s.from }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "flex h-9 w-6 items-center justify-center rounded-md font-mono text-sm font-semibold sm:w-7",
                      s.tone,
                    )}
                  >
                    {value[s.from + i] ?? ""}
                  </span>
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>

        <Status value={value} result={result} expectedCheck={expectedCheck} />
      </div>

      {value.length >= 2 && (
        <dl className="grid gap-x-6 gap-y-3 border-t border-border bg-surface-2/60 p-6 text-sm sm:grid-cols-2 sm:p-8">
          <div>
            <dt className="text-muted-foreground">State</dt>
            <dd className="font-medium">
              {state ? `${state} (${value.slice(0, 2)})` : `Unknown code ${value.slice(0, 2)}`}
            </dd>
          </div>
          {value.length >= 12 && (
            <div>
              <dt className="text-muted-foreground">PAN</dt>
              <dd className="font-mono font-medium tracking-wide">{value.slice(2, 12)}</dd>
            </div>
          )}
          {holder && (
            <div>
              <dt className="text-muted-foreground">PAN holder type</dt>
              <dd className="font-medium">{holder}</dd>
            </div>
          )}
          {value.length >= 13 && (
            <div>
              <dt className="text-muted-foreground">
                Registration number for this PAN in the state
              </dt>
              <dd className="font-medium">{value[12]}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

function Status({
  value,
  result,
  expectedCheck,
}: {
  value: string;
  result: ReturnType<typeof checkGstin> | null;
  expectedCheck: string | null;
}) {
  if (!value)
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        Type or paste a 15-character GSTIN. Nothing is sent anywhere — the check runs in your
        browser.
      </p>
    );
  if (!result)
    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {value.length} of 15 characters
      </p>
    );
  if (!result.valid)
    return (
      <div
        role="alert"
        className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger-foreground"
      >
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">{result.message}</p>
          {result.problem === "checksum" && expectedCheck && (
            <p className="mt-1">
              With these first 14 characters, the last character should be{" "}
              <b className="font-mono">{expectedCheck}</b>. A single mistyped character usually
              causes this.
            </p>
          )}
        </div>
      </div>
    );
  return (
    <div
      aria-live="polite"
      className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success-soft p-4 text-sm text-success-foreground sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2.5">
        <CircleCheck className="mt-0.5 size-4 shrink-0" />
        <span>
          <b className="font-semibold">Valid format and check digit.</b> To confirm it is an active
          registration, search it on the GST portal.
        </span>
      </p>
      <Button variant="secondary" size="sm" asChild className="shrink-0">
        <a href={GST_PORTAL_SEARCH} target="_blank" rel="noopener noreferrer">
          GST portal
          <ExternalLink />
        </a>
      </Button>
    </div>
  );
}
