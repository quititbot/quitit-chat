// /api/chat.js  — TEMP ECHO for debugging (no OpenAI yet)
export const config = { runtime: "edge" };

function corsHeaders(origin) {
  const allowOrigin = origin || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export default async function handler(req) {
  const origin = req.headers.get("origin");
  const base = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: base });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: base });

  let body = {};
  try { body = await req.json(); } catch {}
  return new Response(JSON.stringify({ ok: true, received: body }), {
    status: 200,
    headers: { ...base, "Content-Type": "application/json" },
  });
}
