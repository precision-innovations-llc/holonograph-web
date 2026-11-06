#!/usr/bin/env node
// build-guide-nav.mjs
//
// Propagates guide/_assets/chapters.json into every chapter page, so adding,
// merging or renumbering a chapter is one manifest edit rather than 28.
//
// Usage: node scripts/build-guide-nav.mjs [--check]
//
//   --check  verify only: no writes. Exits non-zero if any page would change.
//
// Rewrites, per chapter page:
//   .guide-sidebar <ol>          the chapter list, with group rows and `current`
//   p.guide-eyebrow              "Chapter NN"
//   nav.guide-nav                prev / next
//   footer <span>Chapter NN · T  the footer chapter line
// and on guide/index.html:
//   ol.guide-toc-full            the chapter cards
//
// Everything else on the page is left alone. Run it before
// build-guide-search.mjs and build-guide-all.mjs.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GUIDE = join(__dirname, "..", "guide");
const CHECK = process.argv.includes("--check");

const { chapters } = JSON.parse(readFileSync(join(GUIDE, "_assets/chapters.json"), "utf8"));

// The manifest holds decoded text. Re-encode on output, including the
// typographic entities the hand-written pages use, so the markup stays in the
// house style rather than drifting to raw UTF-8 punctuation.
const TYPO = {
  "\u2019": "&rsquo;", "\u2018": "&lsquo;", "\u201c": "&ldquo;", "\u201d": "&rdquo;",
  "\u2014": "&mdash;", "\u2013": "&ndash;", "\u2026": "&hellip;", "\u00b7": "&middot;",
};
const esc = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\u2018\u2019\u201c\u201d\u2014\u2013\u2026\u00b7]/g, (c) => TYPO[c]);

/** Group rows appear before the first chapter of each group, in manifest order. */
function withGroupRows(render) {
  let group = null;
  const out = [];
  for (const c of chapters) {
    if (c.group !== group) {
      group = c.group;
      out.push({ part: group });
    }
    out.push(c);
  }
  return out.map(render).join("\n");
}

function sidebar(current) {
  const rows = withGroupRows((row) =>
    row.part !== undefined
      ? `        <li class="s-part">${esc(row.part)}</li>`
      : `        <li${row.slug === current ? ' class="current"' : ""}>` +
        `<span class="s-num">${row.num}</span>` +
        `<a href="./${row.slug}" class="s-ttl">${esc(row.title)}</a></li>`,
  );
  return `      <ol>\n${rows}\n      </ol>`;
}

function tocFull() {
  const rows = withGroupRows((row) =>
    row.part !== undefined
      ? `
        <li class="t-part">${esc(row.part)}</li>`
      : [
          "",
          `        <li data-status="${row.status}">`,
          `          <span class="t-num">${row.num}</span>`,
          `          <span class="t-body">`,
          `            <a href="./${row.slug}" class="t-ttl">${esc(row.title)}</a>`,
          `            <span class="t-gloss">${esc(row.blurb)}</span>`,
          `          </span>`,
          `          <span class="t-status">${row.status}</span>`,
          `        </li>`,
        ].join("\n"),
  );
  return rows;
}

// The first chapter has no previous and the last no next, so both ends point
// back at the index instead, as the hand-written nav did.
function navLink(dir, chapter) {
  const cls = dir === "prev" ? "nav-prev" : "nav-next";
  const href = chapter ? `./${chapter.slug}` : "./";
  const label = chapter ? (dir === "prev" ? "Previous" : "Next") : "Back to";
  const title = chapter ? esc(chapter.title) : "All chapters";
  return [
    `          <a href="${href}" class="${cls}">`,
    `            <span class="nav-label">${label}</span>`,
    `            <span class="nav-title">${title}</span>`,
    `          </a>`,
  ].join("\n");
}

function chapterNav(i) {
  return [
    '<nav class="guide-nav" aria-label="Chapter navigation">',
    navLink("prev", chapters[i - 1]),
    navLink("next", chapters[i + 1]),
    "        </nav>",
  ].join("\n");
}

/** Replace the region between two markers, keeping everything outside it. */
function splice(html, startRe, endMarker, replacement, what, file) {
  const m = startRe.exec(html);
  if (!m) throw new Error(`${file}: could not find ${what}`);
  const end = html.indexOf(endMarker, m.index + m[0].length);
  if (end < 0) throw new Error(`${file}: could not find the end of ${what}`);
  return html.slice(0, m.index) + replacement + html.slice(end + endMarker.length);
}

const changed = [];

chapters.forEach((chapter, i) => {
  const file = join(GUIDE, `${chapter.slug}.html`);
  const before = readFileSync(file, "utf8");
  let html = before;

  html = splice(html, /^ {6}<ol>$/m, "      </ol>", sidebar(chapter.slug), "the sidebar list", chapter.slug);
  html = splice(
    html,
    /<nav class="guide-nav" aria-label="Chapter navigation">/,
    "</nav>",
    chapterNav(i),
    "the chapter nav",
    chapter.slug,
  );
  html = html.replace(
    /<p class="guide-eyebrow">Chapter \d+<\/p>/,
    `<p class="guide-eyebrow">Chapter ${chapter.num}</p>`,
  );
  html = html.replace(
    /<span>Chapter \d+ · [^<]*<\/span>/,
    `<span>Chapter ${chapter.num} · ${esc(chapter.title)}</span>`,
  );

  if (html !== before) {
    changed.push(chapter.slug);
    if (!CHECK) writeFileSync(file, html);
  }
});

// index.html: the full chapter list
{
  const file = join(GUIDE, "index.html");
  const before = readFileSync(file, "utf8");
  const start = before.indexOf('<ol class="guide-toc-full"');
  const open = before.indexOf(">", start) + 1;
  const end = before.indexOf("</ol>", open);
  if (start < 0 || end < 0) throw new Error("index.html: could not find the chapter list");
  const html = before.slice(0, open) + "\n" + tocFull() + "\n\n      " + before.slice(end);
  if (html !== before) {
    changed.push("index");
    if (!CHECK) writeFileSync(file, html);
  }
}

if (CHECK) {
  if (changed.length) {
    console.error(`\n✗ ${changed.length} page(s) differ from the manifest: ${changed.join(", ")}\n`);
    process.exit(1);
  }
  console.log(`✓ all ${chapters.length} chapter pages agree with the manifest\n`);
} else {
  console.log(
    changed.length
      ? `✓ nav written into ${changed.length} page(s): ${changed.join(", ")}`
      : `✓ nothing to do: all ${chapters.length} pages already agree with the manifest`,
  );
}
