import Image from "next/image";
import { cn } from "@/lib/utils";

/** Minimal browser window chrome around a product screenshot. */
export function BrowserFrame({
  src,
  alt,
  width,
  height,
  priority,
  className,
  url = "Invoice Studio — Editor",
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
  url?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border-strong/70 bg-surface shadow-[0_30px_80px_-20px_rgb(30_27_75/0.35),0_0_0_1px_rgb(255_255_255/0.4)_inset] dark:shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)]",
        className,
      )}
    >
      <div className="flex h-9 items-center gap-3 border-b border-border bg-surface-2/80 px-3.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="mx-auto flex h-5 w-full max-w-xs items-center justify-center rounded-md bg-surface px-3 text-[11px] text-subtle-foreground ring-1 ring-border">
          {url}
        </div>
        <div className="w-10" aria-hidden />
      </div>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        sizes="(min-width: 1280px) 1120px, 96vw"
        className="block h-auto w-full"
      />
    </div>
  );
}

/** Rounded phone outline around a mobile screenshot. */
export function PhoneFrame({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[2.4rem] bg-zinc-900 p-2 shadow-[0_30px_60px_-20px_rgb(30_27_75/0.45)] ring-1 ring-zinc-700/50",
        className,
      )}
    >
      <div className="overflow-hidden rounded-[1.9rem] bg-white">
        <Image
          src={src}
          alt={alt}
          width={1170}
          height={2532}
          sizes="280px"
          className="block h-auto w-full"
          loading="lazy"
        />
      </div>
    </div>
  );
}
