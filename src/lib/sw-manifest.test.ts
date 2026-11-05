import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  manifestVersion,
  selectPrecacheUrls,
} from "../../scripts/gen-sw-manifest.mjs";

describe("service worker precache manifest", () => {
  it("lists routes as clean URLs plus static assets, and skips the rest", () => {
    const files = [
      { path: "index.html", size: 10 },
      { path: "dashboard.html", size: 10 },
      { path: "guides/gst-invoice-format.html", size: 10 },
      { path: "404.html", size: 10 },
      { path: "_not-found.html", size: 10 },
      { path: "dashboard.txt", size: 10 },
      { path: "dashboard/__next._tree.txt", size: 10 },
      { path: "_next/static/chunks/app.js", size: 10 },
      { path: "_next/static/media/font.woff2", size: 10 },
      { path: "_next/static/chunks/app.js.map", size: 10 },
      { path: "icons/icon-192.png", size: 10 },
      { path: "favicon.ico", size: 10 },
      { path: "manifest.webmanifest", size: 10 },
      { path: "marketing/small.webp", size: MAX_IMAGE_BYTES },
      { path: "marketing/huge.jpg", size: MAX_IMAGE_BYTES + 1 },
      { path: "robots.txt", size: 10 },
      { path: "sitemap.xml", size: 10 },
      { path: "opengraph-image", size: 10 },
      { path: "sw.js", size: 10 },
    ];
    expect(selectPrecacheUrls(files)).toEqual([
      "/",
      "/_next/static/chunks/app.js",
      "/_next/static/media/font.woff2",
      "/dashboard",
      "/favicon.ico",
      "/guides/gst-invoice-format",
      "/icons/icon-192.png",
      "/manifest.webmanifest",
      "/marketing/small.webp",
    ]);
  });

  it("derives a stable version from file contents", () => {
    const a = manifestVersion([
      { path: "a", hash: "1" },
      { path: "b", hash: "2" },
    ]);
    const sameReordered = manifestVersion([
      { path: "b", hash: "2" },
      { path: "a", hash: "1" },
    ]);
    const changed = manifestVersion([
      { path: "a", hash: "1" },
      { path: "b", hash: "3" },
    ]);
    expect(a).toBe(sameReordered);
    expect(a).not.toBe(changed);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });
});
