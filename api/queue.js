// ── Upstash Redis 대기열 API ──────────────────────────────────────────────────
const MAX_CONCURRENT = 3; // 동시 분석 최대 인원
const ACTIVE_KEY     = "rideai:active";
const LOCK_TTL       = 120; // 분석 최대 대기 시간 (초)

async function redis(method, ...args) {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const res = await fetch(`${url}/${method}/${args.join("/")}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.result;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action, sessionId } = req.method === "POST"
    ? req.body
    : req.query;

  if (!sessionId) return res.status(400).json({ error: "sessionId required" });

  // ── 입장 요청 ──────────────────────────────────────────────────────────────
  if (action === "enter") {
    const active = parseInt(await redis("get", ACTIVE_KEY) || "0");
    if (active < MAX_CONCURRENT) {
      await redis("incr", ACTIVE_KEY);
      await redis("expire", ACTIVE_KEY, LOCK_TTL);
      return res.json({ status: "go", position: 0, active: active + 1 });
    }
    // 대기열에 추가 (중복 방지)
    const listKey = "rideai:queue";
    const existing = await redis("lpos", listKey, sessionId);
    if (existing !== null) {
      const len = await redis("llen", listKey);
      return res.json({ status: "wait", position: Number(existing) + 1, total: Number(len) });
    }
    const len = await redis("rpush", listKey, sessionId);
    return res.json({ status: "wait", position: Number(len), total: Number(len) });
  }

  // ── 상태 확인 (폴링) ───────────────────────────────────────────────────────
  if (action === "status") {
    const listKey = "rideai:queue";
    const pos = await redis("lpos", listKey, sessionId);
    const active = parseInt(await redis("get", ACTIVE_KEY) || "0");
    if (pos === null) {
      // 대기열에 없음 → 이미 입장됐거나 만료
      return res.json({ status: "go", position: 0, active });
    }
    const posNum = Number(pos);
    // 앞 순서가 빠져나가 내 차례가 됐으면 입장
    if (active < MAX_CONCURRENT && posNum === 0) {
      await redis("lpop", listKey);
      await redis("incr", ACTIVE_KEY);
      await redis("expire", ACTIVE_KEY, LOCK_TTL);
      return res.json({ status: "go", position: 0, active: active + 1 });
    }
    const total = await redis("llen", listKey);
    return res.json({ status: "wait", position: posNum + 1, total: Number(total), active });
  }

  // ── 분석 완료 (자리 반납) ──────────────────────────────────────────────────
  if (action === "done") {
    const active = parseInt(await redis("get", ACTIVE_KEY) || "0");
    if (active > 0) await redis("decr", ACTIVE_KEY);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: "unknown action" });
}
