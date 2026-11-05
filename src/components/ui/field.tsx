"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useContext, useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Props to spread on the control inside a <Field> for proper labelling. */
export function useFieldControl(explicitId?: string) {
  const ctx = useContext(FieldContext);
  return {
    id: explicitId ?? ctx?.id,
    "aria-describedby": ctx?.describedBy,
    "aria-invalid": ctx?.invalid || undefined,
  };
}

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  warning?: string | null;
  optional?: boolean;
  required?: boolean;
  className?: string;
  /** Element id for the control; generated when omitted. */
  id?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function Field({
  label,
  hint,
  error,
  warning,
  optional,
  required,
  className,
  id,
  action,
  children,
}: FieldProps) {
  const autoId = useId();
  const controlId = id ?? `f${autoId.replace(/:/g, "")}`;
  const messageId = `${controlId}-msg`;
  const message = error || warning;
  return (
    <FieldContext.Provider
      value={{
        id: controlId,
        describedBy: message || hint ? messageId : undefined,
        invalid: Boolean(error),
      }}
    >
      <div className={cn("flex min-w-0 flex-col gap-1 sm:gap-1.5", className)}>
        {(label || action) && (
          <div className="flex min-h-5 items-center justify-between gap-2">
            {label && (
              <label
                htmlFor={controlId}
                className="text-xs font-medium text-foreground sm:text-[13px]"
              >
                {label}
                {required && <span className="ml-0.5 text-danger">*</span>}
                {optional && (
                  <span className="ml-1.5 text-xs font-normal text-subtle-foreground">
                    Optional
                  </span>
                )}
              </label>
            )}
            {action}
          </div>
        )}
        {children}
        <AnimatePresence initial={false} mode="popLayout">
          {message ? (
            <motion.p
              key={message}
              id={messageId}
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.16 }}
              className={cn(
                "text-xs leading-4",
                error ? "text-danger-foreground" : "text-warning-foreground",
              )}
              role={error ? "alert" : undefined}
            >
              {message}
            </motion.p>
          ) : hint ? (
            <p key="hint" id={messageId} className="text-xs leading-4 text-muted-foreground">
              {hint}
            </p>
          ) : null}
        </AnimatePresence>
      </div>
    </FieldContext.Provider>
  );
}

export function FieldGroup({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid gap-4", className)}>{children}</div>;
}
