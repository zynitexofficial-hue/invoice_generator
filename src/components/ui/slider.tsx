"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export function Slider({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  className,
  "aria-label": ariaLabel,
}: {
  value: number;
  onValueChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <SliderPrimitive.Root
      value={[value]}
      onValueChange={([v]) => onValueChange(v)}
      min={min}
      max={max}
      step={step}
      className={cn("relative flex h-5 w-full touch-none items-center select-none", className)}
    >
      <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-surface-3">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        className="block size-[18px] rounded-full border-2 border-primary bg-white shadow-sm transition-transform duration-150 hover:scale-110 focus-visible:focus-ring active:scale-95"
      />
    </SliderPrimitive.Root>
  );
}
