#!/usr/bin/env node
// build-guide-search.mjs
//
// Generates /guide/_assets/search-index.json from the chapter manifest, and
// injects stable `id` attributes on every <h2>/<h3> so a search result can land
// on the section rather than the top of the page.
//
// Usage: node scripts/build-guide-search.mjs [--check]
//
//   --check  verify only: no writes. Exits non-zero on drift. Use in CI.
//
// Reads  /guide/_assets/chapters.json  (the manifest: order, numbering, titles,
//        groups, status) and each /guide/<slug>.html.
// Writes /guide/<slug>.html            (heading ids, idempotent)
//        /guide/_assets/search-index.json
//
// Three record classes, because "where is the rubric drafter documented?" is a
// different question from "what does this chapter say":
//   section  — one per heading: chapter, heading, anchor, prose
//   endpoint — METHOD + path, pointing at the section that documents it
//   term     — identifiers from <code> spans: contract fields, verdict
//              vocabulary, error codes, SDK symbols
//
// Run it alongside build-guide-all.mjs before wrangler deploy.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const GUIDE = join(ROOT, "guide");
const CHECK = process.argv.includes("--check");

const manifest = JSON.parse(readFileSync(join(GUIDE, "_assets/chapters.json"), "utf8"));
const CHAPTERS = manifest.chapters;

/* ─── helpers ───────────────────────────────────────────────────────────── */

const ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
  "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–", "&rarr;": "→",
  "&larr;": "←", "&hellip;": "…", "&rsquo;": "’", "&lsquo;": "‘",
  "&ldquo;": "“", "&rdquo;": "”", "&times;": "×", "&middot;": "·",
  "&deg;": "°", "&eta;": "η", "&sigma;": "σ", "&alpha;": "α",
  "&sup2;": "²", "&perp;": "⟂", "&#x2F;": "/",
};
const unescape = (s) =>
  s.replace(/&[a-zA-Z#0-9x]+;/g, (m) => ENTITIES[m] ?? m);

const strip = (html) => unescape(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

const slugify = (text) =>
  strip(text)
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

/** The article body: <main> down to the chapter prev/next nav. */
function bodyOf(html) {
  const start = html.indexOf("<main");
  const end = html.indexOf('<nav class="guide-nav"');
  if (start < 0) throw new Error("no <main>");
  return html.slice(start, end < 0 ? html.length : end);
}

/* ─── pass 1 · heading ids (idempotent) ─────────────────────────────────── */

function injectHeadingIds(html, slug) {
  const seen = new Set(
    [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
  );
  let changed = false;
  const out = html.replace(
    /<(h2|h3)(\s[^>]*)?>([\s\S]*?)<\/\1>/g,
    (whole, tag, attrs, inner) => {
      if (attrs && /\bid=/.test(attrs)) return whole;
      let id = slugify(inner);
      if (!id) return whole;
      if (seen.has(id)) {
        let n = 2;
        while (seen.has(`${id}-${n}`)) n += 1;
        id = `${id}-${n}`;
      }
      seen.add(id);
      changed = true;
      return `<${tag}${attrs ?? ""} id="${id}">${inner}</${tag}>`;
    },
  );
  if (changed && CHECK) {
    console.error(`  ✗ ${slug}: headings are missing ids (run without --check)`);
  }
  return { html: out, changed };
}

/* ─── pass 2 · records ──────────────────────────────────────────────────── */

const METHOD = "GET|POST|PUT|PATCH|DELETE";
const PATH_RE = new RegExp(
  `\\b(${METHOD})\\s+(/(?:lens|lessons|holonograph|aperture|hil|fixtures|v1)[A-Za-z0-9_/:.*-]*)`,
  "g",
);
// An identifier worth indexing as a term: camelCase, snake_case, kebab-case,
// dotted, or SCREAMING_CASE. Excludes prose words and bare paths.
const TERM_RE =
  /^(?:[a-z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)+|[a-z][a-z0-9]*(?:_[a-z0-9]+)+|[a-z][a-z0-9]*(?:-[a-z0-9]+)+|[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_*]+)+|[A-Z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)*|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)$/;

function recordsFor(chapter, ci, html) {
  const body = bodyOf(html);
  const sections = [];
  const endpoints = new Map();
  const terms = new Map();

  // split on h2/h3 (which now carry ids)
  const headRe = /<(h2|h3)[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g;
  const marks = [];
  let m;
  while ((m = headRe.exec(body))) {
    marks.push({ level: Number(m[1][1]), anchor: m[2], heading: strip(m[3]), at: m.index, after: m.index + m[0].length });
  }

  const intro = body.slice(0, marks.length ? marks[0].at : body.length);
  const chunks = [
    { level: 1, anchor: "", heading: chapter.title, html: intro },
    ...marks.map((mk, i) => ({
      level: mk.level,
      anchor: mk.anchor,
      heading: mk.heading,
      html: body.slice(mk.after, i + 1 < marks.length ? marks[i + 1].at : body.length),
    })),
  ];

  for (const c of chunks) {
    const text = strip(c.html);
    if (text) {
      sections.push({
        k: "s",
        ci,
        h: c.heading,
        a: c.anchor,
        l: c.level,
        // Capped: a section longer than this is rare, and its opening is what
        // both the match and the snippet use.
        t: text.length > 1800 ? `${text.slice(0, 1800)} \u2026` : text,
      });
    }

    // endpoints named in this section
    for (const e of c.html.matchAll(PATH_RE)) {
      const key = `${e[1]} ${e[2]}`;
      if (!endpoints.has(key)) {
        endpoints.set(key, { k: "e", ci, a: c.anchor, h: c.heading, m: e[1], p: e[2] });
      }
    }

    // terms from <code> spans and table cells
    for (const code of c.html.matchAll(/<code>([\s\S]*?)<\/code>/g)) {
      const raw = strip(code[1]);
      if (!raw || raw.length > 48 || /\s/.test(raw)) continue;
      const bare = raw.replace(/^[.`'"]+|[.,;:`'"()]+$/g, "");
      if (!bare || bare.startsWith("/") || !TERM_RE.test(bare)) continue;
      if (!terms.has(bare)) {
        terms.set(bare, { k: "t", ci, a: c.anchor, h: c.heading, v: bare });
      }
    }
  }

  return { sections, endpoints: [...endpoints.values()], terms: [...terms.values()] };
}

/* ─── pass 3 · manifest / sidebar agreement ─────────────────────────────── */

function checkSidebar(html, slug) {
  const problems = [];
  const aside = html.slice(html.indexOf('<aside class="guide-sidebar"'), html.indexOf("</aside>"));
  if (aside.length < 40) return problems; // index.html has no sidebar
  const listed = [...aside.matchAll(/<span class="s-num">(\d+)<\/span><a href="\.\/([a-z0-9-]+)"/g)]
    .map((m) => `${m[1]} ${m[2]}`);
  const expected = CHAPTERS.map((c) => `${c.num} ${c.slug}`);
  if (listed.join("|") !== expected.join("|")) {
    problems.push(`${slug}: sidebar TOC disagrees with the manifest`);
    const extra = listed.filter((x) => !expected.includes(x));
    const missing = expected.filter((x) => !listed.includes(x));
    if (extra.length) problems.push(`  unexpected: ${extra.join(", ")}`);
    if (missing.length) problems.push(`  missing:    ${missing.join(", ")}`);
  }
  return problems;
}

/* ─── run ───────────────────────────────────────────────────────────────── */

const index = { built: new Date().toISOString(), records: [] };
const problems = [];
const endpointsByChapter = [];
let wrote = 0;

for (const chapter of CHAPTERS) {
  const file = join(GUIDE, `${chapter.slug}.html`);
  let html;
  try {
    html = readFileSync(file, "utf8");
  } catch {
    problems.push(`${chapter.slug}: in the manifest, no such file guide/${chapter.slug}.html`);
    continue;
  }

  const injected = injectHeadingIds(html, chapter.slug);
  if (injected.changed && !CHECK) {
    writeFileSync(file, injected.html);
    wrote += 1;
  }
  html = injected.html;

  problems.push(...checkSidebar(html, chapter.slug));

  const body = bodyOf(html);
  if (chapter.noReferenceSection !== true && !/>Reference</.test(body)) {
    problems.push(
      `${chapter.slug}: no Reference section (set "noReferenceSection": true in the manifest if that is deliberate)`,
    );
  }

  const { sections, endpoints, terms } = recordsFor(chapter, CHAPTERS.indexOf(chapter), html);
  index.records.push(...sections, ...endpoints, ...terms);
  endpointsByChapter.push({ slug: chapter.slug, n: endpoints.length, sections: sections.length, terms: terms.length });
}

// the index page itself, so a search can reach it
try {
  const idx = readFileSync(join(GUIDE, "index.html"), "utf8");
  const text = strip(bodyOf(idx));
  index.records.push({ k: "s", ci: -1, h: "The Guide", a: "", l: 1, t: text.length > 1800 ? `${text.slice(0, 1800)} \u2026` : text });
} catch { /* optional */ }

index.chapters = CHAPTERS.map(({ num, slug, title, group, status }) => ({ num, slug, title, group, status }));

if (problems.length) {
  console.error("\nProblems:");
  for (const p of problems) console.error(`  ${p}`);
}

const counts = index.records.reduce((a, r) => ({ ...a, [r.k]: (a[r.k] ?? 0) + 1 }), {});
console.log("\nChapter               sections  endpoints  terms");
for (const r of endpointsByChapter) {
  console.log(`  ${r.slug.padEnd(20)} ${String(r.sections).padStart(5)} ${String(r.n).padStart(10)} ${String(r.terms).padStart(7)}`);
}
console.log(
  `\nRecords: ${counts.s ?? 0} section, ${counts.e ?? 0} endpoint, ${counts.t ?? 0} term  (${index.records.length} total)`,
);

if (CHECK) {
  if (problems.length) {
    console.error("\n--check failed\n");
    process.exit(1);
  }
  console.log("--check passed\n");
} else {
  const out = join(GUIDE, "_assets/search-index.json");
  writeFileSync(out, JSON.stringify(index));
  const kb = (JSON.stringify(index).length / 1024).toFixed(1);
  console.log(`\n✓ wrote guide/_assets/search-index.json (${kb}kb)`);
  if (wrote) console.log(`✓ heading ids injected into ${wrote} chapter${wrote === 1 ? "" : "s"}`);
  if (problems.length) process.exitCode = 1;
}
