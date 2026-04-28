// src/admin/AdminApp.jsx
// SNOWRIDE 관리자 페이지

import { useState, useEffect, useRef } from "react";

const API = (action, body) =>
  fetch(`/api/admin?action=${action}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {})
  }).then(r => r.json());

/* ── 색상 팔레트 ── */
const C = {
  bg: "#f8fafc", card: "#fff", border: "rgba(0,0,0,0.08)",
  primary: "#0f172a", muted: "#64748b", subtle: "#94a3b8",
  blue: "#2563eb", blueBg: "#dbeafe", blueText: "#1d4ed8",
  green: "#16a34a", greenBg: "#dcfce7", greenText: "#15803d",
  amber: "#d97706", amberBg: "#fef3c7", amberText: "#92400e",
  red: "#dc2626", redBg: "#fee2e2", redText: "#991b1b",
};

/* ── 바 차트 컴포넌트 ── */
function BarChart({ data, color = C.blue }) {
  const max = Math.max(...Object.values(data), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
      {Object.entries(data).map(([key, val]) => (
        <div key={key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ width: "100%", height: Math.max(4, (val / max) * 64), background: val ? color : "#e2e8f0", borderRadius: "3px 3px 0 0", transition: "height 0.6s ease" }} />
          <div style={{ fontSize: 9, color: C.subtle, transform: "rotate(-45deg)", whiteSpace: "nowrap" }}>{key.slice(5)}</div>
        </div>
      ))}
    </div>
  );
}

/* ── 도넛 차트 컴포넌트 ── */
function DonutChart({ data, colors, labels }) {
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (!total) return <div style={{ textAlign: "center", color: C.subtle, fontSize: 12, padding: 16 }}>데이터 없음</div>;
  let offset = 0;
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  const r = 36, cx = 44, cy = 44, circumference = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={88} height={88}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={14} />
        {entries.map(([key, val], i) => {
          const pct = val / total;
          const dash = pct * circumference;
          const el = (
            <circle key={key} cx={cx} cy={cy} r={r} fill="none"
              stroke={colors[i % colors.length]} strokeWidth={14}
              strokeDasharray={`${dash} ${circumference}`}
              strokeDashoffset={-offset * circumference}
              style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }} />
          );
          offset += pct;
          return el;
        })}
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize={14} fontWeight={500} fill={C.primary}>{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill={C.subtle}>총 분석</text>
      </svg>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
        {entries.map(([key, val], i) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: colors[i % colors.length], flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: C.muted, flex: 1 }}>{labels?.[key] || key}</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: C.primary }}>{val}</span>
            <span style={{ fontSize: 10, color: C.subtle }}>({Math.round(val / total * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 앱 미리보기 모달 ── */
function PreviewModal({ phase, onClose }) {
  const [current, setCurrent] = useState(phase || "landing");

  const SCREENS = [
    { id: "landing",  label: "🏠 메인 화면" },
    { id: "sport",    label: "🎿 종목 선택" },
    { id: "level",    label: "📊 레벨 선택" },
    { id: "upload",   label: "🎬 영상 업로드" },
    { id: "loading",  label: "⏳ 분석 중" },
    { id: "done",     label: "📋 결과 화면" },
  ];

  // 화면 바뀔 때 iframe reload
  const iframeRef = useState(null);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" }}>
      <div style={{ display: "flex", gap: 28, alignItems: "flex-start", maxHeight: "95vh", width: "100%", maxWidth: 860 }}>

        {/* 폰 프레임 */}
        <div style={{ flexShrink: 0 }}>
          <div style={{
            width: 390, background: "#1a1a2e", borderRadius: 50, padding: "16px 12px",
            boxShadow: "0 32px 80px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.08)"
          }}>
            {/* 노치 */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
              <div style={{ width: 110, height: 6, background: "#0d0d1a", borderRadius: 99 }} />
            </div>
            {/* iframe 화면 */}
            <div style={{ borderRadius: 32, overflow: "hidden", height: "calc(95vh - 100px)", maxHeight: 780, background: "#f8fafc", position: "relative" }}>
              <iframe
                key={current}
                src={`/?preview=${current}`}
                style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                title={`preview-${current}`}
              />
            </div>
            {/* 홈 바 */}
            <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
              <div style={{ width: 130, height: 4, background: "rgba(255,255,255,0.25)", borderRadius: 99 }} />
            </div>
          </div>
        </div>

        {/* 오른쪽 탭 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>화면 미리보기</div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>✕</button>
          </div>
          {SCREENS.map(s => (
            <button key={s.id} onClick={() => setCurrent(s.id)} style={{
              padding: "13px 16px", borderRadius: 12, border: "none", fontSize: 13,
              fontWeight: current === s.id ? 600 : 400, textAlign: "left",
              background: current === s.id ? "#fff" : "rgba(255,255,255,0.1)",
              color: current === s.id ? C.primary : "rgba(255,255,255,0.75)",
              cursor: "pointer", transition: "all 0.15s"
            }}>{s.label}</button>
          ))}
          <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.7 }}>
            실제 앱 화면이 표시돼요.<br />
            폰 화면 안에서 스크롤 가능해요.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 패치노트 편집기 ── */
function PatchNotesEditor({ initialNotes, onSave }) {
  const [notes, setNotes] = useState(initialNotes || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const addNote = () => setNotes(prev => [{
    ver: `v0.6${Math.floor(Math.random() * 9)}`,
    date: new Date().toLocaleDateString("ko-KR"),
    isLatest: false,
    logs: [{ type: "new", text: "" }]
  }, ...prev]);

  const removeNote = (i) => setNotes(prev => prev.filter((_, idx) => idx !== i));
  const updateNote = (i, key, val) => setNotes(prev => prev.map((n, idx) => idx === i ? { ...n, [key]: val } : n));
  const addLog = (ni) => setNotes(prev => prev.map((n, idx) => idx === ni ? { ...n, logs: [...n.logs, { type: "new", text: "" }] } : n));
  const updateLog = (ni, li, key, val) => setNotes(prev => prev.map((n, idx) => idx === ni ? { ...n, logs: n.logs.map((l, lx) => lx === li ? { ...l, [key]: val } : l) } : n));
  const removeLog = (ni, li) => setNotes(prev => prev.map((n, idx) => idx === ni ? { ...n, logs: n.logs.filter((_, lx) => lx !== li) } : n));
  const setLatest = (i) => setNotes(prev => prev.map((n, idx) => ({ ...n, isLatest: idx === i })));

  const handleSave = async () => {
    setSaving(true);
    await onSave(JSON.stringify(notes));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const typeOptions = [{ v: "new", label: "✦ 새 기능", color: C.green }, { v: "improve", label: "▲ 개선", color: C.blue }, { v: "fix", label: "✕ 버그 수정", color: C.red }];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: C.muted }}>총 {notes.length}개 버전</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addNote} style={{ padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${C.border}`, background: "#fff", fontSize: 12, cursor: "pointer", color: C.primary }}>+ 버전 추가</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: saved ? C.green : C.primary, color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
            {saving ? "저장 중..." : saved ? "✓ 저장됨" : "저장"}
          </button>
        </div>
      </div>
      {notes.map((note, ni) => (
        <div key={ni} style={{ background: "#fff", border: `0.5px solid ${C.border}`, borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
          <div style={{ background: "#f8fafc", padding: "10px 14px", borderBottom: `0.5px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
            <input value={note.ver} onChange={e => updateNote(ni, "ver", e.target.value)} onKeyDown={e=>e.stopPropagation()} style={{ width: 80, padding: "4px 8px", borderRadius: 6, border: `0.5px solid ${C.border}`, fontSize: 12, fontWeight: 500 }} />
            <input value={note.date} onChange={e => updateNote(ni, "date", e.target.value)} onKeyDown={e=>e.stopPropagation()} style={{ flex: 1, padding: "4px 8px", borderRadius: 6, border: `0.5px solid ${C.border}`, fontSize: 12, color: C.muted }} />
            <button onClick={() => setLatest(ni)} style={{ padding: "3px 8px", borderRadius: 99, border: "none", background: note.isLatest ? C.greenBg : "#e2e8f0", color: note.isLatest ? C.greenText : C.muted, fontSize: 11, cursor: "pointer", fontWeight: note.isLatest ? 500 : 400 }}>{note.isLatest ? "★ 최신" : "최신으로"}</button>
            <button onClick={() => removeNote(ni)} style={{ background: "none", border: "none", color: C.subtle, cursor: "pointer", fontSize: 14, padding: "0 4px" }}>✕</button>
          </div>
          <div style={{ padding: "10px 14px" }}>
            {note.logs.map((log, li) => (
              <div key={li} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <select value={log.type} onChange={e => updateLog(ni, li, "type", e.target.value)} style={{ padding: "4px 6px", borderRadius: 6, border: `0.5px solid ${C.border}`, fontSize: 11, background: "#fff", flexShrink: 0, width: 92 }}>
                  {typeOptions.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
                <input value={log.text} onChange={e => updateLog(ni, li, "text", e.target.value)} onKeyDown={e=>e.stopPropagation()} placeholder="패치 내용 입력" style={{ flex: 1, padding: "4px 8px", borderRadius: 6, border: `0.5px solid ${C.border}`, fontSize: 12 }} />
                <button onClick={() => removeLog(ni, li)} style={{ background: "none", border: "none", color: C.subtle, cursor: "pointer", fontSize: 13, flexShrink: 0 }}>✕</button>
              </div>
            ))}
            <button onClick={() => addLog(ni)} style={{ fontSize: 11, color: C.blue, background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>+ 항목 추가</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── 메인 AdminApp ── */
export default function AdminApp() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [stats, setStats] = useState(null);
  const [preview, setPreview] = useState(null);
  const [noticeEnabled, setNoticeEnabled] = useState(false);
  const [noticeType, setNoticeType] = useState("banner");
  const [noticeText, setNoticeText] = useState("");
  // v0.63-9 분리된 배너/팝업 state
  const [bannerEnabled, setBannerEnabled] = useState(false);
  const [bannerText, setBannerText] = useState("");
  const [bannerMsg, setBannerMsg] = useState("");
  const [popupEnabled, setPopupEnabled] = useState(false);
  const [popupText, setPopupText] = useState("");
  const [popupMsg, setPopupMsg] = useState("");
  const [patchNotes, setPatchNotes] = useState([]);
  const [adminPw, setAdminPw] = useState("");
  const [settingMsg, setSettingMsg] = useState("");

  const login = async () => {
    setLoading(true);
    const r = await API("auth", { password: pw });
    setLoading(false);
    if (r.ok) { setAuthed(true); loadData(); }
    else { setPwError(true); setTimeout(() => setPwError(false), 2000); }
  };

  const loadData = async () => {
    const r = await API("stats");
    if (r.total !== undefined) {
      setStats(r);
      const s = r.settings || {};
      setNoticeEnabled(s.notice_enabled === "true");
      setNoticeType(s.notice_type || "banner");
      setNoticeText(s.notice_text || "");
      setBannerEnabled(s.banner_enabled === "true");
      setBannerText(s.banner_text || "");
      setPopupEnabled(s.popup_enabled === "true");
      setPopupText(s.popup_text || "");
      try { setPatchNotes(JSON.parse(s.patch_notes || "[]")); } catch { setPatchNotes([]); }
    }
  };

  const saveSetting = async (key, value) => {
    await API("save-setting", { key, value });
  };

  const saveNotice = async () => {
    await Promise.all([
      saveSetting("notice_enabled", String(noticeEnabled)),
      saveSetting("notice_type", noticeType),
      saveSetting("notice_text", noticeText),
    ]);
    setSettingMsg("저장됐어요!");
    setTimeout(() => setSettingMsg(""), 2000);
  };

  const saveBanner = async () => {
    await Promise.all([
      saveSetting("banner_enabled", String(bannerEnabled)),
      saveSetting("banner_text", bannerText),
    ]);
    setBannerMsg("저장됐어요!");
    setTimeout(() => setBannerMsg(""), 2000);
  };

  const savePopup = async () => {
    await Promise.all([
      saveSetting("popup_enabled", String(popupEnabled)),
      saveSetting("popup_text", popupText),
    ]);
    setPopupMsg("저장됐어요!");
    setTimeout(() => setPopupMsg(""), 2000);
  };

  const saveAdminPw = async () => {
    if (!adminPw.trim()) return;
    await saveSetting("admin_password", adminPw);
    setAdminPw("");
    setSettingMsg("비밀번호가 변경됐어요!");
    setTimeout(() => setSettingMsg(""), 2000);
  };

  const TABS = [
    { id: "dashboard", label: "대시보드" },
    { id: "stats", label: "분석 통계" },
    { id: "preview", label: "화면 미리보기" },
    { id: "patchnotes", label: "패치노트" },
    { id: "notice", label: "공지사항" },
    { id: "settings", label: "설정" },
  ];

  if (!authed) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
      <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 16, padding: "32px 28px", width: 320 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.primary, marginBottom: 4 }}>관리자 로그인</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>SNOWRIDE AI COACHING STAFF</div>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && login()}
          placeholder="관리자 비밀번호"
          style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${pwError ? C.red : "rgba(0,0,0,0.15)"}`, fontSize: 14, marginBottom: 10, boxSizing: "border-box", background: pwError ? "#fef2f2" : "#fff", outline: "none" }} />
        {pwError && <div style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>비밀번호가 올바르지 않습니다.</div>}
        <button onClick={login} disabled={loading} style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: C.primary, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          {loading ? "확인 중..." : "로그인"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Noto Sans KR', sans-serif" }}>
      {/* 헤더 */}
      <div style={{ background: C.primary, padding: "0 24px", display: "flex", alignItems: "center", height: 52 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", flex: 1 }}>SNOWRIDE 관리자</div>
        <a href="/" style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>← 앱으로</a>
      </div>

      {/* 탭 */}
      <div style={{ background: "#fff", borderBottom: `0.5px solid ${C.border}`, padding: "0 24px", display: "flex", gap: 0, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "14px 16px", border: "none", background: "none", fontSize: 13, cursor: "pointer",
            color: tab === t.id ? C.primary : C.muted,
            fontWeight: tab === t.id ? 600 : 400,
            borderBottom: tab === t.id ? `2px solid ${C.primary}` : "2px solid transparent",
            whiteSpace: "nowrap"
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px" }}>

        {/* ── 대시보드 ── */}
        {tab === "dashboard" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
              {[["총 분석수", stats?.total ?? "—", C.blue, C.blueBg], ["오늘", stats?.today ?? "—", C.green, C.greenBg], ["이번 주", stats?.thisWeek ?? "—", C.amber, C.amberBg]].map(([label, val, color, bg]) => (
                <div key={label} style={{ background: bg, borderRadius: 12, padding: "16px 18px" }}>
                  <div style={{ fontSize: 12, color, marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 28, fontWeight: 600, color }}>{val}</div>
                </div>
              ))}
            </div>
            {stats?.daily && (
              <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.primary, marginBottom: 14 }}>최근 14일 일별 분석수</div>
                <BarChart data={stats.daily} color={C.blue} />
              </div>
            )}
          </div>
        )}

        {/* ── 분석 통계 ── */}
        {tab === "stats" && stats && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.primary, marginBottom: 14 }}>종목별</div>
              <DonutChart data={stats.bySport} colors={[C.blue, "#7c3aed"]} labels={{ ski: "스키", snowboard: "스노보드" }} />
            </div>
            <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.primary, marginBottom: 14 }}>레벨별</div>
              <DonutChart data={stats.byLevel} colors={[C.green, C.blue, C.amber, C.red, C.muted]} labels={{ lv1: "레벨 1", lv2: "레벨 2", lv3: "레벨 3", demon: "데몬", unknown: "미선택" }} />
            </div>
            <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", gridColumn: "span 2" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.primary, marginBottom: 14 }}>기술별 분석 현황</div>
              {Object.keys(stats.bySkill).length === 0 ? (
                <div style={{ textAlign: "center", color: C.subtle, fontSize: 12, padding: 16 }}>데이터 없음</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {Object.entries(stats.bySkill).sort((a, b) => b[1] - a[1]).map(([key, val]) => {
                    const total = Object.values(stats.bySkill).reduce((s, v) => s + v, 0);
                    const pct = total ? Math.round(val / total * 100) : 0;
                    return (
                      <div key={key}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 12 }}>
                          <span style={{ color: C.muted }}>{key}</span>
                          <span style={{ fontWeight: 500, color: C.primary }}>{val}회 ({pct}%)</span>
                        </div>
                        <div style={{ height: 5, background: "#e2e8f0", borderRadius: 99 }}>
                          <div style={{ height: "100%", width: pct + "%", background: C.blue, borderRadius: 99 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 화면 미리보기 ── */}
        {tab === "preview" && (
          <div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>각 화면을 선택해서 실제 앱 화면을 미리볼 수 있어요</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { phase: "landing", label: "메인 화면", icon: "🏠", desc: "앱 첫 화면" },
                { phase: "sport", label: "종목 선택", icon: "🎿", desc: "스키/스노보드 선택" },
                { phase: "level", label: "레벨 선택", icon: "📊", desc: "레벨 1~데몬 선택" },
                { phase: "upload", label: "영상 업로드", icon: "🎬", desc: "영상 & 기술 선택" },
                { phase: "loading", label: "분석 중", icon: "⏳", desc: "AI 분석 진행 화면" },
                { phase: "result", label: "결과 화면", icon: "📋", desc: "점수·분석·피드백" },
              ].map(item => (
                <button key={item.phase} onClick={() => setPreview(item.phase)}
                  style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "20px 16px", cursor: "pointer", textAlign: "center" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{item.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.primary, marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{item.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── 패치노트 편집 ── */}
        {tab === "patchnotes" && (
          <PatchNotesEditor
            initialNotes={patchNotes}
            onSave={async (json) => { await saveSetting("patch_notes", json); await loadData(); }}
          />
        )}

        {/* ── 공지사항 ── */}
        {tab === "notice" && (
          <div style={{ maxWidth: 640 }}>

            {/* 배너 */}
            <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "20px 22px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 32, height: 32, background: C.amberBg, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📢</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.primary }}>상단 배너</div>
                  <div style={{ fontSize: 11, color: C.muted }}>앱 상단에 항상 표시 · 방해 적음</div>
                </div>
                <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <div style={{ position: "relative", width: 40, height: 22 }} onClick={() => setBannerEnabled(v => !v)}>
                    <div style={{ position: "absolute", inset: 0, background: bannerEnabled ? C.green : "#e2e8f0", borderRadius: 99, transition: "background 0.2s" }} />
                    <div style={{ position: "absolute", top: 3, left: bannerEnabled ? 21 : 3, width: 16, height: 16, background: "#fff", borderRadius: "50%", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                  </div>
                  <span style={{ fontSize: 12, color: bannerEnabled ? C.greenText : C.muted, fontWeight: 500 }}>{bannerEnabled ? "표시 중" : "숨김"}</span>
                </label>
              </div>
              <textarea value={bannerText} onChange={e => setBannerText(e.target.value)}
                onKeyDown={e => e.stopPropagation()}
                rows={2}
                placeholder="예: 🎿 v0.63 업데이트 — 기술별 세부 평가가 추가됐어요!"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 13, resize: "vertical", boxSizing: "border-box", lineHeight: 1.6, marginBottom: 10 }} />
              {bannerText && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>미리보기</div>
                  <div style={{ background: C.amberBg, border: `0.5px solid #fcd34d`, borderRadius: 8, padding: "9px 16px", fontSize: 13, color: C.amberText, lineHeight: 1.5 }}>
                    {bannerText}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
                {bannerMsg && <span style={{ fontSize: 12, color: C.green }}>{bannerMsg}</span>}
                <button onClick={saveBanner} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: C.primary, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>저장</button>
              </div>
            </div>

            {/* 팝업 */}
            <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 32, height: 32, background: C.blueBg, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>💬</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.primary }}>팝업 모달</div>
                  <div style={{ fontSize: 11, color: C.muted }}>앱 첫 진입 시 자동 표시 · 하루 한 번</div>
                </div>
                <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <div style={{ position: "relative", width: 40, height: 22 }} onClick={() => setPopupEnabled(v => !v)}>
                    <div style={{ position: "absolute", inset: 0, background: popupEnabled ? C.green : "#e2e8f0", borderRadius: 99, transition: "background 0.2s" }} />
                    <div style={{ position: "absolute", top: 3, left: popupEnabled ? 21 : 3, width: 16, height: 16, background: "#fff", borderRadius: "50%", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                  </div>
                  <span style={{ fontSize: 12, color: popupEnabled ? C.greenText : C.muted, fontWeight: 500 }}>{popupEnabled ? "표시 중" : "숨김"}</span>
                </label>
              </div>
              <textarea value={popupText} onChange={e => setPopupText(e.target.value)}
                onKeyDown={e => e.stopPropagation()}
                rows={4}
                placeholder={"예: 안녕하세요 👋\nSNOWRIDE AI 베타 서비스 중입니다.\n분석 결과가 이상하거나 오류가 생기면 결과 화면 하단 피드백 버튼으로 알려주세요 🙏"}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 13, resize: "vertical", boxSizing: "border-box", lineHeight: 1.7, marginBottom: 10 }} />
              {popupText && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>미리보기</div>
                  <div style={{ background: "#fff", border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "20px", textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
                    <div style={{ fontSize: 22, marginBottom: 10 }}>📢</div>
                    <div style={{ fontSize: 13, color: C.primary, lineHeight: 1.8, whiteSpace: "pre-wrap", textAlign: "center", marginBottom: 16, wordBreak: "break-word" }}>
                      {popupText}
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                      <button style={{ padding: "8px 20px", borderRadius: 8, border: `0.5px solid ${C.border}`, background: "#f8fafc", fontSize: 12, cursor: "pointer", color: C.muted }}>오늘 하루 안 보기</button>
                      <button style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: C.primary, color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>확인</button>
                    </div>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
                {popupMsg && <span style={{ fontSize: 12, color: C.green }}>{popupMsg}</span>}
                <button onClick={savePopup} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: C.primary, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>저장</button>
              </div>
            </div>

          </div>
        )}

        {/* ── 설정 ── */}
        {tab === "settings" && (
          <div style={{ maxWidth: 480 }}>
            <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "20px 22px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.primary, marginBottom: 4 }}>관리자 비밀번호 변경</div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>변경 즉시 적용됩니다</div>
              <input type="password" value={adminPw} onChange={e => setAdminPw(e.target.value)} onKeyDown={e=>e.stopPropagation()} placeholder="새 비밀번호 입력"
                style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `0.5px solid ${C.border}`, fontSize: 13, marginBottom: 10, boxSizing: "border-box" }} />
              <button onClick={saveAdminPw} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: C.primary, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>변경</button>
              {settingMsg && <div style={{ marginTop: 10, fontSize: 13, color: C.green }}>{settingMsg}</div>}
            </div>
          </div>
        )}

      </div>

      {preview && <PreviewModal phase={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
