#!/usr/bin/env node
/**
 * Build step (runs after `next build`): list the static export in `out/` that
 * the service worker should precache, write `out/sw-manifest.json`, and stamp
 * the manifest version into `out/sw.js` so every deploy ships a byte-different
 * service worker (that is what makes browsers notice an update).
 *
 * Precached: HTML routes (as clean URLs, e.g. /dashboard), everything under
 * /_next/static (JS, CSS, fonts), icons, the web manifest and marketing
 * images up to 300 KB. Not precached: RSC payloads (*.txt — cached at runtime
 * instead), 404 pages, SEO files, Open Graph images and the SW itself.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MAX_IMAGE_BYTES = 300 * 1024;
const IMAGE_RE = /\.(png|jpe?g|webp|avif|gif|svg|ico)$/i;
const EXCLUDED_HTML = new Set(["404.html", "_not-found.html"]);
const ROOT_ASSETS = new Set(["favicon.ico", "icon.svg", "apple-icon.png", "manifest.webmanifest"]);

/**
 * Pure: decide which files (paths relative to out/, POSIX separators) to
 * precache and under which URL. Returns sorted, de-duplicated URLs.
 *
 * @param {{ path: string, size: number }[]} files
 * @returns {string[]}
 */
export function selectPrecacheUrls(files) {
  /** @type {Set<string>} */
  const urls = new Set();
  for (const { path: p, size } of files) {
    const rel = p.replace(/\\/g, "/").replace(/^\.?\//, "");
    if (rel.endsWith(".html")) {
      const base = rel.split("/").pop() ?? "";
      if (EXCLUDED_HTML.has(base) || rel.startsWith("_not-found/")) continue;
      if (rel === "index.html") urls.add("/");
      else if (rel.endsWith("/index.html")) urls.add(`/${rel.slice(0, -"index.html".length)}`);
      else urls.add(`/${rel.slice(0, -".html".length)}`);
      continue;
    }
    if (rel.startsWith("_next/static/")) {
      if (rel.endsWith(".map")) continue;
      urls.add(`/${rel}`);
      continue;
    }
    if (ROOT_ASSETS.has(rel)) {
      urls.add(`/${rel}`);
      continue;
    }
    if (rel.startsWith("icons/") && IMAGE_RE.test(rel)) {
      urls.add(`/${rel}`);
      continue;
    }
    if (rel.startsWith("marketing/") && IMAGE_RE.test(rel) && size <= MAX_IMAGE_BYTES) {
      urls.add(`/${rel}`);
    }
  }
  return [...urls].sort();
}

/**
 * Pure: a short version string from file paths and their content hashes.
 *
 * @param {{ path: string, hash: string }[]} entries
 */
export function manifestVersion(entries) {
  const h = createHash("sha256");
  for (const e of [...entries].sort((a, b) => (a.path < b.path ? -1 : 1)))
    h.update(`${e.path}\0${e.hash}\n`);
  return h.digest("hex").slice(0, 16);
}

/** @param {string} dir @param {string} [prefix] @returns {Promise<{ path: string, size: number }[]>} */
async function walk(dir, prefix = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(abs, rel)));
    else if (entry.isFile()) out.push({ path: rel, size: (await stat(abs)).size });
  }
  return out;
}

export async function generate(outDir) {
  const files = await walk(outDir);
  const skip = new Set(["sw.js", "sw-manifest.json"]);
  const listed = files.filter((f) => !skip.has(f.path));
  const urls = selectPrecacheUrls(listed);
  // Version covers every file in the export, so any change ships a new SW.
  const hashed = await Promise.all(
    listed.map(async (f) => ({
      path: f.path,
      hash: createHash("sha256")
        .update(await readFile(path.join(outDir, f.path)))
        .digest("hex"),
    })),
  );
  const version = manifestVersion(hashed);
  const manifest = { version, generatedAt: new Date().toISOString(), urls };
  await writeFile(path.join(outDir, "sw-manifest.json"), JSON.stringify(manifest));

  const swPath = path.join(outDir, "sw.js");
  const sw = await readFile(swPath, "utf8");
  if (!sw.includes("__SW_VERSION__"))
    throw new Error("out/sw.js has no __SW_VERSION__ placeholder (was it already stamped?)");
  await writeFile(swPath, sw.replaceAll("__SW_VERSION__", version));
  return manifest;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outDir = path.join(root, "out");
  generate(outDir)
    .then((m) => {
      console.log(`sw-manifest: ${m.urls.length} files precached (version ${m.version})`);
    })
    .catch((error) => {
      console.error("sw-manifest: failed —", error);
      process.exit(1);
    });
}
