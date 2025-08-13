// /api/chat.js — Canned Q&A first, then grounded web pages (no guessing). JSON + CORS. Friendly tone + emojis.

export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  // --- Parse body ---
  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); } catch {}
  const userQRaw = (body?.message ?? body?.text ?? "").trim();
  if (!userQRaw) return res.status(400).json({ error: "Missing message" });

  const FRIENDLY_FALLBACK =
    "I’m sorry, I don’t know the answer to that. You can contact our team at support@quititaus.com.au and they should be able to help you out 😊";

  // ---------- 1) CANNED Q&A (yours) ----------
  // Keep answers exactly as supplied (no ingredient lists beyond your wording).
  const FAQ = [
    {
      id: "oos-when-back",
      tests: [
        /when.*(back|restock|in stock)/i,
        /(sold out).*(when|back|restock)/i,
      ],
      answer:
        "When a product is listed as sold out, usually we will have it back in stock within a week or two."
    },
    {
      id: "schedule-delivery",
      tests: [/schedule.*deliver/i, /(deliver|delivery).*(schedule|time)/i],
      answer:
        "All orders are shipped out though Australia Post. Unfortunately we do not have the ability to schedule deliveries at this time."
    },
    {
      id: "routing-other-state",
      tests: [/(route|routed|went).*(state|different state)/i],
      answer:
        "No need to worry just yet. This can happen sometimes with Australia Post. If it has been a few days and your package has not moved, feel free to email - support@quititaus.com.au and our team can look into it further for you."
    },
    {
      id: "stronger-taste-adjust",
      tests: [/(stronger|weak).*(taste|flavour|flavor)/i, /adjust.*(device|airflow|taste)/i],
      answer:
        "The QUIT IT inhaler is designed to feel different from a vape or cigarette. There’s no vapour, no heat, and no artificial intensity — just clean, natural flavour.\nIt’s meant to be subtle, not overwhelming. That’s a big part of the design. We’ve found that it often takes a few days for your senses to adjust, especially if you’re coming off vaping or smoking where flavours are much more intense. The more you use it, the more noticeable and enjoyable the flavour becomes."
    },
    {
      id: "change-address",
      tests: [/change.*address/i, /(edit|update).*(shipping|address)/i],
      answer:
        "As we usually dispatch all orders same day, any modifications to your order should be made within 1 hour of checkout.\n\nOutside this window, we cannot guarantee our ability to edit shipping details, as your order may already be on its way.\nPlease email support@quititaus.com.au with\n- your name\n- order number\n- updated shipping details"
    },
    {
      id: "guarantee",
      tests: [/guarantee|warranty|money\s*back/i],
      answer:
        "As it takes an incredible amount of willpower to quit any bad habit. Our product is not magic and we understand it will not work for everyone. Hence, my apologies, we do not have currently have a guarantee in place."
    },
    {
      id: "buy-in-store",
      tests: [/physical store|buy in a physical|in stores|retail/i],
      answer:
        "We are currently working toward having our product available in stores all over Australia, but for the moment it is only available through our website."
    },
    {
      id: "fda-tga",
      tests: [/FDA|TGA|approved/i],
      answer:
        "QUIT IT isn’t a medical device, so there’s no approval process with the TGA in Australia. \nBecause it’s a wellness product, we focus on using safe, plant-based ingredients and maintaining high manufacturing standards instead."
    },
    {
      id: "international-shipping",
      tests: [/international|overseas|ship.*(international|worldwide)/i],
      answer:
        "For the moment, we deliver Australia-wide only. We are exploring international shipping for the future, so keep an eye on our updates."
    },
    {
      id: "afterpay",
      tests: [/afterpay/i, /(buy now|pay later)/i],
      answer: "Yes, we have Afterpay available at checkout."
    },
    {
      id: "shipping-times",
      tests: [/how long.*(shipping|deliver|arrive)/i, /(shipping|delivery) times/i],
      answer:
        "We ship daily from Melbourne. Most orders arrive within 2–6 business days, depending on location. You’ll get an AusPost tracking email as soon as your order ships."
    },
    {
      id: "refund-policy",
      tests: [/refund|return policy|money back/i],
      answer:
        "For hygiene reasons, we can only accept returns of unopened, unused products within 30 days of delivery."
    },
    {
      id: "whats-inside-cores",
      tests: [/what('s| is).*inside.*core/i, /ingredients.*core/i],
      answer:
        "Each core is made from an organic cotton and gauze blend, infused with our natural essential oil blend. No nicotine, no artificial chemicals."
    },
    {
      id: "weak-flavour-normal",
      tests: [/(weak).*(flavour|flavor)/i, /(taste).*(weak|light)/i],
      answer:
        "Yes — QUIT IT is intentionally subtle compared to vaping. There’s no vapour or heat, just clean flavour. Many people find it builds slightly after the first couple of days."
    },
    {
      id: "activate-core",
      tests: [/activate.*core/i, /prim(e|ing).*core/i],
      answer:
        "No priming needed — just insert it and start using. If it feels dry, rotate the core or pop in a fresh one."
    },
    {
      id: "pregnancy-safe",
      tests: [/pregnan/i],
      answer:
        "All our ingredients are plant-based, but we always recommend showing your GP our full ingredient list before use. Here’s the list: https://cdn.shopify.com/s/files/1/0918/0941/5477/files/Ingredient_List.pdf?v=1750225464"
    },
    {
      id: "safe-to-use",
      tests: [/is it safe|safe to use|safety/i],
      answer:
        "QUIT IT uses plant-based essential oils and you’re breathing mostly air that passes through a flavoured core. We can’t give medical advice — please check with your GP before use if you have health concerns."
    },
    {
      id: "feel-like-cigarette",
      tests: [/feel.*(smok|cigarette)/i, /(like).*(cigarette)/i],
      answer:
        "Our inhaler has adjustable airflow and is designed to attempt to mimic the hand-to-mouth action and draw of a cigarette. It won’t feel exactly the same — that’s on purpose — but it gives you a familiar motion without harmful smoke or vapour."
    },
    {
      id: "how-long-cores-last",
      tests: [/how long.*(flavour|flavor).*core/i, /(cores?).*(last)/i],
      answer:
        "A pack has 3 cores. Each one lasts around 5 days with regular use, so your Starter Pack is designed to last about a month."
    },
  ];

  function matchFAQ(q) {
    for (const item of FAQ) {
      if (item.tests.some(rx => rx.test(q))) return item;
    }
    return null;
  }

  const faqHit = matchFAQ(userQRaw);
  if (faqHit) {
    // Friendly polish + emoji without changing your facts
    const polished = faqHit.answer
      .replace(/\n\n/g, "\n")
      .trim();
    return res.status(200).json({ answer: polished, grounded: true, source: "faq", id: faqHit.id });
  }

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


  globalThis.__QI_CACHE__ ||= new Map();
  const cache = globalThis.__QI_CACHE__;

  async function fetchText(url) {
    if (cache.has(url)) return cache.get(url);
    const r = await fetch(url, { method: "GET" });
    if (!r.ok) throw new Error(`Fetch ${r.status} for ${url}`);
    const html = await r.text();
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

  function scoreChunk(q, chunk) {
    const terms = q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const lc = chunk.toLowerCase();
    let score = 0;
    for (const term of terms) if (lc.includes(term)) score++;
    return score;
  }

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
        corpus.push({ id: doc.id, url: doc.url, chunk: c, score: scoreChunk(userQRaw, c) });
      }
    }
  } catch (e) {
    return res.status(502).json({ ok: false, error: "Failed to fetch site content", detail: String(e) });
  }

  corpus.sort((a, b) => b.score - a.score);
  const top = corpus.slice(0, 6).filter(c => c.score > 0);

  if (top.length === 0) {
    return res.status(200).json({ answer: FRIENDLY_FALLBACK, grounded: false, source: "none" });
  }

  const sourcesBlock = top.map((c, i) => `Source ${i+1} [${c.id}]: ${c.chunk}`).join("\n\n");
  const SYSTEM = `
You are QUIT IT’s friendly assistant 😊.
Answer ONLY using the “Sources” text below. If the answer isn’t clearly supported, reply exactly with:
"${FRIENDLY_FALLBACK}"
Be warm, helpful, and concise (about 2–5 short sentences). Avoid medical claims. Use plain language and emojis sparingly.
`;

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 260,
        messages: [
          { role: "system", content: SYSTEM.trim() },
          { role: "user", content: `Question: ${userQRaw}\n\nSources:\n${sourcesBlock}` },
        ],
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(502).json({ ok: false, upstream: data });
    }

    const answer = (data?.choices?.[0]?.message?.content || "").trim() || FRIENDLY_FALLBACK;
    const cited = top[0]?.url || null;
    return res.status(200).json({ answer, grounded: true, source: "pages", cited });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}

