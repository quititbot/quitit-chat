// pages/api/chat.js  (or /api/chat.js if using Vercel serverless, Node runtime)
export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*"); // or set to your domain
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const { message, text } = (typeof req.body === "string" ? JSON.parse(req.body||"{}") : req.body) || {};
  const user = message ?? text;
  if (!user) return res.status(400).json({ error: "Missing message" });

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
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
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ ok:false, upstream:data });

    const answer = data?.choices?.[0]?.message?.content || "Sorry, I couldn’t find an answer.";
    return res.status(200).json({ answer });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e) });
  }
}
