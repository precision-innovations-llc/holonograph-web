#!/usr/bin/env node
// build-pages.mjs
//
// Splits the single-file mockup (index-v5.html, not deployed) into the real
// marketing pages. Run after any edit to the mockup, before serving or deploying:
//
//   node scripts/build-pages.mjs
//
// Writes:  site-v6.css, site-v6.js, index.html, ai-attribution.html,
//          attention-spine.html, seams.html, builders.html, papers.html,
//          authority-governance/index.html
//
// Hash routes become real URLs, the review bar and router are dropped, and each page
// gets its own head. Secondary pages keep site.js for their header and footer.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://holonograph.ai";
const OG_IMAGE = `${SITE}/holonograph.webp`;
const ASSET_V = "1";

const PAGES = {
  home: {
    file: "index.html",
    title: "Holonograph | Authority Governance",
    description:
      "Build at machine speed, govern authority with evidence. An independent observation and governance instrument for interpreted decisions.",
  },
  "ai-attribution": {
    file: "ai-attribution.html",
    title: "AI Attribution · Holonograph",
    description:
      "Holonograph attributes a changed score to your agent, the model, your eval, or noise, and compares vendors on cost, latency, and judged quality.",
  },
  "attention-spine": {
    file: "attention-spine.html",
    title: "Attention Spine · Holonograph",
    description:
      "Alarms that arrive with their attributed source: what moved with the metric, by how much, and where it points.",
  },
  "authority-governance": {
    file: "authority-governance/index.html",
    title: "Authority Governance · Holonograph",
    description:
      "An evidence-dependent state per decision surface, derived from the record. Declared conditions, live evidence, and a reading that follows every dependency.",
  },
  seams: {
    file: "seams.html",
    title: "Seams · Holonograph",
    description:
      "A seam is the edge from an interpreted value to the decision that consumes it. How Holonograph maps seams, attends them at authorship, and measures them on live traffic.",
  },
  builders: {
    file: "builders.html",
    title: "Builders · Holonograph",
    description:
      "Coding agents are agents. The seam monitor reports each seam into the session that wrote it, with knowledge of the running system the builder cannot readily reach.",
  },
  papers: {
    file: "papers.html",
    title: "Research · Holonograph",
    description: "What does an LLM judge actually measure? Research on evaluation frames and construct discrimination, with the paper and poster.",
  },
};

const src = readFileSync(join(ROOT, "index-v5.html"), "utf8");

// ---- shared assets -------------------------------------------------------
const css = /<style>([\s\S]*?)<\/style>/.exec(src)[1];
const importmapRe = /<script type="importmap">[\s\S]*?<\/script>/;
const inline = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1])
  .filter((body) => !body.includes("mockup router"));
writeFileSync(join(ROOT, "site-v6.css"), css.trim() + "\n");
writeFileSync(join(ROOT, "site-v6.js"), inline.join("\n").trim() + "\n");

// ---- pieces --------------------------------------------------------------
const favicon = /<link rel="icon"[^>]*>/.exec(src)[0];
const header = /<header class="site-header"[\s\S]*?<\/header>/.exec(src)[0];
const footer = /<footer class="site-footer">[\s\S]*?<\/footer>/.exec(src)[0];
const stage = /<div class="stage"[\s\S]*?<\/div>\s*<\/div>/.exec(src)[0];
const view = {};
const ROUTE_URL = {};
const viewRe = /<div class="view" data-route="([a-z-]+)" data-url="([^"]+)"( hidden)?>/g;
const starts = [...src.matchAll(viewRe)];
const mainEnd = src.indexOf("</main>");
starts.forEach((m, i) => {
  const end = i + 1 < starts.length ? starts[i + 1].index : mainEnd;
  const chunk = src.slice(m.index, end).replace(/<!-- ═[\s\S]*$/, "").trimEnd();
  view[m[1]] = chunk.replace(" hidden>", ">");
  ROUTE_URL[m[1]] = m[2];
});
const missing = Object.keys(PAGES).filter((k) => !view[k]);
if (missing.length) throw new Error("no view for: " + missing.join(", "));

// id -> route, so #anchor links resolve across pages
const ID_ROUTE = {};
for (const [route, html] of Object.entries(view)) {
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) ID_ROUTE[m[1]] = route;
}

function links(html, route) {
  return html.replace(/href="([^"]*)"/g, (all, href) => {
    if (href === "#" || href === "#main" || /^(https?:|mailto:|\/)/.test(href)) return all;
    if (href.startsWith("#")) {
      const id = href.slice(1);
      if (ROUTE_URL[id]) return `href="${ROUTE_URL[id]}"`;
      const host = ID_ROUTE[id];
      if (!host) throw new Error(`dead anchor ${href} on ${route}`);
      return host === route ? all : `href="${ROUTE_URL[host]}#${id}"`;
    }
    const [path, hash] = href.split("#");
    const clean = "/" + path.replace(/\.html$/, "");
    // Guide chapters open in a new tab; the Guide index stays in this one.
    const tab = clean.startsWith("/guide/") && clean !== "/guide/" ? ' target="_blank" rel="noopener"' : "";
    return `href="${clean}${hash ? "#" + hash : ""}"${tab}`;
  });
}

