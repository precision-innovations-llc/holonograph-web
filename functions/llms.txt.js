// Cloudflare Pages Function — /llms.txt
//
// Serves the static llms.txt template with {{binary}} and {{client}} substituted
// from versions.json (binary) and the live npm registry (client, with versions.json
// as fallback). Shadows the underlying static file; env.ASSETS.fetch bypasses
// Function routing so we can still read the template.

const NPM_LATEST = "https://registry.npmjs.org/@holonograph/client/latest";

async function readVersions(request, env) {
  const url = new URL(request.url);
  url.pathname = "/versions.json";
  try {
    const res = await env.ASSETS.fetch(url);
    if (!res.ok) return { binary: "", client: "" };
    return await res.json();
  } catch {
    return { binary: "", client: "" };
  }
}

async function readTemplate(request, env, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  const res = await env.ASSETS.fetch(url);
  if (!res.ok) throw new Error("template fetch failed: " + res.status);
  return await res.text();
}

async function liveClientVersion() {
  try {
    const res = await fetch(NPM_LATEST, { cf: { cacheTtl: 300 } });
    if (!res.ok) return null;
    const meta = await res.json();
    return meta && meta.version ? meta.version : null;
  } catch {
    return null;
  }
}

export async function onRequestGet({ request, env }) {
  const [template, versions, liveClient] = await Promise.all([
    readTemplate(request, env, "/llms.txt"),
    readVersions(request, env),
    liveClientVersion(),
  ]);

  const client = liveClient || versions.client || "";
  const binary = versions.binary || "";

  const substituted = template
    .replace(/\{\{binary\}\}/g, binary)
    .replace(/\{\{client\}\}/g, client);

  return new Response(substituted, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300, must-revalidate",
      "x-content-type-options": "nosniff",
    },
  });
}
