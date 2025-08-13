// /api/chat.js — QUIT IT canned-answers assistant (no web scraping)
// Friendly tone + emojis, PDF blocking kept for future use, CORS enabled.

export default async function handler(req, res) {
  // ---- CORS ----
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  // ---- Parse body ----
  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); } catch {}
  const q = (body?.message ?? body?.text ?? "").trim();
  if (!q) return res.status(400).json({ error: "Missing message" });

  // ---- Friendly fallback ----
  const FALLBACK = "I’m sorry, I don’t know the answer to that. You can contact our team at support@quititaus.com.au and they should be able to help you out 😊";

  // ---- CANNED Q&A (order matters; most specific first) ----
  const FAQ = [
    // Contact / speak to a person
    {
      id: "speak-to-person",
      tests: [/speak.*(person|agent|human)/i, /(contact|support|help).*(team|person)/i, /(live|real).*(chat|person)/i],
      answer:
        "Outside of the chatbot, our team’s happy to help! Please email **support@quititaus.com.au** with your name and order number (if you have one), and we’ll get back to you as soon as we can. 💚"
    },

    // Order + payments
    {
      id: "order-confirmation",
      tests: [/no.*(confirmation|email)/i, /(did|has).*(order).*(go.*through|placed)/i],
      answer:
        "If you didn’t receive an order confirmation email, please check your spam folder. Still can’t find it? Email **support@quititaus.com.au** and we’ll check your order for you."
    },
    {
      id: "cancel-order",
      tests: [/cancel.*order/i],
      answer:
        "We can usually cancel within **1 hour** of purchase. After that, your order may already be on its way. Email **support@quititaus.com.au** and we’ll do our best."
    },
    {
      id: "payment-methods",
      tests: [/(payment|pay).*methods?/i, /(how|ways).*(pay|payment)/i],
      answer:
        "We accept **Visa, Mastercard, PayPal, and Afterpay**."
    },
    {
      id: "afterpay",
      tests: [/afterpay/i, /(buy now|pay later)/i],
      answer:
        "Yes — **Afterpay** is available at checkout."
    },

    // Address changes
    {
      id: "change-address",
      tests: [/change.*address/i, /(edit|update).*(shipping|address)/i],
      answer:
        "As we usually dispatch all orders the same day, any changes should be made within **1 hour** of checkout.\n\nPlease email **support@quititaus.com.au** with:\n- your name\n- order number\n- updated shipping details"
    },

    // Stock / sold out
    {
      id: "oos-when-back",
      tests: [/when.*(back|restock|in stock)/i, /(sold out).*(when|back|restock)/i],
      answer:
        "When a product is listed as **sold out**, it’s usually back in stock within **1–2 weeks**."
    },
    {
      id: "what-sold-out-means",
      tests: [/what does.*sold out/i, /^sold out\??$/i],
      answer:
        "“Sold out” means we’re temporarily out of stock. We typically restock within **1–2 weeks**."
    },

    // Shipping & tracking
    {
      id: "shipping-times",
      tests: [/how long.*(shipping|deliver|arrive)/i, /(shipping|delivery)\s*times?/i],
      answer:
        "We ship **daily from Melbourne**. Most orders arrive within **2–6 business days** depending on location. You’ll receive an **AusPost tracking email** once it ships. 🚚"
    },
    {
      id: "express-shipping",
      tests: [/express/i, /fast.*shipping/i],
      answer:
        "Yes — **Express Post** is available at checkout for faster delivery."
    },
    {
      id: "tracking-link",
      tests: [/(where|how).*(track)/i, /tracking.*(link|number)/i, /(track|tracking)\s*(order|package|parcel)/i],
      answer:
        "You’ll get an **Australia Post tracking link** by email when your order ships. Can’t find it? Check spam or email **support@quititaus.com.au** and we’ll resend it.\nYou can also use our tracker: https://quititaus.com.au/apps/track123"
    },
    {
      id: "order-not-moving",
      tests: [/tracking.*(stuck|not moving|no update)/i, /(parcel|package).*(stuck|no update)/i],
      answer:
        "Australia Post can sometimes scan late or skip scans. If your parcel hasn’t moved for **3 business days**, email us and we’ll follow up: **support@quititaus.com.au**."
    },
    {
      id: "routing-other-state",
      tests: [/(route|routed|went).*(state|different state)/i],
      answer:
        "No need to worry — this sometimes happens with Australia Post’s network. If it hasn’t moved for a few days, email **support@quititaus.com.au** and we’ll check it."
    },
    {
      id: "international-shipping",
      tests: [/international|overseas|ship.*(international|worldwide)/i],
      answer:
        "Right now we deliver **Australia-wide only**. We’re exploring international shipping for the future."
    },

    // Refunds & returns
    {
      id: "refund-policy",
      tests: [/refund|return policy|money back/i],
      answer:
        "For **hygiene reasons**, we can only accept returns of **unopened, unused** products within **30 days** of delivery."
    },
    {
      id: "product-damaged",
      tests: [/(broken|damaged|faulty)/i],
      answer:
        "So sorry about that! Please email photos within **48 hours** of delivery to **support@quititaus.com.au**, and we’ll organise a replacement."
    },
    {
      id: "product-missing",
      tests: [/(missing|shortage)/i],
      answer:
        "That’s not right — please email **support@quititaus.com.au** within **48 hours** of delivery and we’ll fix it."
    },

    // Product & usage
    {
      id: "how-long-cores-last",
      tests: [/how long.*(flavour|flavor).*core/i, /(cores?).*(last)/i],
      answer:
        "A pack has **3 cores**. Each core lasts around **5 days** with regular use — so your Starter Pack is designed to last **about a month**."
    },
    {
      id: "activate-core",
      tests: [/activate.*core/i, /prim(e|ing).*core/i],
      answer:
        "**No priming** needed — just insert the core and start using. If it feels dry, rotate the core or pop in a fresh one."
    },
    {
      id: "adjust-airflow",
      tests: [/adjust.*(airflow|draw|resistance)/i, /(airflow|draw).*(change|tighter|looser)/i],
      answer:
        "Twist the **black tip** to adjust airflow — tighter for more resistance, looser for an easier draw."
    },
    {
      id: "weak-flavour-normal",
      tests: [/(weak).*(flavour|flavor)/i, /(taste).*(weak|light)/i],
      answer:
        "Yes — QUIT IT is intentionally **subtle** compared to vaping (no vapour or heat). Many people find the flavour builds after the first couple of days."
    },
    {
      id: "stronger-taste-tips",
      tests: [/(stronger).*(flavour|flavor|taste)/i],
      answer:
        "For a stronger feel: take **slower, deeper breaths**, try **covering the small side holes**, or **tighten the airflow** slightly."
    },
    {
      id: "flavour-recommendations",
      tests: [/(which|best|recommend).*(flavour|flavor)/i, /(pick|choose).*(flavour|flavor)/i],
      answer:
        "Customer favourites are **Crisp Mint, Maple Pepper, Blueberry, and Coffee**. 🌿 If you like refreshing, go **Crisp Mint**. Sweet? **Blueberry**. Bold & cosy? **Coffee**. Unique sweet-spicy? **Maple Pepper**."
    },
    {
      id: "feel-like-cigarette",
      tests: [/feel.*(smok|cigarette)/i, /(like).*(cigarette)/i],
      answer:
        "The inhaler has **adjustable airflow** and mimics the **hand-to-mouth action** and draw of a cigarette. It won’t feel exactly the same — that’s on purpose — but it gives a familiar motion without smoke or vapour."
    },
    {
      id: "safe-to-use",
      tests: [/is it safe|safe to use|safety/i],
      answer:
        "QUIT IT uses **plant-based essential oils**, and you’re breathing mostly air that passes through a flavoured core. We can’t give medical advice — please check with your GP if you have any concerns."
    },
    {
      id: "pregnancy-safe",
      tests: [/pregnan/i],
      answer:
        "We recommend showing your GP our full ingredient list before use. Here’s the list: https://cdn.shopify.com/s/files/1/0918/0941/5477/files/Ingredient_List.pdf?v=1750225464"
    },
    {
      id: "whats-inside-cores",
      tests: [/what('s| is).*inside.*core/i, /ingredients.*core/i],
      answer:
        "Each core is made from an **organic cotton and gauze** blend, infused with our **natural essential oil blend**. **No nicotine**, no artificial chemicals."
    },

    // Cleaning / care
    {
      id: "how-to-clean",
      tests: [/clean.*(device|inhaler|mouthpiece)/i, /wash.*inhaler/i],
      answer:
        "Wipe the mouthpiece with a dry or slightly damp cloth. Don’t submerge in water or use soap — moisture can damage internal parts."
    },
    {
      id: "how-to-store",
      tests: [/store.*(cores|inhaler)/i, /(keep|storage).*(cores|device)/i],
      answer:
        "Keep cores sealed in their pouch until use, and store your inhaler in a **cool, dry place** away from direct sunlight."
    },

    // Motivation & quitting support
    {
      id: "how-this-helps",
      tests: [/(how|why).*(help).*(quit)/i],
      answer:
        "QUIT IT helps with the **hand-to-mouth habit and breathing pattern** of smoking/vaping — without nicotine or vapour. It’s a tool to manage cravings while you break the habit."
    },
    {
      id: "success-tips",
      tests: [/(tips|advice).*(quit|cravings?)/i],
      answer:
        "Keep your inhaler handy for cravings, replace the core **every ~5 days**, and set small goals. Many customers find pairing QUIT IT with a plan or journal helps a lot. 💪"
    },
    {
      id: "when-to-use",
      tests: [/(when).*(use)/i, /(how often|how many).*(use)/i],
      answer:
        "Use QUIT IT whenever cravings hit — at home, at your desk, in the car, or during stressful moments."
    },

    // Retail / guarantee
    {
      id: "buy-in-store",
      tests: [/physical store|buy in a physical|in stores|retail/i],
      answer:
        "We’re working toward retail availability across Australia, but for now QUIT IT is sold **online only**."
    },
    {
      id: "guarantee",
      tests: [/guarantee|warranty|money\s*back/i],
      answer:
        "Quitting takes real willpower and results vary — our product isn’t magic. We **don’t** offer a guarantee, but we’re here to help you get the most from your inhaler."
    },

    // Fun / light
    {
      id: "fun-fact",
      tests: [/fun fact|interesting/i],
      answer:
        "Many customers report fewer cravings in the **first week**, and the savings add up fast compared to smoking. 🙌"
    },
  ];

  // ---- Match helper ----
  const hit = FAQ.find(item => item.tests.some(rx => rx.test(q)));
  if (hit) {
    return res.status(200).json({
      answer: hit.answer.trim(),
      grounded: true,
      source: "faq",
      id: hit.id
    });
  }

  // ---- (Optional) future: web/page extraction
  // Keeping PDF block patterns here for when/if you re-enable page lookup.
  void [/\.pdf($|\?)/i, /cdn\.shopify\.com\/.*\.pdf/i];

  // Nothing matched → friendly fallback
  return res.status(200).json({ answer: FALLBACK, grounded: false, source: "none" });
}

