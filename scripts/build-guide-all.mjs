#!/usr/bin/env node
// build-guide-all.mjs
//
// Generates /guide/all.html — a single-URL consolidation of all 14 chapters —
// and updates the "## The Guide — Complete text" section of /llms-full.txt with
// full chapter prose. Run before wrangler deploy whenever chapter content changes.
//
// Usage: node scripts/build-guide-all.mjs
//
// Reads chapters in canonical order from /guide/{slug}.html, extracts each
// article body, strips the per-chapter prev/next nav, wraps in a <section id>,
// and stitches into one HTML page + one plaintext block.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const CHAPTERS = [
  ["01", "overview", "Overview & first principles"],
  ["02", "surface-contracts", "Surface contracts"],
  ["03", "snapshot", "The four-layer snapshot"],
  ["04", "substrate-columns", "Substrate columns"],
  ["05", "sdk-reference", "SDK reference"],
  ["06", "mediating-lens", "The mediating lens"],
  ["07", "run-modes", "Run modes"],
  ["08", "sidecar", "Sidecar / OTel integration"],
  ["09", "topology-scanner", "Surface topology scanner"],
  ["10", "conformance", "Conformance & fixtures"],
  ["11", "multiplexer", "The multiplexer"],
  ["12", "lessons-pipeline", "The lessons pipeline"],
  ["13", "drift-attribution", "Drift attribution"],
  ["14", "variance-isolation", "Variance isolation"],
];

// ------- extract <article> body from a chapter file, strip prev/next nav -------
function extractChapterBody(slug) {
  const html = readFileSync(join(ROOT, "guide", `${slug}.html`), "utf8");
  const articleMatch = html.match(/<article>([\s\S]*?)<\/article>/);
  if (!articleMatch) throw new Error(`no <article> in ${slug}.html`);
  let body = articleMatch[1];
  // Strip the prev/next chapter nav — it's per-page and meaningless here.
  body = body.replace(/<nav class="guide-nav"[\s\S]*?<\/nav>\s*/g, "");
  return body.trim();
}

