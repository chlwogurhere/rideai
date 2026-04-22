// 분석 완료 시 활성 수 감소 API
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kv(method, ...args) {
  const res = await fetch(`${KV_URL}/${[method,...args].join("/")}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const data = await res.json();
  return data.result;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  try {
    const active = parseInt(await kv("get", "rideai:active") || "0");
    const next = Math.max(0, active - 1);
    if (next === 0) {
      await kv("del", "rideai:active");
    } else {
      await kv("set", "rideai:active", next, "EX", "180");
    }
    return res.json({ ok: true, active: next });
  } catch(e) {
    console.error("queue-done error:", e);
    return res.json({ ok: true });
  }
}
