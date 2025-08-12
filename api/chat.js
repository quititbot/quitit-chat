// File: /api/chat.js
export const config = { runtime: "edge" };

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// ----- CORS helpers -----
const ALLOW_EXACT = new Set([
  "https://quititaus.com.au",
  "https://www.quititaus.com.au",
]);
function isVercelPreview(origin) {
  try {
    if (!origin) return false;
    const u = new URL(origin);
    return u.protocol === "https:" && u.hostname.endsWith(".vercel.app");
  } catch { return false; }
}
function corsHeaders(origin) {
  const allowOrigin = (origin && (ALLOW_EXACT.has(origin) || isVercelPreview(origin)))
    ? origin
    : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export default async function handler(req) {
  const origin = req.headers.get("origin");
  const baseHeaders = corsHeaders(origin);

  // Preflight for CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: baseHeaders });
  }

  // Read body (accept {message} or {text})
  let body = {};
  try { body = await req.json(); } catch {}
  const user = body?.message ?? body?.text;
  if (!user || typeof user !== "string") {
    return new Response("Missing message", { status: 400, headers: baseHeaders });
  }

  // Call OpenAI (streaming)
  const upstream = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      max_tokens: 400,
      temperature: 0.6,
      messages: [
        { role: "system", content: "You are QUIT IT’s helper. Keep answers short and clear." },
        { role: "user", content: user },
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const txt = await upstream.text().catch(() => "");
    return new Response(`Upstream error: ${txt}`, { status: 502, headers: baseHeaders });
  }

  // Pipe SSE back with CORS headers
  return new Response(upstream.body, {
    headers: {
      ...baseHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
