import { useState, useRef, useEffect, useCallback } from "react";

const MODEL = "claude-sonnet-4-20250514";
const VERSION = "ver 0.01-6";

/* ── API ──────────────────────────────────────────────────── */
async function apiCall(messages, system, apiKey) {
  const key = apiKey || window.__RIDEAI_KEY__ || "";
  if (!key) throw new Error("API 키가 없습니다.");
  const isLocal = window.location.hostname === "localhost";
  const url = isLocal ? "https://api.anthropic.com/v1/messages" : "/api/proxy";
  const headers = { "Content-Type": "application/json", "x-api-key": key };
  if (isLocal) headers["anthropic-version"] = "2023-06-01";
  const r = await fetch(url, { method:"POST", headers,
    body: JSON.stringify({ model:MODEL, max_tokens:3000, system, messages }) });
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
function captureFrames(vid, n=4) {
  return new Promise(resolve => {
    const frames=[];
    function snap() {
      try {
        const vw=vid.videoWidth, vh=vid.videoHeight;
        if (!vw||!vh) return null;
        const W=800, c=document.createElement("canvas");
        c.width=W; c.height=Math.round(W*vh/vw);
        c.getContext("2d").drawImage(vid,0,0,c.width,c.height);
        const px=c.getContext("2d").getImageData(0,0,30,30).data;
        let s=0; for(let i=0;i<px.length;i+=4) s+=px[i]+px[i+1]+px[i+2];
        if(s<500) return null;
        const d=c.toDataURL("image/jpeg",0.88);
        return d.length>4000?{data:d,time:parseFloat(vid.currentTime.toFixed(1)),w:c.width,h:c.height}:null;
      } catch { return null; }
    }
    function waitMeta() {
      return new Promise((ok,fail)=>{
        if(vid.readyState>=1&&vid.duration>0){ok();return;}
        const t=setTimeout(()=>fail(new Error("timeout")),12000);
        const h=()=>{clearTimeout(t);ok();};
        vid.addEventListener("loadedmetadata",h,{once:true});
        vid.addEventListener("durationchange",h,{once:true});
      });
    }
    function captureAt(t) {
      return new Promise(res=>{
        let done=false;
        const finish=()=>{ if(done)return; done=true; requestAnimationFrame(()=>requestAnimationFrame(()=>res(snap()))); };
        const guard=setTimeout(()=>{ if(!done){done=true;res(snap());} },4000);
        vid.addEventListener("seeked",()=>{ clearTimeout(guard); setTimeout(finish,250); },{once:true});
        try{ vid.currentTime=t; } catch{ clearTimeout(guard); done=true; res(null); }
      });
    }
    (async()=>{
      try{ await waitMeta(); } catch{ resolve([]); return; }
      const dur=Math.max(vid.duration,1);
      const targets=Array.from({length:n},(_,i)=>parseFloat(Math.min((i+0.5)*dur/n,dur-0.3).toFixed(1)));
      for(const t of targets){
        const f=await captureAt(t); if(f) frames.push(f);
        await new Promise(r=>setTimeout(r,100));
      }
      vid.currentTime=0; resolve(frames);
    })();
  });
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

      // ── Stick figure overlay (headless, thin lines, semi-transparent) ──
      // Proportional to image size — figure height ~35% of canvas
      const fh = OUT * 0.35;  // figure height
      const fcx = sx, fcy = sy; // figure center = subject click point
      // Joint positions (relative to center, torso = top 40%, legs = bottom 60%)
      const neck  = [fcx,       fcy - fh*0.50];
      const chest = [fcx,       fcy - fh*0.28];
      const hip   = [fcx,       fcy];
      const lSh   = [fcx-fh*0.22, fcy-fh*0.38];
      const rSh   = [fcx+fh*0.22, fcy-fh*0.38];
      const lEl   = [fcx-fh*0.28, fcy-fh*0.12];
      const rEl   = [fcx+fh*0.28, fcy-fh*0.12];
      const lWr   = [fcx-fh*0.22, fcy+fh*0.10];
      const rWr   = [fcx+fh*0.22, fcy+fh*0.10];
      const lKn   = [fcx-fh*0.13, fcy+fh*0.32];
      const rKn   = [fcx+fh*0.13, fcy+fh*0.32];
      const lFt   = [fcx-fh*0.10, fcy+fh*0.60];
      const rFt   = [fcx+fh*0.10, fcy+fh*0.60];

      const figColor = "rgba(255,255,255,0.65)";
      ctx.strokeStyle = figColor; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";

      const line = (a,b) => { ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke(); };
      // Spine
      line(neck, chest); line(chest, hip);
      // Arms
      line(lSh, lEl); line(lEl, lWr);
      line(rSh, rEl); line(rEl, rWr);
      // Legs
      line(hip, lKn); line(lKn, lFt);
      line(hip, rKn); line(rKn, rFt);
      // Shoulder bar
      line(lSh, rSh);
      // Hip bar
      line([fcx-fh*0.10,fcy], [fcx+fh*0.10,fcy]);
      // Joint dots
      const dot = (p,r) => { ctx.beginPath(); ctx.arc(p[0],p[1],r,0,Math.PI*2); ctx.fillStyle=figColor; ctx.fill(); };
      [neck,lSh,rSh,lEl,rEl,hip,lKn,rKn].forEach(p=>dot(p,3.5));

      // Annotations remapped to cropped coords
      (anns||[]).forEach(a=>{
        const col=a.type==="good"?"#22c55e":"#ef4444";
        const px=(a.x*W-x0)*scale, py=(a.y*H-y0)*scale;
        if(px<-40||px>OUT+40||py<-40||py>OUT+40) return;
        ctx.beginPath(); ctx.arc(px,py,18,0,Math.PI*2);
        ctx.fillStyle=col+"28"; ctx.fill(); ctx.strokeStyle=col; ctx.lineWidth=3; ctx.stroke();
        if(a.arrow){
          const ax=(a.arrow.x*W-x0)*scale, ay=(a.arrow.y*H-y0)*scale;
          const ang=Math.atan2(ay-py,ax-px);
          ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(ax,ay);
          ctx.strokeStyle=col; ctx.lineWidth=3; ctx.setLineDash([7,3]); ctx.stroke(); ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(ax,ay);
          ctx.lineTo(ax-15*Math.cos(ang-0.4),ay-15*Math.sin(ang-0.4));
          ctx.lineTo(ax-15*Math.cos(ang+0.4),ay-15*Math.sin(ang+0.4));
          ctx.closePath(); ctx.fillStyle=col; ctx.fill();
          const fs=14; ctx.font="bold "+fs+"px sans-serif";
          const lbl=a.label||"", tw=ctx.measureText(lbl).width;
          const lx=ax+12, ly=ay-6, bw=tw+16, bh=fs+10, bx=lx-4, by=ly-fs-2, br=5;
          ctx.fillStyle="rgba(0,0,0,0.88)";
          ctx.beginPath(); ctx.moveTo(bx+br,by); ctx.lineTo(bx+bw-br,by); ctx.arcTo(bx+bw,by,bx+bw,by+br,br);
          ctx.lineTo(bx+bw,by+bh-br); ctx.arcTo(bx+bw,by+bh,bx+bw-br,by+bh,br);
          ctx.lineTo(bx+br,by+bh); ctx.arcTo(bx,by+bh,bx,by+bh-br,br);
          ctx.lineTo(bx,by+br); ctx.arcTo(bx,by,bx+br,by,br);
          ctx.closePath(); ctx.fill(); ctx.strokeStyle=col; ctx.lineWidth=1; ctx.stroke();
          ctx.fillStyle=col; ctx.fillText(lbl,lx+4,ly);
        }
      });
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
function FeedbackCard({type,tag,text}){const bc={good:"#16a34a",warn:"#dc2626",info:"#2563eb"}[type]||"#2563eb";return(<div style={{background:"#fff",border:"0.5px solid rgba(0,0,0,0.08)",borderLeft:"2.5px solid "+bc,borderRadius:8,padding:"14px 16px",marginBottom:10}}><div style={{marginBottom:8}}><Tag type={type}>{tag}</Tag></div><p style={{fontSize:14,color:"#0f172a",lineHeight:1.75,margin:0}}>{text}</p></div>);}

function FrameCard({frame}){
  const ref=useRef(null);
  useEffect(()=>{if(ref.current&&frame.canvas){const el=ref.current;el.width=frame.canvas.width;el.height=frame.canvas.height;el.getContext("2d").drawImage(frame.canvas,0,0);}},[frame.canvas]);
  return(<div style={{background:"#fff",border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:12,overflow:"hidden"}}>
    {frame.canvas?<canvas ref={ref} style={{width:"100%",display:"block"}}/>:frame.svg?<div dangerouslySetInnerHTML={{__html:frame.svg}} style={{width:"100%",display:"block",lineHeight:0}}/>:<div style={{aspectRatio:"1",background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center",color:"#94a3b8",fontSize:13}}>준비 중...</div>}
    <div style={{padding:"12px 14px"}}>
      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}><Tag type={frame.type}>{frame.type==="good"?"✅ 잘된 점":"⚠️ 개선 필요"}</Tag>{frame.time!=null&&<span style={{fontSize:11,color:"#94a3b8"}}>{frame.time.toFixed(1)}초</span>}</div>
      <div style={{fontSize:13,fontWeight:500,marginBottom:5}}>{frame.title}</div>
      <div style={{fontSize:13,color:"#475569",lineHeight:1.7}}>{frame.desc}</div>
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
    <div style={{fontSize:13,color:"#64748b",marginBottom:14}}>사진에서 사람을 클릭하면 포인트가 찍힙니다. 정확히 클릭할수록 정밀한 분석이 가능합니다.</div>
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

/* ── MAIN APP ─────────────────────────────────────────────── */
export default function App(){
  const [sport,setSport]=useState("ski");
  const [file,setFile]=useState(null);
  const [phase,setPhase]=useState("sport");
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

      setLoadMsg("프레임 캡처 중...");setPct(20);
      const frames=await captureFrames(vid,4);
      vid.style.cssText="width:2px;height:2px;opacity:0.01;position:fixed;top:0";
      console.log("captured:",frames.length);
      setCapturedFrames(frames);

      setLoadMsg("AI 코치 분석 중...");setPct(40);
      const isSki=sport==="ski", sl=isSki?"스키":"스노보드";
      const termGuide=isSki
        ?"스키 용어+괄호설명: '카빙 턴(날 세워 도는 기술)','엣지(스키 측면 날)','전경 자세(앞으로 기울임)','패럴렐(양 스키 나란히)','플렉션(무릎·발목 굽히기)','폴 플랜팅(폴 눈에 찍기)','상체 선행(상체가 먼저 도는 현상)'"
        :"스노보드 용어+괄호설명: '토사이드(발가락 쪽 엣지)','힐사이드(뒤꿈치 쪽 엣지)','앵귤레이션(관절 꺾어 엣지 각도)','로테이션(어깨 방향 전환)','스탠스(발 위치와 넓이)','카빙(엣지로 정밀하게 도는 기술)'";

      const msgContent=[];
      if(frames.length>0){
        msgContent.push({type:"text",text:"아래 "+frames.length+"개 이미지는 "+sl+" 라이딩 영상 캡처입니다. 각 이미지에서 라이더의 위치와 자세를 직접 분석하세요. annotations.x,y는 라이더 몸 중심, arrow.x,y는 분석할 신체부위 실제 위치(0.0=좌/위, 1.0=우/아래)입니다."});
        frames.forEach((f,i)=>{
          msgContent.push({type:"text",text:"[장면 "+(i+1)+"/"+frames.length+" — "+f.time+"초]"});
          msgContent.push({type:"image",source:{type:"base64",media_type:"image/jpeg",data:f.data.split(",")[1]}});
        });
      }
      msgContent.push({type:"text",text:
        "전문 "+sl+" 코치로서 분석하세요. 설명: "+termGuide+
        "\n\nJSON으로만 응답(마크다운 없이):\n"+
        '{"scores":[{"label":"자세","value":75,"color":"#3b82f6"},{"label":"균형","value":70,"color":"#22c55e"},{"label":"기술","value":68,"color":"#f59e0b"}],'+
        '"frames":[{"frameIndex":0,"type":"good","title":"제목10자","desc":"전문용어(설명) 2문장","annotations":[{"x":0.5,"y":0.5,"type":"good","label":"라벨","arrow":{"x":0.5,"y":0.6}}]},'+
        '{"frameIndex":1,"type":"warn","title":"제목","desc":"전문용어(설명) 2문장","annotations":[{"x":0.5,"y":0.5,"type":"warn","label":"라벨","arrow":{"x":0.5,"y":0.6}}]},'+
        '{"frameIndex":2,"type":"good","title":"제목","desc":"전문용어(설명) 2문장","annotations":[{"x":0.5,"y":0.5,"type":"good","label":"라벨","arrow":{"x":0.5,"y":0.6}}]},'+
        '{"frameIndex":3,"type":"warn","title":"제목","desc":"전문용어(설명) 2문장","annotations":[{"x":0.5,"y":0.5,"type":"warn","label":"라벨","arrow":{"x":0.5,"y":0.6}}]}],'+
        '"feedback":[{"type":"good","tag":"잘된 점","text":"2~3문장"},{"type":"warn","tag":"개선 포인트","text":"2~3문장"},{"type":"info","tag":"코치 조언","text":"2~3문장"}],'+
        '"tips":["팁1","팁2","팁3","팁4"]}'+
        "\n규칙: value 60-95, good/warn 각2개, 한국어, 라이더 실제 위치로 x/y 지정"
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
          const c=document.createElement("canvas"); c.width=500; c.height=500;
          c.getContext("2d").drawImage(img,x0,y0,side,side,0,0,500,500);
          res(c.toDataURL("image/jpeg",0.88));
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
        const termGuide2=isSki
          ?"스키: 카빙 턴(날 세워 도는 기술),엣지(측면 날),전경 자세(앞으로 기울임),플렉션(무릎굽히기),상체 선행(상체가 먼저 도는 현상)"
          :"스노보드: 토사이드(발가락 쪽 엣지),힐사이드(뒤꿈치 쪽 엣지),앵귤레이션(관절 꺾어 엣지 각도),로테이션(어깨 방향 전환),스탠스(발 위치)";
        msg2.push({type:"text",text:
          "전문 "+sl+" 코치로서 위 크롭 이미지를 바탕으로 정밀 분석하세요. 설명: "+termGuide2+
          "\n\nJSON으로만 응답(마크다운 없이):\n"+
          '{"scores":[{"label":"자세","value":78,"color":"#3b82f6"},{"label":"균형","value":72,"color":"#22c55e"},{"label":"기술","value":70,"color":"#f59e0b"}],'+
          '"frames":[{"frameIndex":0,"type":"good","title":"제목10자","desc":"신체부위 구체적 분석 2문장","annotations":[{"x":0.5,"y":0.45,"type":"good","label":"라벨","arrow":{"x":0.5,"y":0.6}}]},'+
          '{"frameIndex":1,"type":"warn","title":"제목","desc":"신체부위 구체적 분석 2문장","annotations":[{"x":0.5,"y":0.45,"type":"warn","label":"라벨","arrow":{"x":0.5,"y":0.58}}]},'+
          '{"frameIndex":2,"type":"good","title":"제목","desc":"신체부위 구체적 분석 2문장","annotations":[{"x":0.5,"y":0.45,"type":"good","label":"라벨","arrow":{"x":0.5,"y":0.6}}]},'+
          '{"frameIndex":3,"type":"warn","title":"제목","desc":"신체부위 구체적 분석 2문장","annotations":[{"x":0.5,"y":0.45,"type":"warn","label":"라벨","arrow":{"x":0.5,"y":0.58}}]}],'+
          '"feedback":[{"type":"good","tag":"잘된 점","text":"구체적 칭찬 2~3문장"},{"type":"warn","tag":"개선 포인트","text":"구체적 개선점 2~3문장"},{"type":"info","tag":"코치 조언","text":"실용적 훈련 조언 2~3문장"}],'+
          '"tips":["구체적 팁1","팁2","팁3","팁4"]}'+
          "\n규칙: value 60-95, good/warn 각2개, 한국어, 크롭이미지 기준 x/y(0.3~0.7 범위에 라이더 있음)"
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
      annotated.push({...fd,canvas,svg,time:frame?.time??null});
      setPct(72+Math.round((i+1)/fl.length*26));
    }
    setPct(100);setResult({...refinedData,annotated});setTab(annotated.some(f=>f.type==="good")?"good":"warn");setPhase("done");
  };

  const reset=()=>{
    setPhase("sport");setFile(null);setResult(null);setRawData(null);setCapturedFrames([]);setError("");setPct(0);
    if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current=null;}
    if(fileRef.current) fileRef.current.value="";
    if(vidRef.current) vidRef.current.src="";
  };

  const groups=result?{good:(result.annotated||[]).filter(f=>f.type==="good"),warn:(result.annotated||[]).filter(f=>f.type==="warn")}:{good:[],warn:[]};

  return(
    <div style={{minHeight:"100vh",background:"#f8fafc"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}*{box-sizing:border-box;margin:0;padding:0}`}</style>
      <video ref={vidRef} muted playsInline style={{position:"fixed",right:0,bottom:0,width:2,height:2,opacity:0.01,pointerEvents:"none"}}/>
      <div style={{padding:"1.5rem 20px 60px",maxWidth:720,margin:"0 auto"}}>

        {/* HEADER */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
          <div style={{width:42,height:42,background:"#eff6ff",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>⛷</div>
          <div><div style={{fontSize:20,fontWeight:600,color:"#0f172a"}}>RIDE AI</div><div style={{fontSize:12,color:"#94a3b8"}}>스키·스노보드 AI 라이딩 코치</div></div>
          <button onClick={()=>setShowKeyInput(v=>!v)} style={{marginLeft:"auto",padding:"6px 12px",borderRadius:8,border:"0.5px solid rgba(0,0,0,0.15)",background:apiKey?"#f0fdf4":"#fef2f2",color:apiKey?"#166534":"#991b1b",fontSize:12,cursor:"pointer"}}>
            {apiKey?"🔑 API 키 설정됨":"🔑 API 키 필요"}
          </button>
        </div>

        {showKeyInput&&(<div style={{background:"#f8fafc",border:"0.5px solid rgba(0,0,0,0.1)",borderRadius:12,padding:16,marginBottom:20}}>
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
          <div style={{display:"flex",gap:12}}>
            {[["ski","🎿","스키","#2563eb","#dbeafe","#1d4ed8"],["snowboard","🏂","스노보드","#7c3aed","#ede9fe","#6d28d9"]].map(([s,icon,lbl,ac,bg,bc])=>(
              <button key={s} onClick={()=>{setSport(s);setPhase("upload");}} style={{flex:1,padding:"28px 16px",borderRadius:16,border:"2px solid "+ac,background:bg,color:bc,cursor:"pointer",textAlign:"center",boxShadow:"0 2px 12px "+ac+"22"}}>
                <div style={{fontSize:40,marginBottom:10}}>{icon}</div>
                <div style={{fontSize:17,fontWeight:600}}>{lbl}</div>
                <div style={{fontSize:12,color:ac,marginTop:4,opacity:0.8}}>선택 →</div>
              </button>
            ))}
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
          <div style={{background:"#f8fafc",border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:10,padding:"12px 14px",marginBottom:14,fontSize:13,color:"#64748b",lineHeight:1.7}}>
            <div style={{fontWeight:500,color:"#475569",marginBottom:3}}>📋 업로드 안내</div>
            <div>• 최대 파일 용량: <strong>100MB</strong></div>
            <div>• 지원 형식: MP4, MOV, AVI</div>
            <div>• 라이더가 화면에 잘 보이는 영상일수록 분석 정확도가 높아집니다</div>
            <div>• 영상이 길수록 분석 시간이 다소 걸릴 수 있습니다</div>
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

        {/* STEP 5: DONE */}
        {phase==="done"&&result&&(<div style={{animation:"fadeUp 0.4s ease"}}>
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
            {(result.feedback||[]).map((f,i)=><FeedbackCard key={i} {...f}/>)}
          </div>
          <div style={{background:"#fff",border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:12,padding:"18px 20px",marginBottom:24}}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:14}}>이렇게 연습해보세요 💡</div>
            {(result.tips||[]).map((t,i)=>(
              <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:12}}>
                <span style={{minWidth:24,height:24,background:"#eff6ff",borderRadius:99,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,color:"#1e40af",flexShrink:0}}>{i+1}</span>
                <span style={{fontSize:14,lineHeight:1.65}}>{t}</span>
              </div>
            ))}
          </div>
          <button onClick={reset} style={{display:"block",margin:"0 auto",padding:"10px 28px",border:"0.5px solid rgba(0,0,0,0.15)",borderRadius:8,background:"transparent",color:"#64748b",fontSize:13,cursor:"pointer"}}>↩ 새 영상 분석하기</button>
        </div>)}

        <div style={{textAlign:"center",padding:"32px 0 8px",fontSize:11,color:"#cbd5e1"}}>RIDE AI {VERSION}</div>
      </div>
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
