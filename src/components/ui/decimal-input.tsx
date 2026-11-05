"use client";

import { forwardRef, type ReactNode } from "react";
import { sanitizeDecimalInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Input } from "./input";

export interface DecimalInputProps {
  value: string;
  onValueChange: (value: string) => void;
  maxDecimals?: number;
  leading?: ReactNode;
  trailing?: ReactNode;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  id?: string;
  disabled?: boolean;
  align?: "left" | "right";
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  onBlur?: () => void;
}

/**
 * Text field for money/quantities. Keeps the raw decimal string (no float
 * conversion), filters invalid characters, and opens the numeric keypad on mobile.
 */
export const DecimalInput = forwardRef<HTMLInputElement, DecimalInputProps>(function DecimalInput(
  {
    value,
    onValueChange,
    maxDecimals = 2,
    align = "left",
    className,
    inputClassName,
    onBlur,
    ...props
  },
  ref,
) {
  // <Input> puts `className` on the wrapper when it has adornments, otherwise on the <input>.
  const textClass = cn("tabular", align === "right" && "text-right");
  const hasAdornment = Boolean(props.leading || props.trailing);
  return (
    <Input
      ref={ref}
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={value}
      onChange={(e) => {
        // Accept "1,234.5" while typing by dropping the grouping commas.
        const next = sanitizeDecimalInput(e.target.value.replace(/,/g, ""), maxDecimals);
        if (next !== value) onValueChange(next);
      }}
      onBlur={() => {
        if (value.endsWith(".")) onValueChange(value.slice(0, -1));
        onBlur?.();
      }}
      onFocus={(e) => e.currentTarget.select()}
      className={hasAdornment ? className : cn(textClass, className)}
      inputClassName={cn(textClass, inputClassName)}
      {...props}
    />
  );
});
