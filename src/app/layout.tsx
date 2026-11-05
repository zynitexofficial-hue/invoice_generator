import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import { fontVariables } from "./fonts";
import { Providers } from "./providers";
import "./globals.css";

const verification: Metadata["verification"] = {
  // Search Console token for invoice.zynitex.com; public by design (it ships in the HTML).
  google:
    process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ||
    "GcE-rwXpxEE2JjHUlA3OC0if3cLcpb4gbYXRzCYrrM4",
  other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
    ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
    : undefined,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_TAGLINE} — No Sign-up, No Watermark | ${SITE_NAME}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "free GST invoice generator",
    "free invoice generator",
    "online invoice generator",
    "invoice maker",
    "free invoice maker",
    "online bill maker",
    "GST bill generator",
    "GST bill format",
    "tax invoice format",
    "proforma invoice",
    "quotation maker",
    "bill of supply",
    "invoice generator no sign up",
    "invoice generator no watermark",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "business",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_IN",
    url: "/",
    title: `${SITE_TAGLINE} | ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_TAGLINE} | ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  verification,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafb" },
    { media: "(prefers-color-scheme: dark)", color: "#121317" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Capture the install prompt even if it fires before React hydrates. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bip=e;});",
          }}
        />
        {/*
         * iOS Safari zooms into any focused input under 16px. On iOS only, maximum-scale=1
         * stops that auto-zoom while pinch-zoom keeps working (iOS ignores the limit for
         * gestures); other browsers keep the plain viewport so zooming is never blocked.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var n=navigator;if(!/iP(hone|od|ad)/.test(n.userAgent)&&!(n.platform==='MacIntel'&&n.maxTouchPoints>1))return;function f(){var m=document.querySelector('meta[name=viewport]');if(m&&m.content.indexOf('maximum-scale')<0)m.content+=', maximum-scale=1';}f();document.addEventListener('DOMContentLoaded',f);})();",
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
