// /api/chat.js — CANNED first; else ONLY consult the approved blog for "what's inside" questions.
// PDF blocked. Clean extraction. Friendly fallback.

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
  const q = (body?.message ?? body?.text ?? "").trim();
  if (!q) return res.status(400).json({ error: "Missing message" });

  const FRIENDLY_FALLBACK =
    "I’m sorry, I don’t know the answer to that. You can contact our team at support@quititaus.com.au and they should be able to help you out 😊";

  // ---------- 1) YOUR EXACT CANNED Q&A ----------
  const FAQ = [
    { id:"oos-when-back", tests:[/when.*(back|restock|in stock)/i, /(sold out).*(when|back|restock)/i],
      answer:"When a product is listed as sold out, usually we will have it back in stock within a week or two." },
    { id:"what-sold-out-means", tests:[/what does.*sold out/i, /^sold out\??$/i],
      answer:"When a product is listed as sold out, usually we will have it back in stock within a week or two." },
    { id:"schedule-delivery", tests:[/schedule.*deliver/i, /(deliver|delivery).*(schedule|time)/i],
      answer:"All orders are shipped out though Australia post. Unfortunately we do not have the ability to schedule deliveries at this time." },
    { id:"routing-other-state", tests:[/(route|routed|went).*(state|different state)/i],
      answer:"No need to worry just yet. This can happen sometimes with Australia post. If it has been a few days and your package has not moved, feel free to email - support@quititaus.com.au and our team can look into it further for you." },
    { id:"stronger-taste-adjust", tests:[/(stronger|weak).*(taste|flavour|flavor)/i, /adjust.*(device|airflow|taste)/i],
      answer:"The QUIT IT inhaler is designed to feel different from a vape or cigarette. There’s no vapour, no heat, and no artificial intensity — just clean, natural flavour.\nIt’s meant to be subtle, not overwhelming. That’s a big part of the design. We’ve found that it often takes a few days for your senses to adjust, especially if you’re coming off vaping or smoking where flavours are much more intense. The more you use it, the more noticeable and enjoyable the flavour becomes." },
    { id:"change-address", tests:[/change.*address/i, /(edit|update).*(shipping|address)/i],
      answer:"As we usually dispatch all orders same day, any modifications to your order should be made within 1 hour of checkout.\n\nOutside this window, we cannot guarantee our ability to edit shipping details, as your order may already be on its way.\nPlease email support@quititaus.com.au with\n- your name\n- order number\n- updated shipping details" },
    { id:"guarantee", tests:[/guarantee|warranty|money\s*back/i],
      answer:"As it takes an incredible amount of willpower to quit any bad habit. Our product is not magic and we understand it will not work for everyone. Hence, my apologies, we do not have currently have a guarantee in place." },
    { id:"buy-in-store", tests:[/physical store|buy in a physical|in stores|retail/i],
      answer:"We are currently working toward having our product available in stores all over Australia, but for the moment it is only available through our website." },
    { id:"fda-tga", tests:[/FDA|TGA|approved/i],
      answer:"QUIT IT isn’t a medical device, so there’s no approval process with the TGA in Australia. \nBecause it’s a wellness product, we focus on using safe, plant-based ingredients and maintaining high manufacturing standards instead." },
    { id:"international-shipping", tests:[/international|overseas|ship.*(international|worldwide)/i],
      answer:"For the moment, we deliver Australia-wide only. We are exploring international shipping for the future, so keep an eye on our updates." },
    { id:"afterpay", tests:[/afterpay/i, /(buy now|pay later)/i],
      answer:"Yes, we have Afterpay available at checkout." },
    { id:"shipping-times", tests:[/how long.*(shipping|deliver|arrive)/i, /(shipping|delivery) times/i],
      answer:"We ship daily from Melbourne. Most orders arrive within 2–6 business days, depending on location. You’ll get an AusPost tracking email as soon as your order ships." },
    { id:"refund-policy", tests:[/refund|return policy|money back/i],
      answer:"For hygiene reasons, we can only accept returns of unopened, unused products within 30 days of delivery." },
    { id:"whats-inside-cores", tests:[/what('s| is).*inside.*core/i, /ingredients.*core/i],
      answer:"Each core is made from an organic cotton and gauze blend, infused with our natural essential oil blend. No nicotine, no artificial chemicals." },
    { id:"weak-flavour-normal", tests:[/(weak).*(flavour|flavor)/i, /(taste).*(weak|light)/i],
      answer:"Yes — QUIT IT is intentionally subtle compared to vaping. There’s no vapour or heat, just clean flavour. Many people find it builds slightly after the first couple of days." },
    { id:"activate-core", tests:[/activate.*core/i, /prim(e|ing).*core/i],
      answer:"No priming needed — just insert it and start using. If it feels dry, rotate the core or pop in a fresh one." },
    { id:"pregnancy-safe", tests:[/pregnan/i],
      answer:"All our ingredients are plant-based, but we always recommend showing your GP our full ingredient list before use. Here’s the list: https://cdn.shopify.com/s/files/1/0918/0941/5477/files/Ingredient_List.pdf?v=1750225464" },
    { id:"safe-to-use", tests:[/is it safe|safe to use|safety/i],
      answer:"QUIT IT uses plant-based essential oils and you’re breathing mostly air that passes through a flavoured core. We can’t give medical advice — please check with your GP before use if you have health concerns." },
    { id:"feel-like-cigarette", tests:[/feel.*(smok|cigarette)/i, /(like).*(cigarette)/i],
      answer:"Our inhaler has adjustable airflow and is designed to attempt to mimic the hand-to-mouth action and draw of a cigarette. It won’t feel exactly the same — that’s on purpose — but it gives you a familiar motion without harmful smoke or vapour." },
    { id:"how-long-cores-last", tests:[/how long.*(flavour|flavor).*core/i, /(cores?).*(last)/i],
      answer:"A pack has 3 cores. Each one lasts around 5 days with regular use, so your Starter Pack is designed to last about a month." },
  ];

  const canned = FAQ.find(f => f.tests.some(rx => rx.test(q)));
  if (canned) {
    return res.status(200).json({ answer: canned.answer.trim(), grounded: true, source: "faq", id: canned.id });
  }

  // ---------- 2) PAGE LOOKUP — ONLY for "what's inside / ingredients" ----------
  const ASK_INGREDIENTS = /\b(what('?s| is)\s+inside|ingredients?)\b/i;
  if (!ASK_INGREDIENTS.test(q)) {
    // For any other question that wasn't in canned, don't consult pages — use friendly fallback.
    return res.status(200).json({ answer: FRIENDLY_FALLBACK, grounded: false, source: "none" });
  }

  // Only approved blog post
  const PAGES = [
    { id: "blog-cores-inside", url: "https://quititaus.com.au/blogs/news/whats-inside-quit-it-flavour-cores" },
  ];

  // Block PDFs only
  const BLOCKED_URLS = [/\.pdf($|\?)/i, /cdn\.shopify\.com\/.*\.pdf/i];
  const isBlockedUrl = (url) => BLOCKED_URLS.some(rx => rx.test(url));

  // Cache per deploy
  globalThis.__QI_CACHE__ ||= new Map();
  const cache = globalThis.__QI_CACHE__;

  async function fetchText(url) {
    if (isBlockedUrl(url)) return "";
    if (cache.has(url)) return cache.get(url);
    const r = await fetch(url, { method: "GET" });
    if (!r.ok) throw new Error(`Fetch ${r.status} for ${url}`);
    let html = await r.text();

    // Remove obvious nav/footer noise
    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ");

    const text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();

    cache.set(url, text);
    return text;
  }

  const sentenceSplit = (s) =>
    s.split(/(?<=[\.!\?])\s+/).map(t => t.trim()).filter(Boolean);

  const score = (query, sent) => {
    const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const lc = sent.toLowerCase();
    let pts = 0;
    for (const t of terms) if (lc.includes(t)) pts++;
    return pts;
  };

  let candidates = [];
  try {
    const docs = await Promise.all(
      PAGES.map(p => fetchText(p.url).then(t => ({ id: p.id, url: p.url, text: t })).catch(() => null))
    );
    for (const doc of docs.filter(Boolean)) {
      for (const s of sentenceSplit(doc.text)) {
        // keep sentences that are a reasonable length and likely content
        if (s.length < 30 || s.length > 220) continue;
        const sc = score(q, s);
        if (sc > 0) candidates.push({ sent: s, url: doc.url, id: doc.id, score: sc });
      }
    }
  } catch (e) {
    return res.status(502).json({ ok:false, error: "Failed to fetch site content", detail: String(e) });
  }

  // Require a stronger match; otherwise fallback
  const MIN_SCORE = 3;
  candidates = candidates.filter(c => c.score >= MIN_SCORE).sort((a,b) => b.score - a.score);

  if (!candidates.length) {
    return res.status(200).json({ answer: FRIENDLY_FALLBACK, grounded: false, source: "none" });
  }

  // Compose neat bullets from top same-page sentences
  const top = candidates.slice(0, 6);
  const primaryUrl = top[0].url;
  const byPrimary = top.filter(c => c.url === primaryUrl).slice(0, 4);
  const picked = byPrimary.length ? byPrimary : top.slice(0, 3);

  const answer =
    "Here’s what we say on our site:\n" +
    picked.map(c => `• ${c.sent}`).join("\n");

  return res.status(200).json({ answer, grounded: true, source: "pages", cited: primaryUrl });
}