function activeNav(html, route) {
  const key = route === "home" ? "home" : route;
  return html.replace(`data-nav="${key}"`, `data-nav="${key}" class="on" aria-current="page"`);
}

function head(route) {
  const p = PAGES[route];
  const url = SITE + ROUTE_URL[route];
  const h = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${p.title}</title>`,
    `<meta name="description" content="${p.description}">`,
    `<link rel="canonical" href="${url}">`,
    '<meta name="theme-color" content="#f6f5f9">',
    '<meta name="color-scheme" content="light">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Holonograph">',
    '<meta property="og:locale" content="en_US">',
    `<meta property="og:title" content="${p.title}">`,
    `<meta property="og:description" content="${p.description}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${OG_IMAGE}">`,
    '<meta property="og:image:width" content="2752">',
    '<meta property="og:image:height" content="626">',
    '<meta property="og:image:type" content="image/webp">',
    '<meta property="og:image:alt" content="Holonograph wordmark over a multidimensional grid">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:site" content="@holonograph">',
    '<meta name="twitter:creator" content="@holonograph">',
    `<meta name="twitter:title" content="${p.title}">`,
    `<meta name="twitter:description" content="${p.description}">`,
    `<meta name="twitter:image" content="${OG_IMAGE}">`,
    favicon,
    '<script async src="https://www.googletagmanager.com/gtag/js?id=G-MX42B47LTP"></script>',
    "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-MX42B47LTP', { client_storage: 'none' });</script>",
  ];
  if (route === "home") {
    h.push(`<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
{"@type":"Organization","@id":"https://holonograph.ai/#org","name":"Precision Innovations LLC","url":"https://precision-innovations.us","brand":"Holonograph","logo":"https://holonograph.ai/holonograph.webp","sameAs":["https://x.com/holonograph","https://www.reddit.com/user/holonograph","https://www.instagram.com/holonograph","https://github.com/holonograph","https://www.npmjs.com/org/holonograph","https://crates.io/users/holonograph"]},
{"@type":"WebSite","@id":"https://holonograph.ai/#website","url":"https://holonograph.ai/","name":"Holonograph","publisher":{"@id":"https://holonograph.ai/#org"}},
{"@type":"SoftwareApplication","name":"Holonograph","applicationCategory":"DeveloperApplication","operatingSystem":"Self-hosted (macOS, Linux)","description":"${PAGES.home.description}","publisher":{"@id":"https://holonograph.ai/#org"}}
]}
</script>`);
    h.push(importmapRe.exec(src)[0].replaceAll('"./vendor/', '"/vendor/'));
  }
  h.push(`<link rel="stylesheet" href="/site-v6.css?v=${ASSET_V}">`);
  h.push('<link rel="stylesheet" href="/mobilenav.css">');
  h.push('<link rel="stylesheet" href="/nigel.css?v=10">');
  return h.join("\n");
}

function page(route) {
  const isHome = route === "home";
  return `<!doctype html>
<html lang="en">
<head>
${head(route)}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${isHome ? stage + "\n" : ""}
${links(activeNav(header, route), route)}

<main id="main">
${links(view[route], route)}
</main>

