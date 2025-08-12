// /api/chat.js (Edge runtime)
export const config = { runtime: "edge" };

function corsHeaders(origin) {
  // Keep it simple while debugging; tighten later if you want
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export default async function handler(req) {
  const headers = corsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers });

  let body = {};
  try { body = await req.json(); } catch {}
  const user = body?.message ?? body?.text;
  if (!user) return new Response("Missing message", { status: 400, headers });

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are QUIT IT’s helper. Keep answers short and clear." },
        { role: "user", content: user },
      ],
      max_tokens: 400,
      temperature: 0.6,
      // stream: true, // keep OFF until we confirm CORS works
    }),
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return new Response(JSON.stringify({ ok:false, upstream:data }), {
      status: 502, headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const answer = data?.choices?.[0]?.message?.content || "Sorry, I couldn’t find an answer.";
  return new Response(JSON.stringify({ answer }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

