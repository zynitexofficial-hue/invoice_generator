"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LockOpen,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/db/hooks";
import { updateSettings } from "@/db/settings";
import { generateSalt, hashPin, isValidPinFormat, verifyPin } from "@/lib/security";
import { useLockStore } from "@/stores/lock-store";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Select } from "@/components/ui/select";
import type { SettingsUpdate } from "./use-settings-draft";
import type { AppSettings } from "@/lib/schema";

interface SecuritySectionProps {
  settings: AppSettings;
  update: SettingsUpdate;
}

const AUTO_LOCK_OPTIONS = [
  { value: "0", label: "Lock on tab close / reload only" },
  { value: "5", label: "After 5 minutes of inactivity" },
  { value: "15", label: "After 15 minutes of inactivity (Default)" },
  { value: "30", label: "After 30 minutes of inactivity" },
  { value: "60", label: "After 1 hour of inactivity" },
];

export function SecuritySection({ settings: draftSettings, update }: SecuritySectionProps) {
  const liveSettings = useSettings();
  const settings = liveSettings ?? draftSettings;
  const security = settings.security;
  const isPinEnabled = Boolean(security.pinEnabled && security.pinHash);
  const lock = useLockStore((s) => s.lock);

  // Modal dialog states
  const [setupOpen, setSetupOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  // Setup PIN state
  const [setupPin, setSetupPin] = useState("");
  const [setupConfirmPin, setSetupConfirmPin] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [showSetupPin, setShowSetupPin] = useState(false);
  const [isSubmittingSetup, setIsSubmittingSetup] = useState(false);

  // Change PIN state
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [changeAcknowledged, setChangeAcknowledged] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [isSubmittingChange, setIsSubmittingChange] = useState(false);

  // Disable PIN state
  const [disableCurrentPin, setDisableCurrentPin] = useState("");
  const [isSubmittingDisable, setIsSubmittingDisable] = useState(false);

  // --- Setup PIN Handlers ---
  const handleOpenSetup = () => {
    setSetupPin("");
    setSetupConfirmPin("");
    setAcknowledged(false);
    setShowSetupPin(false);
    setSetupOpen(true);
  };

  const handleSaveSetup = async () => {
    if (!isValidPinFormat(setupPin)) {
      toast.error("PIN must be exactly 6 numeric digits (0–9).");
      return;
    }
    if (setupPin !== setupConfirmPin) {
      toast.error("The confirmation PIN does not match.");
      return;
    }
    if (!acknowledged) {
      toast.error("Please confirm that you understand forgotten PINs cannot be reset.");
      return;
    }

    setIsSubmittingSetup(true);
    try {
      const salt = generateSalt(16);
      const hash = await hashPin(setupPin, salt);

      const nextSecurity = {
        ...security,
        pinEnabled: true,
        pinHash: hash,
        pinSalt: salt,
      };

      update("security", nextSecurity);
      await updateSettings((prev) => ({
        ...prev,
        security: nextSecurity,
      }));

      // Synchronize lock store state with new pin settings
      useLockStore.getState().syncWithSettings(true, security.autoLockMinutes ?? 15);
      useLockStore.getState().unlock();
      toast.success("6-digit PIN lock enabled! Your panel is now protected.");
      setSetupOpen(false);
    } catch {
      toast.error("Failed to enable PIN lock. Please try again.");
    } finally {
      setIsSubmittingSetup(false);
    }
  };

  // --- Change PIN Handlers ---
  const handleOpenChange = () => {
    setCurrentPin("");
    setNewPin("");
    setConfirmNewPin("");
    setChangeAcknowledged(false);
    setShowChangePin(false);
    setChangeOpen(true);
  };

  const handleSaveChange = async () => {
    if (!isValidPinFormat(currentPin)) {
      toast.error("Please enter your current 6-digit PIN.");
      return;
    }
    if (!isValidPinFormat(newPin)) {
      toast.error("New PIN must be exactly 6 numeric digits (0–9).");
      return;
    }
    if (newPin !== confirmNewPin) {
      toast.error("The new confirmation PIN does not match.");
      return;
    }
    if (!changeAcknowledged) {
      toast.error("Please confirm that you understand forgotten PINs cannot be reset.");
      return;
    }

    setIsSubmittingChange(true);
    try {
      const isCurrentValid = await verifyPin(
        currentPin,
        security.pinHash,
        security.pinSalt,
      );

      if (!isCurrentValid) {
        toast.error("Current PIN is incorrect.");
        setIsSubmittingChange(false);
        return;
      }

      const salt = generateSalt(16);
      const hash = await hashPin(newPin, salt);

      const nextSecurity = {
        ...security,
        pinEnabled: true,
        pinHash: hash,
        pinSalt: salt,
      };

      update("security", nextSecurity);
      await updateSettings((prev) => ({
        ...prev,
        security: nextSecurity,
      }));

      // Synchronize lock store state with new pin settings
      useLockStore.getState().syncWithSettings(true, security.autoLockMinutes ?? 15);
      useLockStore.getState().unlock();
      toast.success("PIN changed successfully!");
      setChangeOpen(false);
    } catch {
      toast.error("Failed to change PIN. Please try again.");
    } finally {
      setIsSubmittingChange(false);
    }
  };

  // --- Disable PIN Handlers ---
  const handleOpenDisable = () => {
    setDisableCurrentPin("");
    setDisableOpen(true);
  };

  const handleSaveDisable = async () => {
    if (!isValidPinFormat(disableCurrentPin)) {
      toast.error("Please enter your current 6-digit PIN to disable lock.");
      return;
    }

    setIsSubmittingDisable(true);
    try {
      const isCurrentValid = await verifyPin(
        disableCurrentPin,
        security.pinHash,
        security.pinSalt,
      );

      if (!isCurrentValid) {
        toast.error("Current PIN is incorrect.");
        setIsSubmittingDisable(false);
        return;
      }

      const nextSecurity = {
        ...security,
        pinEnabled: false,
        pinHash: "",
        pinSalt: "",
      };

      update("security", nextSecurity);
      await updateSettings((prev) => ({
        ...prev,
        security: nextSecurity,
      }));

      // Ensure lock store reflects disabled state
      useLockStore.getState().syncWithSettings(false, security.autoLockMinutes ?? 15);

      toast.success("PIN lock disabled. Panel is now accessible without a PIN.");
      setDisableOpen(false);
    } catch {
      toast.error("Failed to disable PIN lock. Please try again.");
    } finally {
      setIsSubmittingDisable(false);
    }
  };

  // Auto-lock time change handler
  const handleAutoLockChange = (val: string) => {
    const minutes = parseInt(val, 10);
    update("security", (prev) => ({
      ...prev,
      autoLockMinutes: Number.isFinite(minutes) ? minutes : 15,
    }));
    toast.success("Auto-lock timeout updated.");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Panel Screen Lock (6-Digit PIN)"
          description="Require a 6-digit PIN to access your invoices, customers, and business records on this device."
          icon={isPinEnabled ? <ShieldCheck className="text-primary" /> : <ShieldAlert />}
          action={
            <Badge tone={isPinEnabled ? "success" : "neutral"} dot>
              {isPinEnabled ? "Protected • Enabled" : "Optional • Disabled"}
            </Badge>
          }
        />
        <CardContent className="space-y-5">
          {!isPinEnabled ? (
            /* Disabled / Not Set State */
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-surface-2/40 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Lock className="size-5" />
                  </div>
                  <div className="space-y-1 text-sm">
                    <p className="font-medium text-foreground">
                      Protect your panel from unauthorized access
                    </p>
                    <p className="text-subtle-foreground">
                      Setting a PIN is completely optional. Once enabled, anyone opening this
                      panel on this browser will be asked to enter your 6-digit PIN on a full-screen
                      lock display before accessing any data.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button onClick={handleOpenSetup} className="gap-2">
                  <KeyRound className="size-4" />
                  <span>Set Up 6-Digit PIN Lock</span>
                </Button>
              </div>
            </div>
          ) : (
            /* Active / Enabled State */
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      PIN Lock is Active & Protecting Your Panel
                    </p>
                    <p className="text-xs text-subtle-foreground">
                      Your panel locks automatically and requires your 6-digit PIN to open.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Auto-lock timeout"
                  hint="How soon the panel locks when left unattended"
                >
                  <Select
                    value={String(security.autoLockMinutes ?? 15)}
                    onValueChange={handleAutoLockChange}
                    options={AUTO_LOCK_OPTIONS}
                  />
                </Field>

                <div className="flex flex-col justify-end space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">Quick Action</span>
                  <Button
                    variant="secondary"
                    onClick={() => lock()}
                    className="w-full gap-2 justify-center"
                  >
                    <Lock className="size-4" />
                    <span>Lock Panel Now</span>
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                <Button variant="secondary" onClick={handleOpenChange} className="gap-2">
                  <KeyRound className="size-4" />
                  <span>Change 6-Digit PIN</span>
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleOpenDisable}
                  className="gap-2 text-danger hover:bg-danger/10 hover:text-danger"
                >
                  <LockOpen className="size-4" />
                  <span>Disable PIN Lock</span>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Offline Safety Reminder */}
      <Alert tone="warning" title="Always maintain an offline backup">
        Because this application is 100% private and runs locally in your browser with no central
        servers, keeping regular `.json` backups from <strong>Settings → Data & backup</strong> ensures
        you can always restore your records if a device is lost or damaged.
      </Alert>

      {/* --- Dialog: Set Up PIN --- */}
      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent size="md">
          <DialogHeader
            title="Set Up 6-Digit Panel PIN"
            description="Create an optional 6-digit PIN to lock your panel"
          />
          <DialogBody className="space-y-4">
            {/* Crucial Permanent Warning Banner */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-foreground">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="space-y-1">
                  <strong className="block font-semibold text-amber-700 dark:text-amber-300">
                    Important: No Way to Reset If Forgotten!
                  </strong>
                  <p className="leading-relaxed text-subtle-foreground">
                    All your invoice data is stored <strong>strictly locally inside this browser</strong>.
                    There are <strong>no online accounts, no reset emails, and no recovery keys</strong>.
                    If you forget your 6-digit PIN, <strong>there is absolutely NO way to reset it</strong> and
                    you will be locked out of this browser&apos;s data.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Field
                label="Enter 6-Digit PIN"
                hint="Numbers only (0–9), exactly 6 digits"
                action={
                  <button
                    type="button"
                    onClick={() => setShowSetupPin(!showSetupPin)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showSetupPin ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    <span>{showSetupPin ? "Hide" : "Show"}</span>
                  </button>
                }
              >
                <Input
                  type={showSetupPin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="••••••"
                  value={setupPin}
                  onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="tracking-widest font-mono text-center text-lg"
                  autoFocus
                />
              </Field>

              <Field
                label="Confirm 6-Digit PIN"
                hint="Re-type your 6-digit PIN to ensure no typos"
                error={
                  setupConfirmPin.length === 6 && setupPin !== setupConfirmPin
                    ? "PINs do not match"
                    : null
                }
              >
                <Input
                  type={showSetupPin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="••••••"
                  value={setupConfirmPin}
                  onChange={(e) =>
                    setSetupConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="tracking-widest font-mono text-center text-lg"
                />
              </Field>

              {/* Mandatory User Acknowledgment Checkbox */}
              <div className="rounded-lg border border-border bg-surface-2/50 p-3 mt-2">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs leading-snug">
                  <Checkbox
                    checked={acknowledged}
                    onCheckedChange={(checked) => setAcknowledged(Boolean(checked))}
                    className="mt-0.5"
                  />
                  <span className="font-medium text-foreground">
                    I understand that if I forget my PIN, <u>there is NO way to reset or recover it</u>,
                    and I am responsible for remembering it.
                  </span>
                </label>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSetupOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveSetup}
              disabled={
                setupPin.length !== 6 ||
                setupConfirmPin.length !== 6 ||
                setupPin !== setupConfirmPin ||
                !acknowledged ||
                isSubmittingSetup
              }
              className="gap-2"
            >
              <Check className="size-4" />
              <span>{isSubmittingSetup ? "Enabling…" : "Enable PIN Lock"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Dialog: Change PIN --- */}
      <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
        <DialogContent size="md">
          <DialogHeader
            title="Change 6-Digit Panel PIN"
            description="Enter your current PIN to set a new 6-digit PIN"
          />
          <DialogBody className="space-y-4">
            <Field label="Current 6-Digit PIN" hint="Enter the PIN you currently use to unlock">
              <Input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="••••••"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="tracking-widest font-mono text-center text-lg"
                autoFocus
              />
            </Field>

            <div className="border-t border-border pt-3 space-y-3">
              <Field
                label="New 6-Digit PIN"
                hint="Numbers only (0–9), exactly 6 digits"
                action={
                  <button
                    type="button"
                    onClick={() => setShowChangePin(!showChangePin)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showChangePin ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    <span>{showChangePin ? "Hide" : "Show"}</span>
                  </button>
                }
              >
                <Input
                  type={showChangePin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="••••••"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="tracking-widest font-mono text-center text-lg"
                />
              </Field>

              <Field
                label="Confirm New 6-Digit PIN"
                hint="Re-type new PIN"
                error={
                  confirmNewPin.length === 6 && newPin !== confirmNewPin
                    ? "New PINs do not match"
                    : null
                }
              >
                <Input
                  type={showChangePin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="••••••"
                  value={confirmNewPin}
                  onChange={(e) =>
                    setConfirmNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="tracking-widest font-mono text-center text-lg"
                />
              </Field>

              <div className="rounded-lg border border-border bg-surface-2/50 p-3 mt-2">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs leading-snug">
                  <Checkbox
                    checked={changeAcknowledged}
                    onCheckedChange={(checked) => setChangeAcknowledged(Boolean(checked))}
                    className="mt-0.5"
                  />
                  <span className="font-medium text-foreground">
                    I understand that there is NO way to reset this new PIN if I forget it.
                  </span>
                </label>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChangeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveChange}
              disabled={
                currentPin.length !== 6 ||
                newPin.length !== 6 ||
                confirmNewPin.length !== 6 ||
                newPin !== confirmNewPin ||
                !changeAcknowledged ||
                isSubmittingChange
              }
            >
              {isSubmittingChange ? "Updating…" : "Update PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Dialog: Disable PIN Lock --- */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent size="sm">
          <DialogHeader
            title="Disable PIN Lock"
            description="Confirm your identity to remove the 6-digit screen lock"
          />
          <DialogBody className="space-y-4">
            <p className="text-xs text-subtle-foreground">
              Disabling PIN lock will allow anyone using this browser to open your invoice panel
              without requiring a code.
            </p>
            <Field label="Current 6-Digit PIN" hint="Enter your PIN to confirm disabling">
              <Input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="••••••"
                value={disableCurrentPin}
                onChange={(e) =>
                  setDisableCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="tracking-widest font-mono text-center text-lg"
                autoFocus
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisableOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleSaveDisable}
              disabled={disableCurrentPin.length !== 6 || isSubmittingDisable}
            >
              {isSubmittingDisable ? "Disabling…" : "Disable Lock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
