"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Subtle enter transition on every route change (opacity + 6px rise). */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="flex min-w-0 flex-1 flex-col"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
