# holonograph-web

Source for [**holonograph.ai**](https://holonograph.ai) — the public site for **Holonograph**, the observation layer for agentic AI systems.

Holonograph is a signed, self-hosted binary that decomposes evaluation drift in agentic AI systems into **four mutually exclusive sources** — substrate, light source, lens, and stochastic noise — and treats the evaluation apparatus itself as a first-class, versioned, independently attributable instrument. Implementation of **The Lens Architecture**.

> Patent-pending product of [Precision Innovations LLC](https://precision-innovations.us).

## About Holonograph

Holonograph sits as a bidirectional mediating gateway between an agentic system and the language models that drive its behavior, capturing every interaction at the wire-format boundary. Because it owns that boundary, it can run a single call against several models at once (*multiplex routing*) and compare them head-to-head on speed, price, and accuracy.

The novel layer is the **lens** — the operator-built evaluation surface (fixtures, baselines, cohort scheme, surface contracts) — treated as a first-class, versioned, independently attributable instrument. The lens is immutable within each version and replaced rather than mutated. Variance contributed by the apparatus becomes a known quantity rather than an unaccounted-for confounder.

- **Methodology overview & vocabulary:** [holonograph.ai/llms-full.txt](https://holonograph.ai/llms-full.txt)
- **Short index:** [holonograph.ai/llms.txt](https://holonograph.ai/llms.txt)

## What's in this repo

This is the marketing site only — a static page (`index.html`) plus a single Cloudflare Pages Function (`functions/api/contact.js`) for the contact form. The Holonograph product itself lives in a separate, private repository.

```
.
├── index.html                # the page (Three.js scene embedded inline)
├── holon.js                  # WebGL scene + interaction (clusters, slider, figures)
├── functions/api/contact.js  # contact form handler (Turnstile + Resend)
├── figures/                  # patent figures referenced from the site
│   ├── holonograph-fig1-mediating-apparatus.svg
│   ├── holonograph-fig3-attribution.svg
│   ├── holonograph-fig5-curation-loop.svg
│   └── holonograph-fig6-multiplex.svg
├── vendor/three/             # vendored Three.js (avoiding CDN dependency)
├── llms.txt                  # short site index for LLM consumers
├── llms-full.txt             # long-form methodology + vocabulary
└── _headers                  # Cloudflare Pages headers (caching, security)
```

## Stack

- **WebGL** scene rendered via Three.js (vendored, not CDN) — the spinning multidimensional grid + section clusters
- **Cloudflare Pages** static hosting
- **Cloudflare Pages Functions** for the contact API endpoint
- **Cloudflare Turnstile** for bot protection on the contact form
- **Cloudflare KV** for per-IP rate-limiting
- **Resend** for outbound mail from the contact form
- No build step — `index.html` is served as-is.

## Local development

```bash
# any static file server works; the repo includes a launch.json for Python's:
python3 -m http.server 8765
# then open http://localhost:8765
```

The contact form endpoint requires Cloudflare Pages Functions and several environment variables (Turnstile secret, Resend API key, etc.). For local UI work, the form will degrade gracefully when those aren't present.

## Deploy

The Cloudflare Pages source is `None` (not git-wired). Every deploy is manual:

```bash
wrangler pages deploy . --project-name=holonograph --branch=main
```

Branch protection on `main` requires PR-via-feature-branch. Pull requests run through review then merge to main; production deploys ride on top of merged main.

## License

Site content (copy, figures, methodology vocabulary) and the Holonograph name & branding are © 2026 Precision Innovations LLC. All rights reserved. Patent pending.

The site's WebGL scene code is original and not licensed for re-use without permission.

The vendored Three.js library retains its original [MIT license](https://github.com/mrdoob/three.js/blob/master/LICENSE).

## Links

- **Website:** https://holonograph.ai
- **GitHub:** https://github.com/holonograph
- **X:** https://x.com/holonograph
- **Reddit:** https://www.reddit.com/user/holonograph/
- **Company:** https://precision-innovations.us
