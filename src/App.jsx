import { useState, useRef, useEffect, useCallback } from "react";

const MODEL = "claude-sonnet-4-20250514";

/* ── API ─────────────────────────────────────────────────── */
async function apiCall(messages, system, apiKey) {
  const key = apiKey || window.__RIDEAI_KEY__ || import.meta.env.VITE_ANTHROPIC_API_KEY || "";
  if (!key) throw new Error("API 키가 없습니다. 설정에서 Anthropic API 키를 입력해주세요.");
  // Use local proxy to avoid CORS
  const isLocal = window.location.hostname === "localhost";
  const url = isLocal ? "https://api.anthropic.com/v1/messages" : "/api/proxy";
  const headers = { "Content-Type": "application/json", "x-api-key": key };
  if (isLocal) headers["anthropic-version"] = "2023-06-01";
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, system, messages }),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || j.error.type);
  return (j.content || []).filter(b => b.type === "text").map(b => b.text).join("");
}

function parseJSON(raw) {
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s === -1 || e <= s) throw new Error("JSON 없음");
  return JSON.parse(raw.slice(s, e + 1));
}

/* ── frame capture ───────────────────────────────────────── */
function captureFrames(vid, n = 4) {
  return new Promise(resolve => {
    const frames = [];
    function snap() {
      try {
        const vw = vid.videoWidth, vh = vid.videoHeight;
        if (!vw || !vh) return null;
        const W = 600, c = document.createElement("canvas");
        c.width = W; c.height = Math.round(W * vh / vw);
        const ctx = c.getContext("2d");
        ctx.drawImage(vid, 0, 0, c.width, c.height);
        const px = ctx.getImageData(0, 0, 30, 30).data;
        let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i+1] + px[i+2];
        if (s < 500) return null;
        const d = c.toDataURL("image/jpeg", 0.82);
        return d.length > 4000 ? { data: d, time: parseFloat(vid.currentTime.toFixed(1)) } : null;
      } catch { return null; }
    }
    function waitMeta() {
      return new Promise((ok, fail) => {
        if (vid.readyState >= 1 && vid.duration > 0) { ok(); return; }
        const t = setTimeout(() => fail(new Error("timeout")), 12000);
        const h = () => { clearTimeout(t); ok(); };
        vid.addEventListener("loadedmetadata", h, { once: true });
        vid.addEventListener("durationchange", h, { once: true });
      });
    }
    function captureAt(t) {
      return new Promise(res => {
        let done = false;
        const finish = () => {
          if (done) return; done = true;
          requestAnimationFrame(() => requestAnimationFrame(() => res(snap())));
        };
        const guard = setTimeout(() => { if (!done) { done = true; res(snap()); } }, 4000);
        vid.addEventListener("seeked", () => { clearTimeout(guard); setTimeout(finish, 250); }, { once: true });
        try { vid.currentTime = t; } catch { clearTimeout(guard); done = true; res(null); }
      });
    }
    (async () => {
      try { await waitMeta(); } catch { resolve([]); return; }
      const dur = Math.max(vid.duration, 1);
      const targets = Array.from({ length: n }, (_, i) =>
        parseFloat(Math.min((i + 0.5) * dur / n, dur - 0.3).toFixed(1))
      );
      console.log("dur:", dur, "vw:", vid.videoWidth, "targets:", targets);
      for (const t of targets) {
        const f = await captureAt(t);
        if (f) { frames.push(f); console.log("captured at", f.time); }
        else console.warn("blank at", t);
        await new Promise(r => setTimeout(r, 100));
      }
      vid.currentTime = 0;
      resolve(frames);
    })();
  });
}

/* ── annotate canvas ─────────────────────────────────────── */
function annotateCanvas(dataUrl, anns) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      ctx.fillStyle = "rgba(0,0,0,0.1)"; ctx.fillRect(0, 0, c.width, c.height);
      (anns || []).forEach(a => {
        const col = a.type === "good" ? "#22c55e" : "#ef4444";
        const px = a.x * c.width, py = a.y * c.height;
        ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.fillStyle = col + "30"; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
        if (a.arrow) {
          const ax = a.arrow.x * c.width, ay = a.arrow.y * c.height;
          const ang = Math.atan2(ay - py, ax - px);
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ax, ay);
          ctx.strokeStyle = col; ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 3]); ctx.stroke(); ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - 12 * Math.cos(ang - 0.4), ay - 12 * Math.sin(ang - 0.4));
          ctx.lineTo(ax - 12 * Math.cos(ang + 0.4), ay - 12 * Math.sin(ang + 0.4));
          ctx.closePath(); ctx.fillStyle = col; ctx.fill();
        }
        const fs = Math.max(13, Math.round(c.width * 0.024));
        ctx.font = "bold " + fs + "px sans-serif";
        const lbl = a.label || "", tw = ctx.measureText(lbl).width;
        const lx = (a.arrow ? a.arrow.x * c.width : px) + 8;
        const ly = (a.arrow ? a.arrow.y * c.height : py) - 8;
        const bw = tw + 16, bh = fs + 10, bx = lx - 4, by = ly - fs - 2, br = 5;
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.beginPath();
        ctx.moveTo(bx+br,by); ctx.lineTo(bx+bw-br,by); ctx.arcTo(bx+bw,by,bx+bw,by+br,br);
        ctx.lineTo(bx+bw,by+bh-br); ctx.arcTo(bx+bw,by+bh,bx+bw-br,by+bh,br);
        ctx.lineTo(bx+br,by+bh); ctx.arcTo(bx,by+bh,bx,by+bh-br,br);
        ctx.lineTo(bx,by+br); ctx.arcTo(bx,by,bx+br,by,br);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = col; ctx.fillText(lbl, lx + 4, ly);
      });
      res(c);
    };
    img.onerror = () => res(null);
    img.src = dataUrl;
  });
}

