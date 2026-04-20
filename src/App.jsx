import { useState, useRef, useEffect, useCallback } from "react";

const MODEL = "claude-sonnet-4-20250514";
const VERSION = "ver 0.04-5";

/* ── html2canvas loader ───────────────────────────────────── */
function loadHtml2Canvas() {
  return new Promise((res, rej) => {
    if (window.html2canvas) { res(window.html2canvas); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    s.onload = () => res(window.html2canvas);
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

/* ── MediaPipe Pose Loader ────────────────────────────────── */
let poseDetector = null;

async function loadMediaPipe() {
  if (poseDetector) return poseDetector;
  // Load MediaPipe via CDN
  await new Promise((res, rej) => {
    if (window.Pose) { res(); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return new Promise((res) => {
    const pose = new window.Pose({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${f}`
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    pose.initialize().then(() => {
      poseDetector = pose;
      res(pose);
    });
  });
}

/* ── Pose Analysis: extract joint angles from landmarks ───── */
function calcAngle(a, b, c) {
  // Angle at joint B between segments BA and BC
  const rad = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let deg = Math.abs(rad * 180 / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return Math.round(deg);
}

function calcLean(a, b) {
  // Angle from vertical
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.round(Math.abs(Math.atan2(dx, dy) * 180 / Math.PI));
}

async function extractPoseData(imageDataUrl) {
  try {
    const pose = await loadMediaPipe();
    const img = await new Promise((res, rej) => {
      const el = new Image(); el.onload = () => res(el); el.onerror = rej; el.src = imageDataUrl;
    });
    // Draw to offscreen canvas for MediaPipe
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);

    return await new Promise((res) => {
      pose.onResults(results => {
        if (!results.poseLandmarks) { res(null); return; }
        const lm = results.poseLandmarks;
        // Key landmark indices (MediaPipe Pose)
        // 11=L shoulder, 12=R shoulder, 23=L hip, 24=R hip
        // 25=L knee, 26=R knee, 27=L ankle, 28=R ankle
        // 13=L elbow, 14=R elbow, 15=L wrist, 16=R wrist
        const get = i => ({ x: lm[i].x, y: lm[i].y, z: lm[i].z, v: lm[i].visibility });
        const lShoulder=get(11), rShoulder=get(12);
        const lHip=get(23), rHip=get(24);
        const lKnee=get(25), rKnee=get(26);
        const lAnkle=get(27), rAnkle=get(28);
        const lElbow=get(13), rElbow=get(14);
        const nose=get(0);

        // Mid points
        const midShoulder = { x:(lShoulder.x+rShoulder.x)/2, y:(lShoulder.y+rShoulder.y)/2 };
        const midHip = { x:(lHip.x+rHip.x)/2, y:(lHip.y+rHip.y)/2 };

        const data = {
          // Joint angles
          leftKneeAngle:   calcAngle(lHip, lKnee, lAnkle),
          rightKneeAngle:  calcAngle(rHip, rKnee, rAnkle),
          leftHipAngle:    calcAngle(lShoulder, lHip, lKnee),
          rightHipAngle:   calcAngle(rShoulder, rHip, rKnee),
          leftElbowAngle:  calcAngle(lShoulder, lElbow, get(15)),
          rightElbowAngle: calcAngle(rShoulder, rElbow, get(16)),
          // Torso lean (degrees from vertical)
          torsoLean: calcLean(midHip, midShoulder),
          // Shoulder level difference (balance indicator)
          shoulderDiff: Math.round(Math.abs(lShoulder.y - rShoulder.y) * 100),
          // Hip level difference
          hipDiff: Math.round(Math.abs(lHip.y - rHip.y) * 100),
          // Head/gaze direction
          headForward: lShoulder.x > 0 && rShoulder.x > 0,
          // Visibility confidence
          confidence: Math.round(((lKnee.v + rKnee.v + lHip.v + rHip.v) / 4) * 100),
        };
        res(data);
      });
      pose.send({ image: c });
    });
  } catch(e) {
    console.warn("MediaPipe error:", e.message);
    return null;
  }
}

function formatPoseData(pose, sport) {
  if (!pose || pose.confidence < 40) return null;
  const isSki = sport === "ski";
  const avgKnee = Math.round((pose.leftKneeAngle + pose.rightKneeAngle) / 2);
  const avgHip  = Math.round((pose.leftHipAngle  + pose.rightHipAngle)  / 2);

  // Ideal ranges for ski/snowboard
  const kneeIdeal  = isSki ? [90, 120] : [95, 125];
  const torsoIdeal = isSki ? [5, 20]   : [10, 25];

  const kneeStatus  = avgKnee  < kneeIdeal[0]  ? "과굴곡(너무 많이 굽힘)" : avgKnee  > kneeIdeal[1]  ? "굴곡 부족(더 굽혀야 함)" : "적정 범위";
  const torsoStatus = pose.torsoLean < torsoIdeal[0] ? "직립(더 앞으로 기울여야 함)" : pose.torsoLean > torsoIdeal[1] ? "과도한 전경" : "적정 범위";

  return (
    `[포즈 측정값 — 신뢰도 ${pose.confidence}%]
` +
    `• 무릎 굴곡: 왼쪽 ${pose.leftKneeAngle}° / 오른쪽 ${pose.rightKneeAngle}° (평균 ${avgKnee}°, 권장 ${kneeIdeal[0]}~${kneeIdeal[1]}°) → ${kneeStatus}
` +
    `• 상체 기울기: ${pose.torsoLean}° (권장 ${torsoIdeal[0]}~${torsoIdeal[1]}°) → ${torsoStatus}
` +
    `• 고관절 각도: 왼쪽 ${pose.leftHipAngle}° / 오른쪽 ${pose.rightHipAngle}°
` +
    `• 어깨 수평 차이: ${pose.shoulderDiff}% (0에 가까울수록 수평)
` +
    `• 팔꿈치 각도: 왼쪽 ${pose.leftElbowAngle}° / 오른쪽 ${pose.rightElbowAngle}°`
  );
}

/* ── API ──────────────────────────────────────────────────── */
async function apiCall(messages, system, apiKey) {
  const key = apiKey || window.__RIDEAI_KEY__ || import.meta.env.VITE_ANTHROPIC_KEY || "";
  if (!key) throw new Error("API 키가 없습니다.");
  const isLocal = window.location.hostname === "localhost";
  const url = isLocal ? "https://api.anthropic.com/v1/messages" : "/api/proxy";
  const headers = { "Content-Type": "application/json", "x-api-key": key };
  if (isLocal) headers["anthropic-version"] = "2023-06-01";
  const r = await fetch(url, { method:"POST", headers,
    body: JSON.stringify({ model:MODEL, max_tokens:3000, temperature:0, system, messages }) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || j.error.type);
  return (j.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
}
function parseJSON(raw) {
  const s=raw.indexOf("{"), e=raw.lastIndexOf("}");
  if (s===-1||e<=s) throw new Error("JSON 없음");
  return JSON.parse(raw.slice(s,e+1));
}

/* ── FRAME CAPTURE ────────────────────────────────────────── */
/* ── single frame capture helper ─────────────────────────── */
function waitMeta(vid) {
  return new Promise((ok,fail)=>{
    if(vid.readyState>=1&&vid.duration>0){ok();return;}
    const t=setTimeout(()=>fail(new Error("timeout")),12000);
    const h=()=>{clearTimeout(t);ok();};
    vid.addEventListener("loadedmetadata",h,{once:true});
    vid.addEventListener("durationchange",h,{once:true});
  });
}
function snapFrame(vid, W=420) {
  try {
    const vw=vid.videoWidth, vh=vid.videoHeight;
    if(!vw||!vh) return null;
    const c=document.createElement("canvas");
    c.width=W; c.height=Math.round(W*vh/vw);
    const ctx=c.getContext("2d");
    ctx.drawImage(vid,0,0,c.width,c.height);
    // Brightness check (skip dark/blank frames)
    const px=ctx.getImageData(0,0,40,40).data;
    let bright=0; for(let i=0;i<px.length;i+=4) bright+=px[i]+px[i+1]+px[i+2];
    if(bright<600) return null;
    // Blur/motion check via edge variance
    const center=ctx.getImageData(c.width/2-30,c.height/2-30,60,60).data;
    let variance=0, prev=center[0];
    for(let i=4;i<center.length;i+=4){ const d=Math.abs(center[i]-prev); variance+=d; prev=center[i]; }
    if(variance<200) return null; // too uniform = blank snow / blur
    const d=c.toDataURL("image/jpeg",0.72);
    return d.length>4000?{data:d,time:parseFloat(vid.currentTime.toFixed(2))}:null;
  } catch { return null; }
}
function seekTo(vid, t) {
  return new Promise(res=>{
    let done=false;
    const finish=()=>{ if(done)return; done=true; requestAnimationFrame(()=>requestAnimationFrame(()=>res(snapFrame(vid)))); };
    const guard=setTimeout(()=>{ if(!done){done=true;res(snapFrame(vid));} },4000);
    vid.addEventListener("seeked",()=>{ clearTimeout(guard); setTimeout(finish,250); },{once:true});
    try{ vid.currentTime=t; } catch{ clearTimeout(guard); done=true; res(null); }
  });
}

/* ── Smart candidate capture: skip first/last 10%, filter bad frames ──────── */
async function captureFrames(vid, n=4) {
  try { await waitMeta(vid); } catch { return []; }
  const dur = Math.max(vid.duration, 1);
  const start = dur * 0.10;
  const end   = dur * 0.90;
  const usable = end - start;
  // Sample 10 candidates evenly across usable range
  const CANDIDATES = 8;
  const candidates = [];
  for(let i=0; i<CANDIDATES; i++){
    const raw = start + (i+0.5)*usable/CANDIDATES;
    const t = Math.round(raw*2)/2; // round to 0.5s — same video → same frames
    const f = await seekTo(vid, t);
    if(f) candidates.push(f);
    await new Promise(r=>setTimeout(r,80));
  }
  vid.currentTime=0;
  console.log("candidates:", candidates.length, "of", CANDIDATES);
  return candidates; // return all candidates — AI will pick best 4
}

/* ── GIF-LIKE CLIP: capture ±1s frames around a timestamp ── */
async function captureClip(vid, centerTime, subX, subY, fps=20) {
  const dur = vid.duration || 0;
  if (!dur) return [];
  const start = Math.max(0, centerTime - 1.0);
  const end   = Math.min(dur, centerTime + 1.0);
  const step  = 1 / fps;
  const times = [];
  for (let t = start; t <= end + 0.001; t += step) times.push(parseFloat(t.toFixed(2)));

  const W = 400; // output size (square)
  const frames = [];

  for (const t of times) {
    const frame = await new Promise(res => {
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        try {
          const vw = vid.videoWidth, vh = vid.videoHeight;
          if (!vw || !vh) { res(null); return; }
          const side = Math.round(Math.min(vw, vh) * 0.52);
          let x0 = Math.round(subX * vw - side/2), y0 = Math.round(subY * vh - side/2);
          x0 = Math.max(0, Math.min(vw-side, x0)); y0 = Math.max(0, Math.min(vh-side, y0));
          const c = document.createElement("canvas"); c.width = W; c.height = W;
          c.getContext("2d").drawImage(vid, x0, y0, side, side, 0, 0, W, W);
          res(c.toDataURL("image/jpeg", 0.75));
        } catch { res(null); }
      };
      const guard = setTimeout(() => { if(!done){done=true;res(null);} }, 3000);
      vid.addEventListener("seeked", () => { clearTimeout(guard); setTimeout(finish, 150); }, { once:true });
      try { vid.currentTime = t; } catch { clearTimeout(guard); finish(); }
    });
    if (frame) frames.push({ data: frame, time: t });
    await new Promise(r => setTimeout(r, 50));
  }
  vid.currentTime = centerTime;
  return frames;
}

/* ── ANIMATED CANVAS COMPONENT ───────────────────────────── */
function AnimatedClip({ frames, label }) {
  const ref = useRef(null);
  const idxRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!frames || frames.length === 0) return;
    const imgs = frames.map(f => { const i = new Image(); i.src = f.data; return i; });
    const draw = () => {
      const el = ref.current; if (!el) return;
      const ctx = el.getContext("2d");
      const img = imgs[idxRef.current % imgs.length];
      if (img.complete) ctx.drawImage(img, 0, 0, el.width, el.height);
      idxRef.current++;
      timerRef.current = setTimeout(draw, 80); // ~12fps playback of 20fps = 0.6x slowmo
    };
    // wait for first image
    imgs[0].onload = draw;
    if (imgs[0].complete) draw();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [frames]);

  if (!frames || frames.length === 0) return null;
  return (
    <div style={{ marginTop:10 }}>
      <div style={{ fontSize:11, color:"#94a3b8", marginBottom:4, display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ background:"#f1f5f9", color:"#475569", fontSize:10, padding:"1px 6px", borderRadius:4, fontWeight:500 }}>GIF</span>
        {label}
      </div>
      <canvas ref={ref} width={400} height={400} style={{ width:"100%", borderRadius:8, display:"block" }}/>
    </div>
  );
}

/* ── ANNOTATE CANVAS (crop square around subject click) ───── */
function buildAnnotatedCanvas(frame, subX, subY, anns) {
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      const W=img.width, H=img.height;
      // Square crop centered on subject point
      const side=Math.round(Math.min(W,H)*0.52);
      let x0=Math.round(subX*W-side/2), y0=Math.round(subY*H-side/2);
      x0=Math.max(0,Math.min(W-side,x0));
      y0=Math.max(0,Math.min(H-side,y0));
      const OUT=600, scale=OUT/side;
      const c=document.createElement("canvas"); c.width=OUT; c.height=OUT;
      const ctx=c.getContext("2d");
      ctx.drawImage(img,x0,y0,side,side,0,0,OUT,OUT);
      // Vignette
      const g=ctx.createRadialGradient(OUT/2,OUT/2,OUT*0.28,OUT/2,OUT/2,OUT*0.7);
      g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1,"rgba(0,0,0,0.2)");
      ctx.fillStyle=g; ctx.fillRect(0,0,OUT,OUT);
      // Subject crosshair
      const sx=(subX*W-x0)*scale, sy=(subY*H-y0)*scale;
      ctx.strokeStyle="rgba(255,255,255,0.25)"; ctx.lineWidth=1; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx,OUT); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,sy); ctx.lineTo(OUT,sy); ctx.stroke();
      ctx.setLineDash([]);

      res(c);
    };
    img.onerror=()=>res(null); img.src=frame.data;
  });
}

/* ── 3D SVG FIGURE ────────────────────────────────────────── */
function make3DFigureSVG(sport, type, frameData) {
  const isGood=type==="good", col=isGood?"#22c55e":"#ef4444", colHi=isGood?"#86efac":"#fca5a5";
  const isSki=sport==="ski", desc=frameData.desc||"", title=frameData.title||"";
  const hl={head:/시선|머리/.test(desc),torso:/상체|전경|몸통|자세|선행|회전/.test(desc),
    arm:/팔|어깨|폴/.test(desc),knee:/무릎|플렉션|굴곡/.test(desc),foot:/엣지|압력|발|날/.test(desc)};
  if(!Object.values(hl).some(Boolean)) hl.torso=true;
  const bc=h=>h?col:"#3d5a82", bh=h=>h?colHi:"#7ba7cc";
  const leanDeg=/선행|과/.test(desc)?8:-14, hx=200, hy=255, lean=leanDeg*Math.PI/180;
  const belly=[hx+Math.sin(lean)*25,hy-Math.cos(lean)*25], chest=[hx+Math.sin(lean)*55,hy-Math.cos(lean)*55];
  const head=[hx+Math.sin(lean)*96,hy-Math.cos(lean)*96];
  const lS=[chest[0]-26,chest[1]+4], rS=[chest[0]+24,chest[1]+8];
  const lEl=[lS[0]-22,lS[1]+35], rEl=[rS[0]+20,rS[1]+30];
  const lW=[lEl[0]-14,lEl[1]+28], rW=[rEl[0]+12,rEl[1]+25];
  const lHip=[hx-20,hy+4], rHip=[hx+20,hy];
  const lKnee=[lHip[0]-8,lHip[1]+52], rKnee=[rHip[0]+6,rHip[1]+50];
  const lAnkle=[lKnee[0]+4,lKnee[1]+48], rAnkle=[rKnee[0]+2,rKnee[1]+46];
  const boardTop=lAnkle[1]+14, sbLFx=hx-22, sbRFx=hx+22, sbFy=boardTop-2;
  const L=(x1,y1,x2,y2,w,c2,hi)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c2}" stroke-width="${w}" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="${Math.max(2,w*0.22)}" stroke-linecap="round" opacity="0.11"/>${hi?`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w+4}" stroke-linecap="round" opacity="0.22"/>`:""}`;
  const sY=isSki?lAnkle[1]+34:boardTop+26, shY=isSki?lAnkle[1]+32:boardTop+22;
  const sLA=isSki?[lAnkle[0],lAnkle[1]]:[hx-22,boardTop-2], sRA=isSki?[rAnkle[0],rAnkle[1]]:[hx+22,boardTop-2];
  const defs=`<defs>
<radialGradient id="bg"><stop offset="0%" stop-color="#1a2540"/><stop offset="100%" stop-color="#060a14"/></radialGradient>
<radialGradient id="hg" cx="37%" cy="33%" r="63%"><stop offset="0%" stop-color="#b0c8e8"/><stop offset="55%" stop-color="#5e85b4"/><stop offset="100%" stop-color="#243860"/></radialGradient>
<radialGradient id="tg"><stop offset="0%" stop-color="${bh(hl.torso)}"/><stop offset="100%" stop-color="${bc(hl.torso)}"/></radialGradient>
<radialGradient id="ag"><stop offset="0%" stop-color="${bh(hl.arm)}"/><stop offset="100%" stop-color="${bc(hl.arm)}"/></radialGradient>
<radialGradient id="lg"><stop offset="0%" stop-color="${bh(hl.knee)}"/><stop offset="100%" stop-color="${bc(hl.knee)}"/></radialGradient>
<radialGradient id="fg"><stop offset="0%" stop-color="${bh(hl.foot)}"/><stop offset="100%" stop-color="${bc(hl.foot)}"/></radialGradient>
<radialGradient id="kg"><stop offset="0%" stop-color="${hl.knee?"#adf":bh(false)}"/><stop offset="100%" stop-color="${hl.knee?"#0af":bc(false)}"/></radialGradient>
<filter id="gw"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round"/></marker>
</defs>`;
  return `<svg viewBox="0 0 420 400" xmlns="http://www.w3.org/2000/svg">
<rect width="420" height="400" fill="url(#bg)"/>${defs}
<polygon points="20,${sY+12} 400,${sY-8} 400,400 20,400" fill="#0a1628" opacity="0.35"/>
<line x1="20" y1="${sY+12}" x2="400" y2="${sY-8}" stroke="#1e3a5f" stroke-width="2" stroke-dasharray="14 7" opacity="0.55"/>
<text x="24" y="${sY+28}" font-size="11" fill="#334d6e" font-family="sans-serif">슬로프 경사면</text>
<ellipse cx="${hx}" cy="${shY}" rx="72" ry="9" fill="#000" opacity="0.3"/>
${isSki?`<rect x="${lAnkle[0]-70}" y="${lAnkle[1]+18}" width="158" height="9" rx="4" fill="#0f172a" stroke="#1e3a5f" stroke-width="1.2" opacity="0.95"/>
<rect x="${rAnkle[0]-48}" y="${rAnkle[1]+22}" width="158" height="9" rx="4" fill="#0f172a" stroke="#1e3a5f" stroke-width="1.2" opacity="0.88"/>`:
`<rect x="${hx-72}" y="${boardTop}" width="144" height="14" rx="7" fill="#0f172a" stroke="#1e3a5f" stroke-width="1.5" opacity="0.95"/>
${hl.foot?`<rect x="${hx-72}" y="${boardTop}" width="144" height="14" rx="7" fill="none" stroke="${col}" stroke-width="2.5" opacity="0.7" filter="url(#gw)"/>`:""}`}
${isSki?`<ellipse cx="${lAnkle[0]}" cy="${lAnkle[1]+10}" rx="17" ry="12" fill="url(#fg)"/><ellipse cx="${rAnkle[0]}" cy="${rAnkle[1]+10}" rx="16" ry="11" fill="url(#fg)" opacity="0.88"/>`:
`<ellipse cx="${sbLFx}" cy="${sbFy}" rx="15" ry="11" fill="url(#fg)"/><ellipse cx="${sbRFx}" cy="${sbFy}" rx="15" ry="11" fill="url(#fg)" opacity="0.88"/>`}
${L(sLA[0],sLA[1],lKnee[0],lKnee[1],18,"url(#lg)",false)}${L(sRA[0],sRA[1],rKnee[0],rKnee[1],17,"url(#lg)",false)}
<ellipse cx="${lKnee[0]}" cy="${lKnee[1]}" rx="14" ry="13" fill="url(#kg)" ${hl.knee?'filter="url(#gw)"':''}/>
${hl.knee?`<ellipse cx="${lKnee[0]}" cy="${lKnee[1]}" rx="19" ry="18" fill="none" stroke="${col}" stroke-width="2.5" opacity="0.85"/>`:""}
<ellipse cx="${rKnee[0]}" cy="${rKnee[1]}" rx="13" ry="12" fill="url(#kg)" opacity="0.82"/>
${L(lKnee[0],lKnee[1],lHip[0],lHip[1],23,"url(#lg)",hl.knee)}${L(rKnee[0],rKnee[1],rHip[0],rHip[1],21,"url(#lg)",hl.knee)}
<ellipse cx="${hx}" cy="${hy+2}" rx="28" ry="18" fill="url(#tg)"/>
${L(hx,hy,belly[0],belly[1],34,"url(#tg)",false)}${L(belly[0],belly[1],chest[0],chest[1],32,"url(#tg)",hl.torso)}
<ellipse cx="${lS[0]}" cy="${lS[1]}" rx="14" ry="12" fill="url(#tg)"/><ellipse cx="${rS[0]}" cy="${rS[1]}" rx="13" ry="11" fill="url(#tg)" opacity="0.9"/>
${isSki?`${L(lS[0],lS[1],lEl[0],lEl[1],15,"url(#ag)",hl.arm)}${L(lEl[0],lEl[1],lW[0],lW[1],12,"url(#ag)",hl.arm)}
${L(rS[0],rS[1],rEl[0],rEl[1],14,"url(#ag)",hl.arm)}${L(rEl[0],rEl[1],rW[0],rW[1],11,"url(#ag)",hl.arm)}
<line x1="${lW[0]}" y1="${lW[1]}" x2="${lW[0]-14}" y2="${lAnkle[1]+18}" stroke="#3a4f6a" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
<circle cx="${lW[0]-14}" cy="${lAnkle[1]+18}" r="7" fill="none" stroke="#3a4f6a" stroke-width="1.5" opacity="0.65"/>
<line x1="${rW[0]}" y1="${rW[1]}" x2="${rW[0]+12}" y2="${rAnkle[1]+16}" stroke="#3a4f6a" stroke-width="2.5" stroke-linecap="round" opacity="0.75"/>
<circle cx="${rW[0]+12}" cy="${rAnkle[1]+16}" r="7" fill="none" stroke="#3a4f6a" stroke-width="1.5" opacity="0.6"/>`:
`${L(lS[0],lS[1],lEl[0],lEl[1]+8,15,"url(#ag)",hl.arm)}${L(lEl[0],lEl[1]+8,lW[0]+8,lW[1]+10,12,"url(#ag)",hl.arm)}
${L(rS[0],rS[1],rEl[0],rEl[1]+6,14,"url(#ag)",hl.arm)}${L(rEl[0],rEl[1]+6,rW[0]-8,rW[1]+8,11,"url(#ag)",hl.arm)}`}
<ellipse cx="${head[0]}" cy="${head[1]}" rx="24" ry="25" fill="url(#hg)" ${hl.head?'filter="url(#gw)"':''}/>
<path d="M${head[0]-22},${head[1]+4} Q${head[0]},${head[1]+15} ${head[0]+20},${head[1]+4}" fill="#0d1f38" stroke="#1a3560" stroke-width="1" opacity="0.9"/>
<path d="M${head[0]-16},${head[1]+2} Q${head[0]+6},${head[1]+9} ${head[0]+16},${head[1]+2}" fill="none" stroke="#4a90d9" stroke-width="1.8" opacity="0.55"/>
<ellipse cx="${head[0]-8}" cy="${head[1]-12}" rx="10" ry="7" fill="#fff" opacity="0.18"/>
<path d="M${head[0]+22},${head[1]-8} L${Math.min(head[0]+115,410)},${head[1]-22}" fill="none" stroke="#fbbf24" stroke-width="2" marker-end="url(#ar)" opacity="0.9"/>
<text x="${Math.min(head[0]+118,412)}" y="${head[1]-16}" font-size="11" fill="#fbbf24" font-family="sans-serif" font-weight="500">시선 →</text>
<path d="M368,100 Q355,195 340,310" fill="none" stroke="#60a5fa" stroke-width="2.5" stroke-dasharray="9 5" marker-end="url(#ar)" opacity="0.85"/>
<text x="314" y="90" font-size="11" fill="#60a5fa" font-family="sans-serif" font-weight="500">진행 방향 ↘</text>
<rect x="10" y="10" width="${isGood?90:96}" height="27" rx="6" fill="${col}" opacity="0.92"/>
<text x="${isGood?55:58}" y="28" text-anchor="middle" font-size="12" fill="#fff" font-weight="bold" font-family="sans-serif">${isGood?"✓ 잘된 자세":"⚠ 개선 필요"}</text>
<text x="210" y="395" text-anchor="middle" font-size="11" fill="#64748b" font-family="sans-serif">${title.slice(0,20)}</text>
</svg>`;
}

/* ── UI COMPONENTS ────────────────────────────────────────── */
function Tag({type,children}){const m={good:["#f0fdf4","#166534"],warn:["#fef2f2","#991b1b"],info:["#eff6ff","#1e40af"]};const[bg,col]=m[type]||m.info;return <span style={{background:bg,color:col,fontSize:11,padding:"2px 10px",borderRadius:99,fontWeight:500}}>{children}</span>;}
function ScoreBar({label,value,color}){return(<div style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:14}}><span style={{color:"#475569"}}>{label}</span><span style={{fontWeight:500}}>{value}점</span></div><div style={{height:7,background:"rgba(0,0,0,0.08)",borderRadius:99}}><div style={{height:"100%",width:value+"%",background:color,borderRadius:99,transition:"width 1.2s ease"}}/></div></div>);}
function FeedbackCard({type,tag,text,actionSteps}){
  const bc={good:"#16a34a",warn:"#dc2626",info:"#2563eb"}[type]||"#2563eb";
  const steps = Array.isArray(actionSteps) ? actionSteps : [];
  return(
    <div style={{background:"#fff",border:"0.5px solid rgba(0,0,0,0.08)",borderLeft:"2.5px solid "+bc,borderRadius:8,padding:"14px 16px",marginBottom:10}}>
      <div style={{marginBottom:8}}><Tag type={type}>{tag}</Tag></div>
      <p style={{fontSize:14,color:"#0f172a",lineHeight:1.75,margin:0}}>{text}</p>
      {steps.length>0&&(
        <div style={{borderTop:"0.5px solid rgba(0,0,0,0.07)",marginTop:12,paddingTop:10}}>
          <div style={{fontSize:11,fontWeight:500,color:"#64748b",marginBottom:8,display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:13}}>💡</span> 이렇게 해보세요
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {steps.map((s,i)=>(
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8}}>
                <span style={{minWidth:18,height:18,borderRadius:"50%",background:"#f1f5f9",border:"0.5px solid rgba(0,0,0,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:500,color:"#475569",flexShrink:0,marginTop:1}}>{i+1}</span>
                <span style={{fontSize:13,color:"#475569",lineHeight:1.65}}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FrameCard({frame}){
  const ref=useRef(null);
  const [showGif,setShowGif]=useState(false);
  useEffect(()=>{if(ref.current&&frame.canvas){const el=ref.current;el.width=frame.canvas.width;el.height=frame.canvas.height;el.getContext("2d").drawImage(frame.canvas,0,0);}},[frame.canvas]);
  const hasGif = frame.gifFrames && frame.gifFrames.length > 0;
  return(<div style={{background:"#fff",border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:12,overflow:"hidden"}}>
    {frame.canvas?<canvas ref={ref} style={{width:"100%",display:"block"}}/>:frame.svg?<div dangerouslySetInnerHTML={{__html:frame.svg}} style={{width:"100%",display:"block",lineHeight:0}}/>:<div style={{aspectRatio:"1",background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center",color:"#94a3b8",fontSize:13}}>준비 중...</div>}
    <div style={{padding:"12px 14px"}}>
      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7,flexWrap:"wrap"}}>
        <Tag type={frame.type}>{frame.type==="good"?"✅ 잘된 점":"⚠️ 개선 필요"}</Tag>
        {frame.time!=null&&<span style={{fontSize:11,color:"#94a3b8"}}>{frame.time.toFixed(1)}초</span>}
        {hasGif&&<button onClick={()=>setShowGif(v=>!v)} style={{marginLeft:"auto",fontSize:11,padding:"2px 9px",borderRadius:20,border:"0.5px solid rgba(0,0,0,0.15)",background:showGif?"#0f172a":"transparent",color:showGif?"#fff":"#64748b",cursor:"pointer"}}>
          {showGif?"▶ 사진 보기":"🎞 동영상 보기"}
        </button>}
      </div>
      <div style={{fontSize:13,fontWeight:500,marginBottom:5}}>{frame.title}</div>
      <div style={{fontSize:13,color:"#475569",lineHeight:1.7}}>{frame.desc}</div>
      {hasGif&&showGif&&<AnimatedClip frames={frame.gifFrames} label={"±1초 구간 · 슬로우모션 · "+frame.gifFrames.length+"프레임"}/>}
    </div>
  </div>);
}

/* ── SUBJECT PICKER ───────────────────────────────────────── */
function SubjectPicker({frames,onDone}){
  const [cur,setCur]=useState(0);
  const [picks,setPicks]=useState({});
  const imgRef=useRef(null);
  const handleClick=e=>{
    const r=imgRef.current.getBoundingClientRect();
    const x=(e.clientX-r.left)/r.width, y=(e.clientY-r.top)/r.height;
    setPicks(p=>({...p,[cur]:{x,y}}));
  };
  const next=()=>{ if(cur<frames.length-1) setCur(c=>c+1); else onDone(picks); };
  const skip=()=>{ if(cur<frames.length-1) setCur(c=>c+1); else onDone(picks); };
  const frame=frames[cur], pick=picks[cur];
  return(<div>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:18}}>
      {frames.map((_,i)=><div key={i} style={{width:30,height:30,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600,background:i<cur?"#22c55e":i===cur?"#0f172a":"#e2e8f0",color:i<=cur?"#fff":"#64748b"}}>{i<cur?"✓":i+1}</div>)}
      <span style={{fontSize:13,color:"#64748b",marginLeft:4}}>장면 {cur+1} / {frames.length}</span>
    </div>
    <div style={{fontSize:16,fontWeight:600,marginBottom:6,color:"#0f172a"}}>분석할 라이더를 클릭하세요</div>
    <div style={{fontSize:13,color:"#64748b",marginBottom:14}}>AI가 선택한 장면입니다. 사진에서 라이더를 클릭하면 해당 위치를 중심으로 확대해서 보여드립니다.</div>
    <div style={{position:"relative",borderRadius:12,overflow:"hidden",cursor:"crosshair",marginBottom:14,border:"2px solid "+(pick?"#22c55e":"#e2e8f0")}}>
      <img ref={imgRef} src={frame.data} onClick={handleClick} alt="frame" style={{width:"100%",display:"block"}}/>
      {pick&&<div style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none"}}>
        <div style={{position:"absolute",left:(pick.x*100)+"%",top:0,bottom:0,width:1,background:"rgba(34,197,94,0.55)",transform:"translateX(-50%)"}}/>
        <div style={{position:"absolute",top:(pick.y*100)+"%",left:0,right:0,height:1,background:"rgba(34,197,94,0.55)",transform:"translateY(-50%)"}}/>
        <div style={{position:"absolute",left:(pick.x*100)+"%",top:(pick.y*100)+"%",width:26,height:26,background:"#22c55e",borderRadius:"50%",border:"3px solid #fff",transform:"translate(-50%,-50%)",boxShadow:"0 2px 10px rgba(0,0,0,0.4)"}}/>
        <div style={{position:"absolute",left:"calc("+(pick.x*100)+"% + 16px)",top:"calc("+(pick.y*100)+"% - 24px)",background:"rgba(0,0,0,0.75)",color:"#22c55e",fontSize:11,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap"}}>선택됨</div>
      </div>}
      <div style={{position:"absolute",top:8,left:8,background:"rgba(0,0,0,0.65)",color:"#fff",fontSize:11,padding:"3px 8px",borderRadius:6}}>{frame.time.toFixed(1)}초</div>
    </div>
    <div style={{display:"flex",gap:8}}>
      <button onClick={skip} style={{flex:1,padding:"12px 0",borderRadius:8,border:"0.5px solid rgba(0,0,0,0.15)",background:"transparent",color:"#64748b",fontSize:14,cursor:"pointer"}}>건너뛰기</button>
      <button onClick={next} disabled={!pick} style={{flex:2,padding:"12px 0",borderRadius:8,border:"none",background:pick?"#0f172a":"#e2e8f0",color:pick?"#fff":"#94a3b8",fontSize:14,fontWeight:600,cursor:pick?"pointer":"not-allowed"}}>
        {cur<frames.length-1?"다음 장면 →":"분석 시작 →"}
      </button>
    </div>
  </div>);
}

/* ── STEP BAR ─────────────────────────────────────────────── */
/* ── History helpers (localStorage, max 5, 7-day TTL) ────── */
const HISTORY_KEY = "rideai_history";
const MAX_HISTORY = 5;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw);
    const now = Date.now();
    return all.filter(h => now - h.savedAt < TTL_MS);
  } catch { return []; }
}

function saveHistory(entry) {
  try {
    let all = loadHistory();
    all.unshift(entry);
    if (all.length > MAX_HISTORY) all = all.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
  } catch(e) { console.warn("history save failed:", e); }
}

const STEPS=["종목 선택","영상 추가","분석","피사체 선택","피드백"];
function StepBar({current}){
  const idx={sport:0,upload:1,loading:2,picking:3,done:4}[current]??0;
  return(<div style={{display:"flex",alignItems:"flex-start",marginBottom:28}}>
    {STEPS.map((s,i)=>(
      <div key={i} style={{display:"flex",alignItems:"center",flex:i<STEPS.length-1?1:"none"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
          <div style={{width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,flexShrink:0,background:i<idx?"#22c55e":i===idx?"#0f172a":"#e2e8f0",color:i<=idx?"#fff":"#94a3b8"}}>{i<idx?"✓":i+1}</div>
          <span style={{fontSize:10,color:i<=idx?"#0f172a":"#94a3b8",whiteSpace:"nowrap"}}>{s}</span>
        </div>
        {i<STEPS.length-1&&<div style={{flex:1,height:2,background:i<idx?"#22c55e":"#e2e8f0",margin:"0 4px",marginBottom:16}}/>}
      </div>
    ))}
  </div>);
}

/* ── Share Frame Card (separate component — no hooks in map) ── */
function ShareFrameCard({frame}){
  const isGood=frame.type==="good";
  const col=isGood?"#166534":"#991b1b";
  const bg=isGood?"#f0fdf4":"#fef2f2";

  // Convert canvas to data URL so html2canvas can capture it as <img>
  const imgSrc = frame.canvas
    ? frame.canvas.toDataURL("image/jpeg", 0.9)
    : null;

  return(
    <div style={{background:"#fff",borderRadius:10,overflow:"hidden",border:"0.5px solid rgba(0,0,0,0.08)"}}>
      {imgSrc
        ? <img src={imgSrc} style={{width:"100%",display:"block"}} alt="분석장면"/>
        : frame.svg
          ? <div dangerouslySetInnerHTML={{__html:frame.svg}} style={{width:"100%",display:"block",lineHeight:0}}/>
          : <div style={{aspectRatio:"1",background:"#f8fafc"}}/>
      }
      <div style={{padding:"8px 10px",background:bg}}>
        <div style={{fontSize:11,fontWeight:600,color:col,marginBottom:3}}>{isGood?"✅ 잘된 점":"⚠️ 개선 필요"}{frame.time!=null?" · "+frame.time.toFixed(1)+"초":""}</div>
        <div style={{fontSize:11,fontWeight:500,marginBottom:2}}>{frame.title}</div>
        <div style={{fontSize:10,color:"#475569",lineHeight:1.5}}>{frame.desc}</div>
      </div>
    </div>
  );
}

/* ── MAIN APP ─────────────────────────────────────────────── */
export default function App(){
  const [authed,setAuthed]=useState(()=>sessionStorage.getItem("rideai_auth")==="ok");
  const [saving,setSaving]=useState(false);

  const [feedback,setFeedback]=useState(null); // null | 'good' | 'bad'
  const [feedbackDone,setFeedbackDone]=useState(false);
  const [stars,setStars]=useState(0);
  const [comment,setComment]=useState("");
  const [starDone,setStarDone]=useState(false);
  const analysisIdRef = useRef(null);
  const resultRef = useRef(null);
  const shareRef = useRef(null);

  // Build a share-optimized canvas: no video, both good+warn frames shown
  const submitStarFeedback = async () => {
    if (starDone || stars === 0) return;
    setStarDone(true);
    try {
      await fetch("https://script.google.com/macros/s/AKfycbz812_V3-2MKcMKetwBuGLNcsr7Rd5ofOT-2V8VdpSjZZYlJfbc9QLOOnwHKYkpgKg96g/exec", {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport,
          stars,
          comment,
          score_pose:    result?.scores?.[0]?.value || "",
          score_balance: result?.scores?.[1]?.value || "",
        }),
      });
    } catch(e) { console.warn("sheet feedback failed:", e.message); }
  };

  const submitFeedback = async (type) => {
    if (feedbackDone) return;
    setFeedback(type);
    // Save to localStorage to prevent duplicate
    const aid = analysisIdRef.current || "unknown";
    localStorage.setItem("rideai_fb_"+aid, "done");
    // Send to proxy for logging (best-effort)
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: aid,
          type,
          sport,
          timestamp: new Date().toISOString(),
          scores: result?.scores || [],
        }),
      });
    } catch(e) { console.warn("feedback send failed:", e.message); }
    setTimeout(() => setFeedbackDone(true), 1000);
  };

  const buildShareCanvas = async () => {
    const h2c = await loadHtml2Canvas();
    // Temporarily show both tabs by rendering share-specific element
    const shareEl = shareRef.current;
    if (!shareEl) throw new Error("shareRef not found");
    shareEl.style.display = "block";
    await new Promise(r => setTimeout(r, 100)); // wait for render
    const canvas = await h2c(shareEl, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#f8fafc",
      scale: 2,
      logging: false,
      ignoreElements: el => el.tagName === "VIDEO",
    });
    shareEl.style.display = "none";
    return canvas;
  };

  const saveAsImage = async () => {
    setSaving(true);
    try {
      const canvas = await buildShareCanvas();
      const link = document.createElement("a");
      const today = new Date().toLocaleDateString("ko-KR").replace(/\. /g,"-").replace(".","");
      link.download = "RIDEAI_분석결과_" + today + ".png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch(e) {
      console.error("save failed:", e);
      alert("저장 중 오류가 발생했습니다: " + e.message);
    }
    setSaving(false);
  };

  const shareResult = async () => {
    setSaving(true);
    try {
      const canvas = await buildShareCanvas();
      canvas.toBlob(async (blob) => {
        const file = new File([blob], "RIDEAI_분석결과.png", { type: "image/png" });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: "RIDE AI 라이딩 분석 결과",
            text: "AI가 분석한 내 라이딩 자세입니다 🎿 rideai.vercel.app",
            files: [file],
          });
        } else {
          const link = document.createElement("a");
          link.download = "RIDEAI_분석결과.png";
          link.href = URL.createObjectURL(blob);
          link.click();
        }
      }, "image/png");
    } catch(e) {
      console.error("share failed:", e);
    }
    setSaving(false);
  };
  const [pwInput,setPwInput]=useState("");
  const [pwError,setPwError]=useState(false);

  const BETA_PW = "gompang2"; // 비밀번호 변경 시 여기만 수정

  const tryAuth = () => {
    if(pwInput.trim()===BETA_PW){
      sessionStorage.setItem("rideai_auth","ok");
      setAuthed(true); setPwError(false);
    } else {
      setPwError(true);
      setTimeout(()=>setPwError(false),2000);
    }
  };

  const [sport,setSport]=useState("ski");
  const [file,setFile]=useState(null);
  const [phase,setPhase]=useState("sport"); // sport | upload | loading | picking | done | history
  const [history,setHistory]=useState(()=>loadHistory());
  const [selectedHistory,setSelectedHistory]=useState(null);
  const [loadMsg,setLoadMsg]=useState("");
  const [pct,setPct]=useState(0);
  const [capturedFrames,setCapturedFrames]=useState([]);
  const [rawData,setRawData]=useState(null);
  const [result,setResult]=useState(null);
  const [tab,setTab]=useState("good");
  const [error,setError]=useState("");
  const [apiKey,setApiKey]=useState(()=>localStorage.getItem("rideai_key")||"");
  const [showKeyInput,setShowKeyInput]=useState(false);
  const fileRef=useRef(null),vidRef=useRef(null),urlRef=useRef(null);
  const fileTooLarge = file && file.size > 100*1024*1024;

  const saveKey=k=>{setApiKey(k);localStorage.setItem("rideai_key",k);window.__RIDEAI_KEY__=k;setShowKeyInput(false);};
  const onFile=f=>{if(f&&f.type.startsWith("video/")){setFile(f);setPhase("upload");}};
  const onDrop=useCallback(e=>{e.preventDefault();onFile(e.dataTransfer.files[0]);;},[]);

  const runAnalysis=async()=>{
    setError("");setPhase("loading");setPct(5);setLoadMsg("영상 불러오는 중...");
    try{
      if(urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current=URL.createObjectURL(file);
      const vid=vidRef.current;
      vid.style.cssText="width:640px;height:360px;opacity:0.01;position:fixed;top:-9999px";
      vid.src=urlRef.current; vid.load();
      await new Promise(r=>setTimeout(r,700));

      setLoadMsg("후보 장면 추출 중...");setPct(15);
      // Use user-selected range if set, otherwise full video
      const frames=await captureFrames(vid, 4);
      vid.style.cssText="width:2px;height:2px;opacity:0.01;position:fixed;top:0";
      console.log("captured:",frames.length);
      setCapturedFrames(frames);

      // ── MediaPipe pose extraction for each candidate frame ──
      setLoadMsg("관절 각도 측정 중...");setPct(30);
      const poseDataList = [];
      try {
        await loadMediaPipe();
        for (const f of frames) {
          const pd = await extractPoseData(f.data);
          poseDataList.push(pd);
          console.log("pose at", f.time, pd);
        }
      } catch(e) {
        console.warn("MediaPipe load failed:", e.message);
        frames.forEach(() => poseDataList.push(null));
      }

      setLoadMsg("AI가 최적 장면 선택 중...");setPct(45);
      const isSki=sport==="ski", sl=isSki?"스키":"스노보드";
      // KSIA 기반 코칭 기준
      const ksiaRef = isSki ? `
[KSIA 스키 등급별 핵심 기준 — 대한스키지도자연맹]
레벨1 수준: 스노우플라우턴(V자 형태로 속도 조절하며 방향 전환), 스템턴(한쪽 스키를 벌려 시작하는 턴), 베이직 롱턴(큰 반경으로 리드미컬하게 내려오기), 베이직 숏턴(짧은 반경으로 연속 방향 전환)
레벨2 수준: 패러렐 롱턴(양 스키 나란히 유지하며 카빙), 패러렐 숏턴(빠른 리듬으로 연속 패러렐 턴), 종합활강(다양한 기술 자연스럽게 연결)
레벨3/데몬 수준: 모든 기술을 어느 사면에서나 완벽하게 표현, 상체와 하체의 분리가 명확, 엣지 체인지 타이밍과 압력 이동이 정교함

잘된 자세 공통 포인트: 상체가 안정적이고 진행 방향을 향함, 무릎이 자연스럽게 굽혀져 충격을 흡수, 리듬감 있게 연속 동작, 양 스키(보드)에 균형 있는 압력
개선 필요 공통 포인트: 상체가 먼저 돌아가거나 뒤로 빠짐, 무릎이 너무 펴지거나 안쪽으로 쏠림, 턴 리듬이 일정하지 않음, 한쪽에만 체중이 쏠림` :
`[KSIA 스노보드 등급별 핵심 기준 — 대한스키지도자연맹]
레벨1 수준: 힐사이드·토사이드 기본 엣지 전환, 가로지르기와 방향 전환의 기초
레벨2 수준: 카빙 롱턴(엣지를 세워 정밀하게 호를 그리며 도는 기술), 숏턴(짧은 리듬으로 연속 방향 전환), 제한활강
레벨3/데몬 수준: 토사이드·힐사이드 전환이 부드럽고 리듬감 있음, 상체 로테이션 타이밍이 정교, 어떤 설면에서도 안정적

잘된 자세 포인트: 엣지 전환이 부드럽고 리듬이 일정, 상체가 안정적이며 불필요한 움직임 없음, 양발에 균형 있는 체중 분배
개선 필요 포인트: 엣지 전환 시 상체가 먼저 돌거나 뒤로 빠짐, 힐사이드·토사이드 한쪽이 불안정, 리듬이 깨지거나 속도 조절이 안됨`;

      const termGuide = ksiaRef;

      const msgContent=[];
      if(frames.length>0){
        msgContent.push({type:"text",text:
          "아래 "+frames.length+"개 이미지는 "+sl+" 라이딩 영상에서 균등하게 추출한 후보 장면입니다. "+
          "1. MediaPipe 포즈 데이터는 참고만 하고, 이미지를 직접 보고 자세를 판단하세요.\\n"+
          "2. 라이더가 잘 보이는 장면 중 잘된 2개, 개선 필요 2개를 선택하세요.\\n"+
          "3. 각도 수치(°)는 절대 언급하지 마세요.\\n"+
          "4. KSIA 기준으로 코치가 슬로프에서 직접 말하듯 자연스럽게 설명하세요."
        });
        frames.forEach((f,i)=>{
          const pd = poseDataList[i];
          const poseText = pd ? formatPoseData(pd, sport) : null;
          msgContent.push({type:"text",text:
            "[후보 "+i+" — "+f.time+"초]" +
            (poseText ? "\n" + poseText : "\n[포즈 감지 실패 — 라이더가 잘 안 보이는 장면]")
          });
          msgContent.push({type:"image",source:{type:"base64",media_type:"image/jpeg",data:f.data.split(",")[1]}});
        });
      }
      const maxIdx = Math.max(frames.length-1, 0);
      msgContent.push({type:"text",text:
        "당신은 KSIA(대한스키지도자연맹) 기준의 전문 "+sl+" 코치입니다.\n"+termGuide+"\n\n[코칭 언어 규칙] 각도 수치 언급 금지. 슬로프 옆에서 직접 코칭하듯 자연스럽게. 잘된 점은 구체적 칭찬, 개선점은 방법 제시.\n"+"위 후보 장면 중 라이더가 잘 보이는 4개를 선택하세요. "+
        "\n\nJSON으로만 응답(마크다운 없이):\n"+
        '{"scores":[{"label":"자세","value":75,"color":"#3b82f6"},{"label":"균형","value":70,"color":"#22c55e"},{"label":"기술","value":68,"color":"#f59e0b"}],'+
        '"frames":['+
        '{"frameIndex":0,"type":"good","title":"제목10자이내","desc":"코칭 말투로 2문장. 잘된 이유 구체적으로"},'+
        '{"frameIndex":3,"type":"warn","title":"제목","desc":"코칭 말투로 2문장. 어떻게 고치면 좋을지 방법까지"},'+
        '{"frameIndex":6,"type":"good","title":"제목","desc":"전문용어(설명) 2문장"},'+
        '{"frameIndex":9,"type":"warn","title":"제목","desc":"전문용어(설명) 2문장"}'+
        '],'+
        '"feedback":[{"type":"good","tag":"잘된 점","text":"KSIA 기준 잘된 부분 2~3문장","actionSteps":["구체적 동작1","동작2"]},{"type":"warn","tag":"개선 포인트","text":"개선방법 2~3문장","actionSteps":["언제어떻게 구체동작1","구체동작2"]},{"type":"info","tag":"코치 조언","text":"코칭 2~3문장","actionSteps":["구체동작1","구체동작2"]}],'+
        '"tips":[{"text":"드릴팁1","detail":"구체적으로 어떻게 하는지 2문장"},{"text":"팁2","detail":"구체적 설명"},{"text":"팁3","detail":"구체적 설명"},{"text":"팁4","detail":"구체적 설명"}]}'+
        "\n규칙: frameIndex는 0~"+maxIdx+" 중 실제 라이더가 보이는 장면 선택, value 60-95, good 2개+warn 2개, 한국어."+
        " 동일한 입력에 대해 항상 동일한 분석 결과를 출력하세요. 점수와 선택 장면이 일관되어야 합니다. 스노보드 종목일 경우 폴(pole)이 없으므로 폴 관련 언급 절대 금지."
      });

      let data;
      try{
        const raw=await apiCall([{role:"user",content:msgContent}],"You are a JSON API. Output ONLY a valid JSON object. No markdown. No code fences.",apiKey);
        data=parseJSON(raw);
      }catch(e){
        console.error("API:",e.message);setError(e.message);data=defaultData(sport);
      }
      setPct(90);setRawData(data);
      if(frames.length>0){setPhase("picking");}
      else{
        const annotated=(data.frames||[]).map(fd=>({...fd,canvas:null,svg:make3DFigureSVG(sport,fd.type,fd),time:null}));
        setResult({...data,annotated});setTab(annotated.some(f=>f.type==="good")?"good":"warn");setPhase("done");
      }
      try{vid.currentTime=0;}catch(e){}
    }catch(outerErr){
      console.error("run:",outerErr.message);setError(outerErr.message);
      const data=defaultData(sport);
      const annotated=(data.frames||[]).map(fd=>({...fd,canvas:null,svg:make3DFigureSVG(sport,fd.type,fd),time:null}));
      setResult({...data,annotated});setTab("good");setPhase("done");
    }
  };

  const onPicksDone=async(picks)=>{
    setPhase("loading");setLoadMsg("피사체 기반 정밀 분석 중...");setPct(40);
    const isSki=sport==="ski", sl=isSki?"스키":"스노보드";

    // ── 2nd pass: send cropped subject images to AI for precise analysis ──
    const pickedFrames=[];
    for(let i=0;i<capturedFrames.length;i++){
      const frame=capturedFrames[i], pick=picks[i];
      if(!frame||!pick) continue;
      // Build a cropped image centered on the subject pick
      const cropped=await new Promise(res=>{
        const img=new Image(); img.onload=()=>{
          const W=img.width,H=img.height,side=Math.round(Math.min(W,H)*0.52);
          let x0=Math.round(pick.x*W-side/2),y0=Math.round(pick.y*H-side/2);
          x0=Math.max(0,Math.min(W-side,x0)); y0=Math.max(0,Math.min(H-side,y0));
          const c=document.createElement("canvas"); c.width=320; c.height=320;
          c.getContext("2d").drawImage(img,x0,y0,side,side,0,0,500,500);
          res(c.toDataURL("image/jpeg",0.65));
        }; img.src=frame.data;
      });
      pickedFrames.push({data:cropped,time:frame.time,frameIdx:i});
    }

    let refinedData=rawData;
    if(pickedFrames.length>0){
      try{
        setLoadMsg("피사체 정밀 분석 중...");setPct(55);
        const msg2=[];
        msg2.push({type:"text",text:"아래는 라이더를 중심으로 정밀하게 크롭한 "+pickedFrames.length+"개 장면입니다. 라이더의 자세를 세밀하게 재분석하여 더 정확한 코칭 피드백을 제공하세요. 신체 부위(무릎 굴곡, 상체 기울기, 팔 위치, 시선)를 구체적으로 분석하세요."});
        pickedFrames.forEach((f,i)=>{
          msg2.push({type:"text",text:"[정밀 장면 "+(i+1)+" — "+f.time+"초]"});
          msg2.push({type:"image",source:{type:"base64",media_type:"image/jpeg",data:f.data.split(",")[1]}});
        });
        const termGuide2 = termGuide; // KSIA 기준 동일 적용
        msg2.push({type:"text",text:
          "당신은 KSIA 기준의 전문 "+sl+" 코치입니다. 라이더를 가까이서 본 이 장면을 바탕으로 정밀 코칭을 해주세요.\n"+
          "각도 수치 없이, 슬로프에서 직접 코칭하듯 자연스럽게 설명하세요.\n"+
          "잘된 점은 구체적으로 칭찬하고, 개선점은 '이렇게 해보세요' 식으로 방법을 제시하세요.\n\n"+
          "JSON으로만 응답(마크다운 없이):\n"+
          '{"scores":[{"label":"자세","value":78,"color":"#3b82f6"},{"label":"균형","value":72,"color":"#22c55e"},{"label":"기술","value":70,"color":"#f59e0b"}],'+
          '"frames":[{"frameIndex":0,"type":"good","title":"제목10자","desc":"KSIA 기준 자연스러운 코칭 말투 2문장","annotations":[{"x":0.5,"y":0.45,"type":"good","label":"라벨","arrow":{"x":0.5,"y":0.6}}]},'+
          '{"frameIndex":1,"type":"warn","title":"제목","desc":"KSIA 기준 자연스러운 코칭 말투 2문장","annotations":[{"x":0.5,"y":0.45,"type":"warn","label":"라벨","arrow":{"x":0.5,"y":0.58}}]},'+
          '{"frameIndex":2,"type":"good","title":"제목","desc":"KSIA 기준 자연스러운 코칭 말투 2문장","annotations":[{"x":0.5,"y":0.45,"type":"good","label":"라벨","arrow":{"x":0.5,"y":0.6}}]},'+
          '{"frameIndex":3,"type":"warn","title":"제목","desc":"KSIA 기준 자연스러운 코칭 말투 2문장","annotations":[{"x":0.5,"y":0.45,"type":"warn","label":"라벨","arrow":{"x":0.5,"y":0.58}}]}],'+
          '"feedback":[{"type":"good","tag":"잘된 점","text":"KSIA 기준 잘된 부분 코칭 말투 2~3문장"},{"type":"warn","tag":"개선 포인트","text":"KSIA 기준 개선방법 코칭 말투 2~3문장"},{"type":"info","tag":"코치 조언","text":"슬로프에서 바로 해볼 수 있는 팁 2~3문장"}],'+
          '"tips":["슬로프에서 바로 해볼 드릴 팁1","팁2","팁3","팁4"]}'+
          "\n규칙: value 60-95, good/warn 각2개, 한국어, 크롭이미지 기준 x/y(0.3~0.7 범위에 라이더 있음). 동일 입력에 항상 동일 결과를 출력하세요."
        });
        const raw2=await apiCall([{role:"user",content:msg2}],"You are a JSON API. Output ONLY a valid JSON object. No markdown. No code fences.",apiKey);
        refinedData=parseJSON(raw2);
      }catch(e){ console.warn("2nd pass failed:",e.message); }
    }

    // Build annotated canvases with stick figure
    setLoadMsg("장면 이미지 생성 중...");setPct(72);
    const annotated=[], fl=refinedData.frames||[];
    for(let i=0;i<fl.length;i++){
      const fd=fl[i], fi=Math.min(Math.max(fd.frameIndex||i,0),capturedFrames.length-1);
      const frame=capturedFrames[fi], pick=picks[fi]||picks[i];
      let canvas=null,svg=null;
      if(frame&&pick){ canvas=await buildAnnotatedCanvas(frame,pick.x,pick.y,fd.annotations||[]); }
      else if(frame){
        const anns=fd.annotations||[];
        const cx=anns.length>0?anns.reduce((s,a)=>s+a.x,0)/anns.length:0.5;
        const cy=anns.length>0?anns.reduce((s,a)=>s+a.y,0)/anns.length:0.5;
        canvas=await buildAnnotatedCanvas(frame,cx,cy,anns);
      }else{ svg=make3DFigureSVG(sport,fd.type,fd); }
      // Capture ±1s clip for GIF preview
      let gifFrames = [];
      if (frame && pick) {
        try {
          gifFrames = await captureClip(vidRef.current, frame.time, pick.x, pick.y);
        } catch(e) { console.warn("clip failed:", e.message); }
      }
      annotated.push({...fd,canvas,svg,time:frame?.time??null,gifFrames});
      setPct(72+Math.round((i+1)/fl.length*26));
    }
    setPct(100);
    const aid = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    analysisIdRef.current = aid;
    setFeedback(null); setStars(0); setComment(""); setStarDone(false);
    setFeedbackDone(localStorage.getItem("rideai_fb_"+aid)==="done");
    const finalResult = {...refinedData, annotated};
    setResult(finalResult);
    setTab(annotated.some(f=>f.type==="good")?"good":"warn");
    setPhase("done");
    // Save thumbnails: one per frame, very small (100x100, low quality)
    const thumbs = [];
    for (const af of annotated) {
      if (af.canvas) {
        try {
          const tc = document.createElement("canvas");
          tc.width = 120; tc.height = 120;
          tc.getContext("2d").drawImage(af.canvas, 0, 0, af.canvas.width, af.canvas.height, 0, 0, 120, 120);
          thumbs.push(tc.toDataURL("image/jpeg", 0.45));
        } catch { thumbs.push(null); }
      } else { thumbs.push(null); }
    }
    // Save to localStorage history
    saveHistory({
      id: aid,
      savedAt: Date.now(),
      sport,
      scores: refinedData.scores || [],
      feedback: refinedData.feedback || [],
      tips: refinedData.tips || [],
      frames: (refinedData.frames||[]).map((f,i)=>({
        type: f.type, title: f.title, desc: f.desc, time: annotated[i]?.time ?? null,
        thumb: thumbs[i] || null,
      })),
    });
    setHistory(loadHistory());
  };

  const reset=()=>{
    setPhase("sport");setFile(null);setResult(null);setRawData(null);setCapturedFrames([]);setError("");setPct(0);
    if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current=null;}
    if(fileRef.current) fileRef.current.value="";
    if(vidRef.current) vidRef.current.src="";
  };

  const groups=result?{good:(result.annotated||[]).filter(f=>f.type==="good"),warn:(result.annotated||[]).filter(f=>f.type==="warn")}:{good:[],warn:[]};

  return(
    <div style={{minHeight:"100vh",background:"#f0f2f5"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}*{box-sizing:border-box;margin:0;padding:0}
      .ad-banner{display:flex;flex-direction:column;gap:16px;padding:20px 8px;}
      @media(max-width:1200px){.ad-left,.ad-right{display:none!important;}}
      `}</style>
      <video ref={vidRef} muted playsInline style={{position:"fixed",right:0,bottom:0,width:2,height:2,opacity:0.01,pointerEvents:"none"}}/>

      {/* ── 3-column layout: left ad | content | right ad ── */}
      <div style={{display:"flex",justifyContent:"center",alignItems:"flex-start",minHeight:"100vh",gap:0}}>

        {/* LEFT AD BANNER */}
        <div className="ad-left" style={{width:160,flexShrink:0,position:"sticky",top:20,paddingTop:20}}>
          <AdBanner side="left"/>
        </div>

        {/* MAIN CONTENT */}
        <div style={{flex:1,maxWidth:720,minWidth:0,background:"#f8fafc",minHeight:"100vh"}}>

      {/* ── BETA PASSWORD GATE ── */}
      {!authed && (
        <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
          <div style={{background:"#fff",borderRadius:20,padding:"40px 32px",maxWidth:380,width:"100%",boxShadow:"0 4px 32px rgba(0,0,0,0.08)",textAlign:"center"}}>
            <div style={{fontSize:44,marginBottom:16}}>⛷</div>
            <div style={{fontSize:22,fontWeight:700,color:"#0f172a",marginBottom:6}}>Snow Riding AI<br/>Coaching Staff</div>
            <div style={{fontSize:13,color:"#94a3b8",marginBottom:28}}>스키·스노보드 AI 라이딩 코치</div>
            <div style={{background:"#f1f5f9",borderRadius:10,padding:"10px 14px",marginBottom:20,fontSize:13,color:"#64748b",lineHeight:1.7,textAlign:"left"}}>
              <div style={{fontWeight:600,color:"#475569",marginBottom:4}}>🔒 베타 서비스</div>
              <div>현재 초대된 사용자만 이용 가능합니다.</div>
              <div>베타 참여를 원하시면 운영자에게 문의하세요.</div>
            </div>
            <input
              type="password"
              placeholder="베타 접근 코드 입력"
              value={pwInput}
              onChange={e=>setPwInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&tryAuth()}
              style={{width:"100%",padding:"12px 16px",borderRadius:10,border:"1.5px solid "+(pwError?"#ef4444":"rgba(0,0,0,0.12)"),fontSize:15,marginBottom:10,outline:"none",textAlign:"center",letterSpacing:2,animation:pwError?"shake 0.4s ease":"none",background:pwError?"#fef2f2":"#fff"}}
            />
            {pwError && <div style={{fontSize:12,color:"#ef4444",marginBottom:8}}>접근 코드가 올바르지 않습니다.</div>}
            <button onClick={tryAuth} style={{width:"100%",padding:"13px 0",borderRadius:10,border:"none",background:"#0f172a",color:"#fff",fontSize:15,fontWeight:600,cursor:"pointer"}}>
              입장하기
            </button>
            <div style={{marginTop:20,fontSize:11,color:"#cbd5e1"}}>Snow Riding AI ver 0.02-3 · made by GP</div>
          </div>
        </div>
      )}

      {authed && <div style={{padding:"1.5rem 20px 60px",maxWidth:720,margin:"0 auto"}}>

        {/* HEADER */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
          <div style={{width:42,height:42,background:"#eff6ff",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>⛷</div>
          <div><div style={{fontSize:15,fontWeight:700,color:"#0f172a",lineHeight:1.3}}>Snow Riding AI<br/>Coaching Staff</div><div style={{fontSize:12,color:"#94a3b8"}}>스키·스노보드 AI 라이딩 코치</div></div>
          {!import.meta.env.VITE_ANTHROPIC_KEY && (
            <button onClick={()=>setShowKeyInput(v=>!v)} style={{marginLeft:"auto",padding:"6px 12px",borderRadius:8,border:"0.5px solid rgba(0,0,0,0.15)",background:apiKey?"#f0fdf4":"#fef2f2",color:apiKey?"#166534":"#991b1b",fontSize:12,cursor:"pointer"}}>
              {apiKey?"🔑 API 키 설정됨":"🔑 API 키 필요"}
            </button>
          )}
        </div>

        {showKeyInput&&!import.meta.env.VITE_ANTHROPIC_KEY&&(<div style={{background:"#f8fafc",border:"0.5px solid rgba(0,0,0,0.1)",borderRadius:12,padding:16,marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:500,marginBottom:8}}>Anthropic API 키</div>
          <div style={{display:"flex",gap:8}}>
            <input type="password" placeholder="sk-ant-..." defaultValue={apiKey} id="apiKeyInput" style={{flex:1,padding:"9px 12px",borderRadius:8,border:"0.5px solid rgba(0,0,0,0.15)",fontSize:13,background:"#fff"}}/>
            <button onClick={()=>saveKey(document.getElementById("apiKeyInput").value.trim())} style={{padding:"9px 18px",borderRadius:8,border:"none",background:"#0f172a",color:"#fff",fontSize:13,cursor:"pointer",fontWeight:500}}>저장</button>
          </div>
        </div>)}

        {phase!=="sport"&&<StepBar current={phase}/>}

        {/* STEP 1: SPORT */}
        {phase==="sport"&&(<div style={{animation:"fadeUp 0.3s ease"}}>
          <div style={{fontSize:18,fontWeight:600,marginBottom:6,color:"#0f172a"}}>종목을 선택하세요</div>
          <div style={{fontSize:14,color:"#64748b",marginBottom:24}}>선택한 종목에 맞는 전문 용어로 분석해드립니다.</div>
          <div style={{display:"flex",gap:12,marginBottom:14}}>
            {[["ski","🎿","스키","#2563eb","#dbeafe","#1d4ed8"],["snowboard","🏂","스노보드","#7c3aed","#ede9fe","#6d28d9"]].map(([s,icon,lbl,ac,bg,bc])=>(
              <button key={s} onClick={()=>{setSport(s);setPhase("upload");}} style={{flex:1,padding:"28px 16px",borderRadius:16,border:"2px solid "+ac,background:bg,color:bc,cursor:"pointer",textAlign:"center",boxShadow:"0 2px 12px "+ac+"22"}}>
                <div style={{fontSize:40,marginBottom:10}}>{icon}</div>
                <div style={{fontSize:17,fontWeight:600}}>{lbl}</div>
                <div style={{fontSize:12,color:ac,marginTop:4,opacity:0.8}}>선택 →</div>
              </button>
            ))}
          </div>

          {/* 이전 기록 확인 버튼 */}
          <button onClick={()=>{setSelectedHistory(null);setPhase("history");}}
            style={{width:"100%",padding:"12px 0",borderRadius:10,border:"0.5px solid rgba(0,0,0,0.12)",background:"#fff",color:"#0f172a",fontSize:14,fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:10}}>
            <span style={{fontSize:16}}>📋</span>
            이전 분석 기록 보기
            {history.length>0&&<span style={{background:"#0f172a",color:"#fff",fontSize:11,fontWeight:600,padding:"1px 7px",borderRadius:99}}>{history.length}</span>}
          </button>
          <div style={{fontSize:11,color:"#94a3b8",lineHeight:1.8,padding:"0 2px"}}>
            ⚠ 기록 안내: 최근 5개까지 보관 · 7일 후 자동 삭제 · 같은 기기/브라우저에서만 확인 가능 · 이미지는 저장되지 않습니다
          </div>

          {/* ── 서비스 안내 ── */}
          <div style={{borderRadius:12,border:"0.5px solid rgba(0,0,0,0.08)",overflow:"hidden",marginTop:8}}>
            <div style={{background:"#f8fafc",padding:"9px 14px",borderBottom:"0.5px solid rgba(0,0,0,0.06)"}}>
              <span style={{fontSize:12,fontWeight:500,color:"#64748b"}}>서비스 안내</span>
            </div>
            <div style={{background:"#fff"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"13px 16px",borderBottom:"0.5px solid rgba(0,0,0,0.06)"}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:"#fef9c3",border:"0.5px solid #ca8a04",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,fontSize:13}}>⚠</div>
                <div>
                  <div style={{fontSize:13,fontWeight:500,color:"#0f172a",marginBottom:3}}>AI 분석이며 실수할 수 있습니다</div>
                  <div style={{fontSize:13,color:"#64748b",lineHeight:1.65}}>분석 결과는 참고용이며 정확하지 않을 수 있습니다. 이용 후 피드백 버튼을 꼭 눌러주세요. 더 나은 서비스를 만드는 데 큰 도움이 됩니다.</div>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"13px 16px",borderBottom:"0.5px solid rgba(0,0,0,0.06)"}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:"#fef2f2",border:"0.5px solid #dc2626",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,fontSize:13}}>💰</div>
                <div>
                  <div style={{fontSize:13,fontWeight:500,color:"#0f172a",marginBottom:3}}>분석 1회당 100~200원의 비용이 제작자에게 발생합니다</div>
                  <div style={{fontSize:13,color:"#64748b",lineHeight:1.65}}>서버 운영 및 AI 사용 비용이 발생하므로 무분별한 분석은 자제 부탁드립니다. 감사합니다.</div>
                </div>
              </div>
              <div style={{padding:"13px 16px",textAlign:"center"}}>
                <a href="https://qr.kakaopay.com/FFxgVyI0s" target="_blank" rel="noopener noreferrer"
                  style={{display:"inline-flex",alignItems:"center",gap:7,padding:"9px 20px",borderRadius:99,background:"#FEE500",color:"#3A1D1D",fontSize:13,fontWeight:600,textDecoration:"none",marginBottom:10}}>
                  <span style={{fontSize:15}}>💛</span> 카카오페이로 후원하기
                </a>
                <div style={{fontSize:12,fontWeight:500,color:"#0f172a",marginBottom:2}}>소중한 후원 감사합니다 🙇</div>
                <div style={{fontSize:11,color:"#94a3b8"}}>후원금은 서버 비용과 AI 개선에 사용됩니다.</div>
              </div>
            </div>
          </div>

        </div>)}

        {/* STEP 2: UPLOAD */}
        {phase==="upload"&&(<div style={{animation:"fadeUp 0.3s ease"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20}}>
            <span style={{fontSize:22}}>{sport==="ski"?"🎿":"🏂"}</span>
            <span style={{fontSize:16,fontWeight:600,color:sport==="ski"?"#1d4ed8":"#6d28d9"}}>{sport==="ski"?"스키":"스노보드"} 영상 업로드</span>
            <button onClick={()=>setPhase("sport")} style={{marginLeft:"auto",fontSize:12,color:"#94a3b8",background:"none",border:"none",cursor:"pointer"}}>← 종목 변경</button>
          </div>
          <div onClick={()=>fileRef.current?.click()} onDrop={onDrop} onDragOver={e=>e.preventDefault()}
            style={{border:"2px dashed rgba(0,0,0,0.12)",borderRadius:16,padding:"44px 20px",textAlign:"center",cursor:"pointer",background:"#fff",marginBottom:12}}>
            <input ref={fileRef} type="file" accept="video/*" onChange={e=>onFile(e.target.files[0])} style={{display:"none"}}/>
            <div style={{fontSize:40,marginBottom:12}}>🎬</div>
            <div style={{fontSize:15,fontWeight:500,marginBottom:6,color:"#0f172a"}}>{file?"✓ "+file.name:"라이딩 영상을 업로드하세요"}</div>
            <div style={{fontSize:13,color:"#94a3b8"}}>{file?(file.size/1024/1024).toFixed(1)+" MB · 분석 준비 완료":"클릭하거나 드래그 · MP4, MOV, AVI"}</div>
          </div>
          <div style={{background:"#f8fafc",border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:10,padding:"12px 14px",marginBottom:10,fontSize:13,color:"#64748b",lineHeight:1.7}}>
            <div style={{fontWeight:500,color:"#475569",marginBottom:3}}>📋 업로드 안내</div>
            <div>• 최대 파일 용량: <strong>100MB</strong></div>
            <div>• 지원 형식: MP4, MOV, AVI</div>
            <div>• 라이더가 화면에 잘 보이는 영상일수록 분석 정확도가 높아집니다</div>
            <div>• 영상이 길수록 분석 시간이 다소 걸릴 수 있습니다</div>
          </div>
          <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,padding:"12px 14px",marginBottom:14,fontSize:13,color:"#78350f",lineHeight:1.8}}>
            <div style={{fontWeight:600,color:"#92400e",marginBottom:5}}>★ 주의사항 — AI 스마트 프레임 선택</div>
            <div>① 영상 앞뒤 <strong>각 10%</strong> 구간은 자동으로 제외됩니다 (출발 준비·도착 정지 구간)</div>
            <div>② 너무 어둡거나 라이더가 보이지 않는 장면은 자동으로 걸러집니다</div>
            <div>③ 남은 후보 장면 중 AI가 직접 보고 <strong>잘된 장면 2개 + 개선 필요 장면 2개</strong>를 선택합니다</div>
            <div style={{marginTop:5,color:"#a16207",fontSize:12}}>💡 라이더가 화면 중앙에 잘 보이는 영상을 사용하면 더 정확한 분석이 가능합니다.</div>
          </div>
            <button onClick={runAnalysis} disabled={!file||fileTooLarge} style={{width:"100%",padding:15,borderRadius:10,border:"none",background:(file&&!fileTooLarge)?"#0f172a":"#e2e8f0",color:(file&&!fileTooLarge)?"#fff":"#94a3b8",fontSize:15,fontWeight:600,cursor:(file&&!fileTooLarge)?"pointer":"not-allowed"}}>
            AI 분석 시작 →
          </button>
          {fileTooLarge&&<div style={{marginTop:10,textAlign:"center",fontSize:13,color:"#dc2626"}}>⚠️ 파일 크기가 100MB를 초과합니다. 더 작은 영상을 선택해주세요.</div>}
        </div>)}

        {/* STEP 3: LOADING */}
        {phase==="loading"&&(<div style={{textAlign:"center",padding:"56px 0",animation:"fadeUp 0.3s ease"}}>
          <div style={{width:52,height:52,border:"3px solid rgba(0,0,0,0.08)",borderTopColor:"#0f172a",borderRadius:"50%",animation:"spin 0.85s linear infinite",margin:"0 auto 20px"}}/>
          <div style={{fontSize:16,fontWeight:500,color:"#0f172a",marginBottom:8}}>{loadMsg}</div>
          <div style={{fontSize:13,color:"#94a3b8",marginBottom:22}}>잠시만 기다려주세요...</div>
          <div style={{maxWidth:260,margin:"0 auto",background:"rgba(0,0,0,0.06)",borderRadius:99,height:5,overflow:"hidden"}}>
            <div style={{height:"100%",width:pct+"%",background:"#0f172a",borderRadius:99,transition:"width 0.5s"}}/>
          </div>
        </div>)}

        {/* STEP 4: PICKING */}
        {phase==="picking"&&capturedFrames.length>0&&(<div style={{animation:"fadeUp 0.3s ease"}}><SubjectPicker frames={capturedFrames} onDone={onPicksDone}/></div>)}

        {/* HISTORY VIEW */}
        {phase==="history"&&(
          <div style={{animation:"fadeUp 0.3s ease"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20}}>
              <button onClick={()=>setPhase("sport")} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#64748b",padding:0}}>←</button>
              <div style={{fontSize:16,fontWeight:600,color:"#0f172a"}}>이전 분석 기록</div>
            </div>

            {history.length===0 ? (
              <div style={{textAlign:"center",padding:"56px 0",color:"#94a3b8"}}>
                <div style={{fontSize:40,marginBottom:12}}>📋</div>
                <div style={{fontSize:14}}>아직 분석 기록이 없습니다</div>
                <div style={{fontSize:12,marginTop:6}}>분석을 완료하면 여기에 기록이 남습니다</div>
              </div>
            ) : (
              <div>
                {selectedHistory ? (
                  /* 선택된 기록 상세 */
                  <div style={{animation:"fadeUp 0.2s ease"}}>
                    <button onClick={()=>setSelectedHistory(null)}
                      style={{background:"none",border:"none",fontSize:13,color:"#64748b",cursor:"pointer",marginBottom:16,padding:0,display:"flex",alignItems:"center",gap:4}}>
                      ← 목록으로
                    </button>
                    <div style={{background:"#fff",border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:12,padding:"16px 18px",marginBottom:12}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                        <span style={{fontSize:20}}>{selectedHistory.sport==="ski"?"🎿":"🏂"}</span>
                        <div>
                          <div style={{fontSize:14,fontWeight:600,color:"#0f172a"}}>{selectedHistory.sport==="ski"?"스키":"스노보드"} 분석</div>
                          <div style={{fontSize:11,color:"#94a3b8"}}>{new Date(selectedHistory.savedAt).toLocaleString("ko-KR")}</div>
                        </div>
                      </div>
                      <div style={{fontSize:13,fontWeight:500,color:"#475569",marginBottom:10}}>종합 점수</div>
                      {(selectedHistory.scores||[]).map((s,i)=>(
                        <div key={i} style={{marginBottom:10}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:13}}>
                            <span style={{color:"#475569"}}>{s.label}</span>
                            <span style={{fontWeight:500}}>{s.value}점</span>
                          </div>
                          <div style={{height:6,background:"rgba(0,0,0,0.08)",borderRadius:99}}>
                            <div style={{height:"100%",width:s.value+"%",background:s.color,borderRadius:99}}/>
                          </div>
                        </div>
                      ))}
                    </div>
                    {(()=>{
                      const goodF=(selectedHistory.frames||[]).filter(f=>f.type==="good");
                      const warnF=(selectedHistory.frames||[]).filter(f=>f.type==="warn");
                      const renderFrames=(frames,type)=>(
                        <div style={{marginBottom:12}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                            <span style={{fontSize:12,fontWeight:500,color:type==="good"?"#166534":"#991b1b"}}>
                              {type==="good"?"✅ 잘된 장면":"⚠️ 고쳐볼 장면"}
                            </span>
                            <span style={{fontSize:11,color:"#94a3b8"}}>({frames.length})</span>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          {frames.map((f,i)=>(
                            <div key={i} style={{background:"#fff",borderRadius:8,overflow:"hidden",border:"0.5px solid "+(type==="good"?"#bbf7d0":"#fecaca")}}>
                              {f.thumb
                                ? <img src={f.thumb} alt="" style={{width:"100%",aspectRatio:"1",objectFit:"cover",display:"block"}}/>
                                : <div style={{width:"100%",aspectRatio:"1",background:type==="good"?"#f0fdf4":"#fef2f2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>
                                    {type==="good"?"✅":"⚠️"}
                                  </div>
                              }
                              <div style={{padding:"8px 10px",background:type==="good"?"#f0fdf4":"#fef2f2"}}>
                                <div style={{fontSize:12,fontWeight:500,color:type==="good"?"#166534":"#991b1b",marginBottom:3}}>{f.title}</div>
                                <div style={{fontSize:11,color:"#374151",lineHeight:1.5}}>{f.desc}</div>
                              </div>
                            </div>
                          ))}
                          </div>
                        </div>
                      );
                      return(
                        <div style={{background:"#fff",border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:12,padding:"16px 18px",marginBottom:12}}>
                          <div style={{fontSize:13,fontWeight:500,color:"#475569",marginBottom:12}}>장면별 분석</div>
                          {goodF.length>0&&renderFrames(goodF,"good")}
                          {warnF.length>0&&renderFrames(warnF,"warn")}
                        </div>
                      );
                    })()}
                    <div style={{background:"#fff",border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:12,padding:"16px 18px",marginBottom:12}}>
                      <div style={{fontSize:13,fontWeight:500,color:"#475569",marginBottom:10}}>코치 피드백</div>
                      {(selectedHistory.feedback||[]).map((f,i)=>{
                        const bc={good:"#16a34a",warn:"#dc2626",info:"#2563eb"}[f.type]||"#2563eb";
                        const steps = Array.isArray(f.actionSteps) ? f.actionSteps : [];
                        return(<div key={i} style={{borderLeft:"3px solid "+bc,paddingLeft:10,marginBottom:10}}>
                          <div style={{fontSize:11,fontWeight:600,color:bc,marginBottom:3}}>{f.tag}</div>
                          <div style={{fontSize:12,color:"#0f172a",lineHeight:1.6,marginBottom:steps.length>0?7:0}}>{f.text}</div>
                          {steps.length>0&&<div style={{borderTop:"0.5px solid rgba(0,0,0,0.07)",paddingTop:7}}>
                            <div style={{fontSize:10,fontWeight:500,color:"#64748b",marginBottom:5}}>💡 이렇게 해보세요</div>
                            {steps.map((s,j)=>(<div key={j} style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:4}}>
                              <span style={{minWidth:16,height:16,borderRadius:"50%",background:"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#475569",flexShrink:0,marginTop:1}}>{j+1}</span>
                              <span style={{fontSize:11,color:"#475569",lineHeight:1.6}}>{s}</span>
                            </div>))}
                          </div>}
                        </div>);
                      })}
                    </div>
                    {(selectedHistory.tips||[]).length>0&&(
                      <div style={{background:"#fff",border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:12,padding:"16px 18px"}}>
                        <div style={{fontSize:13,fontWeight:500,color:"#475569",marginBottom:10}}>연습 팁 💡</div>
                        {selectedHistory.tips.map((tip,i)=>{
                          const txt = typeof tip==="object" ? tip.text : tip;
                          const det = typeof tip==="object" ? tip.detail : null;
                          return(
                            <div key={i} style={{border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:8,overflow:"hidden",marginBottom:8}}>
                              <div style={{padding:"9px 12px",display:"flex",gap:9,alignItems:"flex-start"}}>
                                <span style={{minWidth:20,height:20,background:"#0f172a",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,color:"#fff",flexShrink:0,marginTop:1}}>{i+1}</span>
                                <span style={{fontSize:13,color:"#0f172a",lineHeight:1.6}}>{txt}</span>
                              </div>
                              {det&&<div style={{background:"#f8fafc",borderTop:"0.5px solid rgba(0,0,0,0.07)",padding:"7px 12px 7px 41px"}}>
                                <div style={{fontSize:10,fontWeight:500,color:"#64748b",marginBottom:3}}>구체적으로는</div>
                                <div style={{fontSize:11,color:"#64748b",lineHeight:1.65}}>{det}</div>
                              </div>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  /* 기록 목록 */
                  <div>
                    {history.map((h,i)=>{
                      const daysLeft = Math.ceil((TTL_MS-(Date.now()-h.savedAt))/(1000*60*60*24));
                      const avgScore = h.scores.length>0 ? Math.round(h.scores.reduce((s,sc)=>s+sc.value,0)/h.scores.length) : 0;
                        const firstThumb = (h.frames||[]).find(f=>f.thumb)?.thumb || null;
                        return(
                        <button key={h.id} onClick={()=>setSelectedHistory(h)}
                          style={{width:"100%",background:"#fff",border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:12,overflow:"hidden",marginBottom:10,cursor:"pointer",textAlign:"left",display:"flex"}}>
                          {firstThumb
                            ? <img src={firstThumb} alt="" style={{width:72,flexShrink:0,objectFit:"cover"}}/>
                            : <div style={{width:72,background:"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{h.sport==="ski"?"🎿":"🏂"}</div>
                          }
                          <div style={{flex:1,padding:"12px 14px"}}>
                            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:6}}>
                              <div>
                                <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{h.sport==="ski"?"스키":"스노보드"} 분석</div>
                                <div style={{fontSize:11,color:"#94a3b8"}}>{new Date(h.savedAt).toLocaleDateString("ko-KR")} · {daysLeft}일 후 삭제</div>
                              </div>
                              <div style={{fontSize:17,fontWeight:700,color:"#0f172a"}}>{avgScore}점</div>
                            </div>
                            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                              {h.scores.map((s,j)=>(
                                <span key={j} style={{fontSize:11,background:"#f8fafc",color:"#475569",padding:"2px 7px",borderRadius:99,border:"0.5px solid rgba(0,0,0,0.08)"}}>
                                  {s.label} {s.value}점
                                </span>
                              ))}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    <div style={{fontSize:11,color:"#94a3b8",textAlign:"center",marginTop:8,lineHeight:1.8}}>
                      최근 {history.length}개 기록 · 최대 5개 보관 · 7일 후 자동 삭제
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 5: DONE */}
        {phase==="done"&&result&&(<div style={{animation:"fadeUp 0.4s ease"}}>
          {/* Save/Share buttons */}
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <button onClick={shareResult} disabled={saving} style={{flex:1,padding:"11px 0",borderRadius:10,border:"0.5px solid rgba(0,0,0,0.15)",background:"#0f172a",color:"#fff",fontSize:14,fontWeight:500,cursor:saving?"not-allowed":"pointer",opacity:saving?0.6:1}}>
              {saving?"처리 중...":"📤 공유하기"}
            </button>
            <button onClick={saveAsImage} disabled={saving} style={{flex:1,padding:"11px 0",borderRadius:10,border:"0.5px solid rgba(0,0,0,0.15)",background:"#fff",color:"#0f172a",fontSize:14,fontWeight:500,cursor:saving?"not-allowed":"pointer",opacity:saving?0.6:1}}>
              {saving?"저장 중...":"💾 이미지 저장"}
            </button>
          </div>
          <div ref={resultRef}>
          {error&&<div style={{background:"#fffbeb",color:"#92400e",padding:"10px 14px",borderRadius:8,fontSize:13,marginBottom:16}}>⚠️ {error}</div>}
          <div style={{background:"#000",borderRadius:12,overflow:"hidden",aspectRatio:"16/9",marginBottom:20}}>
            <video src={urlRef.current} controls playsInline style={{width:"100%",height:"100%",objectFit:"contain",display:"block"}}/>
          </div>
          <div style={{background:"#fff",border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:12,padding:"18px 20px",marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:16}}>종합 점수</div>
            {(result.scores||[]).map((s,i)=><ScoreBar key={i} {...s}/>)}
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>장면별 분석</div>
            <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              {[["good","✅ 잘된 장면"],["warn","⚠️ 고쳐볼 장면"]].map(([k,lbl])=>groups[k].length>0&&(
                <button key={k} onClick={()=>setTab(k)} style={{padding:"6px 14px",borderRadius:99,fontSize:13,cursor:"pointer",border:tab===k?"2px solid "+(k==="good"?"#16a34a":"#dc2626"):"0.5px solid rgba(0,0,0,0.12)",background:tab===k?(k==="good"?"#f0fdf4":"#fef2f2"):"transparent",color:tab===k?(k==="good"?"#166534":"#991b1b"):"#64748b",fontWeight:tab===k?500:400}}>
                  {lbl} ({groups[k].length})
                </button>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
              {(groups[tab]||[]).map((f,i)=><FrameCard key={i} frame={f}/>)}
            </div>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>코치 피드백</div>
            {(result.feedback||[]).map((f,i)=><FeedbackCard key={i} type={f.type} tag={f.tag} text={f.text} actionSteps={f.actionSteps}/>)}
          </div>
          <div style={{background:"#fff",border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:12,padding:"18px 20px",marginBottom:24}}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:14}}>이렇게 연습해보세요 💡</div>
            {(result.tips||[]).map((tip,i)=>{
              const text = typeof tip==="object" ? tip.text : tip;
              const detail = typeof tip==="object" ? tip.detail : null;
              return(
                <div key={i} style={{border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:8,overflow:"hidden",marginBottom:10}}>
                  <div style={{padding:"11px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
                    <span style={{minWidth:22,height:22,background:"#0f172a",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,color:"#fff",flexShrink:0,marginTop:1}}>{i+1}</span>
                    <span style={{fontSize:14,color:"#0f172a",lineHeight:1.65}}>{text}</span>
                  </div>
                  {detail&&(
                    <div style={{background:"#f8fafc",borderTop:"0.5px solid rgba(0,0,0,0.07)",padding:"9px 14px 9px 46px"}}>
                      <div style={{fontSize:11,fontWeight:500,color:"#64748b",marginBottom:4}}>구체적으로는</div>
                      <div style={{fontSize:12,color:"#64748b",lineHeight:1.7}}>{detail}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* ── Star Feedback ── */}
          <div style={{background:"#fff",border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:12,padding:"18px 20px",marginBottom:16}}>
            {!starDone ? (<>
              <div style={{fontSize:14,fontWeight:500,color:"#0f172a",marginBottom:4,textAlign:"center"}}>분석이 도움이 됐나요?</div>
              <div style={{fontSize:12,color:"#94a3b8",marginBottom:14,textAlign:"center"}}>별점과 의견을 남겨주시면 AI 코치 개선에 활용됩니다</div>
              {/* Stars */}
              <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:14}}>
                {[1,2,3,4,5].map(s=>(
                  <button key={s} onClick={()=>setStars(s)}
                    style={{fontSize:28,background:"none",border:"none",cursor:"pointer",opacity:s<=stars?1:0.25,transition:"all 0.15s",padding:"2px 4px"}}>
                    ⭐
                  </button>
                ))}
              </div>
              {/* Comment */}
              <textarea
                value={comment}
                onChange={e=>setComment(e.target.value)}
                placeholder="어떤 점이 좋았나요? 또는 아쉬웠나요? (선택)"
                style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"0.5px solid rgba(0,0,0,0.15)",fontSize:13,resize:"none",height:72,fontFamily:"inherit",boxSizing:"border-box",outline:"none",color:"#0f172a",background:"#f8fafc"}}
              />
              <button onClick={submitStarFeedback} disabled={stars===0}
                style={{width:"100%",marginTop:10,padding:"11px 0",borderRadius:8,border:"none",background:stars>0?"#0f172a":"#e2e8f0",color:stars>0?"#fff":"#94a3b8",fontSize:14,fontWeight:500,cursor:stars>0?"pointer":"not-allowed"}}>
                피드백 제출
              </button>
              {stars>0&&<div style={{marginTop:8,textAlign:"center",fontSize:12,color:"#94a3b8"}}>
                {["","아쉬웠어요 😢","조금 아쉬워요 😕","괜찮았어요 😊","좋았어요 😄","최고예요 🤩"][stars]}
              </div>}
            </>) : (
              <div style={{textAlign:"center",padding:"8px 0"}}>
                <div style={{fontSize:22,marginBottom:6}}>{"⭐".repeat(stars)}</div>
                <div style={{fontSize:14,fontWeight:500,color:"#0f172a",marginBottom:3}}>소중한 피드백 감사합니다 🙇</div>
                <div style={{fontSize:12,color:"#94a3b8"}}>더 나은 서비스로 보답하겠습니다!</div>
              </div>
            )}
          </div>

          {/* 후원하기 */}
          <div style={{background:"#fff",border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:12,padding:"18px 20px",marginBottom:16,textAlign:"center"}}>
            <div style={{fontSize:14,fontWeight:500,color:"#0f172a",marginBottom:4}}>☕ 제작자에게 커피 한 잔 후원하기</div>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:16}}>서비스 운영에 큰 힘이 됩니다. 감사합니다 🙏</div>
            <a href="https://qr.kakaopay.com/FFxgVyI0s" target="_blank" rel="noopener noreferrer"
              style={{display:"inline-flex",alignItems:"center",gap:7,padding:"11px 24px",borderRadius:99,background:"#FEE500",color:"#3A1D1D",fontSize:14,fontWeight:600,textDecoration:"none",marginBottom:14}}>
              <span style={{fontSize:16}}>💛</span> 카카오페이로 후원하기
            </a>
            <div style={{borderTop:"0.5px solid rgba(0,0,0,0.08)",paddingTop:13}}>
              <div style={{fontSize:13,fontWeight:500,color:"#0f172a",marginBottom:3}}>소중한 후원 감사합니다 🙇</div>
              <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.6}}>후원해주신 금액은 서버 비용과 AI 개선에 사용됩니다.</div>
            </div>
          </div>

          <button onClick={reset} style={{display:"block",margin:"0 auto",padding:"10px 28px",border:"0.5px solid rgba(0,0,0,0.15)",borderRadius:8,background:"transparent",color:"#64748b",fontSize:13,cursor:"pointer"}}>↩ 새 영상 분석하기</button>
          </div>{/* end resultRef */}

          {/* ── Hidden share panel: both tabs, no video ── */}
          <div ref={shareRef} style={{display:"none",background:"#f8fafc",padding:"20px",fontFamily:"sans-serif"}}>
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,paddingBottom:12,borderBottom:"1px solid rgba(0,0,0,0.08)"}}>
              <div style={{fontSize:28}}>⛷</div>
              <div>
                <div style={{fontSize:18,fontWeight:700,color:"#0f172a"}}>Snow Riding AI Coaching Staff 분석 결과</div>
                <div style={{fontSize:12,color:"#94a3b8"}}>Snow Riding AI Coaching Staff · rideai.vercel.app</div>
              </div>
              <div style={{marginLeft:"auto",fontSize:12,color:"#94a3b8"}}>{new Date().toLocaleDateString("ko-KR")}</div>
            </div>
            {/* Scores */}
            <div style={{background:"#fff",borderRadius:12,padding:"16px 18px",marginBottom:14,border:"0.5px solid rgba(0,0,0,0.08)"}}>
              <div style={{fontSize:13,fontWeight:600,marginBottom:12}}>종합 점수</div>
              {(result?.scores||[]).map((s,i)=>(
                <div key={i} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:13}}>
                    <span style={{color:"#475569"}}>{s.label}</span>
                    <span style={{fontWeight:500}}>{s.value}점</span>
                  </div>
                  <div style={{height:6,background:"rgba(0,0,0,0.08)",borderRadius:99}}>
                    <div style={{height:"100%",width:s.value+"%",background:s.color,borderRadius:99}}/>
                  </div>
                </div>
              ))}
            </div>
            {/* ALL frames — good + warn together */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>장면별 분석</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {(result?.annotated||[]).map((f,i)=><ShareFrameCard key={i} frame={f}/>)}
              </div>
            </div>
            {/* Feedback */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>코치 피드백</div>
              {(result?.feedback||[]).map((f,i)=>{
                const bc={good:"#16a34a",warn:"#dc2626",info:"#2563eb"}[f.type]||"#2563eb";
                return(
                  <div key={i} style={{background:"#fff",borderLeft:"3px solid "+bc,borderRadius:8,padding:"10px 12px",marginBottom:8,border:"0.5px solid rgba(0,0,0,0.06)",borderLeft:"3px solid "+bc}}>
                    <div style={{fontSize:11,fontWeight:600,color:bc,marginBottom:4}}>{f.tag}</div>
                    <div style={{fontSize:12,color:"#0f172a",lineHeight:1.6}}>{f.text}</div>
                  </div>
                );
              })}
            </div>
            {/* Footer */}
            <div style={{textAlign:"center",paddingTop:10,borderTop:"1px solid rgba(0,0,0,0.06)",fontSize:11,color:"#cbd5e1"}}>
              Snow Riding AI Coaching Staff {VERSION} · made by GP · rideai.vercel.app
            </div>
          </div>
        </div>)}

        <div style={{textAlign:"center",padding:"32px 0 4px",fontSize:11,color:"#cbd5e1"}}>Snow Riding AI Coaching Staff {VERSION}</div>
        <div style={{textAlign:"center",padding:"0 0 12px",fontSize:11,color:"#cbd5e1"}}>made by GP</div>
      </div>}

        </div>{/* end main content */}

        {/* RIGHT AD BANNER */}
        <div className="ad-right" style={{width:160,flexShrink:0,position:"sticky",top:20,paddingTop:20}}>
          <AdBanner side="right"/>
        </div>

      </div>{/* end 3-col layout */}
    </div>
  );
}

/* ── Ad Banner Component ──────────────────────────────────── */
function AdBanner({side}) {
  const ads = [
    { bg:"#e8f4fd", border:"#bfdbfe", text:"스키 장갑\n특가 세일", sub:"최대 40% 할인", emoji:"🧤", color:"#1d4ed8" },
    { bg:"#fdf4e8", border:"#fed7aa", text:"스노보드\n렌탈 패키지", sub:"1일권 49,000원~", emoji:"🏂", color:"#c2410c" },
    { bg:"#f0fdf4", border:"#bbf7d0", text:"스키복\n브랜드샵", sub:"시즌 신상 입고", emoji:"🎿", color:"#166534" },
    { bg:"#fdf2f8", border:"#f5d0fe", text:"리조트\n시즌권", sub:"얼리버드 할인", emoji:"⛷", color:"#7e22ce" },
  ];
  return (
    <div className="ad-banner">
      {ads.map((ad,i)=>(
        <div key={i} style={{background:ad.bg,border:"1px solid "+ad.border,borderRadius:12,padding:"14px 10px",textAlign:"center",cursor:"pointer",transition:"transform 0.15s"}}
          onMouseEnter={e=>e.currentTarget.style.transform="scale(1.03)"}
          onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
          <div style={{fontSize:9,color:"#94a3b8",marginBottom:6,letterSpacing:1}}>광고</div>
          <div style={{fontSize:26,marginBottom:6}}>{ad.emoji}</div>
          <div style={{fontSize:12,fontWeight:700,color:ad.color,lineHeight:1.4,whiteSpace:"pre-line",marginBottom:4}}>{ad.text}</div>
          <div style={{fontSize:10,color:"#64748b"}}>{ad.sub}</div>
        </div>
      ))}
    </div>
  );
}

/* ── DEFAULT DATA ─────────────────────────────────────────── */
function defaultData(sport){
  const sk=sport==="ski";
  return{
    scores:[{label:"자세",value:72,color:"#3b82f6"},{label:"균형",value:68,color:"#22c55e"},{label:"기술",value:65,color:"#f59e0b"}],
    frames:[
      {frameIndex:0,type:"good",title:"전경 자세 안정",desc:sk?"전경 자세(앞으로 기울여 무게중심을 앞에 두는 자세)가 안정적입니다. 플렉션(무릎과 발목을 굽히는 동작)도 적절히 유지되고 있습니다.":"스탠스(발 위치와 넓이)가 균형 잡혀 있으며, 토사이드 엣지(발가락 쪽 날)의 압력 이동이 자연스럽습니다.",annotations:[{x:.45,y:.55,type:"good",label:"자세 ✓",arrow:{x:.5,y:.65}}]},
      {frameIndex:1,type:"warn",title:"상체 선행 과다",desc:sk?"상체 선행(상체가 하체보다 먼저 회전하는 현상)이 과도합니다. 카운터 로테이션(상체와 하체의 반대 방향 비틀기)을 의식해보세요.":"힐사이드 엣지(뒤꿈치 쪽 날) 전환 시 상체가 앞으로 기울어집니다. 앵귤레이션(관절을 꺾어 엣지 각도를 만드는 기술)을 활용해보세요.",annotations:[{x:.5,y:.4,type:"warn",label:"선행 과다",arrow:{x:.5,y:.35}}]},
      {frameIndex:2,type:"good",title:"턴 타이밍 양호",desc:sk?"카빙 턴(스키 날을 세워 정밀하게 도는 기술) 시 엣지 전환 타이밍이 정확합니다. 패럴렐(양 스키 나란히) 자세가 유지되고 있습니다.":"토사이드 카빙(발가락 쪽 날을 이용한 정밀 턴)의 타이밍이 자연스럽습니다.",annotations:[{x:.5,y:.55,type:"good",label:"타이밍 ✓",arrow:{x:.5,y:.6}}]},
      {frameIndex:3,type:"warn",title:"엣지 압력 부족",desc:sk?"내측 스키의 엣지 각도(날이 설면에 닿는 각도)가 부족합니다. 플렉션(무릎 굽힘)을 더 깊게 유지하세요.":"힐사이드 엣지(뒤꿈치 쪽 날) 압력이 부족합니다. 앵귤레이션(관절 꺾기)으로 엣지 각도를 더 만들어보세요.",annotations:[{x:.45,y:.65,type:"warn",label:"압력 부족",arrow:{x:.45,y:.72}}]},
    ],
    feedback:[
      {type:"good",tag:"잘된 점",text:sk?"기본 패럴렐(양 스키 나란히 하는 자세)로의 전환이 자연스럽습니다. 카빙 턴 시 엣지 전환 타이밍도 양호합니다.":"기본 스탠스가 균형 잡혀 있으며 토사이드 턴의 압력 이동이 자연스럽습니다."},
      {type:"warn",tag:"개선 포인트",text:sk?"내측 스키의 엣지 각도가 부족해 패럴렐 턴 완성도가 낮습니다. 플렉션을 더 깊게 유지해보세요.":"힐사이드 턴 시 상체가 과도하게 기울어집니다. 엣지 압력 조절에 집중해보세요."},
      {type:"info",tag:"코치 조언",text:sk?"폴 플랜팅(폴을 눈에 찍는 동작) 타이밍을 리듬감 있게 연습하면 턴 전환이 훨씬 자연스러워집니다.":"프론트사이드와 백사이드 턴의 엣지 압력 균형을 맞추는 연습을 꾸준히 해보세요."},
    ],
    tips:sk
      ?["숏턴 드릴: 폴 터치를 리듬에 맞춰 연습하기","사이드슬리핑으로 엣지 감각 키우기","플렉션-익스텐션으로 압력 이동 타이밍 익히기","뒤에서 촬영해 패럴렐 자세와 무릎 굴곡 확인하기"]
      :["엣지 체크 드릴: 힐사이드·토사이드 번갈아 익히기","앵귤레이션: 무릎을 슬로프 방향으로 눌러 엣지 각도 만들기","로테이션을 줄이고 엣지 압력으로 방향 조절 연습","발목 스트레칭으로 엣지 컨트롤 정밀도 향상"],
  };
}
