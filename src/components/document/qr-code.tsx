"use client";

import { memo, useMemo } from "react";
import QRCode from "qrcode";

/** Synchronous, crisp SVG QR code (a single path) — prints sharply at any size. */
export const QrCodeSvg = memo(function QrCodeSvg({
  value,
  className,
  color = "#111827",
  title = "QR code",
}: {
  value: string;
  className?: string;
  color?: string;
  title?: string;
}) {
  const { size, path } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { size: n, path: d };
  }, [value]);

  return (
    <svg
      className={className}
      viewBox={`-1 -1 ${size + 2} ${size + 2}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title}
    >
      <rect x={-1} y={-1} width={size + 2} height={size + 2} fill="#fff" />
      <path d={path} fill={color} />
    </svg>
  );
});
