// /api/chat.js — QUIT IT canned assistant (regex + keyword intents)
// Emojis enabled, no caching, explicit UTF-8. No scraping.

export default async function handler(req, res) {
  const BUILD = "chat-2025-08-13-06"; // bump when you redeploy

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

  // ---- Friendly fallback ----
  const FALLBACK = "I’m sorry, I don’t know the answer to that. You can rephrase the question or alternatively, you can contact our team via the contact form on our FAQ page and they should be able to help you out 😊";

  // ---------------------------------------------------------------------------
  // 1) REGEX FAQ — Most specific first
  // ---------------------------------------------------------------------------
const FAQ = [

// --- QUICK USE + FOLLOW-UPS (put these at the TOP of the FAQ array) ---
{
  id: "how-to-use-short",
  tests: [
    // "how do i use it" variants
    /^(how( do| to)? (i )?use( this| it)?\??)$/i,
    /how.*use( it| this| the (device|inhaler))?/i,
    /how.*start/i,
    /getting.*started/i,
    /(what|how).*(do|to).*(i|you).*(use|work)/i,
    /how.*does.*(it|this|the (device|inhaler)).*work/i,

    // “am I using it right / correctly”
    /(am|are).*(i|we).*(using|doing).*(it|this).*(right|correct(ly)?)/i,
    /use.*correct(ly)?/i,

    // “instructions / manual / guide”
    /(no|missing).*instructions/i,
    /(user|quick).*guide/i,
    /manual/i,

    // “broken?” (we’ll steer them to the use basics first)
    /(is|it('?s)?)\s*(broken|faulty|defective)/i
  ],
  answer:
    "Just pop in a core and breathe in **slowly** through the tip — no button, no heat, no vapour. Twist the **tip** to adjust airflow. Flavour is intentionally **subtle** and often builds over the first couple of days. Each core lasts about **5 days**. 🌿"
},

{
  id: "cant-taste-anything",
  tests: [
    // Core: can't / cannot / not tasting flavour
    /\bcan(?:'?t| not)\s+(?:taste|flavou?r)\b/i,
    /\bcan(?:'?t| not)\s+\w*\s*(?:taste|flavou?r)\b/i, // catches "can't taste any flavour"

    // No / not getting flavour
    /\b(?:no|not(?: getting)?|zero|hardly|barely|can't really)\b.*\b(?:taste|flavou?r)\b/i,

    // Taste / flavour weak
    /\b(?:taste|flavou?r)\b.*\b(?:weak|light|faint|subtle|low|gone)\b/i,

    // Not enough flavour
    /\b(?:no|not enough|zero)\b.*\b(?:flavou?r|taste|scent)\b/i,

    // Typos & common mistakes
    /\bcant\s*tast\b/i,            // missing 'e'
    /\bflavo?r\b/i,                // flavour/flavor short typo
    /\bflavou?r.*week\b/i,         // week instead of weak

    // Conversational
    /\bi.*barely.*(?:taste|flavou?r)\b/i,
    /\bhardly.*(?:taste|flavou?r)\b/i,
    /\b(flavour|taste)\s*not\s*(strong|there|good)\b/i,

    // Not strong / not hitting / no hit
    /\b(not|no)\s*(hit|throat hit|kick)\b/i,
    /\b(not|no)\s*(strong|strength)\b/i,

    // “is it working? nothing’s happening”
    /\b(is|it'?s)\s*(working|work)\b/i,
    /\b(nothing|no)\s*(coming out|happening)\b/i,

    // Like a vape
    /\b(does|should).*(it|this).*(hit|feel).*(like).*(a )?(vape|e-?cig|cigarette)\b/i
  ],
  answer:
    "QUIT IT is designed to be **gentle** — not like a vape. You’re breathing mostly air that’s naturally flavoured as it passes through the core. Try **slower, deeper breaths**, adjust the **airflow** (twist the black tip), or briefly **cover a side hole** for a stronger feel. Many people notice flavour more after **day 2–3**. If it still feels off, we’re happy to help at **support@quititaus.com.au** 😊"
},


{
  id: "no-vapour-expectation",
  tests: [
    // “no vapour/smoke/steam/clouds”
    /(no|not seeing)\s*(vapou?r|smoke|steam|clouds?)/i,
    /(should|is).*(there be|i see).*(vapou?r|smoke)/i,
    /(why).*(no).*(vapou?r|smoke)/i,

    // “doesn’t feel like a vape / no button”
    /(no|not using)\s*button/i,
    /(is|should).*(there be).*(a )?button/i,
    /(does|should).*(feel|hit).*(like).*(vape|ecig|cigarette)/i
  ],
  answer:
    "That’s expected — **no vapour, no smoke, no heat**. The flavour is **subtle by design**. Breathe in slowly through the tip and tweak the **airflow** by twisting the tip. 🌿"
},

  // Speak to a person
  {
    id: "speak-to-person",
    tests: [/speak.*(person|agent|human)/i, /(contact|support|help).*(team|person)/i, /(live|real).*(chat|person)/i],
    answer: "Outside of the chatbot, our team’s happy to help! Please email **support@quititaus.com.au** with your name and order number (if you have one), and we’ll get back to you as soon as we can. 💚"
  },

  // Order & payments
  { id: "order-confirmation", tests: [/no.*(confirmation|email)/i, /(did|has).*(order).*(go.*through|placed)/i],
    answer: "If you didn’t receive an order confirmation email, check your spam folder. Still can’t find it? Email **support@quititaus.com.au** and we’ll check your order for you." },
  { id: "cancel-order", tests: [/cancel.*order/i],
    answer: "We can usually cancel within **1 hour** of purchase. After that, your order may already be on its way. Email **support@quititaus.com.au** and we’ll do our best." },
  { id: "payment-methods", tests: [/(payment|pay).*methods?/i, /(how|ways).*(pay|payment)/i],
    answer: "We accept **Visa, Mastercard, PayPal, and Afterpay**." },
  { id: "afterpay", tests: [/afterpay/i, /(buy now|pay later)/i],
    answer: "Yes — **Afterpay** is available at checkout." },

  // Discounts
  { id: "discount-codes", tests: [/(discount|promo|voucher|coupon)\s?(code)?/i],
    answer: "We don’t have any public discount codes right now. 💚 Occasionally we run special offers for our email subscribers — you can sign up at the bottom of our website to be the first to know." },
  { id: "pensioner-discount", tests: [/(pensioner|senior).*(discount|offer|code)/i],
    answer: "We don’t have a specific pensioner discount at the moment, but we do run promotions throughout the year. You can sign up to our email list at the bottom of our website to be notified first." },

  // Address changes
  { id: "change-address", tests: [/change.*address/i, /(edit|update).*(shipping|address)/i],
    answer: "As we usually dispatch orders the same day, changes should be made within **1 hour** of checkout.\n\nPlease email **support@quititaus.com.au** with:\n- your name\n- order number\n- updated shipping details" },

  // Stock / product colour
  { id: "availability-product-colour", tests: [/(availability|in stock|have).*(colour|color)/i],
    answer: "Availability for each colour is shown on the product page. If a colour is sold out, it’s usually back within **1–2 weeks**." },
  { id: "oos-when-back", tests: [/when.*(back|restock|in stock)/i, /(sold out).*(when|back|restock)/i],
    answer: "When a product is **sold out**, it’s usually back in stock within **1–2 weeks**." },
  { id: "what-sold-out-means", tests: [/what does.*sold out/i, /^sold out\??$/i],
    answer: "“Sold out” means we’re temporarily out of stock. We typically restock within **1–2 weeks**." },

  // Shipping & tracking
  { id: "shipping-times", tests: [/how long.*(shipping|deliver|arrive)/i, /(shipping|delivery)\s*times?/i],
    answer: "We ship **daily from Melbourne**. Most orders arrive within **2–6 business days** depending on location. You’ll receive an **AusPost tracking email** once it ships. 🚚" },
  { id: "express-shipping", tests: [/express/i, /fast.*shipping/i],
    answer: "Yes — **Express Post** is available at checkout for faster delivery." },
  { id: "tracking-link", tests: [/(where|how).*(track)/i, /tracking.*(link|number)/i, /(track|tracking)\s*(order|package|parcel)/i],
    answer: "You’ll get an **Australia Post tracking link** by email when your order ships. Can’t find it? Check spam or email **support@quititaus.com.au** and we’ll resend it.\nYou can also use our tracker: https://quititaus.com.au/apps/track123" },
  { id: "order-not-moving", tests: [/tracking.*(stuck|not moving|no update)/i, /(parcel|package).*(stuck|no update)/i],
    answer: "Australia Post can sometimes scan late or skip scans. If your parcel hasn’t moved for **3 business days**, email us and we’ll follow up: **support@quititaus.com.au**." },
  { id: "routing-other-state", tests: [/(route|routed|went).*(state|different state)/i],
    answer: "No need to worry — this sometimes happens within the AusPost network. If it hasn’t moved for a few days, email **support@quititaus.com.au** and we’ll check it." },
  { id: "international-shipping", tests: [/international|overseas|ship.*(international|worldwide)/i],
    answer: "Right now we deliver **Australia-wide only**. We’re exploring international shipping for the future." },
  { id: "ship-to-nz", tests: [/ship.*nz|new zealand/i],
    answer: "We currently ship **Australia only**. We may add NZ in the future — join our email list to be notified." },

  // Refunds & returns
  { id: "refund-policy", tests: [/refund|return(s?)\b|money back/i],
    answer: "For **hygiene reasons**, we can only accept returns of **unopened, unused** products within **30 days** of delivery." },
  { id: "product-damaged", tests: [/(broken|damaged|faulty)/i],
    answer: "So sorry about that! Please email photos within **48 hours** of delivery to **support@quititaus.com.au**, and we’ll organise a replacement." },
  { id: "product-missing", tests: [/(missing|shortage)/i],
    answer: "That’s not right — please email **support@quititaus.com.au** within **48 hours** of delivery and we’ll fix it." },
  { id: "dont-like-it", tests: [/i don.?t like/i, /not happy|unhappy/i],
    answer: "Sorry to hear that! If it’s flavour-related, many customers find flavours become more noticable after a few days. My recommendation is give it a real go! You may be suprised." },

  // Product & usage
  { id: "how-long-cores-last", tests: [/how long.*(flavou?r).*core/i, /(cores?).*(last)/i],
    answer: "A pack has **3 cores**. Each core lasts around **5 days** with regular use — so your Starter Pack is designed to last **about a month**." },
  { id: "activate-core", tests: [/activate.*core/i, /prim(e|ing).*core/i],
    answer: "**No priming** needed — just insert the core and start using. If it feels dry, rotate the core or pop in a fresh one." },
  { id: "adjust-airflow", tests: [/adjust.*(airflow|draw|resistance)/i, /(airflow|draw).*(change|tighter|looser)/i],
    answer: "Twist the **black tip** to adjust airflow — tighter for more resistance, looser for an easier draw." },
  { id: "weak-flavour-normal", tests: [/(weak).*(flavou?r)/i, /(taste).*(weak|light)/i],
    answer: "Yes — QUIT IT is intentionally **subtle** compared to vaping (no vapour or heat). Many people find the flavour builds after the first couple of days." },
  { id: "stronger-taste-tips", tests: [/(stronger).*(flavou?r|taste)/i],
    answer: "For a stronger feel: take **slower, deeper breaths**, try **covering the small side holes**, or **tighten the airflow** slightly." },

  // Flavour recommendations (updated)
  { id: "flavour-recommendations",
    tests: [/(which|best|recommend|suggest|choose|pick).*(flavou?rs?)/i, /(flavou?rs?).*(recommendation|recommendations|recs?)/i],
    answer: "Customer favourites are **Crisp Mint, Maple Pepper, Blueberry, and Coffee**. 🌿 These give you a mix of refreshing, sweet, bold, and unique flavours — perfect for your Starter Pack’s 4 slots so you can see which you like best." },

  // === UPDATE SECTION – August 2025 ===
[
  {
    id: "doesnt-work",
    tests: [
      /(it|this).*(doesn'?t|does not|won'?t)\s*work/i,
      /(not|isn'?t)\s*(working|operating|doing anything)/i
    ],
    answer: "QUIT IT isn’t like a vape — there’s no smoke, vapour, or button. You breathe mostly air that’s naturally flavoured as it passes through the core. Try slower, deeper breaths, adjust the airflow (twist the tip), or briefly cover a side hole for more sensation."
  },
  {
    id: "addicted",
    tests: [
      /get\s*addicted/i,
      /will\s*i\s*(be|become|get)\s*addicted/i
    ],
    answer: "No — QUIT IT contains no nicotine, tobacco, or addictive chemicals. It’s designed to help replace the habit, not create a new one."
  },
  {
    id: "nicotine",
    tests: [
      /has?\s*nicotine/i,
      /contain.*nicotine/i
    ],
    answer: "No — our products are 100% nicotine-free and tobacco-free."
  },
  {
    id: "is-vape",
    tests: [
      /(is|are|same as).*vape/i,
      /(is|are).*(vape|ecig|cigarette)/i
    ],
    answer: "No — there’s no nicotine, no heating element, no vapour, and no clouds. It’s simply flavoured air you inhale, so it’s much gentler than vaping or smoking."
  },
  {
    id: "quit-smoking",
    tests: [
      /(help|use).*quit\s*(smoking|vaping)/i,
      /stop\s*(smoking|vaping)/i
    ],
    answer: "QUIT IT is designed as a tool to replace the hand-to-mouth habit and provide a sensory experience without nicotine or tobacco. QUIT IT has helped thousands of customers all over Australia quit for good."
  },
  {
    id: "use-at-work",
    tests: [
      /use.*at\s*work/i,
      /can\s*i\s*.*work/i
    ],
    answer: "Yes — since there’s no smoke, vapour, or smell, you can use it anywhere."
  },
  {
    id: "use-on-flight",
    tests: [
      /use.*(plane|flight|airplane|aeroplane)/i,
      /take.*(plane|flight|airplane|aeroplane)/i
    ],
    answer: "Yes — since there’s no smoke, vapour, or smell, you can use it anywhere."
  },
  {
    id: "ship-tasmania",
    tests: [
      /ship.*tasmania/i,
      /deliver.*tasmania/i
    ],
    answer: "Yes — we ship anywhere in Australia, including Tasmania."
  },
  {
    id: "lost-product",
    tests: [
      /(lost|misplaced).*(quit\s*it|inhaler)/i
    ],
    answer: "We don’t replace lost products, but you can order a new inhaler through our website."
  },
  {
    id: "calories",
    tests: [
      /how.*calories/i,
      /(any|has|contain).*calories/i
    ],
    answer: "None — they’re just flavoured air. There’s no sugar, no artificial sweeteners, and no nutritional impact."
  },
  {
    id: "weight-loss",
    tests: [
      /use.*(weight|diet|lose\s*weight)/i
    ],
    answer: "QUIT IT isn’t a weight-loss product, but some people find that using it can help manage cravings by keeping their mouth and hands busy."
  },
  {
    id: "courier-or-auspost",
    tests: [
      /courier/i,
      /auspost/i
    ],
    answer: "We use Australia Post for all deliveries so you can track your parcel easily."
  },
  {
    id: "order-late",
    tests: [
      /(order|parcel).*(late|missing|didn'?t\s*come|hasn'?t\s*arrived)/i
    ],
    answer: "Sorry for the delay! Please email support@quititaus.com.au with your order number and we’ll track it for you right away."
  },
  {
    id: "same-as-fum",
    tests: [
      /(same|like).*f[üu]m/i
    ],
    answer: "No — while our inhalers look similar, we’re an Australian-based company with our own unique flavours and designs."
  },
  {
    id: "expensive",
    tests: [
      /(why|so).*expensive/i,
      /cost.*(high|much)/i
    ],
    answer: "We use high-quality, food-grade flavouring, custom-built inhalers, and we view quality and safety more importantly than producing a cheap flimsy product."
  },
  {
    id: "sales",
    tests: [
      /any.*sale/i,
      /discount.*code/i,
      /promotion/i
    ],
    answer: "Yes — we sometimes run promotions. Sign up to our email list or follow us on social media for updates."
  },
  {
    id: "tga-approved",
    tests: [
      /(tga|approved|approval)/i
    ],
    answer: "Since QUIT IT is not a medical device, there is no rout to have our inhaler tested and approved by TGA. That in mind, all our products have received private testing to be sure they meet all standards."
  },
  {
    id: "chemicals",
    tests: [
      /any.*chemicals/i,
      /contain.*chemicals/i
    ],
    answer: "Our cores contain only food-grade natural and artificial flavourings. No nicotine, no tobacco, no harmful chemicals."
  },
  {
    id: "australian-made",
    tests: [
      /(australian\s*made|made\s*in\s*australia)/i
    ],
    answer: "Our company is Australian-owned. Some components are sourced internationally, and all final assembly and quality control are handled here in Australia."
  },
  {
    id: "made-in-china",
    tests: [
      /made\s*in\s*china/i
    ],
    answer: "Our company is Australian-owned. Some components are sourced internationally, and all final assembly and quality control are handled here in Australia."
  },
  {
    id: "scam",
    tests: [
      /scam/i,
      /(real|legit)/i
    ],
    answer: "We’re an Australian-registered business, with secure payment processing, an active customer service team, and thousands of happy customers. You can read verified reviews on our website."
  },
  {
    id: "buy-inhaler-only",
    tests: [
      /buy.*inhaler.*only/i,
      /spare.*inhaler/i
    ],
    answer: "Currently, our inhalers are only available in a starter pack."
  },
  {
    id: "order-in-qld",
    tests: [
      /order.*qld/i,
      /queensland/i
    ],
    answer: "sometimes AusPost send orders via a different state, if your order has not moved for 3+ days, please reach out to support@quititaus.com.au and our team can help."
  },
  {
    id: "legal",
    tests: [
      /is.*legal/i
    ],
    answer: "Yes — our products are 100% legal to buy and use in Australia."
  },
  {
    id: "lung-problems",
    tests: [
      /lung.*problem/i,
      /harm.*lungs/i
    ],
    answer: "QUIT IT contains no harmful chemicals, smoke, or vapour. You’re breathing mostly clean air through food-grade flavouring."
  },
  {
    id: "under-18",
    tests: [
      /under\s*18/i,
      /\bminor\b/i
    ],
    answer: "Our products are intended for adults."
  },
  {
    id: "fill-stick",
    tests: [
      /(fill|refill).*(stick|core)/i
    ],
    answer: "You can’t refill a core — they’re designed for single use and last around 5 days. Once empty, replace it with a fresh one."
  },
  {
    id: "cleaners",
    tests: [
      /clean(er|ing).*(inhaler|device|quit\s*it)/i
    ],
    answer: "Yes – all inhalers come with a pipe cleaner for the inside and a cloth for the outside of your inhaler. it is best to wipe it down every time you swap out flavours."
  },
  {
    id: "replace-inhaler",
    tests: [
      /replace.*(inhaler|head)/i
    ],
    answer: "The inhaler does not need replacing, you just replace the cores."
  }
]

];


  // Regex hit?
  const regexHit = FAQ.find(item => item.tests.some(rx => rx.test(q)));
  if (regexHit) {
    return res.status(200).json({ answer: regexHit.answer.trim(), grounded: true, source: "faq", id: regexHit.id, build: BUILD });
  }

  // ---------------------------------------------------------------------------
  // 2) KEYWORD INTENT MATCHER — forgiving paraphrases
  // ---------------------------------------------------------------------------
  function normalize(s) {
    return (s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  const N = normalize(q);

  const ANSWERS = {
    speakToPerson: "Outside of the chatbot, our team’s happy to help! Please email support@quititaus.com.au with your name and order number (if you have one), and we’ll get back to you as soon as we can. 💚",
    flavourRecs: "Customer favourites are **Crisp Mint, Maple Pepper, Blueberry, and Coffee**. 🌿 If you like refreshing, go **Crisp Mint**. Sweet? **Blueberry**. Bold & cosy? **Coffee**. Unique sweet-spicy? **Maple Pepper**.",
    funFact: "Here’s a fun one: many QUIT IT customers say cravings drop in the **first week**, and the savings add up fast compared to smoking. 🙌",
    shippingTimes: "We ship **daily from Melbourne**. Most orders arrive within **2–6 business days** depending on location. You’ll receive an **AusPost tracking email** once it ships. 🚚",
    express: "Yes — **Express Post** is available at checkout for faster delivery.",
    tracking: "You’ll get an **Australia Post tracking link** by email when your order ships. Can’t find it? Check spam or email **support@quititaus.com.au** and we’ll resend it.\nYou can also use our tracker: https://quititaus.com.au/apps/track123",
    orderStuck: "Australia Post can sometimes scan late or skip scans. If your parcel hasn’t moved for **3 business days**, email us and we’ll follow up: **support@quititaus.com.au**.",
    changeAddress: "As we usually dispatch orders the same day, changes should be made within **1 hour** of checkout.\n\nPlease email **support@quititaus.com.au** with:\n- your name\n- order number\n- updated shipping details",
    refunds: "For **hygiene reasons**, we can only accept returns of **unopened, unused** products within **30 days** of delivery.",
    soldOut: "“Sold out” means we’re temporarily out of stock. We typically restock within **1–2 weeks**.",
    whenBack: "When a product is **sold out**, it’s usually back in stock within **1–2 weeks**.",
    afterpay: "Yes — **Afterpay** is available at checkout.",
    payments: "We accept **Visa, Mastercard, PayPal, and Afterpay**.",
    intlShipping: "Right now we deliver **Australia-wide only**. We’re exploring international shipping for the future.",
    safeUse: "QUIT IT uses **plant-based essential oils**, and you’re breathing mostly air that passes through a flavoured core. We can’t give medical advice — please check with your GP if you have any concerns.",
    pregnancy: "We recommend showing your GP our full ingredient list before use. Here’s the list: https://cdn.shopify.com/s/files/1/0918/0941/5477/files/Ingredient_List.pdf?v=1750225464",
    feelLikeCig: "The inhaler has **adjustable airflow** and mimics the **hand-to-mouth action** and draw of a cigarette. It won’t feel exactly the same — that’s on purpose — but it gives a familiar motion without smoke or vapour.",
    coresLast: "A pack has **3 cores**. Each core lasts around **5 days** with regular use — so your Starter Pack is designed to last **about a month**.",
    strongerTaste: "For a stronger feel: take **slower, deeper breaths**, try **covering the small side holes**, or **tighten the airflow** slightly.",
    adjustAirflow: "Twist the **black tip** to adjust airflow — tighter for more resistance, looser for an easier draw.",
    whatsInside: "There’s **no nicotine**. No tobacco. No artificial additives. Just a blend of:\n\n• **Essential oils**\n• **Natural flavour compounds**\n• **Organic plant extracts**\n\nAll infused into a **medical-grade polyester core** that delivers smooth, safe inhalation. 🌿",
  };

  const INTENTS = [
    { id: "speakToPerson", any: ["speak to a person","human agent","real person","talk to human","contact support","talk to a person"] },

    // Flavour phrasings
    { id: "flavourRecs", any: [
      "flavour recommendation","flavor recommendation","flavour recommendations","flavor recommendations",
      "flavour rec","flavour recs","flavor rec","flavor recs",
      "recommend flavour","recommend flavours","recommend flavors","recommend a flavour","recommend a flavor",
      "best flavour","best flavours","best flavor","best flavors",
      "which flavour","which flavour should i pick","which flavour should i choose",
      "which flavors","which flavor","which flavor should i pick","which flavor should i choose",
      "flavour suggestions","flavor suggestions","suggest a flavour","suggest a flavor",
      "pick a flavour","pick a flavor","choose a flavour","choose a flavor",
      "what are best flavours","what are the best flavours","what are the best flavors"
    ] },

    // Fun / interesting
    { id: "funFact", any: ["fun fact","fun facts","something interesting","interesting fact","tell me something interesting"] },

    // Shipping & tracking, etc.
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
    { id: "whatsInside", any: ["whats inside the flavour cores","what is inside the flavour cores","ingredients in core","what’s inside cores","whats inside cores"] },
  ];

  const intent = INTENTS.find(it => it.any.some(k => N.includes(k)));
  if (intent) {
    const answer = ANSWERS[intent.id];
    if (answer) {
      return res.status(200).json({ answer, grounded: true, source: "faq_keywords", id: intent.id, build: BUILD });
    }
  }

  // Nothing matched → friendly fallback
  return res.status(200).json({ answer: FALLBACK, grounded: false, source: "none", build: BUILD });
}

