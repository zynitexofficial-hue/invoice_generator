"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { PRESET_COLORS } from "@/lib/templates-meta";
import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";
import { fieldBase } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

const HEX = /^#[0-9a-f]{6}$/i;

export function ColorPicker({
  value,
  onChange,
  id,
  className,
  presets = PRESET_COLORS,
}: {
  value: string;
  onChange: (hex: string) => void;
  id?: string;
  className?: string;
  presets?: string[];
}) {
  const field = useFieldControl(id);
  // Hex text field mirrors `value`, but may hold a partial entry while typing.
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          {...field}
          className={cn(fieldBase, "flex h-9 items-center gap-2.5 px-2", className)}
        >
          <span
            className="size-6 shrink-0 rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]"
            style={{ background: value }}
            aria-hidden
          />
          <span className="font-mono text-[13px] text-foreground uppercase">{value}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[244px] p-3">
        <div className="color-picker [&_.react-colorful]:h-40 [&_.react-colorful]:w-full [&_.react-colorful__hue]:mt-3 [&_.react-colorful__hue]:h-3 [&_.react-colorful__hue]:rounded-full [&_.react-colorful__pointer]:size-5 [&_.react-colorful__saturation]:rounded-lg [&_.react-colorful__saturation]:border-b-0">
          <HexColorPicker color={value} onChange={onChange} />
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {presets.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Use ${c}`}
              onClick={() => onChange(c)}
              className="relative flex size-7 items-center justify-center rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)] transition-transform hover:scale-110 focus-visible:focus-ring"
              style={{ background: c }}
            >
              {c.toLowerCase() === value.toLowerCase() && (
                <Check className="size-3.5 text-white drop-shadow" />
              )}
            </button>
          ))}
        </div>
        <input
          aria-label="Hex colour"
          value={draft}
          onChange={(e) => {
            const v = e.target.value.trim();
            setDraft(v);
            const hex = v.startsWith("#") ? v : `#${v}`;
            if (HEX.test(hex)) onChange(hex.toLowerCase());
          }}
          className={cn(fieldBase, "mt-3 h-8 px-2.5 font-mono text-[13px] uppercase")}
          maxLength={7}
        />
      </PopoverContent>
    </Popover>
  );
}
