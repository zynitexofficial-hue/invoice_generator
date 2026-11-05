import { useId } from "react";
import type { TemplateId } from "@/lib/schema";

/** Tiny schematic of each template's layout, tinted with the current colours. */
export function TemplateGlyph({
  id,
  primary,
  accent,
  className,
}: {
  id: TemplateId;
  primary: string;
  accent: string;
  className?: string;
}) {
  const gradientId = `g${useId().replace(/:/g, "")}`;
  const line = "#d4d4d8";
  const text = "#a1a1aa";
  const rows = (y: number, n: number, stripe?: string) =>
    Array.from({ length: n }, (_, i) => (
      <g key={i}>
        {stripe && i % 2 === 1 && (
          <rect x="6" y={y + i * 6 - 1} width="48" height="5" fill={stripe} rx="0.5" />
        )}
        <rect x="8" y={y + i * 6} width="22" height="2" rx="1" fill={text} />
        <rect x="44" y={y + i * 6} width="8" height="2" rx="1" fill={text} />
      </g>
    ));
  return (
    <svg viewBox="0 0 60 80" className={className} aria-hidden>
      <rect width="60" height="80" fill="#fff" />
      {id === "minimal" && (
        <>
          <rect x="6" y="7" width="16" height="3" rx="1" fill="#27272a" />
          <rect x="6" y="12" width="12" height="2" rx="1" fill={text} />
          <rect x="38" y="7" width="16" height="5" rx="1" fill={line} />
          <rect x="6" y="20" width="48" height="0.6" fill={line} />
          <rect x="6" y="24" width="14" height="2" rx="1" fill={text} />
          <rect x="6" y="34" width="48" height="0.8" fill="#27272a" />
          {rows(38, 4)}
          <rect x="34" y="66" width="20" height="3" rx="1" fill="#27272a" />
        </>
      )}
      {id === "professional" && (
        <>
          <rect width="60" height="1.6" fill={primary} />
          <rect x="6" y="7" width="7" height="7" rx="1.5" fill={line} />
          <rect x="15" y="8" width="14" height="2.5" rx="1" fill="#3f3f46" />
          <rect x="38" y="7" width="16" height="4" rx="1" fill={primary} />
          <rect
            x="6"
            y="19"
            width="22"
            height="11"
            rx="1.5"
            fill="none"
            stroke={line}
            strokeWidth="0.6"
          />
          <rect x="6" y="19" width="0.9" height="11" fill={primary} />
          <rect
            x="31"
            y="19"
            width="23"
            height="11"
            rx="1.5"
            fill={`${primary}12`}
            stroke={`${primary}44`}
            strokeWidth="0.6"
          />
          <rect x="6" y="34" width="48" height="4" rx="1" fill={primary} />
          {rows(41, 4, `${primary}12`)}
          <rect x="34" y="68" width="20" height="3" rx="1" fill="#3f3f46" />
        </>
      )}
      {id === "modern" && (
        <>
          <rect width="60" height="20" fill={primary} />
          <rect x="6" y="6" width="14" height="3" rx="1" fill="#fff" fillOpacity="0.9" />
          <rect x="40" y="6" width="14" height="2" rx="1" fill="#fff" fillOpacity="0.7" />
          <rect x="40" y="11" width="14" height="4" rx="1" fill="#fff" />
          <rect x="6" y="24" width="23" height="9" rx="2" fill="#f4f4f5" />
          <rect x="31" y="24" width="23" height="9" rx="2" fill="#f4f4f5" />
          <rect x="31" y="24" width="23" height="1" fill={accent} />
          {rows(38, 4, "#f4f4f5")}
          <rect x="32" y="66" width="22" height="5" rx="1.5" fill={primary} />
        </>
      )}
      {id === "corporate" && (
        <>
          <rect width="60" height="2.5" fill={primary} />
          <rect y="2.5" width="60" height="0.7" fill={accent} />
          <rect x="6" y="8" width="18" height="3" rx="0.5" fill={primary} />
          <rect x="38" y="8" width="16" height="3" rx="0.5" fill="#3f3f46" />
          <rect x="6" y="17" width="48" height="12" fill="none" stroke={line} strokeWidth="0.6" />
          <rect x="6" y="17" width="48" height="3" fill={`${primary}1f`} />
          <rect x="30" y="17" width="0.6" height="12" fill={line} />
          <rect
            x="6"
            y="33"
            width="48"
            height="4"
            fill={`${primary}1f`}
            stroke={line}
            strokeWidth="0.5"
          />
          {rows(40, 4)}
          <rect x="32" y="62" width="22" height="10" fill="none" stroke={line} strokeWidth="0.6" />
        </>
      )}
      {id === "creative" && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor={primary} />
              <stop offset="1" stopColor={accent} />
            </linearGradient>
          </defs>
          <rect width="3" height="80" fill={`url(#${gradientId})`} />
          <rect x="8" y="7" width="20" height="5" rx="1" fill={primary} />
          <rect x="28" y="9" width="2" height="2" rx="1" fill={accent} />
          <rect x="8" y="14" width="8" height="2.5" rx="1.2" fill={`${accent}33`} />
          <rect x="40" y="7" width="14" height="2" rx="1" fill={text} />
          <rect x="8" y="21" width="46" height="11" rx="3" fill={`url(#${gradientId})`} />
          {rows(38, 4)}
          <rect x="34" y="66" width="20" height="3" rx="1" fill={primary} />
          <rect x="34" y="70" width="20" height="1" fill={accent} />
        </>
      )}
      {id === "service" && (
        <>
          <rect x="6" y="7" width="14" height="3" rx="1" fill="#3f3f46" />
          <rect x="40" y="7" width="14" height="3" rx="1.5" fill={`${primary}26`} />
          <rect x="42" y="12" width="12" height="3" rx="1" fill="#3f3f46" />
          <rect x="6" y="20" width="48" height="7" rx="1" fill="#f4f4f5" />
          <rect x="6" y="20" width="1" height="7" fill={accent} />
          <rect x="6" y="31" width="16" height="2" rx="1" fill={text} />
          <rect x="6" y="37" width="48" height="0.9" fill={primary} />
          {rows(41, 4)}
          <rect x="34" y="66" width="20" height="3" rx="1" fill={primary} />
          <rect x="34" y="70" width="20" height="1" fill={accent} />
        </>
      )}
    </svg>
  );
}
