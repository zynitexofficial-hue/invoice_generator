"use client";

import { Check, CircleAlert, CloudOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEditor } from "@/stores/editor-store";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { flushSave } from "./use-autosave";

export function SaveStatus() {
  const status = useEditor((s) => s.status);
  const persisted = useEditor((s) => s.persisted);

  const content =
    status === "saving" || status === "pending"
      ? {
          key: "saving",
          icon: <Spinner className="size-3.5" />,
          text: "Saving…",
          tone: "text-muted-foreground",
        }
      : status === "error"
        ? {
            key: "error",
            icon: <CircleAlert className="size-3.5" />,
            text: "Not saved — retry",
            tone: "text-danger-foreground",
          }
        : !persisted
          ? {
              key: "new",
              icon: <CloudOff className="size-3.5" />,
              text: "Not saved yet",
              tone: "text-subtle-foreground",
            }
          : {
              key: "saved",
              icon: <Check className="size-3.5" />,
              text: "Saved",
              tone: "text-muted-foreground",
            };

  const inner = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={content.key}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -3 }}
        transition={{ duration: 0.15 }}
        className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${content.tone}`}
      >
        {content.icon}
        {content.text}
      </motion.span>
    </AnimatePresence>
  );

  if (status === "error") {
    return (
      <button
        type="button"
        onClick={() => void flushSave()}
        className="rounded focus-visible:focus-ring"
      >
        {inner}
      </button>
    );
  }
  return (
    <Tooltip
      content={
        persisted
          ? "Changes are saved in this browser automatically"
          : "Your first edit saves this document"
      }
    >
      <span
        tabIndex={0}
        className="rounded focus-visible:focus-ring"
        role="status"
        aria-live="polite"
      >
        {inner}
      </span>
    </Tooltip>
  );
}
