import { cn } from "@/lib/utils";
import { APP_NAME } from "./nav";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative flex size-8 items-center justify-center overflow-hidden rounded-[10px] text-white shadow-[0_1px_2px_rgb(0_0_0/0.2),inset_0_1px_0_rgb(255_255_255/0.25)]",
        "bg-[linear-gradient(135deg,oklch(0.58_0.22_274),oklch(0.47_0.21_284))]",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none">
        <path d="M7 3.5h7.5L18 7v13.5H7z" fill="white" fillOpacity="0.95" />
        <path d="M14.5 3.5V7H18" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.2" />
        <path
          d="M9.5 11h6M9.5 14h6M9.5 17h3.5"
          stroke="oklch(0.5 0.21 278)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="text-[15px] font-semibold tracking-[-0.02em]">{APP_NAME}</span>
    </span>
  );
}
