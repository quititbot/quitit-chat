import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    if (!resend) {
      return res.status(500).json({ ok:false, error: "RESEND_API_KEY not set" });
    }
    const { name, email, message } = req.body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ ok:false, error: "Missing fields" });
    }
    const to = process.env.FALLBACK_TO || "support@quititaus.com.au";
    const from = process.env.SENDER_EMAIL || "QUIT IT Bot <support@quititaus.com.au>";
    await resend.emails.send({
      from,
      to,
      subject: `Chat fallback from ${name}`,
      reply_to: email,
      html: `<p><b>Name:</b> ${name}</p><p><b>Email:</b> ${email}</p><p>${String(message).replace(/</g,"&lt;")}</p>`
    });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e) });
  }
}