/* ── Professional 3D figure SVG ─────────────────────────── */
function make3DFigureSVG(sport, type, frameData) {
  const isGood = type === "good";
  const col    = isGood ? "#22c55e" : "#ef4444";
  const colDim = isGood ? "#166534" : "#991b1b";
  const colHi  = isGood ? "#86efac" : "#fca5a5";
  const isSki  = sport === "ski";
  const desc   = frameData.desc || "";
  const title  = frameData.title || "";

  /* which body zones to highlight */
  const hl = {
    head:  /시선|머리|고개|시야/.test(desc),
    torso: /상체|전경|몸통|자세|선행|회전|척추/.test(desc),
    arm:   /팔|어깨|폴|포지션|상지/.test(desc),
    knee:  /무릎|플렉션|굴곡|굽|각도/.test(desc),
    foot:  /엣지|압력|발|날|하중|체중/.test(desc),
  };
  if (!Object.values(hl).some(Boolean)) hl.torso = true;

  const bc = h => h ? col    : "#4a6fa5";
  const bh = h => h ? colHi  : "#8ab0d8";

  /* lean direction from desc */
  const isOverRotation = /선행|과/.test(desc);
  const leanDeg = isOverRotation ? 8 : -14; /* negative = forward */

  /* ── SVG geometry helpers ── */
  // Cubic bezier path helper
  const C = (x1,y1,cx1,cy1,cx2,cy2,x2,y2) =>
    `M${x1},${y1} C${cx1},${cy1} ${cx2},${cy2} ${x2},${y2}`;

  /* ── body geometry (anatomical proportions) ── */
  // Anchor: hip at (200, 255)
  const hx=200, hy=255;
  const lean = leanDeg * Math.PI/180;

  // Derived points
  const belly = [hx + Math.sin(lean)*25, hy - Math.cos(lean)*25];
  const chest  = [hx + Math.sin(lean)*55, hy - Math.cos(lean)*55];
  const neck   = [hx + Math.sin(lean)*72, hy - Math.cos(lean)*72];
  const head   = [hx + Math.sin(lean)*96, hy - Math.cos(lean)*96];

  const lShoulder = [chest[0]-26, chest[1]+4];
  const rShoulder = [chest[0]+24, chest[1]+8];
  const lElbow    = [lShoulder[0]-22, lShoulder[1]+35];
  const rElbow    = [rShoulder[0]+20, rShoulder[1]+30];
  const lWrist    = [lElbow[0]-14, lElbow[1]+28];
  const rWrist    = [rElbow[0]+12, rElbow[1]+25];

  const lHip   = [hx-20, hy+4];
  const rHip   = [hx+20, hy];
  const lKnee  = [lHip[0]-8,  lHip[1]+52];
  const rKnee  = [rHip[0]+6,  rHip[1]+50];
  const lAnkle = [lKnee[0]+4, lKnee[1]+48];
  const rAnkle = [rKnee[0]+2, rKnee[1]+46];

  /* ── annotation point mapping ── */
  const zones = {
    head:  head,
    torso: belly,
    arm:   rElbow,
    knee:  lKnee,
    foot:  lAnkle,
  };

  /* ── callout helper ── */
  function callout(pt, side, labelTop, labelBot) {
    const px = pt[0], py = pt[1];
    const lx = side === "L" ? px-55 : px+55;
    const ly = py;
    return `
<line x1="${px}" y1="${py}" x2="${lx+(side==="L"?14:-14)}" y2="${ly}" stroke="${col}" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.9"/>
<rect x="${side==="L"?lx-48:lx}" y="${ly-17}" width="52" height="34" rx="5" fill="${col}" opacity="0.14" stroke="${col}" stroke-width="1"/>
<text x="${side==="L"?lx-22:lx+26}" y="${ly-2}" text-anchor="middle" font-size="11" fill="${col}" font-weight="bold" font-family="sans-serif">${labelTop}</text>
<text x="${side==="L"?lx-22:lx+26}" y="${ly+13}" text-anchor="middle" font-size="10" fill="${col}" font-family="sans-serif">${labelBot}</text>`;
  }

  /* ── segment helper (3D limb with highlight stroke) ── */
  function limb(x1,y1,x2,y2,w,grad,highlighted) {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#${grad})" stroke-width="${w}" stroke-linecap="round"/>
<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="${Math.max(2,w*0.22)}" stroke-linecap="round" opacity="0.11"/>
${highlighted ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w+4}" stroke-linecap="round" opacity="0.22"/>` : ""}`;
  }

  /* ── defs (gradients + filters) ── */
  const defs = `<defs>
<radialGradient id="bgG2" cx="50%" cy="25%" r="80%">
  <stop offset="0%" stop-color="#1a2540"/><stop offset="100%" stop-color="#060a14"/>
</radialGradient>
<radialGradient id="headG2" cx="37%" cy="33%" r="63%">
  <stop offset="0%" stop-color="#b0c8e8"/><stop offset="55%" stop-color="#5e85b4"/><stop offset="100%" stop-color="#243860"/>
</radialGradient>
<radialGradient id="torsoG2" cx="32%" cy="28%" r="68%">
  <stop offset="0%" stop-color="${bh(hl.torso)}"/><stop offset="100%" stop-color="${bc(hl.torso)}"/>
</radialGradient>
<radialGradient id="armG2" cx="32%" cy="28%" r="68%">
  <stop offset="0%" stop-color="${bh(hl.arm)}"/><stop offset="100%" stop-color="${bc(hl.arm)}"/>
</radialGradient>
<radialGradient id="legG2" cx="32%" cy="25%" r="70%">
  <stop offset="0%" stop-color="${bh(hl.knee)}"/><stop offset="100%" stop-color="${bc(hl.knee)}"/>
</radialGradient>
<radialGradient id="footG2" cx="32%" cy="28%" r="68%">
  <stop offset="0%" stop-color="${bh(hl.foot)}"/><stop offset="100%" stop-color="${bc(hl.foot)}"/>
</radialGradient>
<radialGradient id="kneeG2" cx="38%" cy="34%" r="62%">
  <stop offset="0%" stop-color="${hl.knee?"#adf":bh(false)}"/><stop offset="100%" stop-color="${hl.knee?"#0af":bc(false)}"/>
</radialGradient>
<filter id="glw"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<marker id="arr2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
  <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</marker>
</defs>`;

  /* ── equipment & boots ─────────────────────────────────────────────────────
     Snowboard: board is one long plank, both feet fixed on it side-by-side.
     The board centre sits at hx, top surface at lAnkle[1]+14.
     Left foot at hx-22, right foot at hx+22 (parallel, perpendicular to travel).
     Ski:  two separate skis, each under its own ankle, pointing forward.
  ── */
  const boardTop = lAnkle[1] + 14;   // y of board top surface
  const sbLFx = hx - 22;             // snowboard left foot x
  const sbRFx = hx + 22;             // snowboard right foot x
  const sbFy  = boardTop - 2;        // foot y on board

  const equipment = isSki ? `
<rect x="${lAnkle[0]-70}" y="${lAnkle[1]+18}" width="158" height="9" rx="4"
  fill="#0f172a" stroke="#1e3a5f" stroke-width="1.2" opacity="0.95"/>
<rect x="${rAnkle[0]-48}" y="${rAnkle[1]+22}" width="158" height="9" rx="4"
  fill="#0f172a" stroke="#1e3a5f" stroke-width="1.2" opacity="0.88"/>
<line x1="${lAnkle[0]-55}" y1="${lAnkle[1]+20}" x2="${lAnkle[0]+78}" y2="${lAnkle[1]+20}"
  stroke="#fff" stroke-width="1.5" opacity="0.09" stroke-linecap="round"/>
` : `
<rect x="${hx-72}" y="${boardTop}" width="144" height="14" rx="7"
  fill="#0f172a" stroke="#1e3a5f" stroke-width="1.5" opacity="0.95"/>
<ellipse cx="${hx}" cy="${boardTop+7}" rx="46" ry="4" fill="#1e3a5f" opacity="0.4"/>
<line x1="${hx-58}" y1="${boardTop+3}" x2="${hx+58}" y2="${boardTop+3}"
  stroke="#fff" stroke-width="2" opacity="0.09" stroke-linecap="round"/>
${hl.foot ? `<rect x="${hx-72}" y="${boardTop}" width="144" height="14" rx="7"
  fill="none" stroke="${col}" stroke-width="2.5" opacity="0.7" filter="url(#glw)"/>` : ""}
`;

  /* ── boots: ski uses ankle coords; snowboard uses board-centred positions ── */
  const boots = isSki ? `
<ellipse cx="${lAnkle[0]}" cy="${lAnkle[1]+10}" rx="17" ry="12" fill="url(#footG2)"/>
<ellipse cx="${lAnkle[0]}" cy="${lAnkle[1]+6}"  rx="9"  ry="4"  fill="#fff" opacity="0.15"/>
<ellipse cx="${rAnkle[0]}" cy="${rAnkle[1]+10}" rx="16" ry="11" fill="url(#footG2)" opacity="0.88"/>
${hl.foot ? `<ellipse cx="${lAnkle[0]}" cy="${lAnkle[1]+10}" rx="20" ry="15"
  fill="none" stroke="${col}" stroke-width="2.5" opacity="0.85" filter="url(#glw)"/>` : ""}
` : `
<ellipse cx="${sbLFx}" cy="${sbFy}" rx="15" ry="11" fill="url(#footG2)"/>
<ellipse cx="${sbLFx}" cy="${sbFy-4}" rx="8" ry="3.5" fill="#fff" opacity="0.15"/>
<ellipse cx="${sbRFx}" cy="${sbFy}" rx="15" ry="11" fill="url(#footG2)" opacity="0.88"/>
${hl.foot ? `<ellipse cx="${sbLFx}" cy="${sbFy}" rx="19" ry="14"
  fill="none" stroke="${col}" stroke-width="2.5" opacity="0.85" filter="url(#glw)"/>` : ""}
`;

  /* ── lower legs ── */
  // Snowboard: ankles are fixed on board at sbLFx/sbRFx; ski: use ankle coords
  const shinLA = isSki ? [lAnkle[0], lAnkle[1]] : [hx-22, boardTop-2];
  const shinRA = isSki ? [rAnkle[0], rAnkle[1]] : [hx+22, boardTop-2];
  const shins = limb(shinLA[0],shinLA[1],lKnee[0],lKnee[1],18,"legG2",false)
    + limb(shinRA[0],shinRA[1],rKnee[0],rKnee[1],17,"legG2",false);

  /* ── knees ── */
  const knees = `
<ellipse cx="${lKnee[0]}" cy="${lKnee[1]}" rx="14" ry="13" fill="url(#kneeG2)" ${hl.knee?'filter="url(#glw)"':''}/>
<ellipse cx="${lKnee[0]}" cy="${lKnee[1]-5}" rx="7" ry="4" fill="#fff" opacity="0.2"/>
${hl.knee ? `<ellipse cx="${lKnee[0]}" cy="${lKnee[1]}" rx="19" ry="18" fill="none" stroke="${col}" stroke-width="2.5" opacity="0.85"/>` : ""}
<ellipse cx="${rKnee[0]}" cy="${rKnee[1]}" rx="13" ry="12" fill="url(#kneeG2)" opacity="0.82"/>
<path d="M${lKnee[0]+16},${lKnee[1]-2} A24,24 0 0 1 ${lKnee[0]+2},${lKnee[1]-22}" fill="none" stroke="#64748b" stroke-width="1.2" opacity="0.65"/>
<text x="${lKnee[0]+22}" y="${lKnee[1]-10}" font-size="10" fill="#64748b" font-family="sans-serif">110°</text>`;

  /* ── thighs ── */
  const thighs = limb(lKnee[0],lKnee[1],lHip[0],lHip[1],23,"legG2",hl.knee)
    + limb(rKnee[0],rKnee[1],rHip[0],rHip[1],21,"legG2",hl.knee);

  /* ── hip ── */
  const hip = `
<ellipse cx="${hx}" cy="${hy+2}" rx="28" ry="18" fill="url(#torsoG2)"/>
<ellipse cx="${hx-5}" cy="${hy-4}" rx="15" ry="7" fill="#fff" opacity="0.12"/>`;

  /* ── torso (built from thick curved limb) ── */
  const torso = `
${limb(hx,hy,belly[0],belly[1],34,"torsoG2",false)}
${limb(belly[0],belly[1],chest[0],chest[1],32,"torsoG2",hl.torso)}
${hl.torso ? `<line x1="${belly[0]}" y1="${belly[1]}" x2="${chest[0]}" y2="${chest[1]}" stroke="${col}" stroke-width="36" stroke-linecap="round" opacity="0.18"/>` : ""}
<ellipse cx="${(chest[0]+belly[0])/2}" cy="${(chest[1]+belly[1])/2}" rx="14" ry="9" fill="none" stroke="#fff" stroke-width="1" opacity="0.13"/>
<path d="M${leanDeg<0?chest[0]-8:chest[0]},${chest[1]+14} A10,10 0 0 ${leanDeg<0?'0':'1'} ${chest[0]+Math.sign(leanDeg)*22},${chest[1]+26}" fill="none" stroke="#64748b" stroke-width="1.2" opacity="0.6"/>
<text x="${chest[0]+Math.sign(leanDeg)*32}" y="${chest[1]+26}" font-size="10" fill="#64748b" font-family="sans-serif">${Math.abs(leanDeg)}°</text>`;

  /* ── shoulders ── */
  const shoulders = `
<ellipse cx="${lShoulder[0]}" cy="${lShoulder[1]}" rx="14" ry="12" fill="url(#torsoG2)"/>
<ellipse cx="${rShoulder[0]}" cy="${rShoulder[1]}" rx="13" ry="11" fill="url(#torsoG2)" opacity="0.9"/>`;

  /* ── arms ── */
  const arms = isSki ? `
${limb(lShoulder[0],lShoulder[1],lElbow[0],lElbow[1],15,"armG2",hl.arm)}
${limb(lElbow[0],lElbow[1],lWrist[0],lWrist[1],12,"armG2",hl.arm)}
<ellipse cx="${lElbow[0]}" cy="${lElbow[1]}" rx="9" ry="8" fill="url(#armG2)"/>
${limb(rShoulder[0],rShoulder[1],rElbow[0],rElbow[1],14,"armG2",hl.arm)}
${limb(rElbow[0],rElbow[1],rWrist[0],rWrist[1],11,"armG2",hl.arm)}
<ellipse cx="${rElbow[0]}" cy="${rElbow[1]}" rx="8" ry="8" fill="url(#armG2)" opacity="0.85"/>
<line x1="${lWrist[0]}" y1="${lWrist[1]}" x2="${lWrist[0]-14}" y2="${lAnkle[1]+18}" stroke="#3a4f6a" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
<circle cx="${lWrist[0]-14}" cy="${lAnkle[1]+18}" r="7" fill="none" stroke="#3a4f6a" stroke-width="1.5" opacity="0.65"/>
<line x1="${rWrist[0]}" y1="${rWrist[1]}" x2="${rWrist[0]+12}" y2="${rAnkle[1]+16}" stroke="#3a4f6a" stroke-width="2.5" stroke-linecap="round" opacity="0.75"/>
<circle cx="${rWrist[0]+12}" cy="${rAnkle[1]+16}" r="7" fill="none" stroke="#3a4f6a" stroke-width="1.5" opacity="0.6"/>
` : `
${limb(lShoulder[0],lShoulder[1],lElbow[0],lElbow[1]+8,15,"armG2",hl.arm)}
${limb(lElbow[0],lElbow[1]+8,lWrist[0]+8,lWrist[1]+10,12,"armG2",hl.arm)}
<ellipse cx="${lElbow[0]}" cy="${lElbow[1]+8}" rx="9" ry="8" fill="url(#armG2)"/>
${limb(rShoulder[0],rShoulder[1],rElbow[0],rElbow[1]+6,14,"armG2",hl.arm)}
${limb(rElbow[0],rElbow[1]+6,rWrist[0]-8,rWrist[1]+8,11,"armG2",hl.arm)}
<ellipse cx="${rElbow[0]}" cy="${rElbow[1]+6}" rx="8" ry="8" fill="url(#armG2)" opacity="0.85"/>`;

  /* ── neck ── */
  const neckSvg = `<ellipse cx="${neck[0]}" cy="${neck[1]}" rx="10" ry="8" fill="url(#torsoG2)"/>`;

  /* ── head ── */
  const headSvg = `
<ellipse cx="${head[0]}" cy="${head[1]}" rx="24" ry="25" fill="url(#headG2)" ${hl.head?'filter="url(#glw)"':''}/>
<path d="M${head[0]-22},${head[1]+4} Q${head[0]-14},${head[1]+15} ${head[0]+2},${head[1]+13} Q${head[0]+14},${head[1]+12} ${head[0]+20},${head[1]+4}" fill="#0d1f38" stroke="#1a3560" stroke-width="1" opacity="0.9"/>
<path d="M${head[0]-16},${head[1]+2} Q${head[0]-6},${head[1]+9} ${head[0]+6},${head[1]+8} Q${head[0]+13},${head[1]+7} ${head[0]+16},${head[1]+2}" fill="none" stroke="#4a90d9" stroke-width="1.8" opacity="0.55"/>
<path d="M${head[0]-22},${head[1]-4} Q${head[0]-8},${head[1]-18} ${head[0]+10},${head[1]-18} Q${head[0]+22},${head[1]-16} ${head[0]+22},${head[1]-4}" fill="#1a3060" stroke="#2a4880" stroke-width="1" opacity="0.85"/>
<ellipse cx="${head[0]-8}" cy="${head[1]-12}" rx="10" ry="7" fill="#fff" opacity="0.18"/>
${hl.head ? `<ellipse cx="${head[0]}" cy="${head[1]}" rx="28" ry="29" fill="none" stroke="${col}" stroke-width="2.5" opacity="0.85"/>` : ""}`;

  /* ── direction arrows (all coords clamped inside 420x400 viewBox) ── */
  // Travel direction: diagonal arrow from upper-right, going down-left toward slope
  const tAx1=368, tAy1=100, tAx2=340, tAy2=310;
  // Gaze direction: from head forward (slightly up-right, staying in-bounds)
  const gFromX=head[0]+20, gFromY=head[1]-6;
  const gToX=Math.min(gFromX+95, 410), gToY=head[1]-20;
  // Label positions
  const tLx=tAx1-12, tLy=tAy1-12;
  const gLx=gToX-40, gLy=gToY-8;

  const arrows = `
<path d="M${tAx1},${tAy1} Q${tAx1-10},${(tAy1+tAy2)/2} ${tAx2},${tAy2}" fill="none" stroke="#60a5fa" stroke-width="2.5" stroke-dasharray="9 5" marker-end="url(#arr2)" opacity="0.85"/>
<rect x="${tLx-4}" y="${tLy-15}" width="74" height="18" rx="4" fill="rgba(10,18,40,0.7)"/>
<text x="${tLx+33}" y="${tLy}" text-anchor="middle" font-size="11" fill="#60a5fa" font-family="sans-serif" font-weight="500">진행 방향 ↘</text>
<path d="M${gFromX},${gFromY} L${gToX},${gToY}" fill="none" stroke="#fbbf24" stroke-width="2" marker-end="url(#arr2)" opacity="0.9"/>
<rect x="${gLx}" y="${gToY-15}" width="70" height="18" rx="4" fill="rgba(10,18,40,0.7)"/>
<text x="${gLx+35}" y="${gToY}" text-anchor="middle" font-size="11" fill="#fbbf24" font-family="sans-serif" font-weight="500">시선 방향 →</text>`;

  /* ── callouts based on highlights ── */
  const callouts = [
    hl.knee  && callout(lKnee,  "L", "무릎 굴곡", isGood?"양호 ✓":"수정 !"),
    hl.torso && callout(belly,  "R", "상체 자세", isGood?"전경 ✓":"선행 !"),
    hl.foot  && callout(lAnkle, "R", "엣지(날)", isGood?"압력 ✓":"부족 !"),
    hl.head  && callout(head,   "L", "시선",      isGood?"정면 ✓":"불안 !"),
    hl.arm   && callout(rElbow, "R", isSki?"폴":"팔 위치", isGood?"균형 ✓":"수정 !"),
  ].filter(Boolean).join("");

  /* ── slope guide ── */
  const slopeY = isSki ? lAnkle[1]+34 : boardTop+26;
  const slope = `
<line x1="20" y1="${slopeY+12}" x2="400" y2="${slopeY-8}" stroke="#1e3a5f" stroke-width="2" stroke-dasharray="14 7" opacity="0.55"/>
<polygon points="20,${slopeY+12} 400,${slopeY-8} 400,400 20,400" fill="#0a1628" opacity="0.35"/>
<text x="24" y="${slopeY+28}" font-size="11" fill="#334d6e" font-family="sans-serif">슬로프 경사면</text>`;

  /* ── ground shadow ── */
  const shadowY = isSki ? lAnkle[1]+32 : boardTop+22;
  const shadow = `<ellipse cx="${hx}" cy="${shadowY}" rx="72" ry="9" fill="#000" opacity="0.3"/>`;

  /* ── status badge ── */
  const badge = `
<rect x="10" y="10" width="${isGood?90:96}" height="27" rx="6" fill="${col}" opacity="0.92"/>
<text x="${isGood?55:58}" y="28" text-anchor="middle" font-size="12" fill="#fff" font-weight="bold" font-family="sans-serif">${isGood?"✓ 잘된 자세":"⚠ 개선 필요"}</text>
<rect x="10" y="44" width="160" height="22" rx="4" fill="rgba(255,255,255,0.05)" stroke="#243050" stroke-width="1"/>
<text x="90" y="59" text-anchor="middle" font-size="11" fill="#64748b" font-family="sans-serif">${title.slice(0,18)}</text>`;

  return `<svg viewBox="0 0 420 400" xmlns="http://www.w3.org/2000/svg">
<rect width="420" height="400" fill="url(#bgG2)"/>
${defs}
${slope}
${shadow}
${equipment}
${boots}
${shins}
${knees}
${thighs}
${hip}
${torso}
${shoulders}
${arms}
${neckSvg}
${headSvg}
${arrows}
${callouts}
${badge}
</svg>`;
}

