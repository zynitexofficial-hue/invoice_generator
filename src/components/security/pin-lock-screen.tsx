"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Delete, HelpCircle, Lock, ShieldAlert, Sparkles } from "lucide-react";
import { useSettings } from "@/db/hooks";
import { verifyPin } from "@/lib/security";
import { useLockStore } from "@/stores/lock-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";

const PIN_LENGTH = 6;

export function PinLockScreen() {
  const settings = useSettings();
  const isLocked = useLockStore((s) => s.isLocked);
  const lockoutUntil = useLockStore((s) => s.lockoutUntil);
  const unlock = useLockStore((s) => s.unlock);
  const recordFailedAttempt = useLockStore((s) => s.recordFailedAttempt);

  const [digits, setDigits] = useState<string>("");
  const [errorShake, setErrorShake] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Lockout countdown timer
  useEffect(() => {
    if (!lockoutUntil) return;
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const remainingLockoutSecs = lockoutUntil
    ? Math.max(0, Math.ceil((lockoutUntil - currentTime) / 1000))
    : 0;
  const isLockedOut = remainingLockoutSecs > 0;
  const verifyingRef = useRef(false);

  // Handle PIN verification
  const handleVerify = useCallback(
    async (codeToVerify: string) => {
      if (verifyingRef.current || isLockedOut) return;
      if (!settings?.security.pinHash || !settings?.security.pinSalt) {
        // Fallback: if somehow PIN is enabled without hash/salt, unlock
        unlock();
        return;
      }

      verifyingRef.current = true;
      setIsVerifying(true);
      setErrorMessage(null);

      try {
        const isValid = await verifyPin(
          codeToVerify,
          settings.security.pinHash,
          settings.security.pinSalt,
        );

        if (isValid) {
          setIsSuccess(true);
          setTimeout(() => {
            unlock();
            setDigits("");
            setIsSuccess(false);
            verifyingRef.current = false;
            setIsVerifying(false);
          }, 350);
        } else {
          recordFailedAttempt();
          setErrorShake(true);
          setErrorMessage("Incorrect PIN. Please try again.");
          setTimeout(() => {
            setErrorShake(false);
            setDigits("");
            verifyingRef.current = false;
            setIsVerifying(false);
          }, 600);
        }
      } catch {
        setErrorShake(true);
        setErrorMessage("Verification error. Please try again.");
        setTimeout(() => {
          setErrorShake(false);
          setDigits("");
          verifyingRef.current = false;
          setIsVerifying(false);
        }, 600);
      }
    },
    [isLockedOut, settings, unlock, recordFailedAttempt],
  );

  const addDigit = useCallback(
    (digit: string) => {
      if (isLockedOut || isVerifying || isSuccess) return;
      setDigits((prev) => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + digit;
        if (next.length === PIN_LENGTH) {
          void handleVerify(next);
        }
        return next;
      });
    },
    [isLockedOut, isVerifying, isSuccess, handleVerify],
  );

  const backspace = useCallback(() => {
    if (isLockedOut || isVerifying || isSuccess) return;
    setDigits((prev) => prev.slice(0, -1));
    setErrorMessage(null);
  }, [isLockedOut, isVerifying, isSuccess]);

  const clear = useCallback(() => {
    if (isLockedOut || isVerifying || isSuccess) return;
    setDigits("");
    setErrorMessage(null);
  }, [isLockedOut, isVerifying, isSuccess]);

  // Handle physical keyboard input
  useEffect(() => {
    if (!isLocked) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if help modal is open
      if (helpOpen) return;

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        addDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (e.key === "Escape" || e.key === "Delete") {
        e.preventDefault();
        clear();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (digits.length === PIN_LENGTH) {
          void handleVerify(digits);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLocked, helpOpen, digits, addDigit, backspace, clear, handleVerify]);

  // Lock body scroll while lock screen is active
  useEffect(() => {
    if (!isLocked) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isLocked]);

  if (!isLocked) return null;

  const businessName = settings?.profile?.name || "Invoice Generator";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Panel Locked"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-2xl selection:bg-transparent"
    >
      <div className="relative my-auto flex w-full max-w-sm flex-col items-center">
        {/* Lock Icon Emblem */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="relative mb-4 flex size-16 items-center justify-center rounded-3xl border border-primary/25 bg-primary/10 text-primary shadow-lg shadow-primary/10"
        >
          {isSuccess ? (
            <Sparkles className="size-8 text-primary animate-pulse" />
          ) : (
            <Lock className="size-8 text-primary" />
          )}
        </motion.div>

        {/* Title & Organization Name */}
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {businessName}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            Enter 6-Digit PIN
          </h1>
          <p className="mt-1 text-sm text-subtle-foreground">
            Enter your PIN to open your panel
          </p>
        </div>

        {/* 6 PIN Indicator Dots */}
        <motion.div
          animate={
            errorShake
              ? { x: [-12, 12, -10, 10, -5, 5, 0] }
              : isSuccess
                ? { scale: [1, 1.1, 1] }
                : {}
          }
          transition={{ duration: 0.4 }}
          className="mb-8 flex items-center justify-center gap-3.5"
          aria-label={`${digits.length} of ${PIN_LENGTH} digits entered`}
        >
          {Array.from({ length: PIN_LENGTH }).map((_, idx) => {
            const isFilled = idx < digits.length;
            const isCurrent = idx === digits.length;

            return (
              <div
                key={idx}
                className={`relative flex size-4 items-center justify-center rounded-full transition-all duration-200 ${
                  errorShake
                    ? "border-2 border-danger bg-danger/20"
                    : isSuccess
                      ? "border-2 border-primary bg-primary scale-110 shadow-md shadow-primary/30"
                      : isFilled
                        ? "border-2 border-primary bg-primary scale-110 shadow-xs shadow-primary/40"
                        : isCurrent
                          ? "border-2 border-primary/60 bg-transparent ring-2 ring-primary/20"
                          : "border-2 border-border-strong/70 bg-surface-2/70"
                }`}
              >
                {isFilled && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="size-1.5 rounded-full bg-primary-foreground"
                  />
                )}
              </div>
            );
          })}
        </motion.div>

        {/* Status / Error Message */}
        <div className="h-6 mb-4 text-center">
          <AnimatePresence mode="wait">
            {isLockedOut ? (
              <motion.div
                key="lockout"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center gap-1.5 text-xs font-medium text-danger"
              >
                <ShieldAlert className="size-3.5 shrink-0" />
                <span>Too many attempts. Wait {remainingLockoutSecs}s</span>
              </motion.div>
            ) : errorMessage ? (
              <motion.p
                key="error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs font-medium text-danger"
              >
                {errorMessage}
              </motion.p>
            ) : isVerifying ? (
              <motion.p
                key="verifying"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs font-medium text-subtle-foreground"
              >
                Verifying…
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Touch & Click Numeric Keypad */}
        <div className="grid w-full max-w-[280px] grid-cols-3 gap-3.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <button
              key={num}
              type="button"
              disabled={isLockedOut || isVerifying || isSuccess}
              onClick={() => addDigit(num)}
              className="flex h-14 w-full items-center justify-center rounded-2xl border border-border/70 bg-surface text-xl font-semibold text-foreground shadow-xs transition-all hover:bg-surface-2 active:scale-95 disabled:pointer-events-none disabled:opacity-40 focus-visible:focus-ring"
            >
              {num}
            </button>
          ))}

          {/* Clear Button */}
          <button
            type="button"
            disabled={isLockedOut || isVerifying || digits.length === 0}
            onClick={clear}
            className="flex h-14 w-full items-center justify-center rounded-2xl text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-all hover:bg-surface-2 hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-30 focus-visible:focus-ring"
          >
            Clear
          </button>

          {/* 0 Button */}
          <button
            type="button"
            disabled={isLockedOut || isVerifying || isSuccess}
            onClick={() => addDigit("0")}
            className="flex h-14 w-full items-center justify-center rounded-2xl border border-border/70 bg-surface text-xl font-semibold text-foreground shadow-xs transition-all hover:bg-surface-2 active:scale-95 disabled:pointer-events-none disabled:opacity-40 focus-visible:focus-ring"
          >
            0
          </button>

          {/* Backspace Button */}
          <button
            type="button"
            disabled={isLockedOut || isVerifying || digits.length === 0}
            onClick={backspace}
            aria-label="Delete last digit"
            className="flex h-14 w-full items-center justify-center rounded-2xl text-muted-foreground transition-all hover:bg-surface-2 hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-30 focus-visible:focus-ring"
          >
            <Delete className="size-5" />
          </button>
        </div>

        {/* Forgot PIN / Help Link */}
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:focus-ring rounded-md px-2 py-1"
          >
            <HelpCircle className="size-3.5" />
            <span>Forgot PIN?</span>
          </button>
        </div>
      </div>

      {/* Forgot PIN Informational Dialog */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader
            title="Forgot your 6-digit PIN?"
            description="Important information about your local offline security"
          />
          <DialogBody className="space-y-3 text-sm text-subtle-foreground">
            <div className="rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-xs leading-relaxed text-foreground">
              <strong className="block mb-1 font-semibold text-danger">
                No Reset or Recovery Available
              </strong>
              Invoice Generator stores all your business data 100% locally and privately in this
              browser. There are <strong>no cloud accounts</strong>, no email verification, and no
              central server, so <strong>there is no way to reset or bypass your PIN</strong>.
            </div>
            <p>
              If you have previously downloaded a JSON backup file (from <em>Settings → Data & backup</em>),
              your data is safe:
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-xs">
              <li>Open Invoice Generator in another browser or an Incognito window.</li>
              <li>Go to Settings → Data & backup and choose <strong>Restore backup</strong>.</li>
              <li>Select your saved backup JSON file to regain access with a clean state.</li>
            </ol>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setHelpOpen(false)}>
              Back to PIN Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