${links(footer, route)}
<script src="/site-v6.js?v=${ASSET_V}"></script>
<script src="/nigel.js?v=16"></script>
<script src="/mobilenav.js"></script>
${isHome ? '<script type="module" src="/holon-light.js?v=15"></script>\n' : ""}</body>
</html>
`;
}

// ---- JS-driven copy, also served as text --------------------------------
function literal(open, close) {
  const start = src.indexOf(open);
  if (start < 0) throw new Error("missing " + open);
  const from = start + open.length - 1;
  const end = src.indexOf(close, from);
  return src.slice(from, end + close.length - 1);
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ALARMS = new Function("return " + literal("var SC = [", "\n  ];"))();
const TABS = ["Agent change", "Model change", "Eval change", "Visibility gap"];
const spineText =
  '<div class="sr-only"><h3>Example alarms</h3><ul>' +
  ALARMS.map(
    (a, i) =>
      `<li>${TABS[i]}: ${esc(a.metric)} ${a.d > 0 ? "+" : "-"}${Math.abs(a.d).toFixed(1)} pts. Where it points: ${esc(a.to)}. ${esc(a.what)} Correction: ${esc(a.fix)}. ${esc(a.then)}</li>`,
  ).join("") +
  "</ul></div>";
view["attention-spine"] = view["attention-spine"].replace("</figure>", "</figure>\n      " + spineText);

const STATES = new Function("SAT", "return " + literal("var S = {", "\n  };"))([]);
const lifecycleText =
  '<div class="sr-only"><h3>Authority lifecycle</h3><ul>' +
  Object.values(STATES)
    .map((st) => `<li>${esc(st.read)}: ${esc(st.what)}${st.why ? " " + esc(st.why) : ""} ${esc(st.next)}</li>`)
    .join("") +
  "</ul></div>";
{
  const id = view["authority-governance"].indexOf('id="lc"');
  const end = view["authority-governance"].indexOf("</figure>", id) + "</figure>".length;
  view["authority-governance"] = view["authority-governance"].slice(0, end) + "\n      " + lifecycleText + view["authority-governance"].slice(end);
}

for (const route of Object.keys(PAGES)) {
  const out = join(ROOT, PAGES[route].file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page(route));
  console.log("  " + PAGES[route].file);
}
console.log("  site-v6.css, site-v6.js");

// ---- secondary pages: header, footer and changelog as served HTML ---------
function chrome(active) {
  const slots = {};
  const el = (id) => (slots[id] = { className: "", innerHTML: "" });
  const stub = {
    documentElement: { style: { setProperty() {} } },
    body: { getAttribute: () => active },
    head: { appendChild() {} },
    createElement: () => ({}),
    getElementById: (id) => (id === "siteHeader" || id === "siteFooter" ? el(id) : null),
    querySelector: () => ({}),
    querySelectorAll: () => [],
  };
  const win = { gtag() {}, matchMedia: () => ({ matches: false }) };
  new Function("window", "document", "gtag", readFileSync(join(ROOT, "site.js"), "utf8"))(win, stub, win.gtag);
  return slots;
}

const SECONDARY = ["about", "changelog", "contact", "glossary", "lens-facets", "pricing", "privacy", "terms", "guide/index"];
for (const name of SECONDARY) {
  const file = join(ROOT, name + ".html");
  let html = readFileSync(file, "utf8");
  const active = (/<body data-nav="([^"]*)"/.exec(html) || [])[1] || "";
  const { siteHeader, siteFooter } = chrome(active);
  html = html.replace(/<header id="siteHeader"[^>]*>[\s\S]*?<\/header>/, `<header id="siteHeader" class="site-header">${siteHeader.innerHTML}</header>`);
  html = html.replace(/<footer id="siteFooter"[^>]*>[\s\S]*?<\/footer>/, `<footer id="siteFooter" class="site-footer">${siteFooter.innerHTML}</footer>`);
  writeFileSync(file, html);
}

{
  const data = JSON.parse(readFileSync(join(ROOT, "changelog.json"), "utf8"));
  const cmp = (a, b) => {
    const x = a.split(".").map(Number), y = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
    return 0;
  };
  const tracks = data.tracks, rels = data.releases, order = Object.keys(tracks);
  const current = {};
  for (const r of rels) if (!current[r.track] || cmp(r.version, current[r.track].version) > 0) current[r.track] = r;
  const cur = order.map((key) => {
    const t = tracks[key], c = current[key];
    if (!c) return "";
    const npm = t.npm ? `<a class="npm" href="${t.npm}" target="_blank" rel="noopener">npm &#8599;</a>` : "";
    return `<div class="cur-card"><div class="meta"><div class="track">Current <b>${esc(t.name)}</b></div><div class="sub">${esc(t.sub || "")}</div><div class="ver">v<span class="v">${esc(c.version)}</span></div></div>${npm}</div>`;
  }).join("");
  const relHtml = (r) =>
    `<article class="rel"><div class="top"><span class="ver">v${esc(r.version)}</span><span class="date">${esc(r.date)}</span></div><h3>${esc(r.title || "")}</h3><ul>${(r.notes || []).map((n) => `<li>${esc(n)}</li>`).join("")}</ul></article>`;
  const LIMIT = 10;
  const cols = order.map((key) => {
    const t = tracks[key];
    const mine = rels.filter((r) => r.track === key).sort((a, b) => cmp(b.version, a.version));
    const rest = mine.slice(LIMIT);
    const body = mine.slice(0, LIMIT).map(relHtml).join("") +
      (rest.length ? `<div class="rel-more" hidden>${rest.map(relHtml).join("")}</div><button class="more-btn" type="button" data-more>Show ${rest.length} more &darr;</button>` : "");
    return `<div class="col ${esc(key)}"><h2><span class="dot"></span>${esc(t.name)}<span class="sub">${esc(t.sub || "")}</span></h2>${body}</div>`;
  }).join("");
  const file = join(ROOT, "changelog.html");
  let html = readFileSync(file, "utf8");
  html = html.replace(/(<section class="current" id="current"[^>]*>)[\s\S]*?(<\/section>)/, (m, a, b) => a + cur.replaceAll("$", "$") + b);
  html = html.replace(/(<section class="cols" id="cols"[^>]*>)[\s\S]*?(<\/section>)/, (m, a, b) => a + cols + b);
  writeFileSync(file, html);
}
console.log("  secondary chrome and changelog served as HTML");