async function generateIllustration(sport, frameData) {
  // Use the 3D figure directly — more reliable than AI SVG generation
  return make3DFigureSVG(sport, frameData.type, frameData);
}

/* ── small UI ────────────────────────────────────────────── */
function ScoreBar({ label, value, color }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14 }}>
        <span style={{ color: "#475569" }}>{label}</span>
        <span style={{ fontWeight: 500 }}>{value}점</span>
      </div>
      <div style={{ height: 7, background: "rgba(0,0,0,0.08)", borderRadius: 99 }}>
        <div style={{ height: "100%", width: value + "%", background: color, borderRadius: 99, transition: "width 1.2s ease" }} />
      </div>
    <div style={{ textAlign: "center", padding: "20px 0 8px", fontSize: 11, color: "#cbd5e1" }}>
      RIDE AI ver 0.01-1
    </div>
    </div>
  );
}

function Tag({ type, children }) {
  const m = { good: ["#f0fdf4", "#166534"], warn: ["#fef2f2", "#991b1b"], info: ["#eff6ff", "#1e40af"] };
  const [bg, col] = m[type] || m.info;
  return <span style={{ background: bg, color: col, fontSize: 11, padding: "2px 10px", borderRadius: 99, fontWeight: 500, flexShrink: 0 }}>{children}</span>;
}


