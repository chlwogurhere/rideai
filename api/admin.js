// api/admin.js
// 관리자 페이지용 데이터 API

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json"
};

async function supabase(path, method = "GET", body = null) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...headers, ...(method !== "GET" ? { "Prefer": "return=representation" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!r.ok) throw new Error(await r.text());
  return method === "DELETE" ? null : r.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action } = req.query;

  try {
    // ── 관리자 로그인 인증
    if (action === "auth") {
      const settings = await supabase("admin_settings?select=key,value");
      const pw = settings.find(s => s.key === "admin_password")?.value;
      if (req.body.password === pw) return res.json({ ok: true });
      return res.status(401).json({ ok: false });
    }

    // ── 대시보드: 기본 통계
    if (action === "stats") {
      const [all, settings] = await Promise.all([
        supabase("analyses?select=created_at,sport,level,focus_skill,score_posture,score_balance,score_skill&order=created_at.desc&limit=1000"),
        supabase("admin_settings?select=key,value")
      ]);

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // 일별 통계 (최근 14일)
      const daily = {};
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        daily[key] = 0;
      }
      all.forEach(a => {
        const key = a.created_at.slice(0, 10);
        if (daily[key] !== undefined) daily[key]++;
      });

      // 종목별
      const bySport = { ski: 0, snowboard: 0 };
      all.forEach(a => { if (a.sport === "ski") bySport.ski++; else bySport.snowboard++; });

      // 레벨별
      const byLevel = { lv1: 0, lv2: 0, lv3: 0, demon: 0, unknown: 0 };
      all.forEach(a => { byLevel[a.level || "unknown"] = (byLevel[a.level || "unknown"] || 0) + 1; });

      // 기술별
      const bySkill = {};
      all.forEach(a => {
        const k = a.focus_skill || "전체";
        bySkill[k] = (bySkill[k] || 0) + 1;
      });

      // 평균 점수
      const scored = all.filter(a => a.score_posture);
      const avgScores = scored.length ? {
        posture: Math.round(scored.reduce((s, a) => s + (a.score_posture || 0), 0) / scored.length),
        balance: Math.round(scored.reduce((s, a) => s + (a.score_balance || 0), 0) / scored.length),
        skill: Math.round(scored.reduce((s, a) => s + (a.score_skill || 0), 0) / scored.length),
      } : { posture: 0, balance: 0, skill: 0 };

      const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));

      return res.json({
        total: all.length,
        today: all.filter(a => a.created_at >= todayStart).length,
        thisWeek: all.filter(a => a.created_at >= weekStart).length,
        daily,
        bySport,
        byLevel,
        bySkill,
        avgScores,
        settings: settingsMap
      });
    }

    // ── 설정 저장
    if (action === "save-setting" && req.method === "POST") {
      const { key, value } = req.body;
      await supabase(
        `admin_settings?key=eq.${encodeURIComponent(key)}`,
        "PATCH",
        { value, updated_at: new Date().toISOString() }
      );
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    console.error("admin error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
