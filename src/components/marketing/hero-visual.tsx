"use client";

import { Check } from "lucide-react";
import {
  AnimatePresence,
  motion,
  type MotionValue,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrowserFrame } from "./frames";

const SPRING = { stiffness: 110, damping: 20, mass: 0.5 };
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Grid lines that light up around the cursor. Writes CSS variables directly
 * (no React renders while the pointer moves). Place inside a `relative` section.
 */
export function HeroSpotlight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host || !matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = host.getBoundingClientRect();
        el.style.setProperty("--x", `${e.clientX - r.left}px`);
        el.style.setProperty("--y", `${e.clientY - r.top}px`);
        el.style.opacity = "1";
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      el.style.opacity = "0";
    };
    host.addEventListener("pointermove", move, { passive: true });
    host.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 [background-image:linear-gradient(to_right,color-mix(in_oklch,var(--primary)_45%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,var(--primary)_45%,transparent)_1px,transparent_1px)] [mask-image:radial-gradient(280px_circle_at_var(--x,50%)_var(--y,0px),#000,transparent),radial-gradient(ellipse_70%_60%_at_50%_0%,#000_45%,transparent_100%)] [background-size:56px_56px] [mask-composite:intersect] opacity-0 transition-opacity duration-500"
    />
  );
}

/** Product screenshot that tilts gently toward the pointer, with floating proof cards. */
export function HeroVisual() {
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, SPRING);
  const sy = useSpring(py, SPRING);
  const rotateY = useTransform(sx, [-0.5, 0.5], [-3.5, 3.5]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [2.5, -2.5]);
  const nearX = useTransform(sx, [-0.5, 0.5], [-18, 18]);
  const nearY = useTransform(sy, [-0.5, 0.5], [-12, 12]);

  useEffect(() => {
    if (reduce || !matchMedia("(pointer: fine)").matches) return;
    const move = (e: PointerEvent) => {
      px.set(e.clientX / innerWidth - 0.5);
      py.set(e.clientY / innerHeight - 0.5);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [reduce, px, py]);

  return (
    <div className="relative mx-auto mt-16 max-w-6xl px-4 [perspective:1800px] sm:px-6">
      <motion.div
        style={{ rotateX, rotateY }}
        initial={reduce ? false : { opacity: 0, y: 40, rotateX: 8 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
        className="origin-top"
      >
        <BrowserFrame
          src="/marketing/app-editor.webp"
          alt="Invoice Studio editor: items with HSN codes on the left and a live GST tax invoice preview with CGST and SGST on the right"
          width={2160}
          height={1350}
          priority
        />
      </motion.div>

      <FloatCard
        x={nearX}
        y={nearY}
        delay={0.6}
        className="top-[22%] -left-4 hidden lg:block xl:-left-16"
      >
        <GstTicker />
      </FloatCard>
      <FloatCard
        x={nearX}
        y={nearY}
        delay={0.8}
        floatDelay={1.5}
        className="right-2 bottom-[16%] hidden lg:block xl:-right-12"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-success-soft text-success-foreground">
            <Check className="size-4" />
          </span>
          <div>
            <div className="text-sm font-medium">PDF downloaded</div>
            <div className="text-xs text-muted-foreground">No watermark · A4</div>
          </div>
        </div>
      </FloatCard>

      {/* Fade the screenshot into the page */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent"
      />
    </div>
  );
}

function FloatCard({
  x,
  y,
  delay,
  floatDelay = 0,
  className,
  children,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  delay: number;
  floatDelay?: number;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div style={{ x, y }} className={`absolute z-10 ${className ?? ""}`}>
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE, delay }}
      >
        <div
          className="min-w-52 rounded-xl border border-border bg-surface/95 p-3.5 shadow-lg backdrop-blur motion-safe:animate-[float_6s_ease-in-out_infinite]"
          style={{ animationDelay: `${floatDelay}s` }}
        >
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

const SPLITS = [
  {
    key: "intra",
    label: "Customer in your state",
    rows: [
      ["CGST @ 9%", "₹9,450"],
      ["SGST @ 9%", "₹9,450"],
    ],
  },
  { key: "inter", label: "Customer in another state", rows: [["IGST @ 18%", "₹18,900"]] },
] as const;

/** Flips between an intra-state and an inter-state split every few seconds. */
function GstTicker() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % SPLITS.length), 3200);
    return () => window.clearInterval(id);
  }, [reduce]);
  const split = SPLITS[i];

  return (
    <div className="w-52">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
        </span>
        Auto GST split
      </div>
      <div className="relative mt-1.5 h-[4.25rem] overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={split.key}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="absolute inset-x-0 top-0"
          >
            <div className="text-xs text-subtle-foreground">{split.label}</div>
            <div className="mt-1 space-y-0.5 text-sm">
              {split.rows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-6">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium tabular-nums">{value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
