// /api/chat.js — Grounded answers from QUIT IT pages only (JSON + CORS)

export default async function handler(req, res) {
  // --- CORS (simple & permissive; tighten later if you like) ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  // --- Parse body ---
  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); } catch {}
  const userQ = (body?.message ?? body?.text ?? "").trim();
  if (!userQ) return res.status(400).json({ error: "Missing message" });

  // --- Friendly fallback (used whenever we can't find it in Sources) ---
  const FRIENDLY_FALLBACK =
    "I’m sorry—I don’t know the answer to that. You can contact our team at support@quititaus.com.au and they’ll be happy to help.";

  // --- Whitelisted QUIT IT pages (edit/expand anytime) ---
  // Includes your new URLs, plus common info pages.
  const PAGES = [
    // Your new ones:
    { id: "blog-cores-inside", url: "https://quititaus.com.au/blogs/news/whats-inside-quit-it-flavour-cores" },
    { id: "home",              url: "https://quititaus.com.au/" },
    { id: "faq",               url: "https://quititaus.com.au/pages/frequently-asked-questions" },
    { id: "tracking",          url: "https://quititaus.com.au/apps/track123" },
    { id: "contact",           url: "https://quititaus.com.au/pages/contact" },

    // Previously suggested (keep if these exist on your site):
    { id: "flavour-cores",     url: "https://quititaus.com.au/products/flavour-core-bundle" },
    { id: "starter-pack",      url: "https://quititaus.com.au/products/starter-pack" },
  ];

  // --- Simple server memory cache (clears on redeploy) ---
  globalThis.__QI_CACHE__ ||= new Map();
  const cache = globalThis.__QI_CACHE__;

  async function fetchText(url) {
    if (cache.has(url)) return cache.get(url);
    const r = await fetch(url, { method: "GET" });
    if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
    const html = await r.text();

    // strip scripts/styles, tags, entities; collapse whitespace
    const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
    const withoutStyles  = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, " ");
    const text = withoutStyles
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();

    cache.set(url, text);
    return text;
  }

  // chunk text into ~900 chars with 120-char overlap (keeps context)
  function chunkText(t, maxLen = 900, overlap = 120) {
    const chunks = [];
    let i = 0;
    while (i < t.length) {
      const end = Math.min(t.length, i + maxLen);
      chunks.push(t.slice(i, end).trim());
      i = Math.max(0, end - overlap);
    }
    return chunks.filter(Boolean);
  }

  // super-simple keyword score
  function scoreChunk(q, chunk) {
    const terms = q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const lc = chunk.toLowerCase();
    let score = 0;
    for (const term of terms) if (lc.includes(term)) score++;
    return score;
  }

  // Build a ranked corpus of chunks from your pages
  let corpus = [];
  try {
    const docs = await Promise.all(
      PAGES.map(p =>
        fetchText(p.url)
          .then(t => ({ id: p.id, url: p.url, text: t }))
          .catch(() => null)
      )
    );
    for (const doc of docs.filter(Boolean)) {
      for (const c of chunkText(doc.text)) {
        corpus.push({ id: doc.id, url: doc.url, chunk: c, score: scoreChunk(userQ, c) });
      }
    }
  } catch (e) {
    return res.status(502).json({ ok: false, error: "Failed to fetch site content", detail: String(e) });
  }

  // Take top-scoring chunks; if none > 0, we don’t answer
  corpus.sort((a, b) => b.score - a.score);
  const TOP_K = 6;
  const top = corpus.slice(0, TOP_K).filter(c => c.score > 0);

  if (top.length === 0) {
    return res.status(200).json({ answer: FRIENDLY_FALLBACK, grounded: false });
  }

  // Build a Sources block for the model
  const sourcesBlock = top.map((c, i) => `Source ${i+1} [${c.id}]: ${c.chunk}`).join("\n\n");

  // Gentle, friendly system prompt (no guessing)
  const SYSTEM = `
You are QUIT IT’s friendly assistant.
Answer ONLY using the “Sources” provided. If the answer isn’t clearly supported, respond with: "${FRIENDLY_FALLBACK}"
Be warm, helpful, and concise (around 2–5 short sentences). Avoid medical claims. Use plain language.
If helpful, mention they can email support@quititaus.com.au.
`;

  // Call OpenAI (non-streaming for reliability)
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,      // calm & consistent
        max_tokens: 260,       // enough for a friendly helpful reply
        messages: [
          { role: "system", content: SYSTEM.trim() },
          { role: "user", content: `Question: ${userQ}\n\nSources:\n${sourcesBlock}` },
        ],
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(502).json({ ok: false, upstream: data });
    }

    const answer = (data?.choices?.[0]?.message?.content || "").trim() || FRIENDLY_FALLBACK;
    const cited = top[0]?.url || null;

    return res.status(200).json({ answer, grounded: true, cited });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}

