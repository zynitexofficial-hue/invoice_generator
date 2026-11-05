"use client";

import { FolderOpen } from "lucide-react";
import { openInvoiceFile } from "@/components/storage/file-actions";
import { Button, type ButtonProps } from "@/components/ui/button";

/** "Open invoice file" button: validates a .json invoice file and opens it in the editor. */
export function OpenInvoiceFileButton({
  variant = "secondary",
  size,
  label = "Open file",
}: {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  label?: string;
}) {
  return (
    <Button variant={variant} size={size} onClick={openInvoiceFile}>
      <FolderOpen />
      {label}
    </Button>
  );
}
