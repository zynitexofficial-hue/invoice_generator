import { ImageResponse } from "next/og";

export const alt =
  "Invoice Studio — Free GST Invoice Generator. No sign-up, no login, no watermark.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

/** Social share card (generated once at build time). Text avoids ₹ — the default OG font lacks it. */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: "linear-gradient(135deg, #4f46e5 0%, #3b2fc9 55%, #6d28d9 100%)",
        color: "white",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 30,
              height: 38,
              borderRadius: 4,
              background: "#4f46e5",
              display: "flex",
            }}
          />
        </div>
        <div style={{ fontSize: 34, fontWeight: 700 }}>Invoice Studio</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>
          Free GST Invoice Generator
        </div>
        <div style={{ fontSize: 34, opacity: 0.88 }}>
          No sign-up · No login · No watermark · No hidden charges
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 24 }}>
        {["Auto CGST / SGST / IGST", "6 templates", "UPI QR", "PDF download"].map((t) => (
          <div
            key={t}
            style={{
              display: "flex",
              padding: "10px 20px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.16)",
            }}
          >
            {t}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
