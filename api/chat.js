// /api/chat.js — QUIT IT canned assistant (regex + keyword intents + site snippets + optional AI fallback)
// Emojis enabled, no caching, explicit UTF-8. No scraping beyond your own allowlisted pages.

export default async function handler(req, res) {
  const BUILD = "chat-2025-08-14-01"; // bump when you redeploy
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""; // optional

  // ---- CORS + headers (UTF-8 + no cache) ----
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  // ---- Parse ----
  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch {}
  const q = (body?.message ?? body?.text ?? "").trim();
  if (!q) return res.status(400).json({ error: "Missing message", build: BUILD });

  // ---- Friendly fallback (exact text also used by AI guard) ----
  const FALLBACK =
    "I’m sorry, I don’t know the answer to that. You can rephrase the question or alternatively, you can contact our team via the contact form on our FAQ page and they should be able to help you out 😊";

  // ────────────────────────────────────────────────────────────────────────────
  // 0) SITE SOURCING (STRICT SANDBOX)
  // ────────────────────────────────────────────────────────────────────────────
  // Only these pages are ever read; FAQ page is explicitly blocked.
  const ALLOW_URLS = [
    "https://quititaus.com.au/",
    "https://quititaus.com.au/products/starter-pack",
    "https://quititaus.com.au/products/flavour-core-bundle",
    "https://quititaus.com.au/apps/track123"
  ];
  const BLOCK_URLS = new Set([
    "https://quititaus.com.au/pages/frequently-asked-questions"
  ]);

  // Simple in-memory cache (per lambda instance)
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
  globalThis.__SITE_CACHE__ ||= { at: 0, docs: [] };

  function stripHtml(html) {
    // remove scripts/styles
    html = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
    // convert <br> and block tags to periods/spaces to keep sentence boundaries somewhat sane
    html = html.replace(/<\/(p|div|section|li|h[1-6])>/gi, ". ");
    // strip tags
    html = html.replace(/<[^>]+>/g, " ");
    // decode a few common entities
    html = html
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&hellip;/g, "…")
      .replace(/&ndash;|&#8211;/g, "–")
      .replace(/&mdash;|&#8212;/g, "—");
    // collapse whitespace
    return html.replace(/\s+/g, " ").trim();
  }

  async function fetchAllowed(url, signal) {
    if (!ALLOW_URLS.includes(url) || BLOCK_URLS.has(url)) {
      throw new Error("URL not allowed");
    }
    const r = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "QUITIT-Chat/1.0 (+serverless)" },
      signal
    });
    if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);
    const html = await r.text();
    const text = stripHtml(html);
    return text;
  }

  async function buildSiteKB() {
    const now = Date.now();
    if (globalThis.__SITE_CACHE__.docs.length && now - globalThis.__SITE_CACHE__.at < CACHE_TTL_MS) {
      return globalThis.__SITE_CACHE__.docs;
    }
    // refresh cache with a short timeout per page
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 6500);
    try {
      const docs = [];
      for (const url of ALLOW_URLS) {
        try {
          const text = await fetchAllowed(url, controller.signal);
          // Keep it lighter: cut to ~40k chars per page
          const trimmed = text.slice(0, 40000);
          docs.push({ url, text: trimmed });
        } catch {
          // ignore single-page failures; continue
        }
      }
      globalThis.__SITE_CACHE__ = { at: now, docs };
      return docs;
    } finally {
      clearTimeout(to);
    }
  }

  function normalize(s) {
    return (s || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function keywordScore(query, text) {
    const qWords = normalize(query).split(" ").filter(w => w.length > 2);
    if (!qWords.length) return 0;
    let score = 0;
    for (const w of qWords) {
      // frequency + proximity-ish bonus
      const re = new RegExp(`\\b${w}\\b`, "gi");
      const matches = text.match(re)?.length || 0;
      score += matches * 2;
    }
    return score;
  }

  function bestSnippet(query, text, maxLen = 420) {
    // split roughly on sentence ends
    const sentences = text.split(/(?<=[\.!\?])\s+/).slice(0, 800);
    const qWords = normalize(query).split(" ").filter(w => w.length > 2);
    let best = { s: "", score: 0, idx: -1 };
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      const ns = normalize(s);
      let sc = 0;
      for (const w of qWords) {
        const re = new RegExp(`\\b${w}\\b`, "g");
        sc += (ns.match(re)?.length || 0);
      }
      // small bonus for shorter, cleaner sentences
      sc += Math.max(0, 3 - Math.floor(s.length / 180));
      if (sc > best.score) best = { s, score: sc, idx: i };
    }
    if (!best.s) return "";
    // try to include a neighbour sentence for context if short
    let out = best.s.trim();
    if (out.length < maxLen / 2 && best.idx + 1 < sentences.length) {
      const next = sentences[best.idx + 1].trim();
      if ((out + " " + next).length <= maxLen) out = out + " " + next;
    }
    // trim to maxLen
    if (out.length > maxLen) out = out.slice(0, maxLen - 1).trimEnd() + "…";
    return out;
  }

  async function siteAnswer(query) {
    const docs = await buildSiteKB();
    if (!docs.length) return null;

    // pick best doc by keyword score
    let bestDoc = null;
    let bestScore = 0;
    for (const d of docs) {
      const sc = keywordScore(query, d.text);
      if (sc > bestScore) { bestScore = sc; bestDoc = d; }
    }
    if (!bestDoc || bestScore < 2) return null;

    const snippet = bestSnippet(query, bestDoc.text);
    if (!snippet) return null;

    // Slight clean-up and keep it concise
    const answer = snippet.replace(/\s{2,}/g, " ").trim();
    return { answer, url: bestDoc.url };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 1) REGEX FAQ — Most specific first (YOUR ORIGINAL, unchanged except BUILD id)
  // ────────────────────────────────────────────────────────────────────────────
  const FAQ = [
    // --- QUICK USE + FOLLOW-UPS (put these at the TOP of the FAQ array) ---
    {
      id: "how-to-use-short",
      tests: [
        /^(how( do| to)? (i )?use( this| it)?\??)$/i,
        /how.*use( it| this| the (device|inhaler))?/i,
        /how.*start/i,
        /getting.*started/i,
        /(what|how).*(do|to).*(i|you).*(use|work)/i,
        /how.*does.*(it|this|the (device|inhaler)).*work/i,
        /(am|are).*(i|we).*(using|doing).*(it|this).*(right|correct(ly)?)/i,
        /use.*correct(ly)?/i,
        /(no|missing).*instructions/i,
        /(user|quick).*guide/i,
        /manual/i,
        /(is|it('?s)?)\s*(broken|faulty|defective)/i
      ],
      answer:
        "Just pop in a core and breathe in **slowly** through the tip — no button, no heat, no vapour. Twist the **tip** to adjust airflow. Flavour is intentionally **subtle** and often builds over the first couple of days. Each core lasts about **5 days**. 🌿"
    },
    {
      id: "cant-taste-anything",
      tests: [
        /\bcan(?:'?t| not)\s+(?:taste|flavou?r)\b/i,
        /\bcan(?:'?t| not)\s+\w*\s*(?:taste|flavou?r)\b/i,
        /\b(?:no|not(?: getting)?|zero|hardly|barely|can't really)\b.*\b(?:taste|flavou?r)\b/i,
        /\b(?:taste|flavou?r)\b.*\b(?:weak|light|faint|subtle|low|gone)\b/i,
        /\b(?:no|not enough|zero)\b.*\b(?:flavou?r|taste|scent)\b/i,
        /\bcant\s*tast\b/i,
        /\bflavo?r\b/i,
        /\bflavou?r.*week\b/i,
        /\bi.*barely.*(?:taste|flavou?r)\b/i,
        /\bhardly.*(?:taste|flavou?r)\b/i,
        /\b(flavour|taste)\s*not\s*(strong|there|good)\b/i,
        /\b(not|no)\s*(hit|throat hit|kick)\b/i,
        /\b(not|no)\s*(strong|strength)\b/i,
        /\b(is|it'?s)\s*(working|work)\b/i,
        /\b(nothing|no)\s*(coming out|happening)\b/i,
        /\b(does|should).*(it|this).*(hit|feel).*(like).*(a )?(vape|e-?cig|cigarette)\b/i
      ],
      answer:
        "QUIT IT is designed to be **gentle** — not like a vape. You’re breathing mostly air that’s naturally flavoured as it passes through the core. Try **slower, deeper breaths**, adjust the **airflow** (twist the black tip), or briefly **cover a side hole** for a stronger feel. Many people notice flavour more after **day 2–3**. If it still feels off, we’re happy to help at **support@quititaus.com.au** 😊"
    },
    {
      id: "no-vapour-expectation",
      tests: [
        /(no|not seeing)\s*(vapou?r|smoke|steam|clouds?)/i,
        /(should|is).*(there be|i see).*(vapou?r|smoke)/i,
        /(why).*(no).*(vapou?r|smoke)/i,
        /(no|not using)\s*button/i,
        /(is|should).*(there be).*(a )?button/i,
        /(does|should).*(feel|hit).*(like).*(vape|ecig|cigarette)/i
      ],
      answer:
        "That’s expected — **no vapour, no smoke, no heat**. The flavour is **subtle by design**. Breathe in slowly through the tip and tweak the **airflow** by twisting the tip. 🌿"
    },
    {
      id: "speak-to-person",
      tests: [/speak.*(person|agent|human)/i, /(contact|support|help).*(team|person)/i, /(live|real).*(chat|person)/i],
      answer:
        "Outside of the chatbot, our team’s happy to help! Please email **support@quititaus.com.au** with your name and order number (if you have one), and we’ll get back to you as soon as we can. 💚"
    },
    // … (UNCHANGED) — keep ALL of your FAQ entries from your message here verbatim …
    // For brevity, the rest of your FAQ array is identical to what you pasted.
    // ⬇️ Paste everything from "order-confirmation" through to "replace-inhaler" unchanged.
    // (I’ve omitted here to keep this snippet readable.)
  ];

  // Quick regex match?
  const regexHit = FAQ.find(item => item.tests.some(rx => rx.test(q)));
  if (regexHit) {
    return res.status(200).json({
      answer: regexHit.answer.trim(),
      grounded: true,
      source: "faq",
      id: regexHit.id,
      build: BUILD
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 2) KEYWORD INTENTS — forgiving paraphrases (YOUR ORIGINAL, unchanged)
  // ────────────────────────────────────────────────────────────────────────────
  const N = normalize(q);
  const ANSWERS = {
    speakToPerson:
      "Outside of the chatbot, our team’s happy to help! Please email support@quititaus.com.au with your name and order number (if you have one), and we’ll get back to you as soon as we can. 💚",
    flavourRecs:
      "Customer favourites are **Crisp Mint, Maple Pepper, Blueberry, and Coffee**. 🌿 These give you a mix of refreshing, sweet, bold, and unique flavours — perfect for your Starter Pack’s 4 slots so you can see which you like best.",
    funFact:
      "Here’s a fun one: many QUIT IT customers say cravings drop in the **first week**, and the savings add up fast compared to smoking. 🙌",
    shippingTimes:
      "We ship **daily from Melbourne**. Most orders arrive within **2–6 business days** depending on location. You’ll receive an **AusPost tracking email** once it ships. 🚚",
    express:
      "Yes — **Express Post** is available at checkout for faster delivery.",
    tracking:
      "You’ll get an **Australia Post tracking link** by email when your order ships. Can’t find it? Check spam or email **support@quititaus.com.au** and we’ll resend it.\nYou can also use our tracker: https://quititaus.com.au/apps/track123",
    orderStuck:
      "Australia Post can sometimes scan late or skip scans. If your parcel hasn’t moved for **3 business days**, email us and we’ll follow up: **support@quititaus.com.au**.",
    changeAddress:
      "As we usually dispatch orders the same day, changes should be made within **1 hour** of checkout.\n\nPlease email **support@quititaus.com.au** with:\n- your name\n- order number\n- updated shipping details",
    refunds:
      "For **hygiene reasons**, we can only accept returns of **unopened, unused** products within **30 days** of delivery.",
    soldOut:
      "“Sold out” means we’re temporarily out of stock. We typically restock within **1–2 weeks**.",
    whenBack:
      "When a product is **sold out**, it’s usually back in stock within **1–2 weeks**.",
    afterpay: "Yes — **Afterpay** is available at checkout.",
    payments: "We accept **Visa, Mastercard, PayPal, and Afterpay**.",
    intlShipping:
      "Right now we deliver **Australia-wide only**. We’re exploring international shipping for the future.",
    safeUse:
      "QUIT IT uses **plant-based essential oils**, and you’re breathing mostly air that passes through a flavoured core. We can’t give medical advice — please check with your GP if you have any concerns.",
    pregnancy:
      "We recommend showing your GP our full ingredient list before use. Here’s the list: https://cdn.shopify.com/s/files/1/0918/0941/5477/files/Ingredient_List.pdf?v=1750225464",
    feelLikeCig:
      "The inhaler has **adjustable airflow** and mimics the **hand-to-mouth action** and draw of a cigarette. It won’t feel exactly the same — that’s on purpose — but it gives a familiar motion without smoke or vapour.",
    coresLast:
      "A pack has **3 cores**. Each core lasts around **5 days** with regular use — so your Starter Pack is designed to last **about a month**.",
    strongerTaste:
      "For a stronger feel: take **slower, deeper breaths**, try **covering the small side holes**, or **tighten the airflow** slightly.",
    adjustAirflow:
      "Twist the **black tip** to adjust airflow — tighter for more resistance, looser for an easier draw.",
    whatsInside:
      "There’s **no nicotine**. No tobacco. No artificial additives. Just a blend of:\n\n• **Essential oils**\n• **Natural flavour compounds**\n• **Organic plant extracts**\n\nAll infused into a **medical-grade polyester core** that delivers smooth, safe inhalation. 🌿"
  };

  const INTENTS = [
    { id: "speakToPerson", any: ["speak to a person", "human agent", "real person", "talk to human", "contact support", "talk to a person"] },
    { id: "flavourRecs", any: ["flavour recommendation","flavor recommendation","flavour recommendations","flavor recommendations","flavour rec","flavour recs","flavor rec","flavor recs","recommend flavour","recommend flavours","recommend flavors","recommend a flavour","recommend a flavor","best flavour","best flavours","best flavor","best flavors","which flavour","which flavour should i pick","which flavour should i choose","which flavors","which flavor","which flavor should i pick","which flavor should i choose","flavour suggestions","flavor suggestions","suggest a flavour","suggest a flavor","pick a flavour","pick a flavor","choose a flavour","choose a flavor","what are best flavours","what are the best flavours","what are the best flavors"] },
    { id: "funFact", any: ["fun fact","fun facts","something interesting","interesting fact","tell me something interesting"] },
    { id: "shippingTimes", any: ["how long shipping","shipping time","delivery time","how long does shipping take","when will my order arrive"] },
    { id: "express", any: ["express post","express shipping","faster shipping"] },
    { id: "tracking", any: ["track my order","tracking link","tracking number","how do i track","where is my order","track order"] },
    { id: "orderStuck", any: ["tracking stuck","not moving","no update","parcel stuck","package stuck"] },
    { id: "changeAddress", any: ["change address","update address","edit address","wrong address"] },
    { id: "refunds", any: ["refund","return policy","money back","returns"] },
    { id: "soldOut", any: ["what does sold out mean","what is sold out"] },
    { id: "whenBack", any: ["when back in stock","back in stock","restock when","when restock"] },
    { id: "afterpay", any: ["afterpay","buy now pay later"] },
    { id: "payments", any: ["payment methods","how can i pay","ways to pay"] },
    { id: "intlShipping", any: ["international shipping","ship overseas","ship internationally","worldwide shipping"] },
    { id: "safeUse", any: ["is it safe","safe to use","safety"] },
    { id: "pregnancy", any: ["pregnant","pregnancy","safe while pregnant","safe during pregnancy"] },
    { id: "feelLikeCig", any: ["feel like a cigarette","does it feel like smoking","feel like smoking"] },
    { id: "coresLast", any: ["how long do the cores last","core last","how long flavour cores last","how long flavor cores last"] },
    { id: "strongerTaste", any: ["stronger taste","stronger flavour","stronger flavor","flavour too weak","flavor too weak"] },
    { id: "adjustAirflow", any: ["adjust airflow","change draw","more resistance","looser draw","tighter draw"] },
    { id: "whatsInside", any: ["whats inside the flavour cores","what is inside the flavour cores","ingredients in core","what’s inside cores","whats inside cores"] }
  ];

  const intent = INTENTS.find(it => it.any.some(k => N.includes(k)));
  if (intent) {
    const answer = ANSWERS[intent.id];
    if (answer) {
      return res.status(200).json({
        answer,
        grounded: true,
        source: "faq_keywords",
        id: intent.id,
        build: BUILD
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 3) SITE SNIPPET MATCH — ONLY from allowlisted pages
  // ────────────────────────────────────────────────────────────────────────────
  try {
    const hit = await siteAnswer(q);
    if (hit && hit.answer) {
      // Short, friendly wrap, with a visible source
      const answer = `${hit.answer}\n\nSource: ${hit.url}`;
      return res.status(200).json({
        answer,
        grounded: true,
        source: "site",
        url: hit.url,
        build: BUILD
      });
    }
  } catch {
    // ignore and fall through
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 4) AI FALLBACK (optional) — uses your FAQ + allowlisted site text only
  // ────────────────────────────────────────────────────────────────────────────
  if (!OPENAI_API_KEY) {
    return res.status(200).json({ answer: FALLBACK, grounded: false, source: "none", build: BUILD });
  }

  // Build compact knowledge from FAQ answers
  const KNOWLEDGE_FAQ = FAQ.map(x => `QID:${x.id}\nA:${x.answer}`).join("\n\n");

  // Add brief site context (first ~1200 chars per page for token safety)
  const siteDocs = (await buildSiteKB()).map(d => `URL:${d.url}\nTEXT:${d.text.slice(0, 1200)}`).join("\n\n");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8500);

    const prompt = [
      {
        role: "system",
        content:
          "You are QUIT IT’s support assistant. Answer ONLY using the knowledge provided. If the question is outside scope or not present, reply with the fallback message exactly. Keep answers concise, friendly, and in Australian English."
      },
      {
        role: "user",
        content:
`KNOWLEDGE (authoritative, do not invent):
[FAQ]
${KNOWLEDGE_FAQ}

[SITE — allowlist only]
${siteDocs}

BLOCKED SOURCE:
https://quititaus.com.au/pages/frequently-asked-questions  (Do NOT use.)

USER QUESTION:
${q}

If unsure or not covered, reply exactly with:
${FALLBACK}`
      }
    ];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: prompt,
        temperature: 0.2,
        max_tokens: 250
      })
    });
    clearTimeout(timeout);

    if (!r.ok) {
      return res.status(200).json({ answer: FALLBACK, grounded: false, source: "ai_error", build: BUILD });
    }

    const data = await r.json();
    const aiText = data?.choices?.[0]?.message?.content?.trim();
    if (!aiText) {
      return res.status(200).json({ answer: FALLBACK, grounded: false, source: "ai_empty", build: BUILD });
    }

    const isFallback = aiText === FALLBACK;
    return res.status(200).json({
      answer: aiText,
      grounded: !isFallback,
      source: "ai_fallback",
      build: BUILD
    });
  } catch {
    return res.status(200).json({ answer: FALLBACK, grounded: false, source: "ai_timeout", build: BUILD });
  }
}

