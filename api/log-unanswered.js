// Logs unanswered questions from the widget
// - Always logs to Vercel function logs
// - If SLACK_WEBHOOK_URL is set, also posts to Slack
export default async function handler(req, res) {
  const BUILD = "log-unanswered-2025-08-13-01";

  // CORS + utf-8 + no-cache
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed", build: BUILD });

  // Parse JSON safely
  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch {}

  const question = String(body?.question || "").trim();
  const client = body?.client || {};
  const now = new Date().toISOString();

  if (!question) {
    return res.status(400).json({ ok: false, error: "Missing question", build: BUILD });
  }

  // Prepare a normalized payload
  const payload = {
    ts: now,
    question,
    client: {
      href: client.href || "",
      path: client.path || "",
      tz: client.tz || "",
      ua: req.headers["user-agent"] || "",
      ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || ""
    },
    build: BUILD,
  };

  // Always log to function logs (viewable in Vercel > Functions > Logs)
  console.log("[UNANSWERED]", JSON.stringify(payload));

  // Optional: post to Slack if webhook is configured
  try {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (url) {
      const text =
        `*Unanswered question*  •  ${now}\n` +
        `> ${question}\n` +
        `• Page: ${payload.client.href || "(unknown)"}\n` +
        `• TZ: ${payload.client.tz || "n/a"}  •  IP: ${payload.client.ip || "n/a"}`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
    }
  } catch (e) {
    // Don’t fail the request if Slack is down
    console.error("Slack log failed:", e?.message || e);
  }

  return res.status(200).json({ ok: true, build: BUILD });
}
