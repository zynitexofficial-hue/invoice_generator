import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PrintHost } from "@/components/document/print-host";
import { AppShell } from "@/components/layout/app-shell";
import { CommandPalette } from "@/components/layout/command-palette";
import { InstallHelpDialog } from "@/components/layout/install-app";
import { FileActionsHost } from "@/components/storage/file-actions";
import { LockScreenHost } from "@/components/security/lock-screen-host";
import { StorageBoot, StorageErrorDialog, WelcomeDialog } from "@/components/storage/storage-guard";
import { ConfirmHost } from "@/components/ui/confirm";

// App screens hold the user's private, browser-local data — keep them out of search results.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <StorageBoot />
      <StorageErrorDialog />
      <WelcomeDialog />
      <FileActionsHost />
      <CommandPalette />
      <InstallHelpDialog />
      <ConfirmHost />
      <PrintHost />
      <LockScreenHost />
    </>
  );
}
