export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { id, type, sport, timestamp, scores } = req.body;

    // Log to Vercel function logs (visible in Vercel dashboard)
    console.log(JSON.stringify({
      event: "feedback",
      id,
      type,        // "good" | "bad"
      sport,       // "ski" | "snowboard"
      timestamp,
      scores,
    }));

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
