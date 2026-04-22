// 대기열 상태 확인 API
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const MAX_CONCURRENT = 3;

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

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "id required" });

  try {
    const active = parseInt(await kv("get", "rideai:active") || "0");
    const queue = await kv("lrange", "rideai:queue", "0", "-1");
    const queueArr = Array.isArray(queue) ? queue : [];
    const position = queueArr.indexOf(id);

    if (position === -1) {
      // 대기열에 없음 → 이미 통과했거나 만료
      return res.json({ status: "go", position: 0, active });
    }

    if (active < MAX_CONCURRENT) {
      // 자리 남았으면 대기열에서 제거 후 입장
      await kv("lrem", "rideai:queue", "1", id);
      await kv("set", "rideai:active", active + 1, "EX", "180");
      return res.json({ status: "go", position: 0, active: active + 1 });
    }

    return res.json({
      status: "wait",
      position: position + 1,
      active,
      total: queueArr.length
    });
  } catch(e) {
    console.error("queue-status error:", e);
    return res.json({ status: "go", position: 0 });
  }
}