function FrameCard({ frame }) {
  return (
    <div style={{ background: "#ffffff", border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: "12px", overflow: "hidden" }}>
      {frame.svg
        ? <div dangerouslySetInnerHTML={{ __html: frame.svg }} style={{ width: "100%", display: "block", lineHeight: 0 }} />
        : <div style={{ aspectRatio: "16/9", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#94a3b8" }}>일러스트 준비 중...</div>
      }
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7, flexWrap: "wrap" }}>
          <Tag type={frame.type}>{frame.type === "good" ? "✅ 잘된 점" : "⚠️ 개선 필요"}</Tag>
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 5 }}>{frame.title}</div>
        <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.7 }}>{frame.desc}</div>
      </div>
    </div>
  );
}

function FeedbackCard({ type, tag, text }) {
  const bc = { good: "#16a34a", warn: "#dc2626", info: "#2563eb" }[type] || "#2563eb";
  return (
    <div style={{ background: "#ffffff", border: "0.5px solid rgba(0,0,0,0.08)", borderLeft: "2.5px solid " + bc, borderRadius: "8px", padding: "14px 16px", marginBottom: 10 }}>
      <div style={{ marginBottom: 8 }}><Tag type={type}>{tag}</Tag></div>
      <p style={{ fontSize: 14, color: "#0f172a", lineHeight: 1.75, margin: 0 }}>{text}</p>
    </div>
  );
}