// ------- HTML → plaintext with structural breaks, for llms-full.txt -------
function htmlToPlain(html) {
  return (
    html
      // headings → newline + prefix + newline
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `\n\n# ${stripTags(t).trim()}\n\n`)
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n\n## ${stripTags(t).trim()}\n\n`)
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `\n\n### ${stripTags(t).trim()}\n\n`)
      .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, t) => `\n\n#### ${stripTags(t).trim()}\n\n`)
      // fenced code
      .replace(/<pre>\s*<code>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, t) => `\n\n\`\`\`\n${decode(t).trim()}\n\`\`\`\n\n`)
      // inline code / strong / em
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, t) => `\`${decode(stripTags(t))}\``)
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_, t) => `**${stripTags(t)}**`)
      .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_, t) => `*${stripTags(t)}*`)
      // links
      .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, t) => `[${stripTags(t)}](${href})`)
      // lists
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `- ${stripTags(t).trim()}\n`)
      .replace(/<\/?(ul|ol)[^>]*>/gi, "\n")
      // paragraphs
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `${stripTags(t).trim()}\n\n`)
      // callouts / tables — coarse fallback
      .replace(/<div[^>]*>|<\/div>/gi, "")
      .replace(/<span[^>]*>|<\/span>/gi, "")
      .replace(/<table[^>]*>|<\/table>|<thead>|<\/thead>|<tbody>|<\/tbody>|<tr>|<\/tr>/gi, "\n")
      .replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, (_, t) => `${stripTags(t).trim()}\t`)
      .replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, (_, t) => `${stripTags(t).trim()}\t`)
      // strip any remaining tags
      .replace(/<[^>]+>/g, "")
      // decode entities
      .replace(/&nbsp;/g, " ")
      .replace(/&mdash;/g, "—")
      .replace(/&ndash;/g, "–")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      // collapse whitespace runs
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, "");
}
function decode(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

// ------- read version from versions.json -------
const versions = JSON.parse(readFileSync(join(ROOT, "versions.json"), "utf8"));
const BIN = versions.binary;
const CLI = versions.client;

// ------- generate /guide/all.html -------
const chapterBodies = CHAPTERS.map(([num, slug, title]) => {
  const body = extractChapterBody(slug);
  return { num, slug, title, body };
});

const sidebarItems = CHAPTERS.map(
  ([num, slug, title]) =>
    `        <li><span class="s-num">${num}</span><a href="#${slug}" class="s-ttl">${title}</a></li>`
).join("\n");

// Note: all URL references in the generated page use the clean form (no .html)
// to match sitemap.xml and per-chapter canonical tags.

const chapterSections = chapterBodies
  .map(
    ({ num, slug, title, body }) => `
        <section id="${slug}" class="guide-chapter-block" aria-label="Chapter ${num}">
${body}
        </section>
`
  )
  .join("\n");

const allHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#ffffff" />
<title>The Guide — Complete — Holonograph</title>
<meta name="description" content="The complete Holonograph guide, all fourteen chapters in a single scrolling page. One URL for offline reading, LLM ingestion, and full-text search across the whole methodology." />
<meta name="discloses" content="capability-only" />
<meta name="reflects-version" content="v${BIN}" />
<meta name="reflects-client-version" content="${CLI}" />
<meta name="status" content="live" />
<meta name="sign-off-required" content="false" />
<meta name="generator" content="build-guide-all.mjs" />
<link rel="canonical" href="https://holonograph.ai/guide/all" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23ffffff'/%3E%3Ccircle cx='16' cy='16' r='6' fill='none' stroke='%235f3ddc' stroke-width='1'/%3E%3Ccircle cx='16' cy='16' r='10' fill='none' stroke='%235f3ddc' stroke-width='0.5' opacity='0.5'/%3E%3C/svg%3E" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Kodchasan:wght@200;300&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="./_assets/guide.css" />
</head>
<body>
  <header class="guide-topbar">
    <a href="../" class="guide-brand" aria-label="Holonograph home">HOLONOGRAPH</a>
    <span class="guide-topbar-sep">/</span>
    <span class="guide-crumb"><a href="./">The Guide</a> · complete</span>
    <span class="guide-topbar-right">
      <span class="guide-version">v${BIN} · client ${CLI}</span>
      <a href="./" class="guide-back-link">chapter view</a>
    </span>
  </header>

  <div class="guide-shell">

    <aside class="guide-sidebar" aria-label="Chapter list">
      <p class="guide-sidebar-title">The Guide</p>
      <ol>
${sidebarItems}
      </ol>
    </aside>

    <main class="guide-main">
      <article>

        <p class="guide-eyebrow">The Guide · one-page view</p>
        <h1 class="guide-h1">The complete Guide</h1>
        <p class="guide-meta">Reflects Holonograph v${BIN} <span class="dot">·</span> <code>@holonograph/client</code> ${CLI} <span class="dot">·</span> all 14 chapters, one URL</p>

        <p class="guide-lede">
          This page is the entire Holonograph guide in a single scrolling document. Every chapter that lives at its own permalink is included here in full, in reading order, without the per-page prev/next chrome. Use the sidebar to jump to a chapter, or read straight through.
        </p>

        <p>
          The chapter permalinks remain the canonical individual references — this consolidated view exists for offline reading, full-text search across the whole guide, LLM ingestion, and print. Each section below anchors to <code>#chapter-slug</code>; the sidebar and the per-chapter permalinks stay in sync.
        </p>

${chapterSections}

      </article>
    </main>

  </div>

  <footer class="guide-footer">
    <span>© 2026 Precision Innovations LLC</span>
    <span>The Guide · complete</span>
    <span>Patent pending · v${BIN} · client ${CLI}</span>
  </footer>
</body>
</html>
`;

writeFileSync(join(ROOT, "guide", "all.html"), allHtml);
console.log(`✓ wrote guide/all.html (${(allHtml.length / 1024).toFixed(1)}kb, ${chapterBodies.length} chapters)`);

// ------- update /llms-full.txt with a full-prose section -------
const llmsPath = join(ROOT, "llms-full.txt");
const currentLlms = readFileSync(llmsPath, "utf8");

const chapterPlain = chapterBodies
  .map(({ num, slug, title, body }) => {
    const prose = htmlToPlain(body);
    return `### Chapter ${num} — ${title}\n\n_Permalink: https://holonograph.ai/guide/${slug}_\n\n${prose}`;
  })
  .join("\n\n---\n\n");

const GUIDE_MARKER_START = "<!-- BEGIN-GENERATED-GUIDE-COMPLETE -->";
const GUIDE_MARKER_END = "<!-- END-GENERATED-GUIDE-COMPLETE -->";

const newSection = `${GUIDE_MARKER_START}
## The Guide — Complete text

The full text of every guide chapter, in reading order. Individual chapter permalinks live at https://holonograph.ai/guide/{slug} and a single-URL HTML consolidation at https://holonograph.ai/guide/all. Auto-generated from the chapter sources by scripts/build-guide-all.mjs.

${chapterPlain}
${GUIDE_MARKER_END}`;

let newLlms;
if (currentLlms.includes(GUIDE_MARKER_START)) {
  // Replace the existing generated block idempotently.
  const re = new RegExp(`${GUIDE_MARKER_START}[\\s\\S]*?${GUIDE_MARKER_END}`, "m");
  newLlms = currentLlms.replace(re, newSection);
} else {
  // Insert BEFORE "## Links" so links / contact stay at the end.
  const linksIdx = currentLlms.indexOf("## Links");
  if (linksIdx === -1) {
    newLlms = currentLlms.trimEnd() + "\n\n" + newSection + "\n";
  } else {
    newLlms = currentLlms.slice(0, linksIdx) + newSection + "\n\n" + currentLlms.slice(linksIdx);
  }
}
writeFileSync(llmsPath, newLlms);
console.log(`✓ updated llms-full.txt (${(newLlms.length / 1024).toFixed(1)}kb)`);
