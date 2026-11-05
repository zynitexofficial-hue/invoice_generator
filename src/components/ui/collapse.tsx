"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

/** Animated show/hide with height + opacity (GPU-friendly, no layout jumps). */
export function Collapse({
  open,
  children,
  id,
  className,
}: {
  open: boolean;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          id={id}
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{
            height: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
            opacity: { duration: 0.18 },
          }}
          style={{ overflow: "hidden" }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
