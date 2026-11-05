"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";

type Supply = "intra" | "inter";

/** Tiny interactive demo: flip the customer's state and watch the GST split change. */
export function GstSplitDemo() {
  const [supply, setSupply] = useState<Supply>("intra");
  const rows =
    supply === "intra"
      ? [
          { k: "cgst", label: "CGST @ 9%", value: "₹9,450.00" },
          { k: "sgst", label: "SGST @ 9%", value: "₹9,450.00" },
        ]
      : [{ k: "igst", label: "IGST @ 18%", value: "₹18,900.00" }];

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-md">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-muted-foreground">Your business in</span>
        <span className="rounded-md bg-surface-2 px-2 py-1 font-medium">Maharashtra</span>
      </div>
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-3">
        <span className="text-xs font-medium text-muted-foreground">Customer in</span>
        <Segmented<Supply>
          size="sm"
          value={supply}
          onValueChange={setSupply}
          aria-label="Customer location"
          options={[
            { value: "intra", label: "Maharashtra" },
            { value: "inter", label: "Karnataka" },
          ]}
        />
      </div>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Taxable value</dt>
          <dd className="tabular-nums">₹1,05,000.00</dd>
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          {rows.map((r) => (
            <motion.div
              key={r.k}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex justify-between"
            >
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="font-medium text-primary tabular-nums">{r.value}</dd>
            </motion.div>
          ))}
        </AnimatePresence>
        <motion.div
          layout
          className="flex justify-between border-t border-border pt-2 font-semibold"
        >
          <dt>Total</dt>
          <dd className="tabular-nums">₹1,23,900.00</dd>
        </motion.div>
      </dl>
      <p className="mt-3 text-[11px] leading-4 text-subtle-foreground">
        {supply === "intra"
          ? "Same state as your business → CGST + SGST"
          : "Different state from your business → IGST"}
      </p>
    </div>
  );
}
