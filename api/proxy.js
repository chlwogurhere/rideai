export const config = { api: { bodyParser: { sizeLimit: "20mb" } } };

// ── Rate limit (Upstash Redis) ─────────────────────────────────────────────
const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const RATE_LIMIT = 5;   // 분당 최대 요청 수
const RATE_WINDOW = 60; // 윈도우 (초)

async function checkRateLimit(ip) {
  if (!KV_URL || !KV_TOKEN) return true; // Redis 없으면 통과
  try {
    const key = `rideai:rate:${ip}`;
    const res = await fetch(`${KV_URL}/incr/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const { result: count } = await res.json();
    if (count === 1) {
      // 첫 요청이면 만료 시간 설정
      await fetch(`${KV_URL}/expire/${key}/${RATE_WINDOW}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
    }
    return count <= RATE_LIMIT;
  } catch { return true; } // Redis 오류 시 통과
}

// ── 허용 값 whitelist ──────────────────────────────────────────────────────
const ALLOWED_SPORTS  = ["ski","snowboard"];
const ALLOWED_LEVELS  = ["lv1","lv2","lv3","demon","unknown",""];
const ALLOWED_SKILLS  = ["전체","베이직턴","다이나믹턴","카빙턴","슬라이딩턴","모글","종합활강",""];
const ALLOWED_STANCES = ["regular","goofy",""];

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  const origin = req.headers.origin || "";
  const allowed = ["https://rideai.vercel.app","https://snowride.kr","https://www.snowride.kr","http://localhost:5173","http://localhost:3000"];
  if (allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── Rate limit ────────────────────────────────────────────────────────────
  const ip = getClientIp(req);
  const allowed_req = await checkRateLimit(ip);
  if (!allowed_req) {
    return res.status(429).json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
  }

  // ── Payload 크기 체크 ─────────────────────────────────────────────────────
  const bodySize = JSON.stringify(req.body).length;
  if (bodySize > 15 * 1024 * 1024) {
    return res.status(413).json({ error: "요청 크기가 너무 큽니다. 영상을 줄여서 다시 시도해주세요." });
  }

  // ── 입력값 whitelist 검증 ─────────────────────────────────────────────────
  const { sport, level, stance, focusSkill } = req.body?.meta || {};
  if (sport && !ALLOWED_SPORTS.includes(sport)) {
    return res.status(400).json({ error: "올바르지 않은 요청입니다." });
  }
  if (level && !ALLOWED_LEVELS.includes(level)) {
    return res.status(400).json({ error: "올바르지 않은 요청입니다." });
  }
  if (stance && !ALLOWED_STANCES.includes(stance)) {
    return res.status(400).json({ error: "올바르지 않은 요청입니다." });
  }
  if (focusSkill) {
    const base = ALLOWED_SKILLS.find(s => focusSkill.startsWith(s));
    if (!base) return res.status(400).json({ error: "올바르지 않은 요청입니다." });
  }

  // ── API 키 ────────────────────────────────────────────────────────────────
  const apiKey = req.headers["x-api-key"] || process.env.ANTHROPIC_KEY || "";
  if (!apiKey) return res.status(400).json({ error: "API key required" });

  // ── Claude API 호출 ───────────────────────────────────────────────────────
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    // ── 에러 메시지 정제 ───────────────────────────────────────────────────
    if (!response.ok) {
      const status = response.status;
      if (status === 429) return res.status(429).json({ error: "분석 서버가 바쁩니다. 잠시 후 다시 시도해주세요." });
      if (status === 401) return res.status(401).json({ error: "인증 오류가 발생했습니다." });
      if (status === 400) return res.status(400).json({ error: "요청 형식 오류가 발생했습니다." });
      return res.status(status).json({ error: "분석 중 오류가 발생했습니다. 다시 시도해주세요." });
    }

    return res.status(200).json(data);
  } catch (err) {
    // 내부 에러 메시지 외부 노출 방지
    console.error("proxy error:", err.message);
    return res.status(500).json({ error: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요." });
  }
}
