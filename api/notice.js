// api/notice.js
// 앱에서 공지사항 설정을 읽어오는 공개 엔드포인트 (anon key 사용)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_settings?select=key,value&key=in.(banner_enabled,banner_text,popup_enabled,popup_text)`,
      { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await r.json();
    const map = Object.fromEntries(rows.map(s => [s.key, s.value]));
    return res.json({
      banner: { enabled: map.banner_enabled === "true", text: map.banner_text || "" },
      popup:  { enabled: map.popup_enabled  === "true", text: map.popup_text  || "" },
    });
  } catch (e) {
    return res.status(500).json({ banner: { enabled: false, text: "" }, popup: { enabled: false, text: "" } });
  }
}
