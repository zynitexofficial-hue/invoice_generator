"use client";

import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";

export const fieldBase = cn(
  "w-full min-w-0 rounded-lg border border-input bg-surface text-[length:var(--field-font)] text-foreground shadow-xs",
  "placeholder:text-subtle-foreground",
  "transition-[border-color,box-shadow,background-color] duration-150",
  "hover:border-border-strong",
  "focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_var(--ring)] focus-visible:outline-none",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:shadow-[0_0_0_3px_color-mix(in_oklch,var(--danger)_25%,transparent)]",
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70",
);

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Content shown inside the field before the text (icon, currency symbol). */
  leading?: ReactNode;
  /** Content shown inside the field after the text (unit, %, button). */
  trailing?: ReactNode;
  inputClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, inputClassName, leading, trailing, type = "text", ...props },
  ref,
) {
  const field = useFieldControl(props.id);
  if (!leading && !trailing) {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(fieldBase, "h-[var(--field-h)] px-3", className)}
        {...field}
        {...props}
        id={field.id}
      />
    );
  }
  return (
    <div className={cn("relative flex items-center", className)}>
      {leading && (
        <span className="pointer-events-none absolute left-3 flex items-center text-sm text-muted-foreground [&_svg]:size-4">
          {leading}
        </span>
      )}
      <input
        ref={ref}
        type={type}
        className={cn(
          fieldBase,
          "h-[var(--field-h)] px-3",
          leading && "pl-8",
          trailing && "pr-10",
          inputClassName,
        )}
        {...field}
        {...props}
        id={field.id}
      />
      {trailing && (
        <span className="absolute right-1.5 flex items-center text-sm text-muted-foreground [&_svg]:size-4">
          {trailing}
        </span>
      )}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grow with content up to this many rows. */
  maxRows?: number;
}

/** Textarea that grows with its content (no scrollbars for typical notes). */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 3, maxRows = 12, value, onChange, ...props },
  forwardedRef,
) {
  const field = useFieldControl(props.id);
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || 20;
    const chrome = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 2;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight + 2, line * maxRows + chrome);
    el.style.height = `${Math.max(next, line * rows + chrome)}px`;
    el.style.overflowY = el.scrollHeight + 2 > line * maxRows + chrome ? "auto" : "hidden";
  }, [value, rows, maxRows]);

  return (
    <textarea
      ref={setRef}
      rows={rows}
      value={value}
      onChange={onChange}
      className={cn(fieldBase, "block resize-none px-3 py-2 leading-5", className)}
      {...field}
      {...props}
      id={field.id}
    />
  );
});
