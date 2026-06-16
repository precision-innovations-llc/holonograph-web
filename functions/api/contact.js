// Cloudflare Pages Function — /api/contact
//
// Required Pages bindings / secrets (set in Cloudflare dashboard):
//   TURNSTILE_SECRET  (secret)  Cloudflare Turnstile secret key
//   RESEND_API_KEY    (secret)  Resend API key for outbound mail
//   CONTACT_EMAIL     (env)     destination address, e.g. brian@holonograph.ai
//   MAIL_FROM         (env)     verified sender, e.g. "Holonograph <noreply@holonograph.ai>"
//   RATE_LIMIT        (KV)      KV namespace binding (any name works; we read env.RATE_LIMIT)
//
// All are optional for local dev — the handler degrades gracefully:
//   - no KV binding   → rate limiting is skipped (logged)
//   - no TS secret    → Turnstile verification is skipped (logged)
//   - no Resend key   → submission is console.log'd instead of emailed

const MAX_PER_MIN = 1;
const MAX_PER_DAY = 10;

const MAX = { name: 100, email: 200, message: 5000 };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
  const ip = request.headers.get("cf-connecting-ip") || "unknown";

  // ----- rate limit (per-IP) -----
  if (env.RATE_LIMIT) {
    const now = Date.now();
    const minBucket = Math.floor(now / 60_000);
    const dayBucket = Math.floor(now / 86_400_000);
    const minKey = `rl:min:${ip}:${minBucket}`;
    const dayKey = `rl:day:${ip}:${dayBucket}`;

    const [minHits, dayHits] = await Promise.all([
      env.RATE_LIMIT.get(minKey),
      env.RATE_LIMIT.get(dayKey),
    ]);

    if (parseInt(minHits || "0", 10) >= MAX_PER_MIN) {
      return json({ error: "too fast — wait a minute" }, 429);
    }
    if (parseInt(dayHits || "0", 10) >= MAX_PER_DAY) {
      return json({ error: "daily limit reached — try tomorrow" }, 429);
    }
    // optimistically increment (skip on failure — we already passed the limit check)
    await Promise.all([
      env.RATE_LIMIT.put(minKey, "1", { expirationTtl: 60 }),
      env.RATE_LIMIT.put(
        dayKey,
        String(parseInt(dayHits || "0", 10) + 1),
        { expirationTtl: 86_400 }
      ),
    ]).catch(() => {});
  } else {
    console.warn("[contact] no RATE_LIMIT KV binding — skipping rate limit");
  }

  // ----- parse body -----
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid request" }, 400);
  }

  const name    = typeof body.name    === "string" ? body.name.trim()    : "";
  const email   = typeof body.email   === "string" ? body.email.trim()   : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const tsToken = typeof body["cf-turnstile-response"] === "string" ? body["cf-turnstile-response"] : "";

  // ----- validate -----
  if (!name || !email || !message) return json({ error: "all fields required" }, 400);
  if (name.length    > MAX.name)    return json({ error: "name too long" }, 400);
  if (email.length   > MAX.email)   return json({ error: "email too long" }, 400);
  if (message.length > MAX.message) return json({ error: "message too long" }, 400);
  if (!EMAIL_RE.test(email))        return json({ error: "invalid email" }, 400);

  // ----- Turnstile verify -----
  if (env.TURNSTILE_SECRET) {
    if (!tsToken) return json({ error: "bot check failed" }, 400);
    try {
      const verifyRes = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            secret: env.TURNSTILE_SECRET,
            response: tsToken,
            remoteip: ip,
          }),
        }
      );
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        return json({ error: "bot check failed" }, 400);
      }
    } catch {
      return json({ error: "verification unavailable" }, 503);
    }
  } else {
    console.warn("[contact] no TURNSTILE_SECRET — skipping bot check");
  }

  // ----- send via Resend (or log) -----
  if (env.RESEND_API_KEY && env.CONTACT_EMAIL && env.MAIL_FROM) {
    const safe = (s) => String(s).replace(/[\r\n]+/g, " ").slice(0, 200);
    const escapeHtml = (s) => String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: env.CONTACT_EMAIL,
        reply_to: email,
        subject: `holonograph · ${safe(name)}`,
        text: `From: ${name} <${email}>\nIP: ${ip}\n\n${message}\n`,
        html: `<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>` +
              `<p style="color:#888;font-size:12px"><strong>IP:</strong> ${escapeHtml(ip)}</p>` +
              `<hr/><p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text().catch(() => "");
      console.error("[contact] resend failed", emailRes.status, errText);
      return json({ error: "send failed" }, 502);
    }
  } else {
    console.log("[contact] submission (no mail configured):", { name, email, ip, message });
  }

  return json({ ok: true });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "allow": "POST, OPTIONS",
    },
  });
}

// All other methods: 405
export async function onRequest({ request }) {
  return json({ error: "method not allowed" }, 405);
}