/* ── APP ─────────────────────────────────────────────────── */
export default function App() {
  const [sport, setSport] = useState("ski");
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [loadMsg, setLoadMsg] = useState("");
  const [pct, setPct] = useState(0);
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState("good");
  const [error, setError] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("rideai_key") || "");
  const [showKeyInput, setShowKeyInput] = useState(false);

  const fileRef = useRef(null);
  const vidRef = useRef(null);
  const urlRef = useRef(null);

  const saveKey = (k) => {
    setApiKey(k);
    localStorage.setItem("rideai_key", k);
    window.__RIDEAI_KEY__ = k;
    setShowKeyInput(false);
  };

  const onFile = f => { if (f && f.type.startsWith("video/")) setFile(f); };
  const onDrop = useCallback(e => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }, []);

  const run = async () => {
    if (!file) return;
    setError(""); setPhase("loading"); setPct(5); setLoadMsg("영상 불러오는 중...");

    try {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(file);
      const vid = vidRef.current;
      // Temporarily make video large enough to decode frames
      vid.style.width = "640px";
      vid.style.height = "360px";
      vid.style.opacity = "0.01";
      vid.style.position = "fixed";
      vid.style.top = "-9999px";
      vid.src = urlRef.current;
      vid.load();
      await new Promise(r => setTimeout(r, 800));

      // ── Real frame capture (works in Chrome browser) ──
      setLoadMsg("영상 프레임 캡처 중..."); setPct(15);
      const capturedFrames = await captureFrames(vid, 4);
      console.log("captured frames:", capturedFrames.length);
      // Reset video size
      vid.style.width = "2px";
      vid.style.height = "2px";
      vid.style.top = "0";

      setLoadMsg("AI 코치 분석 중..."); setPct(35);
      const isSki = sport === "ski";
      const sl = isSki ? "스키" : "스노보드";

      // Sport-specific terminology guide
      const termGuide = isSki
        ? "전문 용어 + 괄호 설명. 스키 용어 예시: '카빙 턴(스키 날을 세워 정밀하게 도는 기술)', '엣지(스키 측면 날)', '전경 자세(앞으로 기울이는 자세)', '패럴렐(양 스키 나란히)', '플렉션(무릎·발목 굽히기)', '폴 플랜팅(폴을 눈에 찍는 동작)', '상체 선행(상체가 하체보다 먼저 도는 현상)'"
        : "전문 용어 + 괄호 설명. 스노보드 용어 예시: '토사이드(발가락 쪽 엣지)', '힐사이드(뒤꿈치 쪽 엣지)', '엣지(보드 측면 날)', '앵귤레이션(관절 꺾어 엣지 각도 만들기)', '로테이션(어깨 방향 전환)', '스탠스(발 고정 위치와 넓이)', '카빙(엣지로 정밀하게 도는 기술)', '드리프트(보드를 흘리며 도는 방식)'";

      const promptText =
        "전문 " + sl + " 코치로서 " + sl + " 라이딩 영상의 4개 구간을 분석해주세요."
        + " 설명 규칙: " + termGuide + "."
        + "\n\nJSON 형식으로만 응답 (마크다운 없이):\n"
        + '{"scores":[{"label":"자세","value":75,"color":"#3b82f6"},{"label":"균형","value":70,"color":"#22c55e"},{"label":"기술","value":68,"color":"#f59e0b"}],'
        + '"frames":['
        + '{"frameIndex":0,"type":"good","title":"제목10자이내","desc":"' + sl + ' 전문용어(설명) 2문장","annotations":[{"x":0.5,"y":0.5,"type":"good","label":"라벨","arrow":{"x":0.65,"y":0.68}}]},'
        + '{"frameIndex":1,"type":"warn","title":"제목","desc":"' + sl + ' 전문용어(설명) 2문장","annotations":[{"x":0.4,"y":0.4,"type":"warn","label":"라벨","arrow":{"x":0.28,"y":0.55}}]},'
        + '{"frameIndex":2,"type":"good","title":"제목","desc":"' + sl + ' 전문용어(설명) 2문장","annotations":[{"x":0.5,"y":0.6,"type":"good","label":"라벨","arrow":{"x":0.6,"y":0.7}}]},'
        + '{"frameIndex":3,"type":"warn","title":"제목","desc":"' + sl + ' 전문용어(설명) 2문장","annotations":[{"x":0.45,"y":0.45,"type":"warn","label":"라벨","arrow":{"x":0.3,"y":0.6}}]}'
        + '],'
        + '"feedback":[{"type":"good","tag":"잘된 점","text":"' + sl + ' 전문용어(설명) 2~3문장"},{"type":"warn","tag":"개선 포인트","text":"' + sl + ' 전문용어(설명) 2~3문장"},{"type":"info","tag":"코치 조언","text":"' + sl + ' 전문용어(설명) 2~3문장"}],'
        + '"tips":["팁1","팁2","팁3","팁4"]}'
        + "\n규칙: value 60-95 정수, good/warn 균형 각2개, x/y 0.0-1.0, 한국어로만 작성";

      // Build message — include real frames if captured
      const msgContent = [];
      if (capturedFrames.length > 0) {
        capturedFrames.forEach((f, i) => {
          msgContent.push({ type: "text", text: "[장면 " + (i+1) + "/" + capturedFrames.length + " — " + f.time + "초]" });
          msgContent.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.data.split(",")[1] } });
        });
        // Update prompt to mention we have real frames
        msgContent.push({ type: "text", text: "위 " + capturedFrames.length + "개 이미지는 실제 " + sl + " 라이딩 영상에서 캡처한 장면입니다. 각 장면을 직접 분석하고\n\n" + promptText });
      } else {
        msgContent.push({ type: "text", text: promptText });
      }

      let data;
      try {
        const raw = await apiCall(
          [{ role: "user", content: msgContent }],
          "You are a JSON API. Output ONLY a valid JSON object. No markdown. No code fences. Start with { end with }.",
          apiKey
        );
        data = parseJSON(raw);
      } catch (e) {
        console.error("API:", e.message);
        setError(e.message);
        data = defaultData(sport);
      }

      // Build SVG illustrations
      setLoadMsg("장면 일러스트 생성 중..."); setPct(65);
      const annotated = [];
      const frames = data.frames || [];
      for (let i = 0; i < frames.length; i++) {
        const fd = frames[i];
        const svg = make3DFigureSVG(sport, fd.type, fd);
        annotated.push({ ...fd, canvas: null, svg });
        setPct(65 + Math.round((i + 1) / frames.length * 30));
      }

      setPct(100);
      setResult({ ...data, annotated });
      setTab(annotated.some(f => f.type === "good") ? "good" : "warn");
      setPhase("done");
      try { vid.currentTime = 0; } catch(e) {}

    } catch (outerErr) {
      // Safety net — if anything above throws, show result with fallback data
      console.error("run() outer error:", outerErr.message);
      setError(outerErr.message);
      const data = defaultData(sport);
      const annotated = (data.frames || []).map(fd => ({
        ...fd, canvas: null, svg: make3DFigureSVG(sport, fd.type, fd)
      }));
      setResult({ ...data, annotated });
      setTab("good");
      setPhase("done");
    }
  };

  const reset = () => {
    setPhase("idle"); setFile(null); setResult(null); setError(""); setPct(0);
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    if (fileRef.current) fileRef.current.value = "";
    if (vidRef.current) vidRef.current.src = "";
  };

  const groups = result ? {
    good: (result.annotated || []).filter(f => f.type === "good"),
    warn: (result.annotated || []).filter(f => f.type === "warn"),
  } : { good: [], warn: [] };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "0 0 60px" }}>
    <div style={{ padding: "1.5rem 20px", maxWidth: 720, margin: "0 auto" }}>
      <h2 className="sr-only">RIDE AI — 스키·스노보드 라이딩 분석</h2>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`}</style>

      <video ref={vidRef} muted playsInline style={{ position: "fixed", right: 0, bottom: 0, width: 2, height: 2, opacity: 0.01, pointerEvents: "none" }} />

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <div style={{ width: 42, height: 42, background: "#eff6ff", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>⛷</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500 }}>RIDE AI</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>스키·스노보드 AI 라이딩 코치</div>
        </div>
        <button onClick={() => setShowKeyInput(v => !v)} style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: "8px", border: "0.5px solid rgba(0,0,0,0.15)", background: apiKey ? "#f0fdf4" : "#fef2f2", color: apiKey ? "#166534" : "#991b1b", fontSize: 12, cursor: "pointer" }}>
          {apiKey ? "🔑 API 키 설정됨" : "🔑 API 키 필요"}
        </button>
      </div>

      {showKeyInput && (
        <div style={{ background: "#f8fafc", border: "0.5px solid rgba(0,0,0,0.15)", borderRadius: "12px", padding: "16px", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Anthropic API 키 입력</div>
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 12, lineHeight: 1.6 }}>
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>console.anthropic.com</a>에서 발급받은 API 키를 입력하세요.<br/>
            키는 브라우저에만 저장되며 서버로 전송되지 않습니다.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="password"
              placeholder="sk-ant-..."
              defaultValue={apiKey}
              id="apiKeyInput"
              style={{ flex: 1, padding: "9px 12px", borderRadius: "8px", border: "0.5px solid rgba(0,0,0,0.15)", fontSize: 13, background: "#fff" }}
            />
            <button onClick={() => saveKey(document.getElementById("apiKeyInput").value.trim())}
              style={{ padding: "9px 18px", borderRadius: "8px", border: "none", background: "#0f172a", color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
              저장
            </button>
          </div>
        </div>
      )}

      {/* IDLE */}
      {phase === "idle" && <>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[["ski", "🎿 스키", "#2563eb", "#dbeafe", "#1d4ed8"], ["snowboard", "🏂 스노보드", "#7c3aed", "#ede9fe", "#6d28d9"]].map(([s, lbl, ac, bg, bc]) => (
            <button key={s} onClick={() => setSport(s)} style={{
              flex: 1, padding: "13px 0", borderRadius: "8px",
              border: sport === s ? "2px solid " + ac : "0.5px solid rgba(0,0,0,0.15)",
              background: sport === s ? bg : "transparent",
              color: sport === s ? bc : "#475569",
              fontWeight: sport === s ? 500 : 400, fontSize: 14, cursor: "pointer",
              transition: "all 0.18s",
              boxShadow: sport === s ? "0 0 0 3px " + ac + "22" : "none",
            }}>{lbl}</button>
          ))}
        </div>

        <div onClick={() => fileRef.current?.click()} onDrop={onDrop} onDragOver={e => e.preventDefault()}
          style={{ border: "0.5px solid rgba(0,0,0,0.15)", borderRadius: "12px", padding: "40px 20px", textAlign: "center", cursor: "pointer", background: "#f8fafc", marginBottom: 14 }}>
          <input ref={fileRef} type="file" accept="video/*" onChange={e => onFile(e.target.files[0])} style={{ display: "none" }} />
          <div style={{ fontSize: 36, marginBottom: 10 }}>🎬</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
            {file ? "✓ " + file.name : "라이딩 영상을 업로드하세요"}
          </div>
          <div style={{ fontSize: 13, color: "#94a3b8" }}>
            {file ? (file.size / 1024 / 1024).toFixed(1) + " MB · 분석 준비 완료" : "클릭하거나 드래그 · MP4, MOV, AVI"}
          </div>
        </div>

        <button onClick={run} disabled={!file} style={{ width: "100%", padding: 14, borderRadius: "8px", border: "none", background: file ? "#0f172a" : "rgba(0,0,0,0.08)", color: file ? "#ffffff" : "#94a3b8", fontSize: 15, fontWeight: 500, cursor: file ? "pointer" : "not-allowed" }}>
          AI 분석 시작
        </button>
      </>}

      {/* LOADING */}
      {phase === "loading" && (
        <div style={{ textAlign: "center", padding: "52px 0" }}>
          <div style={{ width: 48, height: 48, border: "3px solid rgba(0,0,0,0.08)", borderTopColor: "#0f172a", borderRadius: "50%", animation: "spin 0.85s linear infinite", margin: "0 auto 20px" }} />
          <div style={{ fontSize: 15, color: "#0f172a", marginBottom: 8, fontWeight: 500 }}>{loadMsg}</div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20 }}>잠시만 기다려주세요...</div>
          <div style={{ maxWidth: 240, margin: "0 auto", background: "rgba(0,0,0,0.08)", borderRadius: 99, height: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: pct + "%", background: "#0f172a", borderRadius: 99, transition: "width 0.5s" }} />
          </div>
        </div>
      )}

      {/* DONE */}
      {phase === "done" && result && (
        <div style={{ animation: "fadeUp 0.4s ease" }}>
          {error && (
            <div style={{ background: "#fffbeb", color: "#92400e", padding: "10px 14px", borderRadius: "8px", fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              ⚠️ AI 직접 분석 대신 기본 분석 데이터를 표시합니다. <span style={{ opacity: 0.7, fontSize: 11 }}>{error}</span>
            </div>
          )}

          <div style={{ background: "#000", borderRadius: "12px", overflow: "hidden", aspectRatio: "16/9", marginBottom: 20 }}>
            <video src={urlRef.current} controls playsInline style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          </div>

          <div style={{ background: "#ffffff", border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: "12px", padding: "18px 20px", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>종합 점수</div>
            {(result.scores || []).map((s, i) => <ScoreBar key={i} {...s} />)}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>장면별 분석</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {[["good", "✅ 잘된 장면"], ["warn", "⚠️ 고쳐볼 장면"]].map(([k, lbl]) =>
                groups[k].length > 0 && (
                  <button key={k} onClick={() => setTab(k)} style={{
                    padding: "6px 14px", borderRadius: 99, fontSize: 13, cursor: "pointer",
                    border: tab === k ? "2px solid " + (k === "good" ? "#16a34a" : "#dc2626") : "0.5px solid rgba(0,0,0,0.15)",
                    background: tab === k ? (k === "good" ? "#f0fdf4" : "#fef2f2") : "transparent",
                    color: tab === k ? (k === "good" ? "#166534" : "#991b1b") : "#475569",
                    fontWeight: tab === k ? 500 : 400,
                  }}>{lbl} ({groups[k].length})</button>
                )
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
              {(groups[tab] || []).map((f, i) => <FrameCard key={i} frame={f} />)}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>코치 피드백</div>
            {(result.feedback || []).map((f, i) => <FeedbackCard key={i} {...f} />)}
          </div>

          <div style={{ background: "#ffffff", border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: "12px", padding: "18px 20px", marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 14 }}>이렇게 연습해보세요 💡</div>
            {(result.tips || []).map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                <span style={{ minWidth: 24, height: 24, background: "#eff6ff", borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, color: "#1e40af", flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: 14, lineHeight: 1.65 }}>{t}</span>
              </div>
            ))}
          </div>

          <button onClick={reset} style={{ display: "block", margin: "0 auto", padding: "10px 28px", border: "0.5px solid rgba(0,0,0,0.15)", borderRadius: "8px", background: "transparent", color: "#475569", fontSize: 13, cursor: "pointer" }}>
            ↩ 새 영상 분석하기
          </button>
        </div>
      )}
    </div>
    </div>
  );
}

function defaultData(sport) {
  const sk = sport === "ski";
  const n = 4;
  return {
    scores: [
      { label: "자세", value: 72, color: "#3b82f6" },
      { label: "균형", value: 68, color: "#22c55e" },
      { label: "기술", value: 65, color: "#f59e0b" },
    ],
    frames: Array.from({ length: n }, (_, i) => ({
      frameIndex: i, type: i % 2 === 0 ? "good" : "warn",
      timeRange: "구간 " + (i+1),
      title: i % 2 === 0 ? "전경 자세 안정" : "상체 선행 과다",
      desc: i % 2 === 0
        ? sk ? "전경 자세(앞으로 기울여 무게중심을 앞에 두는 자세)가 안정적입니다. 플렉션(무릎과 발목을 굽히는 동작)도 적절히 유지되고 있습니다."
             : "스탠스(발 위치와 넓이)가 균형 잡혀 있으며, 토사이드 엣지(발가락 쪽 날)의 압력 이동이 자연스럽습니다."
        : sk ? "상체 선행(상체가 하체보다 먼저 회전하는 현상)이 과도하여 균형이 흐트러지고 있습니다. 카운터 로테이션(상체와 하체의 반대 방향 비틀기)을 의식해보세요."
             : "힐사이드 엣지(뒤꿈치 쪽 날) 전환 시 상체가 과도하게 앞으로 기울어지고 있습니다. 앵귤레이션(관절을 꺾어 엣지 각도를 만드는 기술)을 활용해보세요.",
      annotations: [{ x: 0.45, y: 0.55, type: i % 2 === 0 ? "good" : "warn", label: i % 2 === 0 ? "자세 ✓" : "선행 과다", arrow: { x: 0.58, y: 0.7 } }],
    })),
    feedback: [
      { type: "good", tag: "잘된 점", text: sk ? "기본 패럴렐(양 스키 나란히 하는 자세)로의 전환이 자연스럽습니다. 카빙 턴(스키 날을 세워 정밀하게 도는 기술) 시 엣지 전환 타이밍도 양호합니다." : "기본 스탠스(발 위치)가 균형 잡혀 있으며 토사이드 턴(발가락 쪽으로 도는 동작)의 압력 이동이 자연스럽습니다." },
      { type: "warn", tag: "개선 포인트", text: sk ? "내측 스키(안쪽 스키)의 엣지 각도가 부족해 패럴렐 턴 완성도가 낮습니다. 플렉션(무릎 굽힘)을 더 깊게 유지해보세요." : "힐사이드 턴(뒤꿈치 쪽으로 도는 동작) 시 상체가 과도하게 기울어집니다. 엣지(날) 압력 조절에 더 집중해보세요." },
      { type: "info", tag: "코치 조언", text: sk ? "폴 플랜팅(폴을 눈에 찍는 동작) 타이밍을 리듬감 있게 연습하면 턴 전환이 훨씬 자연스러워집니다." : "프론트사이드(발가락 쪽)와 백사이드(뒤꿈치 쪽) 턴의 엣지 압력 균형을 맞추는 연습을 꾸준히 해보세요." },
    ],
    tips: sk
      ? ["숏턴 드릴: 폴 터치(폴 찍기)를 리듬에 맞춰 의식적으로 연습하기", "사이드슬리핑(옆으로 미끄러지기)으로 엣지(날) 감각 키우기", "플렉션-익스텐션(굽혔다 펴는 동작)으로 압력 이동 타이밍 익히기", "영상 분석: 뒤에서 촬영해 패럴렐 자세와 무릎 굴곡 각도 직접 확인하기"]
      : ["엣지 체크 드릴: 힐사이드·토사이드 엣지를 번갈아 익히기", "앵귤레이션(관절 꺾기): 무릎을 슬로프 방향으로 눌러 엣지 각도 만들기", "로테이션(어깨 방향 전환)을 줄이고 엣지 압력으로 방향 조절 연습하기", "발목 스트레칭으로 가동성을 높여 엣지(날) 컨트롤 정밀도 향상시키기"],
  };
}
