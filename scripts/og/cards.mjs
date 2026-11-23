// Share cards: one per marketing page, one for the Guide, home for the rest.
// Rendered by scripts/build-og.mjs from scripts/og/card.html into /og/*.jpg.
// Titles are the page H1s; change one here when its H1 changes, then re-render.

export const SITE = "https://holonograph.ai";
export const W = 1200;
export const H = 630;

export const CARDS = {
  home: { eyebrow: "Multidimensional · Longitudinal Attribution", title: "Build at machine speed, govern authority with evidence" },
  "ai-attribution": { eyebrow: "AI Attribution", title: "Complex agents introduce variance, challenging the role of observability alone" },
  "attention-spine": { eyebrow: "Attention Spine", title: "Correct-looking behavior is not always correct" },
  "authority-governance": { eyebrow: "Authority Governance", title: "Authority, derived from the record" },
  seams: { eyebrow: "Seams", title: "Where inference becomes a decision" },
  builders: { eyebrow: "Builders", title: "Reported in the session that wrote it" },
  "lens-facets": { eyebrow: "Lens facets", title: "When a scale stops discriminating" },
  pricing: { eyebrow: "Pricing", title: "Priced by resolution" },
  papers: { eyebrow: "Research", title: "What Does an LLM Judge Actually Measure?" },
  about: { eyebrow: "About", title: "Born of necessity" },
  contact: { eyebrow: "Request a demo", title: "See the instrument run on your agents" },
  glossary: { eyebrow: "Glossary", title: "The vocabulary of the instrument" },
  changelog: { eyebrow: "Changelog", title: "A history of all Holonograph and SDK updates" },
  guide: { eyebrow: "Guide", title: "Operating the Instrument" },
};

/** Which card a source HTML file uses. Pages built by build-pages.mjs use their route. */
export function cardFor(file) {
  if (file.startsWith("guide/")) return "guide";
  const base = file.replace(/\.html$/, "").replace(/\/index$/, "");
  if (base === "index" || base === "privacy" || base === "terms") return "home";
  return CARDS[base] ? base : "home";
}

export function imageUrl(key) {
  return `${SITE}/og/${key}.jpg`;
}

/** The image meta block. `close` is "" or " /" to match the file's style. */
export function imageMeta(key, close = "") {
  const c = CARDS[key];
  const alt = `Holonograph, ${c.eyebrow}: ${c.title}`.replace(/"/g, "&quot;");
  const url = imageUrl(key);
  return [
    `<meta property="og:image" content="${url}"${close}>`,
    `<meta property="og:image:width" content="${W}"${close}>`,
    `<meta property="og:image:height" content="${H}"${close}>`,
    `<meta property="og:image:type" content="image/jpeg"${close}>`,
    `<meta property="og:image:alt" content="${alt}"${close}>`,
    `<meta name="twitter:image" content="${url}"${close}>`,
    `<meta name="twitter:image:alt" content="${alt}"${close}>`,
  ];
}
