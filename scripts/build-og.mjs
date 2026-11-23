#!/usr/bin/env node
// build-og.mjs: share images and their meta tags.
//
//   node scripts/build-og.mjs                     rewrite image tags in the static pages
//   node scripts/build-og.mjs --render [base]     also render /og/*.jpg and /og/logo.png
//
// Rendering needs the repo served at `base` (default http://localhost:8765, the
// "static" launch config) and Google Chrome. Pages from build-pages.mjs get their
// tags there; this script covers the hand-maintained pages and the Guide.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CARDS, H, W, cardFor, imageMeta } from "./og/cards.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SKIP_DIRS = new Set(["dist", "scripts", "assets", "node_modules", "vendor", "functions", ".git", ".claude", "og", "figures", "pdf"]);
const SKIP_FILES = new Set(["404.html", "index-v5.html"]);

const args = process.argv.slice(2);
if (args[0] === "--render") render(args[1] ?? "http://localhost:8765");
rewriteTags();

function shoot(url, out, w, h) {
  const tmp = join(tmpdir(), `og-${process.pid}.png`);
  rmSync(tmp, { force: true });
  execFileSync(CHROME, [
    "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars",
    "--force-device-scale-factor=2", `--window-size=${w},${h}`, "--virtual-time-budget=5000", "--timeout=15000",
    `--user-data-dir=${join(tmpdir(), "og-chrome")}`, `--screenshot=${tmp}`, url,
  ], { stdio: "ignore" });
  if (!existsSync(tmp)) throw new Error(`no screenshot for ${url}`);
  const jpeg = out.endsWith(".jpg");
  execFileSync("sips", ["-z", String(h), String(w), ...(jpeg ? ["-s", "format", "jpeg", "-s", "formatOptions", "86"] : []), tmp, "--out", out], { stdio: "ignore" });
  rmSync(tmp, { force: true });
}

function render(base) {
  mkdirSync(join(ROOT, "og"), { recursive: true });
  for (const [key, c] of Object.entries(CARDS)) {
    const q = new URLSearchParams({ title: c.title, eyebrow: c.eyebrow });
    shoot(`${base}/scripts/og/card.html?${q}`, join(ROOT, "og", `${key}.jpg`), W, H);
    console.log(`og/${key}.jpg`);
  }
  shoot(`${base}/scripts/og/logo.html`, join(ROOT, "og", "logo.png"), 1200, 300);
  console.log("og/logo.png");
}

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name) && !name.startsWith("_") && !name.startsWith(".")) yield* htmlFiles(p);
    } else if (name.endsWith(".html") && !SKIP_FILES.has(name)) yield p;
  }
}

function rewriteTags() {
  const IMG = /^[ \t]*<meta (?:property="og:image(?::[a-z]+)?"|name="twitter:image(?::alt)?") [^>]*>[ \t]*\n/gm;
  let changed = 0;
  for (const p of htmlFiles(ROOT)) {
    const file = relative(ROOT, p);
    const src = readFileSync(p, "utf8");
    if (!/property="og:/.test(src)) continue;
    const close = /<meta [^>]*\/>/.test(src) ? " /" : "";
    let html = src.replace(IMG, "");
    const block = imageMeta(cardFor(file), close).join("\n") + "\n";
    const anchor = html.match(/^[ \t]*<meta property="og:url"[^>]*>[ \t]*\n/m) ?? html.match(/^[ \t]*<meta property="og:[^>]*>[ \t]*\n(?![\s\S]*<meta property="og:)/m);
    if (!anchor) throw new Error(`${file}: no og: tags to anchor on`);
    const at = anchor.index + anchor[0].length;
    html = html.slice(0, at) + block + html.slice(at);
    if (!/name="twitter:card"/.test(html)) html = html.slice(0, at) + `<meta name="twitter:card" content="summary_large_image"${close}>\n` + html.slice(at);
    if (html !== src) { writeFileSync(p, html); changed++; }
  }
  console.log(`image tags: ${changed} files updated`);
}
