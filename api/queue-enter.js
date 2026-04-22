// 대기열 입장 API
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const MAX_CONCURRENT = 3; // 동시 최대 분석 수

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
    const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    
    // 현재 활성 분석 수 확인
    const active = parseInt(await kv("get", "rideai:active") || "0");
    
    if (active < MAX_CONCURRENT) {
      // 바로 입장
      await kv("set", "rideai:active", active + 1, "EX", "180");
      return res.json({ status: "go", id, position: 0 });
    }
    
    // 대기열에 추가
    await kv("rpush", "rideai:queue", id);
    await kv("expire", "rideai:queue", "600");
    
    // 내 위치 계산
    const queue = await kv("lrange", "rideai:queue", "0", "-1");
    const position = Array.isArray(queue) ? queue.indexOf(id) + 1 : 1;
    
    return res.json({ status: "wait", id, position, active });
  } catch(e) {
    console.error("queue-enter error:", e);
    // Redis 오류 시 바로 통과 (대기열 없이 진행)
    return res.json({ status: "go", id: "fallback", position: 0 });
  }
}
