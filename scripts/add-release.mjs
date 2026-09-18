#!/usr/bin/env node
// add-release.mjs
//
// One-command release step for the site changelog. Prepends a release entry to
// /changelog.json (the changelog page + guide footers read it) and re-derives
// /versions.json (consumed by the llms.txt Functions) so the "current" versions
// always match the highest semver present. Run this at deploy time, once per
// shipped version.
//
// Usage:
//   node scripts/add-release.mjs <track> <version> "<title>" "<note>" ["<note>" ...]
//
//   <track>    lens | sdk
//   <version>  X.Y.Z  (semver; must not already exist for that track)
//   <title>    short release title (noun phrase, not a command)
//   <note>...  one or more capability-level bullets
//
// Flags:
//   --date=YYYY-MM-DD   override the stamped date (default: today) — use when backfilling
//   --dry               validate + print what WOULD change, write nothing
//
// Examples:
//   node scripts/add-release.mjs lens 0.40.2 "Faster reconciliation" "Windowed reads now stream."
//   node scripts/add-release.mjs sdk 0.8.0 "Typed drop reasons" "Every drop carries a typed reason." --date=2026-08-20
//
// Notes stay capability-level: describe what an operator can now see or do. Do NOT
// paste formulas, estimator names, internal milestone codes, or PR numbers.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CHANGELOG = join(ROOT, "changelog.json");
const VERSIONS = join(ROOT, "versions.json");

const TRACKS = { lens: "binary", sdk: "client" }; // track -> versions.json field
// Firewall guardrail: soft-warn if a note looks like it leaks secret internals.
const SECRET_HINTS = /wilson[- ]?hilferty|capture[- ]?recapture|jolly[- ]?seber|\bFDR\b|benjamini|hochberg|yekutieli|\bPR ?#?\d+|\bM9[A-Z]?\b|\bF\d{2,}\b|\bslice \d/i;

function die(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

function cmpSemver(a, b) {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); }
  return 0;
}

// ---- parse args ----------------------------------------------------------
const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 27).join("\n").replace(/^\/\/ ?/gm, ""));
  process.exit(0);
}
const dry = argv.includes("--dry");
let dateArg = null;
const positional = [];
for (const a of argv) {
  if (a === "--dry") continue;
  const m = /^--date=(.+)$/.exec(a);
  if (m) { dateArg = m[1]; continue; }
  if (a.startsWith("--")) die(`unknown flag: ${a}`);
  positional.push(a);
}

const [track, version, title, ...notes] = positional;

// ---- validate ------------------------------------------------------------
if (!track || !version || !title || notes.length === 0)
  die('need: <track> <version> "<title>" "<note>" [more notes...]   (see --help)');
if (!(track in TRACKS)) die(`track must be one of: ${Object.keys(TRACKS).join(", ")} (got "${track}")`);
if (!/^\d+\.\d+\.\d+$/.test(version)) die(`version must be semver X.Y.Z (got "${version}")`);

const today = new Date().toISOString().slice(0, 10);
const date = dateArg || today;
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die(`--date must be YYYY-MM-DD (got "${date}")`);

for (const n of notes) if (SECRET_HINTS.test(n))
  console.error(`  ⚠ note may leak internals (formula / milestone code / PR#): "${n}"\n    Keep notes capability-level. Continuing anyway.`);

// ---- read + dup-check ----------------------------------------------------
const raw = readFileSync(CHANGELOG, "utf8");
let data;
try { data = JSON.parse(raw); } catch (e) { die(`changelog.json is not valid JSON: ${e.message}`); }
if (!Array.isArray(data.releases)) die("changelog.json has no releases[] array");
if (data.releases.some(r => r.track === track && r.version === version))
  die(`${track} ${version} already exists in changelog.json`);

// ---- build the entry block in the file's compact house style -------------
const noteLines = notes.map(n => `        ${JSON.stringify(n)}`).join(",\n");
const block =
`    {
      "track": ${JSON.stringify(track)}, "version": ${JSON.stringify(version)}, "date": ${JSON.stringify(date)},
      "title": ${JSON.stringify(title)},
      "notes": [
${noteLines}
      ]
    },`;

// prepend: insert right after the `"releases": [` line (newest-first)
const anchor = /"releases"\s*:\s*\[[ \t]*\r?\n/;
if (!anchor.test(raw)) die('could not find the `"releases": [` insertion point — add the entry by hand');
const nextText = raw.replace(anchor, m => m + block + "\n");

// safety net: the result MUST parse (catches trailing-comma / malformed cases)
let nextData;
try { nextData = JSON.parse(nextText); }
catch (e) { die(`refusing to write — result would be invalid JSON (${e.message})`); }

// ---- re-derive versions.json from the (would-be) changelog ---------------
const current = {};
for (const r of nextData.releases) {
  if (!current[r.track] || cmpSemver(r.version, current[r.track]) > 0) current[r.track] = r.version;
}
const nextVersions = {
  binary: current.lens ?? JSON.parse(readFileSync(VERSIONS, "utf8")).binary,
  client: current.sdk ?? JSON.parse(readFileSync(VERSIONS, "utf8")).client,
};

// ---- report / write ------------------------------------------------------
const isCurrent = current[track] === version;
console.log(`\n  ${dry ? "DRY RUN — would add" : "Added"}: ${track} ${version} (${date}) — ${title}`);
notes.forEach(n => console.log(`      • ${n}`));
console.log(`\n  current → Lens ${nextVersions.binary} · SDK ${nextVersions.client}`);
if (!isCurrent) console.log(`  (backfill: ${version} is not the highest ${track} version, so it lands in history, not current)`);

if (dry) {
  console.log(`\n  versions.json would become: ${JSON.stringify(nextVersions)}\n  (no files written — --dry)\n`);
  process.exit(0);
}

writeFileSync(CHANGELOG, nextText);
writeFileSync(VERSIONS, JSON.stringify(nextVersions, null, 2) + "\n");
console.log(`\n  ✓ changelog.json + versions.json updated. Refresh the changelog page (or redeploy) to see it.\n`);
