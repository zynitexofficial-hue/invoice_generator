import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static site: every route is pre-rendered to HTML in `out/`.
  // All data lives in the browser (IndexedDB), so no server features are used.
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
  // Tailwind CSS is small; inlining it removes the render-blocking stylesheet
  // round-trip for first-time visitors (the audience search traffic brings).
  experimental: { inlineCss: true },
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
