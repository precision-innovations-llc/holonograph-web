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
      "Build at machine speed, govern authority with evidence. An independent observation and governance instrument for measuring interpreted decisions across complex software systems.",
  },
  "ai-attribution": {
    file: "ai-attribution.html",
    title: "AI Attribution · Holonograph",
    description:
      "Complex agents introduce variance. Holonograph attributes a changed score to your agent, the model, your eval, or noise, and compares vendors on cost, latency, and judged quality.",
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
    description: "Holonograph research and papers.",
  },
};

const src = readFileSync(join(ROOT, "index-v5.html"), "utf8");

// ---- shared assets -------------------------------------------------------
const css = /<style>([\s\S]*?)<\/style>/.exec(src)[1];
const importmapRe = /<script type="importmap">[\s\S]*?<\/script>/;
const inline = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1])
  .filter((body) => !body.includes("mockup router"));
const NIGEL_AUTOOPEN = `
/* Home: open Nigel when the live demo arrives, so the chat and the lens are on screen together. */
(function(){
  var demo=document.querySelector('.demo'), played=false;
  if(!demo) return;
  demo.addEventListener('reveal:in', function(){
    if(played) return; played=true;
    var fab=document.getElementById('nigelFab');
    if(fab) fab.click();
  });
})();
`;
writeFileSync(join(ROOT, "site-v6.css"), css.trim() + "\n");
writeFileSync(join(ROOT, "site-v6.js"), inline.join("\n").trim() + "\n" + NIGEL_AUTOOPEN);

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
    return `href="${clean}${hash ? "#" + hash : ""}"`;
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
<script src="/nigel.js?v=15"></script>
<script src="/mobilenav.js"></script>
${isHome ? '<script type="module" src="/holon-light.js?v=15"></script>\n' : ""}</body>
</html>
`;
}

for (const route of Object.keys(PAGES)) {
  const out = join(ROOT, PAGES[route].file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page(route));
  console.log("  " + PAGES[route].file);
}
console.log("  site-v6.css, site-v6.js");
