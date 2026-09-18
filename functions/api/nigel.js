// Cloudflare Pages Function — /api/nigel
//
// Nigel's chat endpoint, served from holonograph.ai itself.
//
// Nigel runs on Cloud Run (*.run.app). Called from the widget directly, his session
// cookie was third-party to holonograph.ai, and Safari and Firefox block those by
// default: every message started a new session, the conversation was lost between
// turns, and the six-new-sessions-a-day cap bit after six messages. Relayed through
// here, the browser only ever talks to holonograph.ai and the cookie is first-party.
//
// Pages secrets:
//   NIGEL_PROXY_KEY     (production AND preview)  shared with the nigel-chat service.
//                       It is what lets Nigel trust x-nigel-client-ip: every relayed
//                       request arrives from Cloudflare, so rate limiting has to key
//                       on the IP reported here, and only a request carrying the key
//                       is allowed to report one.
//   NIGEL_OPERATOR_KEY  (PREVIEW ONLY, never production)  tags every preview turn
//                       as test traffic. See the block before the upstream fetch.
//
// The upstream is not configurable. This relay exists for one service.

const UPSTREAM = "https://nigel-chat-98022099798.us-central1.run.app/";
const COOKIE = "nigel_sid";
const SID_RE = /^[0-9a-f-]{36}$/;
// A 1,200-character message is ~1.3 KB of JSON. Headroom, not a limit anyone meets;
// the real message limit is enforced by Nigel, who also says so in character.
const MAX_BODY = 8 * 1024;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

export async function onRequestPost({ request, env }) {
  if (!env.NIGEL_PROXY_KEY) return json({ error: "nigel is not configured" }, 503);

  // Same-origin only. Without this the relay is an LLM endpoint any other site can
  // point a form at and bill to us: a text/plain POST needs no CORS preflight, so
  // the browser sends it even though the page can never read the reply.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "origin not allowed" }, 403);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "request too large" }, 413);

  const sid = readCookie(request.headers.get("cookie"), COOKIE);

  // Every page load asks for the transcript. With no session there is nothing to
  // restore, so answer here: a visitor who never opens the chat never reaches
  // Google's infrastructure at all, not even in a request log.
  if (!sid && isHistory(raw)) return json({ messages: [] });

  const headers = {
    "content-type": "application/json",
    "x-nigel-proxy-key": env.NIGEL_PROXY_KEY,
    "x-nigel-client-ip": request.headers.get("cf-connecting-ip") || "",
  };
  // Forward Nigel's cookie and nothing else. The rest of the visitor's cookies for
  // holonograph.ai are none of Cloud Run's business.
  if (sid) headers.cookie = `${COOKIE}=${sid}`;

  // Test traffic must land in the lens as runMode eval (provenance
  // manual_production_run), never as production. NIGEL_OPERATOR_KEY is set for the
  // PREVIEW environment only, so everything sent through a preview URL, the widget
  // included, is tagged eval with no secret ever in a browser; production has no
  // such secret and so can never tag itself. Scripted tests against production send
  // the two headers themselves, and Nigel refuses eval without a valid key rather
  // than quietly filing the turn as production.
  if (env.NIGEL_OPERATOR_KEY) {
    headers["x-nigel-run-mode"] = "eval";
    headers["x-nigel-operator-key"] = env.NIGEL_OPERATOR_KEY;
  } else {
    const runMode = request.headers.get("x-nigel-run-mode");
    const operatorKey = request.headers.get("x-nigel-operator-key");
    if (runMode !== null) headers["x-nigel-run-mode"] = runMode;
    if (operatorKey !== null) headers["x-nigel-operator-key"] = operatorKey;
  }

  let upstream;
  try {
    upstream = await fetch(UPSTREAM, { method: "POST", headers, body: raw });
  } catch {
    return json({ error: "nigel is unreachable" }, 502);
  }

  const out = new Headers({
    "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  const setCookie = upstream.headers.get("set-cookie");
  if (setCookie) out.append("set-cookie", setCookie);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

function isHistory(raw) {
  try {
    return JSON.parse(raw).action === "history";
  } catch {
    return false;
  }
}

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      const v = part.slice(i + 1).trim();
      return SID_RE.test(v) ? v : null;
    }
  }
  return null;
}
