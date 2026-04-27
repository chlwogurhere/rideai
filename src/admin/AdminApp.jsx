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
  const MOCK = {
    scores: [
      { label: "자세", value: 78, color: "#3b82f6" },
      { label: "균형", value: 82, color: "#22c55e" },
      { label: "기술", value: 73, color: "#f59e0b" }
    ],
    feedback: [
      { type: "good", tag: "잘된 점", text: "무릎 굴곡이 일정하게 유지되고 있어서 충격 흡수가 잘 되고 있어요. 전체적으로 보드 위에서 안정감 있게 타고 계세요." },
      { type: "warn", tag: "개선 포인트", text: "상체가 가끔 뒤로 기울어지는 경향이 있어요. 진행방향으로 시선을 두고 상체를 앞으로 기울여보세요." },
      { type: "info", tag: "코치 조언", text: "다음 활강에서는 양손을 허리 높이로 벌리고 시선을 10미터 앞에 두고 내려와보세요." }
    ],
    tips: [
      { text: "시선을 더 멀리 두어보세요", detail: "발끝이 아닌 10~15미터 앞을 보면서 활강하세요. 자연스럽게 상체 자세가 개선됩니다." },
      { text: "양팔을 허리 높이로 벌려보세요", detail: "팔을 몸에서 조금 떨어뜨려 균형추 역할을 하게 하세요. 턴할 때 더 안정적이 됩니다." },
      { text: "앞발에 체중을 더 실어보세요", detail: "상체가 뒤로 기울지 않도록 앞발 쪽으로 체중을 이동해보세요." },
      { text: "무릎 굴곡은 지금처럼 유지하세요", detail: "현재 무릎 사용이 좋습니다. 이 정도 굴곡으로 충격을 흡수하며 계속 연습하세요." }
    ],
    breakdown: [
      { name: "발목·무릎·골반 각도", term: "앵귤레이션", score: 4.2, feedback: "무릎이 안쪽으로 잘 꺾여 있어요. 골반이 살짝 더 들어가면 엣지가 더 깊게 박혀요." },
      { name: "설면과 보드 각도", term: "인클리네이션", score: 3.6, feedback: "보드 기울기가 안정적이에요. 턴 후반에 좀 더 눕혀주면 카빙이 깔끔하게 나와요." },
      { name: "바깥발 체중 집중", term: "외경 압력", score: 3.8, feedback: "턴 시작에 바깥발 압력이 잘 잡혀요. 턴 후반에 안발로 빠지는 경향이 있으니 끝까지 의식해주세요." },
      { name: "체중 앞·뒤 위치", term: "전·중·후경", score: 3.4, feedback: "출발 자세는 좋아요. 턴 중반부터 무게가 뒤로 빠지니 정강이로 부츠 앞을 누르는 느낌으로 가주세요." },
      { name: "압력 들어가는 시점", term: "가압 타이밍", score: 3.9, feedback: "엣지 전환이 부드러워요. 압력이 턴 후반에 몰리니 중반부터 미리 눌러주는 게 좋아요." },
      { name: "골반·중심 안정", term: "", score: 4.0, feedback: "중심이 안정적으로 잡혀 있어요. 좌우 흔들림만 줄이면 더 깔끔한 라인이 나와요." },
      { name: "상체·하체 분리", term: "", score: 4.5, feedback: "상체가 진행 방향을 잘 향하고 있어요. 팔이 살짝 내려가는 순간이 있으니 끝까지 균형을 잡아주세요." }
    ]
  };

  const screens = {
    landing: { label: "메인 화면", bg: "#fff" },
    sport: { label: "종목 선택", bg: "#fff" },
    level: { label: "레벨 선택", bg: "#fff" },
    upload: { label: "영상 업로드", bg: "#fff" },
    loading: { label: "분석 중", bg: "#fff" },
    result: { label: "결과 화면", bg: "#f8fafc" },
  };

  const [current, setCurrent] = useState(phase || "landing");

  const renderScreen = () => {
    switch (current) {
      case "landing": return (
        <div style={{ padding: "28px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <div style={{ width: 36, height: 36, background: "#0d47a1", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14 }}>S</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0d47a1" }}>SNOW<span style={{ color: "#2196f3" }}>RIDE</span></div>
              <div style={{ fontSize: 9, color: C.subtle, letterSpacing: 2 }}>AI COACHING STAFF</div>
            </div>
          </div>
          <div style={{ background: "#f1f5f9", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.primary, marginBottom: 8 }}>SNOWRIDE AI 코칭 스태프</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>스키·스노보드 라이딩 영상을 업로드하면 AI가 KSIA 기준으로 자세를 분석하고 맞춤 피드백을 제공합니다.</div>
          </div>
          {[["🎬", "영상 업로드", "라이딩 영상을 올리면 AI가 자동으로 핵심 장면을 선택해요"], ["🤖", "AI 정밀 분석", "KSIA 기준으로 자세·균형·기술을 코치처럼 분석해드려요"], ["📊", "맞춤 피드백", "잘된 점과 개선 포인트를 슬로우모션과 함께 확인하세요"]].map(([icon, title, desc], i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "10px 12px", background: "#fff", borderRadius: 10, border: `0.5px solid ${C.border}`, marginBottom: 8 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
              <div><div style={{ fontSize: 12, fontWeight: 500, color: C.primary }}>{title}</div><div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{desc}</div></div>
            </div>
          ))}
          <button style={{ width: "100%", padding: "13px 0", borderRadius: 10, border: "none", background: C.primary, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>시작하기</button>
        </div>
      );

      case "sport": return (
        <div style={{ padding: "24px 20px" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.primary, marginBottom: 6 }}>종목 선택</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>분석할 종목을 선택해주세요</div>
          {[["🎿", "스키", "알파인 스키 · KSIA 기준 분석", "#1d4ed8", "#dbeafe"], ["🏂", "스노보드", "프리스타일·카빙 · KSIA 기준 분석", "#7c3aed", "#ede9fe"]].map(([icon, name, desc, color, bg]) => (
            <div key={name} style={{ background: bg, border: `2px solid ${color}`, borderRadius: 14, padding: "20px 18px", marginBottom: 12, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 32 }}>{icon}</span>
                <div><div style={{ fontSize: 16, fontWeight: 600, color }}>{name}</div><div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{desc}</div></div>
              </div>
            </div>
          ))}
        </div>
      );

      case "level": return (
        <div style={{ padding: "24px 20px" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.primary, marginBottom: 6 }}>레벨 선택</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>현재 실력을 선택해주세요</div>
          {[["lv1", "레벨 1", "기초 기술 연습 중", "#22c55e"], ["lv2", "레벨 2", "중급 기술 연습 중", "#3b82f6"], ["lv3", "레벨 3", "고급 기술 연습 중", "#f59e0b"], ["demon", "데몬스트레이터", "전문 지도자 수준", "#ef4444"]].map(([id, name, desc, color]) => (
            <div key={id} style={{ background: "#fff", border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 8, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <div><div style={{ fontSize: 14, fontWeight: 500, color: C.primary }}>{name}</div><div style={{ fontSize: 12, color: C.muted }}>{desc}</div></div>
              </div>
            </div>
          ))}
          <button style={{ width: "100%", padding: "13px 0", borderRadius: 10, border: "none", background: C.primary, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>다음</button>
        </div>
      );

      case "upload": return (
        <div style={{ padding: "24px 20px" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#1d4ed8", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>🏂 스노보드 영상 업로드</div>
          <div style={{ border: "2px dashed #cbd5e1", borderRadius: 14, padding: "40px 20px", textAlign: "center", background: "#f8fafc", marginBottom: 16 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🎬</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.primary, marginBottom: 4 }}>영상을 드래그하거나 클릭</div>
            <div style={{ fontSize: 12, color: C.muted }}>MP4, MOV, AVI · 최대 100MB</div>
          </div>
          <div style={{ background: "#fff", border: `0.5px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: C.primary, marginBottom: 8 }}>기술 선택 (선택 사항)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["전체", "베이직턴", "카빙턴", "슬라이딩턴", "모글", "종합활강"].map(t => (
                <button key={t} style={{ padding: "5px 10px", borderRadius: 99, fontSize: 11, border: t === "카빙턴" ? "2px solid #7c3aed" : `0.5px solid ${C.border}`, background: t === "카빙턴" ? "#ede9fe" : "#fff", color: t === "카빙턴" ? "#7c3aed" : C.muted, cursor: "pointer" }}>{t}</button>
              ))}
            </div>
          </div>
          <button style={{ width: "100%", padding: "13px 0", borderRadius: 10, border: "none", background: "#6366f1", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>분석 시작</button>
        </div>
      );

      case "loading": return (
        <div style={{ padding: "60px 24px", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, border: "4px solid #e2e8f0", borderTop: `4px solid ${C.primary}`, borderRadius: "50%", margin: "0 auto 24px", animation: "spin 1s linear infinite" }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: C.primary, marginBottom: 8 }}>AI가 영상을 분석하고 있어요</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>핵심 장면을 선택하는 중...</div>
          <div style={{ height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: "60%", background: C.primary, borderRadius: 99 }} />
          </div>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 8 }}>60% 완료</div>
        </div>
      );

      case "result": return (
        <div style={{ padding: "16px", background: "#f8fafc", minHeight: 500 }}>
          {/* 종합 점수 */}
          <div style={{ background: "#fff", border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.primary, marginBottom: 10 }}>종합 점수</div>
            {MOCK.scores.map((s, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 12 }}>
                  <span style={{ color: C.muted }}>{s.label}</span>
                  <span style={{ fontWeight: 500 }}>{s.value}점</span>
                </div>
                <div style={{ height: 5, background: "rgba(0,0,0,0.08)", borderRadius: 99 }}>
                  <div style={{ height: "100%", width: s.value + "%", background: s.color, borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
          {/* 장면별 분석 */}
          <div style={{ background: "#fff", border: `0.5px solid ${C.border}`, borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: `0.5px solid ${C.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.primary, marginBottom: 8 }}>장면별 분석</div>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ flex: 1, padding: "8px 6px", borderRadius: 8, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "#15803d" }}>잘된 장면</span>
                  <span style={{ fontSize: 10, background: "#16a34a", color: "#fff", padding: "1px 6px", borderRadius: 99 }}>2</span>
                </div>
                <div style={{ flex: 1, padding: "8px 6px", borderRadius: 8, background: "#f8fafc", border: `0.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: C.muted }}>고쳐볼 장면</span>
                  <span style={{ fontSize: 10, background: "#e2e8f0", color: "#fff", padding: "1px 6px", borderRadius: 99 }}>2</span>
                </div>
              </div>
            </div>
            <div style={{ padding: "10px 14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[{ title: "안정적인 기본자세", type: "good" }, { title: "균형잡힌 라이딩", type: "good" }].map((f, i) => (
                  <div key={i} style={{ background: "#1a1a1a", borderRadius: 8, aspectRatio: "4/3", position: "relative" }}>
                    <div style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(22,163,74,0.9)", color: "#fff", fontSize: 9, padding: "2px 6px", borderRadius: 99 }}>잘된 점</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* 세부 평가 */}
          <div style={{ background: "#fff", border: `0.5px solid ${C.border}`, borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
            <div style={{ background: "#f8fafc", padding: "10px 14px", borderBottom: `0.5px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.primary }}>카빙 롱턴 세부 평가</div>
              <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 500 }}>평균 3.9</span>
            </div>
            <div style={{ padding: "0 14px" }}>
              {MOCK.breakdown.slice(0, 3).map((it, i) => (
                <div key={i} style={{ padding: "10px 0", borderBottom: i < 2 ? `0.5px solid ${C.border}` : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: C.primary }}>{it.name}{it.term && <span style={{ fontWeight: 400, color: C.subtle }}> ({it.term})</span>}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: C.primary }}>{it.score.toFixed(1)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5 }}>{it.feedback}</div>
                </div>
              ))}
              <div style={{ padding: "8px 0", textAlign: "center", fontSize: 10, color: C.subtle }}>··· 나머지 4개 항목 ···</div>
            </div>
          </div>
          {/* 코치 피드백 */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.primary, marginBottom: 8 }}>코치 피드백</div>
            {MOCK.feedback.slice(0, 2).map((f, i) => {
              const bc = { good: "#16a34a", warn: "#dc2626", info: "#2563eb" }[f.type];
              return (
                <div key={i} style={{ background: "#fff", borderLeft: `3px solid ${bc}`, borderRadius: 8, padding: "10px 12px", marginBottom: 6, border: `0.5px solid ${C.border}`, borderLeft: `3px solid ${bc}` }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: bc, marginBottom: 3 }}>{f.tag}</div>
                  <div style={{ fontSize: 11, color: C.primary, lineHeight: 1.5 }}>{f.text}</div>
                </div>
              );
            })}
          </div>
          {/* 팁 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.primary, marginBottom: 8 }}>이렇게 연습해보세요 💡</div>
            {MOCK.tips.slice(0, 2).map((tip, i) => (
              <div key={i} style={{ border: `0.5px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 6 }}>
                <div style={{ padding: "9px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ minWidth: 20, height: 20, background: C.primary, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "#fff", flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontSize: 12, color: C.primary, lineHeight: 1.5 }}>{tip.text}</span>
                </div>
                <div style={{ background: "#f8fafc", borderTop: `0.5px solid ${C.border}`, padding: "7px 12px 7px 40px" }}>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{tip.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );

      default: return null;
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" }}>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", maxHeight: "95vh", width: "100%", maxWidth: 820 }}>

        {/* 왼쪽 — 폰 프레임 */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {/* 폰 외곽 */}
          <div style={{
            width: 375, background: "#1a1a2e", borderRadius: 44, padding: "14px 10px",
            boxShadow: "0 32px 80px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08)"
          }}>
            {/* 노치 */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <div style={{ width: 100, height: 6, background: "#0d0d1a", borderRadius: 99 }} />
            </div>
            {/* 화면 영역 — 실제 앱처럼 스크롤 가능 */}
            <div style={{
              background: current === "result" ? "#f8fafc" : "#fff",
              borderRadius: 30, overflow: "hidden",
              height: "calc(95vh - 80px)", maxHeight: 760,
              display: "flex", flexDirection: "column"
            }}>
              {/* 앱 상단 바 */}
              <div style={{ background: "#0f172a", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <div style={{ width: 28, height: 28, background: "rgba(255,255,255,0.15)", borderRadius: 8 }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: 0.5 }}>SNOW<span style={{ color: "#60a5fa" }}>RIDE</span></div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", letterSpacing: 1.5 }}>AI COACHING STAFF</div>
                </div>
                <div style={{ marginLeft: "auto", fontSize: 9, color: "rgba(255,255,255,0.5)" }}>미리보기</div>
              </div>
              {/* 실제 화면 내용 — 스크롤 가능 */}
              <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
                {renderScreen()}
              </div>
            </div>
            {/* 홈 바 */}
            <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
              <div style={{ width: 120, height: 4, background: "rgba(255,255,255,0.25)", borderRadius: 99 }} />
            </div>
          </div>
        </div>

        {/* 오른쪽 — 탭 + 닫기 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 160 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>화면 미리보기</div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 13, cursor: "pointer", width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
          {Object.entries(screens).map(([key, { label }]) => (
            <button key={key} onClick={() => setCurrent(key)} style={{
              padding: "12px 16px", borderRadius: 12, border: "none", fontSize: 13,
              fontWeight: current === key ? 600 : 400,
              background: current === key ? "#fff" : "rgba(255,255,255,0.1)",
              color: current === key ? C.primary : "rgba(255,255,255,0.7)",
              cursor: "pointer", textAlign: "left", transition: "all 0.15s"
            }}>{label}</button>
          ))}
          <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
            화면 안에서 스크롤하면<br />전체 내용을 볼 수 있어요
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
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
            <input value={note.ver} onChange={e => updateNote(ni, "ver", e.target.value)} style={{ width: 80, padding: "4px 8px", borderRadius: 6, border: `0.5px solid ${C.border}`, fontSize: 12, fontWeight: 500 }} />
            <input value={note.date} onChange={e => updateNote(ni, "date", e.target.value)} style={{ flex: 1, padding: "4px 8px", borderRadius: 6, border: `0.5px solid ${C.border}`, fontSize: 12, color: C.muted }} />
            <button onClick={() => setLatest(ni)} style={{ padding: "3px 8px", borderRadius: 99, border: "none", background: note.isLatest ? C.greenBg : "#e2e8f0", color: note.isLatest ? C.greenText : C.muted, fontSize: 11, cursor: "pointer", fontWeight: note.isLatest ? 500 : 400 }}>{note.isLatest ? "★ 최신" : "최신으로"}</button>
            <button onClick={() => removeNote(ni)} style={{ background: "none", border: "none", color: C.subtle, cursor: "pointer", fontSize: 14, padding: "0 4px" }}>✕</button>
          </div>
          <div style={{ padding: "10px 14px" }}>
            {note.logs.map((log, li) => (
              <div key={li} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <select value={log.type} onChange={e => updateLog(ni, li, "type", e.target.value)} style={{ padding: "4px 6px", borderRadius: 6, border: `0.5px solid ${C.border}`, fontSize: 11, background: "#fff", flexShrink: 0, width: 92 }}>
                  {typeOptions.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
                <input value={log.text} onChange={e => updateLog(ni, li, "text", e.target.value)} placeholder="패치 내용 입력" style={{ flex: 1, padding: "4px 8px", borderRadius: 6, border: `0.5px solid ${C.border}`, fontSize: 12 }} />
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
          <div style={{ maxWidth: 600 }}>
            <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "20px 22px", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.primary, marginBottom: 16 }}>공지사항 설정</div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.primary, marginBottom: 8 }}>표시 방식</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["banner", "상단 배너", "항상 보임, 방해 적음"], ["popup", "팝업 모달", "첫 진입 시 자동 표시"]].map(([val, label, desc]) => (
                    <button key={val} onClick={() => setNoticeType(val)} style={{
                      flex: 1, padding: "10px 12px", borderRadius: 10, border: `2px solid ${noticeType === val ? C.blue : C.border}`,
                      background: noticeType === val ? C.blueBg : "#fff", cursor: "pointer", textAlign: "left"
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: noticeType === val ? C.blueText : C.primary }}>{label}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.primary, marginBottom: 6 }}>공지 내용</div>
                <textarea value={noticeText} onChange={e => setNoticeText(e.target.value)} rows={3} placeholder="공지사항 내용을 입력하세요 (빈칸이면 표시 안 됨)"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 13, resize: "vertical", boxSizing: "border-box", lineHeight: 1.6 }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={noticeEnabled} onChange={e => setNoticeEnabled(e.target.checked)} />
                  <span style={{ fontSize: 13, color: C.primary }}>공지사항 표시 활성화</span>
                </label>
                <button onClick={saveNotice} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.primary, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>저장</button>
              </div>
            </div>
            {noticeText && (
              <div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>미리보기</div>
                {noticeType === "banner" ? (
                  <div style={{ background: C.amberBg, border: `0.5px solid #fcd34d`, borderRadius: 8, padding: "10px 16px", fontSize: 13, color: C.amberText }}>⚠️ {noticeText}</div>
                ) : (
                  <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "20px", textAlign: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.primary, marginBottom: 8 }}>{noticeText}</div>
                    <button style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: C.primary, color: "#fff", fontSize: 13, cursor: "pointer" }}>확인</button>
                  </div>
                )}
              </div>
            )}
            {settingMsg && <div style={{ marginTop: 10, fontSize: 13, color: C.green }}>{settingMsg}</div>}
          </div>
        )}

        {/* ── 설정 ── */}
        {tab === "settings" && (
          <div style={{ maxWidth: 480 }}>
            <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "20px 22px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.primary, marginBottom: 4 }}>관리자 비밀번호 변경</div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>변경 즉시 적용됩니다</div>
              <input type="password" value={adminPw} onChange={e => setAdminPw(e.target.value)} placeholder="새 비밀번호 입력"
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
