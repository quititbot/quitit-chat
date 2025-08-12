import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const KB_PATH = path.join(process.cwd(), "data", "faq.json");

function cosine(a, b) {
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return s / (Math.sqrt(na) * Math.sqrt(nb));
}

let cached = { items: null, embeds: null };

async function loadKB() {
  if (cached.items) return cached.items;
  const text = fs.readFileSync(KB_PATH, "utf8");
  cached.items = JSON.parse(text);
  return cached.items;
}

async function embedAll(items) {
  if (cached.embeds) return cached.embeds;
  const inputs = items.map(i => `Q: ${i.question}\nA: ${i.answer}`);
  const r = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: inputs
  });
  cached.embeds = r.data.map(d => d.embedding);
  return cached.embeds;
}

async function embedOne(text) {
  const r = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text
  });
  return r.data[0].embedding;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { text, history } = req.body || {};
    const userText = (text || "").toString().slice(0, 2000).trim();
    if (!userText) return res.status(400).json({ error: "Missing text" });

    // greetings shortcut
    if (/^\s*(hi|hello|hey|yo|sup)\b/i.test(userText)) {
      return res.json({ answer: "Hi there! How can I help today? You can ask about shipping, flavour cores, safety, or returns.", confidence: 1.0, from: "greeting" });
    }

    const items = await loadKB();
    const embeds = await embedAll(items);
    const qEmb = await embedOne(userText);

    const scored = embeds.map((e, i) => ({ i, score: cosine(e, qEmb) }))
                         .sort((a,b)=>b.score-a.score)
                         .slice(0, 5);
    const context = scored.map(({i}) => `Q: ${items[i].question}\nA: ${items[i].answer}`).join("\n\n");

    const system = `You are QUIT IT's support assistant. Keep answers short, friendly, and accurate. Only use the approved info in the context. Do NOT invent medical claims or policies. If the user asks for medical advice, say they should consult their GP. If information is not covered, say you can email support@quititaus.com.au for help.`;

    const prompt = `Approved context:\n${context}\n\nUser: ${userText}`;

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
    });

    const answer = (response.output_text || "").trim();
    const confidence = Number((scored[0]?.score || 0).toFixed(3));
    const needs_handoff = confidence < 0.55 || !answer;

    if (!answer) {
      return res.json({ answer: "I’m not 100% sure on that one! Could you email our team at support@quititaus.com.au so we can help you out?", confidence, needs_handoff: true });
    }
    return res.json({ answer, confidence, needs_handoff });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
}
