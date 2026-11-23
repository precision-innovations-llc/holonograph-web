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
import { CARDS, H, W, cardFor, iconLinks, imageMeta } from "./og/cards.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SKIP_DIRS = new Set(["dist", "scripts", "assets", "node_modules", "vendor", "functions", ".git", ".claude", "og", "figures", "pdf"]);
const SKIP_FILES = new Set(["404.html", "index-v5.html"]);

const args = process.argv.slice(2);
if (args[0] === "--render") render(args[1] ?? "http://localhost:8765");
rewriteTags();
rewriteIcons();

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
  renderIcons(base);
}

/** Every page, 404 included, gets the same icon links. */
function rewriteIcons() {
  const ICON = /^[ \t]*<link rel="(?:icon|apple-touch-icon|shortcut icon)"[^>]*>[ \t]*\n/gm;
  let changed = 0;
  for (const p of htmlFiles(ROOT, true)) {
    const src = readFileSync(p, "utf8");
    const first = src.search(ICON);
    if (first < 0) continue;
    const close = /<meta [^>]*\/>/.test(src) ? " /" : "";
    const rest = src.slice(first).replace(ICON, "");
    const html = src.slice(0, first) + iconLinks(close).join("\n") + "\n" + rest;
    if (html !== src) { writeFileSync(p, html); changed++; }
  }
  console.log(`icon links: ${changed} files updated`);
}

function* htmlFiles(dir, all = false) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name) && !name.startsWith("_") && !name.startsWith(".")) yield* htmlFiles(p, all);
    } else if (name.endsWith(".html") && (all ? name !== "index-v5.html" : !SKIP_FILES.has(name))) yield p;
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

// ── icons ────────────────────────────────────────────────────────────────────
// /favicon.svg is the source. --render also writes /favicon.ico (16 + 32, PNG
// payloads) and /apple-touch-icon.png (180, square: iOS rounds the corners).
export function renderIcons(base) {
  const tmp = tmpdir();
  const png = (src, size, out) => {
    const shot = join(tmp, `icon-${size}.png`);
    rmSync(shot, { force: true });
    execFileSync(CHROME, ["--headless=new", "--hide-scrollbars", "--default-background-color=00000000", "--force-device-scale-factor=1", `--window-size=${size},${size}`,
      "--timeout=8000", `--user-data-dir=${join(tmp, "og-chrome")}`, `--screenshot=${shot}`, `${base}/${src}`], { stdio: "ignore" });
    execFileSync("sips", ["-z", String(size), String(size), shot, "--out", out], { stdio: "ignore" });
    return out;
  };
  png("scripts/og/apple-icon.svg", 180, join(ROOT, "apple-touch-icon.png"));
  const imgs = [16, 32].map((s) => readFileSync(png("favicon.svg", s, join(tmp, `fav-${s}.png`))));
  const head = Buffer.alloc(6 + 16 * imgs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
  let off = head.length;
  imgs.forEach((buf, i) => {
    const s = [16, 32][i], e = 6 + 16 * i;
    head.writeUInt8(s, e); head.writeUInt8(s, e + 1); head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += buf.length;
  });
  writeFileSync(join(ROOT, "favicon.ico"), Buffer.concat([head, ...imgs]));
  console.log("favicon.ico, apple-touch-icon.png");
}
