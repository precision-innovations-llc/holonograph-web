#!/usr/bin/env node
// build-dist.mjs
//
// Copies the site into dist/, leaving out everything listed in .assetsignore plus
// anything that must never be served. `wrangler pages deploy` does NOT read
// .assetsignore, so deploy from this folder, never from the repo root:
//
//   node scripts/build-pages.mjs && node scripts/build-dist.mjs
//   npx wrangler pages deploy dist --project-name=holonograph --branch=staging
//
// Run wrangler from the repo root so functions/ is still picked up.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const ALWAYS = [".git/", ".wrangler/", "node_modules/", "dist/", "functions/", ".assetsignore", ".gitignore", ".claude/", "assets/", "scripts/", "README.md", "index-v5.html"];
const listed = readFileSync(join(ROOT, ".assetsignore"), "utf8")
  .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
  .map((l) => l.replace(/^\*\*\//, ""));
const rules = [...new Set([...ALWAYS, ...listed])];

function skip(rel) {
  const parts = rel.split(sep);
  return rules.some((r) => {
    if (r.endsWith("/")) return parts[0] === r.slice(0, -1);
    return rel === r || parts[parts.length - 1] === r;
  });
}

if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST);
for (const name of readdirSync(ROOT)) {
  if (skip(name)) continue;
  cpSync(join(ROOT, name), join(DIST, name), {
    recursive: true,
    filter: (src) => !skip(relative(ROOT, src)),
  });
}
for (const bad of ["assets", "scripts", ".claude", "README.md", "index-v5.html", ".gitignore", ".assetsignore", "functions"]) {
  if (existsSync(join(DIST, bad))) throw new Error("dist contains " + bad);
}
console.log("dist/ ready");
