// /api/log-unanswered.js — capture questions we didn't answer well

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { question, client } = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}));
    if (!question) return res.status(400).json({ ok: false, error: "Missing question" });

    const now = new Date().toISOString();
    const meta = {
      question: String(question).slice(0, 500),
      when: now,
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown",
      ua: req.headers["user-agent"] || "unknown",
      referer: req.headers["referer"] || req.headers["origin"] || "unknown",
      client: client || {}
    };

    // For now: log to Vercel function logs
    console.log("[UNANSWERED]", JSON.stringify(meta));

    // TODO: forward to a store (Airtable / Supabase / Google Sheets)
    // await fetch("https://your-destination.example.com", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(meta) });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[UNANSWERED][ERROR]", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
