"use client";

import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { create } from "zustand";
import { MIN_PASSPHRASE_LENGTH, passphraseStrength } from "@/lib/backup-crypto";
import { cn } from "@/lib/utils";
import { objectKey, useRetained } from "@/hooks/use-retained";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/*
 * Promise-based passphrase prompt used for encrypted backups:
 *   const r = await askPassphrase({ mode: "create", ... });
 * "create" asks twice (passphrase + confirm) with a strength hint and the
 * no-recovery warning; "enter" asks once and can validate (e.g. decrypt) before
 * closing so a wrong passphrase is shown inline. Nothing here is stored.
 */

export interface PassphraseOptions {
  mode: "create" | "enter";
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  /** Show "keep it for automatic backups until I close this tab". */
  offerRemember?: boolean;
  /** Return an error message to keep the dialog open, or null when accepted. */
  validate?: (passphrase: string) => Promise<string | null>;
}

export interface PassphraseResult {
  passphrase: string;
  remember: boolean;
}

interface PromptState {
  options: PassphraseOptions | null;
  resolve: ((r: PassphraseResult | null) => void) | null;
  ask: (o: PassphraseOptions) => Promise<PassphraseResult | null>;
  settle: (r: PassphraseResult | null) => void;
}

const usePrompt = create<PromptState>((set, get) => ({
  options: null,
  resolve: null,
  ask: (options) =>
    new Promise((resolve) => {
      get().resolve?.(null);
      set({ options, resolve });
    }),
  settle: (r) => {
    get().resolve?.(r);
    set({ options: null, resolve: null });
  },
}));

export const askPassphrase = (o: PassphraseOptions) => usePrompt.getState().ask(o);

/** Mounted once (inside FileActionsHost). */
export function PassphrasePromptHost() {
  const options = usePrompt((s) => s.options);
  const settle = usePrompt((s) => s.settle);
  const shown = useRetained(options);
  return (
    <Dialog open={Boolean(options)} onOpenChange={(o) => !o && settle(null)}>
      <DialogContent size="md">
        {shown && <PassphraseForm key={objectKey(shown)} options={shown} onDone={settle} />}
      </DialogContent>
    </Dialog>
  );
}

const STRENGTH_COLORS = ["bg-danger", "bg-warning", "bg-info", "bg-success"] as const;

function PassphraseForm({
  options,
  onDone,
}: {
  options: PassphraseOptions;
  onDone: (r: PassphraseResult | null) => void;
}) {
  const creating = options.mode === "create";
  const [passphrase, setPassphrase] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [show, setShow] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const strength = passphraseStrength(passphrase);
  const tooShort = creating && passphrase.length < MIN_PASSPHRASE_LENGTH;
  const mismatch = creating && confirmText.length > 0 && confirmText !== passphrase;
  const canSubmit =
    passphrase.length > 0 &&
    !busy &&
    (!creating || (!tooShort && confirmText === passphrase && understood));

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    if (options.validate) {
      setBusy(true);
      try {
        const message = await options.validate(passphrase);
        if (message) {
          setError(message);
          return;
        }
      } finally {
        setBusy(false);
      }
    }
    onDone({ passphrase, remember });
  };

  const toggle = (
    <button
      type="button"
      onClick={() => setShow((s) => !s)}
      className="flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:focus-ring"
      aria-pressed={show}
    >
      {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      {show ? "Hide" : "Show"}
    </button>
  );

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <DialogHeader icon={<KeyRound />} title={options.title} description={options.description} />
      <DialogBody className="grid gap-4">
        {creating && (
          <Alert tone="warning" title="A lost passphrase can't be recovered">
            The passphrase is never saved. Without it, nobody — not even us — can open this backup.
            Write it down and keep it somewhere safe.
          </Alert>
        )}
        <Field
          label="Passphrase"
          action={toggle}
          error={error}
          hint={
            creating
              ? `At least ${MIN_PASSPHRASE_LENGTH} characters. A few unrelated words work well.`
              : undefined
          }
        >
          <Input
            type={show ? "text" : "password"}
            autoComplete={creating ? "new-password" : "current-password"}
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value);
              setError(null);
            }}
            autoFocus
            maxLength={256}
          />
        </Field>
        {creating && passphrase && (
          <div aria-live="polite">
            <div className="flex gap-1" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full",
                    i < Math.max(1, strength.score)
                      ? STRENGTH_COLORS[strength.score]
                      : "bg-surface-3",
                  )}
                />
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Strength: {strength.label}</p>
          </div>
        )}
        {creating && (
          <Field label="Type it again" error={mismatch ? "The passphrases don't match." : null}>
            <Input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              maxLength={256}
            />
          </Field>
        )}
        {creating && (
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-5">
            <Checkbox
              checked={understood}
              onCheckedChange={(v) => setUnderstood(Boolean(v))}
              className="mt-0.5"
            />
            <span>
              I understand that if I lose this passphrase, the backup can&apos;t be opened.
            </span>
          </label>
        )}
        {options.offerRemember && (
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-5">
            <Checkbox
              checked={remember}
              onCheckedChange={(v) => setRemember(Boolean(v))}
              className="mt-0.5"
            />
            <span>
              Use it for automatic backups until I close this tab
              <span className="block text-xs text-muted-foreground">
                Kept in memory only — never saved.
              </span>
            </span>
          </label>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!canSubmit} loading={busy}>
          {options.confirmLabel ?? "Continue"}
        </Button>
      </DialogFooter>
    </form>
  );
}
