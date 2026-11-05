"use client";

import { TriangleAlert } from "lucide-react";
import { AlertDialog } from "radix-ui";
import { useState, type ReactNode } from "react";
import { create } from "zustand";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Input } from "./input";

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  /** Require typing this exact text before confirming (for irreversible actions). */
  typeToConfirm?: string;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  resolve: ((ok: boolean) => void) | null;
  ask: (options: ConfirmOptions) => Promise<boolean>;
  settle: (ok: boolean) => void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolve: null,
  ask: (options) =>
    new Promise<boolean>((resolve) => {
      get().resolve?.(false);
      set({ open: true, options, resolve });
    }),
  settle: (ok) => {
    get().resolve?.(ok);
    set({ open: false, resolve: null });
  },
}));

/** Promise-based confirmation: `if (await confirm({...})) { … }` */
export const confirm = (options: ConfirmOptions) => useConfirmStore.getState().ask(options);

/** Mounted once in the root layout. */
export function ConfirmHost() {
  const { open, options, settle } = useConfirmStore();
  const [typed, setTyped] = useState("");
  const danger = options?.tone === "danger";
  const blocked = Boolean(options?.typeToConfirm) && typed.trim() !== options?.typeToConfirm;

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) settle(false);
        setTyped("");
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-overlay backdrop-blur-[2px] data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <AlertDialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-[60] w-[calc(100vw-2rem)] max-w-[440px] -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-border bg-surface p-6 shadow-lg outline-none",
            "data-[state=closed]:animate-dialog-out data-[state=open]:animate-dialog-in",
          )}
        >
          <div className="flex gap-4">
            {danger && (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger-foreground">
                <TriangleAlert className="size-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <AlertDialog.Title className="text-[17px] leading-6 font-semibold">
                {options?.title}
              </AlertDialog.Title>
              <AlertDialog.Description asChild>
                <div className="mt-1.5 text-sm leading-5 text-muted-foreground">
                  {options?.description}
                </div>
              </AlertDialog.Description>
              {options?.typeToConfirm && (
                <div className="mt-4 space-y-1.5">
                  <p className="text-[13px] text-muted-foreground">
                    Type{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {options.typeToConfirm}
                    </span>{" "}
                    to confirm.
                  </p>
                  <Input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoFocus
                    aria-label="Confirmation text"
                  />
                </div>
              )}
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">{options?.cancelLabel ?? "Cancel"}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant={danger ? "danger" : "primary"}
                disabled={blocked}
                onClick={(e) => {
                  e.preventDefault();
                  settle(true);
                  setTyped("");
                }}
              >
                {options?.confirmLabel ?? "Confirm"}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
