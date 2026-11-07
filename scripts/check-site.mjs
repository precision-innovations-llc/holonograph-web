#!/usr/bin/env node
// check-site.mjs
//
// Fails if dist/ would ship a stale or unreachable page. Runs from build-dist.mjs.
//
//   - every page is reachable from the home page (404 excepted)
//   - every internal link resolves, and none points at a redirected URL
//   - the sitemap lists exactly the live pages
//   - no redirect source still exists as a file
//   - every wordmark carries the TM

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, posix } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p.slice(DIST.length + 1));
  }
  return out;
}
const files = new Set(walk(DIST));
const html = [...files].filter((f) => f.endsWith(".html"));
const urlOf = (f) => "/" + f.replace(/index\.html$/, "").replace(/\.html$/, "");
const pages = new Map(html.map((f) => [urlOf(f), f]));

const redirects = new Map();
for (const line of readFileSync(join(DIST, "_redirects"), "utf8").split("\n")) {
  const m = /^(\/\S*)\s+(\/\S*)\s+30[12]$/.exec(line.trim());
  if (m) redirects.set(m[1], m[2]);
}

const siteJs = readFileSync(join(DIST, "site.js"), "utf8");
const problems = [];
const edges = new Map();

function resolve(link, from) {
  const clean = link.split("#")[0].split("?")[0];
  if (!clean) return null;
  const base = posix.dirname(urlOf(from).endsWith("/") ? urlOf(from) + "x" : urlOf(from));
  const abs = clean.startsWith("/") ? clean : posix.normalize(posix.join(base, clean));
  return clean.endsWith("/") && !abs.endsWith("/") ? abs + "/" : abs;
}

for (const f of html) {
  let text = readFileSync(join(DIST, f), "utf8");
  if (text.includes("site.js")) text += siteJs;
  const out = new Set();
  const found = [...text.matchAll(/href=["']([^"']+)["']/g), ...text.matchAll(/href:'([^']+)'/g)].map((m) => m[1]);
  for (const link of found) {
    if (/^(https?:|mailto:|data:|#)/.test(link) || link.includes("'") || link.includes("+")) continue;
    const u = resolve(link, f);
    if (!u) continue;
    const noHtml = u.replace(/\.html$/, "");
    if (redirects.has(u) || redirects.has(noHtml)) {
      problems.push(`${f}: links to redirected ${link}`);
      continue;
    }
    const target = pages.get(noHtml) ?? pages.get(noHtml + "/") ?? pages.get(noHtml.replace(/\/$/, ""));
    if (target) out.add(target);
    else if (!files.has(u.slice(1))) problems.push(`${f}: dead link ${link}`);
  }
  edges.set(f, out);
  const raw = readFileSync(join(DIST, f), "utf8");
  for (const m of raw.matchAll(/<(?:a|span) class="mark"[^>]*>[\s\S]*?<\/(?:a|span)>/g)) {
    if (!m[0].includes('class="tm"')) problems.push(`${f}: wordmark without the TM`);
  }
}

const seen = new Set();
const stack = ["index.html"];
while (stack.length) {
  const f = stack.pop();
  if (seen.has(f)) continue;
  seen.add(f);
  stack.push(...(edges.get(f) ?? []));
}
for (const f of html) if (!seen.has(f) && f !== "404.html") problems.push(`orphan page: ${f}`);

const listed = new Set(
  [...readFileSync(join(DIST, "sitemap.xml"), "utf8").matchAll(/<loc>https:\/\/holonograph\.ai([^<]*)<\/loc>/g)].map((m) => m[1]),
);
for (const u of listed) {
  if (u.endsWith(".txt")) continue;
  if (!pages.has(u) && !pages.has(u + "/")) problems.push(`sitemap lists missing page: ${u}`);
}
for (const u of pages.keys()) {
  if (u === "/404" || u === "/guide/all" || u.startsWith("/guide/")) continue;
  if (!listed.has(u)) problems.push(`page missing from sitemap: ${u}`);
}
for (const src of redirects.keys()) {
  const f = src.slice(1);
  if (files.has(f) || files.has(f + ".html")) problems.push(`redirect source still ships: ${src}`);
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} site problem(s):`);
  [...new Set(problems)].slice(0, 40).forEach((p) => console.error("  " + p));
  process.exit(1);
}
console.log(`✓ ${pages.size} pages reachable, links and sitemap clean, ${redirects.size} redirects retired`);
