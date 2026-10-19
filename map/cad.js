// 지적도 편집 엔진 — 캔버스에 그리고, 캐드처럼 선택·그립·그리기·이동·복사·회전·삭제·스냅·실행취소를 한다.
// 좌표: 도면단위(du). 1pt = 10du (원본 PDF 기준). 화면 = 도면 × s + o
const TAU = Math.PI * 2;
const clone = o => JSON.parse(JSON.stringify(o, (k, v) => k.startsWith("_") ? undefined : v));
const strip = e => clone(e);
let seq = 0;
export const newId = () => "n" + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

const W_WORLD = 1.2;                         // 원본 선굵기 1 = 0.12pt
const minPx = w => w <= 1 ? 0.7 : w <= 2 ? 1.1 : w <= 4 ? 1.7 : 2.6;
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx - px, y = ay + t * dy - py; return Math.sqrt(x * x + y * y);
};
const inPoly = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { const yi = p[i + 1], yj = p[j + 1]; if ((yi > y) !== (yj > y) && x < (p[j] - p[i]) * (y - yi) / (yj - yi) + p[i]) c = !c; } return c; };
const segRect = (ax, ay, bx, by, r) => {   // 선분이 사각형과 겹치는지
  const inR = (x, y) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
  if (inR(ax, ay) || inR(bx, by)) return true;
  const X = (p1, p2, p3, p4) => { const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]); if (!d) return false; const u = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d, v = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d; return u >= 0 && u <= 1 && v >= 0 && v <= 1; };
  const a = [ax, ay], b = [bx, by], c = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
  return X(a, b, c[0], c[1]) || X(a, b, c[1], c[2]) || X(a, b, c[2], c[3]) || X(a, b, c[3], c[0]);
};
export const polyArea = p => { let a = 0; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += (p[j] + p[i]) * (p[j + 1] - p[i + 1]); return Math.abs(a / 2); };
export const polyLen = (p, z) => { let L = 0; for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); if (z && p.length > 4) L += Math.hypot(p[0] - p[p.length - 2], p[1] - p[p.length - 1]); return L; };

const TOOLS = {
  L: "선", PL: "폴리선", REC: "사각형", C: "원", H: "영역", T: "글자", DIM: "치수", DI: "거리 재기",
  M: "이동", CO: "복사", RO: "회전", E: "삭제", CAL: "축척 맞추기",
};
export const ALIAS = {
  L: "L", LINE: "L", 선: "L", PL: "PL", PLINE: "PL", 폴리선: "PL", REC: "REC", RECT: "REC", RECTANG: "REC", 사각형: "REC",
  C: "C", CIRCLE: "C", 원: "C", H: "H", AREA: "H", HATCH: "H", 영역: "H", T: "T", TEXT: "T", DT: "T", MT: "T", 글자: "T", 텍스트: "T",
  DIM: "DIM", DLI: "DIM", 치수: "DIM", DI: "DI", DIST: "DI", 거리: "DI", M: "M", MOVE: "M", 이동: "M", CO: "CO", CP: "CO", COPY: "CO", 복사: "CO",
  RO: "RO", ROTATE: "RO", 회전: "RO", E: "E", ERASE: "E", 삭제: "E", CAL: "CAL", 축척: "CAL",
};

export class Cad {
  constructor(canvas, cb = {}) {
    this.cv = canvas; this.ctx = canvas.getContext("2d"); this.cb = cb;
    this.view = { s: 0.1, ox: 0, oy: 0 };
    this.layers = []; this.ents = []; this.byId = new Map(); this.base = new Map();
    this.sel = new Set(); this.hover = null;
    this.undoS = []; this.redoS = []; this.dirty = 0;
    this.editable = false; this.osnap = true; this.ortho = false;
    this.cur = { layer: "작업", color: null, w: 2, fill: "#3b82f6", fo: 0.3, th: 0 };
    this.settings = {};
    this.tool = null; this.last = null; this.mouse = { sx: 0, sy: 0, x: 0, y: 0 }; this.snap = null;
    this.glyphs = []; this.mctx = document.createElement("canvas").getContext("2d");
    this._bind();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
  }

  /* ---------- 불러오기 / 저장용 차이 ---------- */
  load(base, edits = {}) {
    this.doc = base;
    this.glyphs = base.glyphs.map(d => d ? new Path2D(d) : null);
    const lay = new Map((base.layers || []).map(l => [l.id, { ...l, vis: true, lock: false }]));
    for (const e of base.ents) { const L = lay.get(e.l); if (L && e.c && e.c.toLowerCase() === L.color.toLowerCase()) delete e.c; this.base.set(e.id, JSON.stringify(e)); }
    this.layers = edits.layers?.length ? edits.layers.map(l => ({ vis: true, lock: false, ...l })) : [...lay.values()];
    if (!this.layers.some(l => l.id === "작업")) this.layers.push({ id: "작업", name: "작업", color: "#e11d48", vis: true, lock: false });
    const del = new Set(edits.del || []), mod = edits.mod || {};
    this.ents = [];
    for (const e of base.ents) { if (del.has(e.id)) continue; this.ents.push(mod[e.id] ? { ...mod[e.id], id: e.id } : { ...e }); }
    for (const e of edits.add || []) this.ents.push({ ...e });
    this.byId = new Map(this.ents.map(e => [e.id, e]));
    this.settings = { ...(edits.settings || {}) };
    this.undoS = []; this.redoS = []; this.dirty = 0; this.sel.clear();
    this.render();
  }
  diff() {
    const add = [], mod = {}, del = [];
    for (const e of this.ents) {
      const b = this.base.get(e.id);
      if (!b) add.push(strip(e)); else { const s = JSON.stringify(strip(e)); if (s !== b) mod[e.id] = strip(e); }
    }
    for (const id of this.base.keys()) if (!this.byId.has(id)) del.push(id);
    return { add, mod, del, layers: this.layers.map(({ id, name, color, vis, lock }) => ({ id, name, color, vis, lock })), settings: this.settings };
  }

  /* ---------- 좌표 ---------- */
  resize() {
    const r = this.cv.parentElement.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    const first = !this.W;
    this.W = r.width; this.H = r.height; this.dpr = dpr;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
    this.cv.style.width = r.width + "px"; this.cv.style.height = r.height + "px";
    if (first && this.doc) this.fit(); else this.render();
  }
  toW(sx, sy) { const v = this.view; return [(sx - v.ox) / v.s, (sy - v.oy) / v.s]; }
  toS(x, y) { const v = this.view; return [x * v.s + v.ox, y * v.s + v.oy]; }
  fit(b) {
    b = b || this.extents(); if (!b || !this.W) return;
    const pad = 30, s = Math.min((this.W - pad * 2) / Math.max(1, b[2] - b[0]), (this.H - pad * 2) / Math.max(1, b[3] - b[1]));
    this.view = { s, ox: this.W / 2 - (b[0] + b[2]) / 2 * s, oy: this.H / 2 - (b[1] + b[3]) / 2 * s };
    this.render(); this.cb.onView?.();
  }
  extents() {
    let b = null;
    for (const e of this.ents) { if (!this.layerOf(e).vis || e.t === "gl" || e.t === "tx") continue; const k = this.bbox(e); b = b ? [Math.min(b[0], k[0]), Math.min(b[1], k[1]), Math.max(b[2], k[2]), Math.max(b[3], k[3])] : [...k]; }
    return b || this.doc?.ext;
  }
  zoomAt(sx, sy, f) {
    const v = this.view, ns = Math.max(0.01, Math.min(60, v.s * f)); f = ns / v.s;
    v.ox = sx - (sx - v.ox) * f; v.oy = sy - (sy - v.oy) * f; v.s = ns;
    this.render(); this.cb.onView?.();
  }
  flyTo(x, y, s) {
    const v = this.view, from = { ...v }, to = { s: s || Math.max(v.s, 1.2) }; to.ox = this.W / 2 - x * to.s; to.oy = this.H / 2 - y * to.s;
    const t0 = performance.now(), D = 380;
    const step = t => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3);
      // 확대 비율은 로그로 보간해야 자연스러움
      v.s = Math.exp(Math.log(from.s) + (Math.log(to.s) - Math.log(from.s)) * e);
      const cx = (this.W / 2 - from.ox) / from.s + ((x) - (this.W / 2 - from.ox) / from.s) * e, cy = (this.H / 2 - from.oy) / from.s + ((y) - (this.H / 2 - from.oy) / from.s) * e;
      v.ox = this.W / 2 - cx * v.s; v.oy = this.H / 2 - cy * v.s;
      this.render(); this.cb.onView?.(); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  // 거리 표시 (축척을 맞췄으면 m)
  fmtLen(du) { const k = this.settings.mPerDu; return k ? (du * k >= 100 ? (du * k).toFixed(1) : (du * k).toFixed(2)) + " m" : Math.round(du) + " (도면단위)"; }
  fmtArea(du2) { const k = this.settings.mPerDu; return k ? Math.round(du2 * k * k).toLocaleString() + " ㎡" : Math.round(du2).toLocaleString() + " (도면단위²)"; }
  lenIn(n) { const k = this.settings.mPerDu; return k ? n / k : n; }   // 입력한 숫자(m) → 도면단위

  /* ---------- 엔티티 도우미 ---------- */
  layerOf(e) { return this._lay?.get(e.l) || this.layers.find(l => l.id === e.l) || { vis: true, lock: false, color: "#000" }; }
  colorOf(e) { return e.c || this.layerOf(e).color || "#000"; }
  textW(e) {
    if (e.t === "gl") { const g = e.g[e.g.length - 1]; return (g?.[1] || 0) + (e.h || 21) * 0.62; }
    this.mctx.font = `${e.b ? 700 : 500} 100px Pretendard, "Malgun Gothic", sans-serif`;
    return this.mctx.measureText(e.s || "").width / 100 * e.h;
  }
  bbox(e) {
    if (e._b) return e._b;
    let b;
    if (e.t === "pl" || e.t === "dm") { const p = e.p; b = [Infinity, Infinity, -Infinity, -Infinity]; for (let i = 0; i < p.length; i += 2) { b[0] = Math.min(b[0], p[i]); b[2] = Math.max(b[2], p[i]); b[1] = Math.min(b[1], p[i + 1]); b[3] = Math.max(b[3], p[i + 1]); } if (e.t === "dm") { const o = Math.abs(e.o || 0) + 30; b = [b[0] - o, b[1] - o, b[2] + o, b[3] + o]; } }
    else if (e.t === "fill") { b = [Infinity, Infinity, -Infinity, -Infinity]; for (const r of e.p) for (let i = 0; i < r.length; i += 2) { b[0] = Math.min(b[0], r[i]); b[2] = Math.max(b[2], r[i]); b[1] = Math.min(b[1], r[i + 1]); b[3] = Math.max(b[3], r[i + 1]); } }
    else if (e.t === "ci") b = [e.x - e.r, e.y - e.r, e.x + e.r, e.y + e.r];
    else { const h = e.h || 21, w = this.textW(e), dy = e.t === "gl" ? (e.g[e.g.length - 1]?.[2] || 0) : 0;
      if (e.t === "tx" && e.r) { const a = e.r * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), pts = [[0, 0], [w, 0], [w, -h], [0, -h]].map(([x, y]) => [e.x + x * c - y * s, e.y + x * s + y * c]); b = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]; }
      else b = [e.x, e.y - h + Math.min(0, dy), e.x + w, e.y + h * 0.25 + Math.max(0, dy)]; }
    return (e._b = b);
  }
  path(e) {
    if (e._p) return e._p;
    const P = new Path2D();
    if (e.t === "pl") { const p = e.p; P.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) P.lineTo(p[i], p[i + 1]); if (e.z) P.closePath(); }
    else if (e.t === "fill") for (const r of e.p) { P.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) P.lineTo(r[i], r[i + 1]); P.closePath(); }
    else if (e.t === "ci") P.arc(e.x, e.y, e.r, 0, TAU);
    return (e._p = P);
  }
  touch(e) { delete e._p; delete e._b; }

  /* ---------- 그리기 ---------- */
  render() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._draw(); });
  }
  _draw() {
    const { ctx, dpr } = this, v = this.view; if (!this.W) return;
    this._lay = new Map(this.layers.map(l => [l.id, l]));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, this.W, this.H);
    const vr = [...this.toW(0, 0), ...this.toW(this.W, this.H)], m = 20 / v.s;
    const seen = e => { const L = this._lay.get(e.l); if (L && !L.vis) return false; const b = this.bbox(e); return !(b[2] < vr[0] - m || b[0] > vr[2] + m || b[3] < vr[1] - m || b[1] > vr[3] + m); };
    const vis = this.ents.filter(seen);
    const W = () => ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.ox, dpr * v.oy);
    W();
    // 1) 채움
    for (const e of vis) {
      if (e.t === "fill") { ctx.globalAlpha = e.fo ?? 1; ctx.fillStyle = this.colorOf(e); ctx.fill(this.path(e)); }
      else if ((e.t === "pl" && e.z || e.t === "ci") && e.f) { ctx.globalAlpha = e.fo ?? 0.3; ctx.fillStyle = e.f; ctx.fill(this.path(e), "evenodd"); }
    }
    ctx.globalAlpha = 1;
    // 2) 선
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (const e of vis) {
      if (e.t !== "pl" && e.t !== "ci") continue;
      const w = e.w || 1; ctx.lineWidth = Math.max(minPx(w) / v.s, w * W_WORLD);
      ctx.strokeStyle = this.colorOf(e); ctx.setLineDash(e.d ? [6 / v.s, 4 / v.s] : []); ctx.stroke(this.path(e));
    }
    ctx.setLineDash([]);
    // 3) 글자 · 치수
    for (const e of vis) {
      if (e.t === "gl") {
        const h = (e.h || 21) * v.s; if (h < 2.2) continue;
        ctx.fillStyle = this.colorOf(e);
        for (const g of e.g) { const P = this.glyphs[g[0]]; if (!P) continue;
          ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * (v.ox + (e.x + g[1]) * v.s), dpr * (v.oy + (e.y + (g[2] || 0)) * v.s)); ctx.fill(P); }
      } else if (e.t === "tx") {
        const px = e.h * v.s; if (px < 2.2) continue;
        const [sx, sy] = this.toS(e.x, e.y);
        ctx.setTransform(dpr, 0, 0, dpr, dpr * sx, dpr * sy); if (e.r) ctx.rotate(e.r * Math.PI / 180);
        ctx.font = `${e.b ? 700 : 500} ${px}px Pretendard, "Malgun Gothic", sans-serif`; ctx.textBaseline = "alphabetic";
        if (e.bg) { const tw = ctx.measureText(e.s).width; ctx.fillStyle = e.bg; ctx.fillRect(-px * 0.15, -px * 0.95, tw + px * 0.3, px * 1.25); }
        ctx.fillStyle = this.colorOf(e); ctx.fillText(e.s || "", 0, 0);
      } else if (e.t === "dm") this._dim(e);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 4) 선택 · 마우스 올림 표시
    const hl = (e, col, lw, dash) => {
      W(); ctx.strokeStyle = col; ctx.lineWidth = lw / v.s; ctx.setLineDash(dash ? [5 / v.s, 4 / v.s] : []);
      if (e.t === "pl" || e.t === "ci" || e.t === "fill") ctx.stroke(this.path(e));
      else { const b = this.bbox(e); ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); }
      ctx.setLineDash([]); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    if (this.hover && !this.sel.has(this.hover.id) && this.editable) hl(this.hover, "rgba(37,99,235,.55)", 3);
    for (const id of this.sel) { const e = this.byId.get(id); if (e) hl(e, "#2563eb", 2, true); }
    if (this.editable && this.sel.size && this.sel.size <= 60) {
      ctx.fillStyle = "#2563eb"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
      for (const id of this.sel) { const e = this.byId.get(id); if (!e) continue; for (const g of this.grips(e)) { const [sx, sy] = this.toS(g.x, g.y); ctx.fillRect(sx - 4, sy - 4, 8, 8); ctx.strokeRect(sx - 4, sy - 4, 8, 8); } }
    }
    this._drawTool();
    this.cb.onDraw?.();
  }
  _dim(e) {
    const { ctx, dpr } = this, [x1, y1, x2, y2] = e.p, L = Math.hypot(x2 - x1, y2 - y1); if (!L) return;
    const nx = -(y2 - y1) / L, ny = (x2 - x1) / L, o = e.o || 0;
    const a = this.toS(x1 + nx * o, y1 + ny * o), b = this.toS(x2 + nx * o, y2 + ny * o), p1 = this.toS(x1, y1), p2 = this.toS(x2, y2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const col = this.colorOf(e);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(a[0], a[1]); ctx.moveTo(p2[0], p2[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (const [p, d] of [[a, 1], [b, -1]]) { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + d * 9 * Math.cos(ang - 0.3), p[1] + d * 9 * Math.sin(ang - 0.3)); ctx.lineTo(p[0] + d * 9 * Math.cos(ang + 0.3), p[1] + d * 9 * Math.sin(ang + 0.3)); ctx.fill(); }
    const t = this.fmtLen(L).replace(" (도면단위)", ""), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    let r = ang; if (r > Math.PI / 2) r -= Math.PI; if (r < -Math.PI / 2) r += Math.PI;
    ctx.translate(mx, my); ctx.rotate(r); ctx.font = "600 12px Pretendard, sans-serif"; ctx.textAlign = "center";
    const tw = ctx.measureText(t).width; ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(-tw / 2 - 3, -17, tw + 6, 15); ctx.fillStyle = col; ctx.fillText(t, 0, -5); ctx.textAlign = "start";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------- 고르기 ---------- */
  pickable(e) { const L = this.layerOf(e); return L.vis && !L.lock; }
  hit(e, x, y, tol) {
    const b = this.bbox(e); if (x < b[0] - tol || x > b[2] + tol || y < b[1] - tol || y > b[3] + tol) return false;
    if (e.t === "pl") { const p = e.p, n = p.length; for (let i = 2; i < n; i += 2) if (segDist(x, y, p[i - 2], p[i - 1], p[i], p[i + 1]) <= tol) return true; if (e.z && n > 4 && segDist(x, y, p[n - 2], p[n - 1], p[0], p[1]) <= tol) return true; return !!(e.z && e.f && inPoly(x, y, p)); }
    if (e.t === "ci") { const d = Math.hypot(x - e.x, y - e.y); return Math.abs(d - e.r) <= tol || (e.f && d < e.r); }
    if (e.t === "fill") return e.p.some(r => inPoly(x, y, r));
    return true;   // 글자·치수는 상자 안이면
  }
  pick(sx, sy) {
    const [x, y] = this.toW(sx, sy), tol = 6 / this.view.s;
    const order = t => t === "tx" || t === "gl" || t === "dm" ? 0 : t === "pl" || t === "ci" ? 1 : 2;
    let best = null, bo = 9;
    for (let i = this.ents.length - 1; i >= 0; i--) { const e = this.ents[i]; const o = order(e.t) + (e.t === "pl" && e.z && e.f ? 0.5 : 0); if (o >= bo || !this.pickable(e)) continue; if (this.hit(e, x, y, tol)) { best = e; bo = o; if (o === 0) break; } }
    return best;
  }
  inRect(e, r, cross) {
    const b = this.bbox(e);
    if (!cross) return b[0] >= r[0] && b[2] <= r[2] && b[1] >= r[1] && b[3] <= r[3];
    if (b[2] < r[0] || b[0] > r[2] || b[3] < r[1] || b[1] > r[3]) return false;
    if (e.t === "pl") { const p = e.p; if (p.length === 2) return true; for (let i = 2; i < p.length; i += 2) if (segRect(p[i - 2], p[i - 1], p[i], p[i + 1], r)) return true; if (e.z && segRect(p[p.length - 2], p[p.length - 1], p[0], p[1], r)) return true; return !!(e.f && inPoly(r[0], r[1], p)); }
    if (e.t === "fill") return e.p.some(q => { for (let i = 0; i < q.length; i += 2) if (q[i] >= r[0] && q[i] <= r[2] && q[i + 1] >= r[1] && q[i + 1] <= r[3]) return true; return inPoly(r[0], r[1], q); });
    return true;
  }
  setSel(ids, add) {
    if (!add) this.sel.clear();
    for (const id of ids) { if (add && this.sel.has(id) && ids.length === 1) this.sel.delete(id); else this.sel.add(id); }
    this.render(); this.cb.onSel?.([...this.sel].map(id => this.byId.get(id)).filter(Boolean));
  }
  selected() { return [...this.sel].map(id => this.byId.get(id)).filter(Boolean); }

  /* ---------- 그립 ---------- */
  grips(e) {
    if (e.t === "pl") { const out = []; for (let i = 0; i < e.p.length; i += 2) out.push({ x: e.p[i], y: e.p[i + 1], i }); return out; }
    if (e.t === "dm") return [{ x: e.p[0], y: e.p[1], i: 0 }, { x: e.p[2], y: e.p[3], i: 2 }];
    if (e.t === "ci") return [{ x: e.x, y: e.y, c: 1 }, { x: e.x + e.r, y: e.y, r: 1 }];
    if (e.t === "tx" || e.t === "gl") return [{ x: e.x, y: e.y, c: 1 }];
    return [];
  }
  gripAt(sx, sy) {
    if (this.sel.size > 60) return null;
    for (const id of this.sel) { const e = this.byId.get(id); if (!e) continue; for (const g of this.grips(e)) { const [gx, gy] = this.toS(g.x, g.y); if (Math.abs(gx - sx) <= 6 && Math.abs(gy - sy) <= 6) return { e, g }; } }
    return null;
  }
  applyGrip(e, g, x, y, orig) {
    if (g.i != null) { e.p[g.i] = x; e.p[g.i + 1] = y; }
    else if (g.r) e.r = Math.max(1, Math.hypot(x - e.x, y - e.y));
    else { const dx = x - orig.x, dy = y - orig.y; Object.assign(e, { x: orig.x + dx, y: orig.y + dy }); }
    this.touch(e);
  }

  /* ---------- 변형 ---------- */
  move(e, dx, dy) {
    if (e.t === "pl" || e.t === "dm") for (let i = 0; i < e.p.length; i += 2) { e.p[i] += dx; e.p[i + 1] += dy; }
    else if (e.t === "fill") for (const r of e.p) for (let i = 0; i < r.length; i += 2) { r[i] += dx; r[i + 1] += dy; }
    else { e.x += dx; e.y += dy; }
    this.touch(e);
  }
  rotate(e, cx, cy, a) {
    const c = Math.cos(a), s = Math.sin(a), R = (x, y) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
    const RP = p => { for (let i = 0; i < p.length; i += 2) { const [x, y] = R(p[i], p[i + 1]); p[i] = x; p[i + 1] = y; } };
    if (e.t === "pl" || e.t === "dm") RP(e.p); else if (e.t === "fill") e.p.forEach(RP);
    else { [e.x, e.y] = R(e.x, e.y); if (e.t === "tx") e.r = ((e.r || 0) + a * 180 / Math.PI) % 360; }
    this.touch(e);
  }

  /* ---------- 바꾸기 기록 (실행취소) ---------- */
  commit(label, changes) {
    if (!changes.length) return;
    for (const c of changes) this._put(c.id, c.after);
    this.undoS.push({ label, changes }); if (this.undoS.length > 200) this.undoS.shift();
    this.redoS = []; this.dirty++;
    this.render(); this.cb.onChange?.(label);
  }
  _put(id, val) {
    const i = this.ents.findIndex(e => e.id === id);
    if (val == null) { if (i >= 0) this.ents.splice(i, 1); this.byId.delete(id); this.sel.delete(id); }
    else { const e = clone(val); if (i >= 0) this.ents[i] = e; else this.ents.push(e); this.byId.set(id, e); }
  }
  undo() { const u = this.undoS.pop(); if (!u) return this.log("되돌릴 작업이 없습니다."); for (const c of [...u.changes].reverse()) this._put(c.id, c.before); this.redoS.push(u); this.dirty++; this.log(`실행취소: ${u.label}`); this.render(); this.cb.onChange?.(); this.cb.onSel?.(this.selected()); }
  redo() { const u = this.redoS.pop(); if (!u) return this.log("다시 할 작업이 없습니다."); for (const c of u.changes) this._put(c.id, c.after); this.undoS.push(u); this.dirty++; this.log(`다시 실행: ${u.label}`); this.render(); this.cb.onChange?.(); }
  // 고른 객체들을 fn 으로 고치고 기록
  edit(label, ents, fn) {
    const ch = ents.map(e => { const before = clone(e), x = clone(e); fn(x); return { id: e.id, before, after: x }; });
    this.commit(label, ch);
  }
  addEnt(e, label) { e.id = e.id || newId(); e.l = e.l || this.cur.layer; this.commit(label || "추가", [{ id: e.id, before: null, after: e }]); return e; }
  erase(ents) { if (!ents.length) return; this.commit(`삭제 ${ents.length}개`, ents.map(e => ({ id: e.id, before: clone(e), after: null }))); this.log(`${ents.length}개를 지웠습니다.`); }
  log(m) { this.cb.onLog?.(m); }
  prompt(m) { this._prompt = m; this.cb.onPrompt?.(m); }

  /* ---------- 스냅 ---------- */
  findSnap(sx, sy) {
    if (!this.osnap || !this.editable) return null;
    const [x, y] = this.toW(sx, sy), tol = 10 / this.view.s; let best = null, bd = tol;
    const tryP = (px, py, kind) => { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = { x: px, y: py, kind }; } };
    for (const e of this.ents) {
      if (e.t === "fill" || !this.layerOf(e).vis) continue;
      const b = this.bbox(e); if (x < b[0] - tol || x > b[2] + tol || y < b[1] - tol || y > b[3] + tol) continue;
      if (e.t === "pl" || e.t === "dm") { const p = e.p; for (let i = 0; i < p.length; i += 2) tryP(p[i], p[i + 1], "끝점");
        if (bd > tol * 0.5) for (let i = 2; i < p.length; i += 2) tryP((p[i] + p[i - 2]) / 2, (p[i + 1] + p[i - 1]) / 2, "중간점"); }
      else if (e.t === "ci") { tryP(e.x, e.y, "중심"); for (const [a, b2] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) tryP(e.x + a * e.r, e.y + b2 * e.r, "사분점"); }
      else tryP(e.x, e.y, "삽입점");
    }
    if (!best && this.tool?.pts?.length) {   // 수직·수평 추적 보조
      const [lx, ly] = this.tool.pts.at(-1), [psx, psy] = this.toS(lx, ly);
      if (Math.abs(sy - psy) < 6) best = { x, y: ly, kind: "수평", soft: 1 }; else if (Math.abs(sx - psx) < 6) best = { x: lx, y, kind: "수직", soft: 1 };
    }
    return best;
  }
  // 마우스 위치 → 실제로 찍힐 점 (스냅 · 직교)
  point(sx, sy, from) {
    const s = this.findSnap(sx, sy); this.snap = s;
    let [x, y] = s ? [s.x, s.y] : this.toW(sx, sy);
    if (from && (this.ortho || this._shift) && (!s || s.soft)) { if (Math.abs(x - from[0]) > Math.abs(y - from[1])) y = from[1]; else x = from[0]; }
    return [x, y];
  }

  /* ---------- 도구 ---------- */
  run(cmd) {
    const k = ALIAS[String(cmd).trim().toUpperCase()] || ALIAS[String(cmd).trim()];
    if (!k) return false;
    if (!this.editable) { this.log("도면 편집 모드에서만 쓸 수 있습니다."); return true; }
    this.cancel(true);
    this.last = k;
    if (k === "E") { const s = this.selected(); if (s.length) { this.erase(s); return true; } }
    this.tool = { k, pts: [], stage: 0 };
    if (["M", "CO", "RO", "E"].includes(k) && !this.sel.size) { this.tool.picking = true; this.prompt(`${TOOLS[k]} — 객체를 고른 뒤 Enter (오른쪽 클릭)`); }
    else this._promptFor();
    this.cb.onTool?.(k); this.render();
    return true;
  }
  _promptFor() {
    const t = this.tool; if (!t) return this.prompt("");
    const n = t.pts.length, K = t.k, unit = this.settings.mPerDu ? "m" : "도면단위";
    const P = {
      L: n ? `선 — 다음 점 (숫자 입력 = 길이 ${unit}, Enter 끝)` : "선 — 첫 점을 지정",
      PL: n ? `폴리선 — 다음 점 (숫자 = 길이, C = 닫기, Enter 끝)` : "폴리선 — 첫 점을 지정",
      REC: n ? "사각형 — 반대쪽 모서리 (또는 가로,세로 입력)" : "사각형 — 첫 모서리를 지정",
      C: n ? `원 — 반지름 지정 (숫자 입력 = 반지름 ${unit})` : "원 — 중심점을 지정",
      H: n < 3 ? `영역 — 점을 차례로 찍으세요 (${n}개)` : `영역 — 다음 점, Enter = 영역 닫기 (면적 표시)`,
      T: n ? "글자 — 아래 입력칸에 내용을 쓰고 Enter" : "글자 — 넣을 위치를 지정",
      DIM: n === 0 ? "치수 — 첫 점" : n === 1 ? "치수 — 두 번째 점" : "치수 — 치수선 위치",
      DI: n ? "거리 재기 — 두 번째 점" : "거리 재기 — 첫 점",
      M: n ? "이동 — 옮길 위치 (숫자 = 거리)" : "이동 — 기준점을 지정",
      CO: n ? "복사 — 놓을 위치 (계속 찍으면 여러 개, Enter 끝)" : "복사 — 기준점을 지정",
      RO: n ? "회전 — 각도를 마우스로 지정하거나 숫자(도) 입력" : "회전 — 회전 중심점을 지정",
      CAL: n === 0 ? "축척 맞추기 — 실제 길이를 아는 두 점 중 첫 점" : n === 1 ? "축척 맞추기 — 두 번째 점" : "축척 맞추기 — 두 점 사이 실제 거리(m)를 입력하고 Enter",
    };
    this.prompt(P[K] || "");
  }
  cancel(silent) {
    if (this.tool && !silent) this.log("*취소*");
    this.tool = null; this.drag = null; this.snap = null; this.prompt(""); this.cb.onTool?.(null); this.render();
  }
  // Enter / 오른쪽 클릭
  enter() {
    const t = this.tool;
    if (!t) { if (this.last) this.run(this.last); return; }
    if (t.picking) { if (!this.sel.size) return this.cancel(); t.picking = false; this._promptFor(); return; }
    if (t.k === "PL" && t.pts.length >= 2) this._finishPoly(false);
    else if (t.k === "H" && t.pts.length >= 3) this._finishPoly(true);
    this.cancel(true);
  }
  _finishPoly(area) {
    const t = this.tool, p = t.pts.flat();
    if (area) { const e = this.addEnt({ t: "pl", p, z: 1, w: this.cur.w, f: this.cur.fill, fo: this.cur.fo, c: this.cur.color || undefined }, "영역");
      this.log(`영역을 만들었습니다 — 면적 ${this.fmtArea(polyArea(p))}, 둘레 ${this.fmtLen(polyLen(p, true))}`); this.setSel([e.id]); }
    else { this.addEnt({ t: "pl", p, w: this.cur.w, c: this.cur.color || undefined, ...(t.close ? { z: 1 } : {}) }, "폴리선"); this.log(`폴리선 길이 ${this.fmtLen(polyLen(p, t.close))}`); }
  }
  // 명령줄에 숫자·글자 입력
  input(txt) {
    const t = this.tool; txt = String(txt).trim();
    if (!t) return this.run(txt) || (txt && this.log(`알 수 없는 명령: ${txt}`), false);
    if (t.k === "T" && t.pts.length) { if (txt) { const e = this.addEnt({ t: "tx", x: t.pts[0][0], y: t.pts[0][1], s: txt, h: this.cur.th || Math.round(14 / this.view.s), c: this.cur.color || undefined }, "글자"); this.setSel([e.id]); } this.cancel(true); return true; }
    if (t.k === "CAL" && t.pts.length === 2) {
      const m = parseFloat(txt); if (!(m > 0)) { this.log("0보다 큰 숫자(m)를 입력하세요."); return true; }
      const du = Math.hypot(t.pts[1][0] - t.pts[0][0], t.pts[1][1] - t.pts[0][1]); this.settings.mPerDu = m / du; this.dirty++;
      this.log(`축척을 맞췄습니다: 도면 ${Math.round(du)}단위 = ${m} m`); this.cancel(true); this.cb.onChange?.("축척"); this.render(); return true;
    }
    if (/^c$/i.test(txt) && t.k === "PL" && t.pts.length >= 3) { t.close = true; this._finishPoly(false); this.cancel(true); return true; }
    const nums = txt.split(/[,\s]+/).map(Number);
    if (!txt || nums.some(isNaN)) { this.log("숫자를 입력하세요."); return true; }
    const n = nums[0], cur = this.toW(this.mouse.sx, this.mouse.sy);
    const along = from => { const d = Math.hypot(cur[0] - from[0], cur[1] - from[1]) || 1; let ux = (cur[0] - from[0]) / d, uy = (cur[1] - from[1]) / d; if (this.ortho || this._shift) { if (Math.abs(ux) > Math.abs(uy)) { ux = Math.sign(ux) || 1; uy = 0; } else { uy = Math.sign(uy) || 1; ux = 0; } } const L = this.lenIn(n); return [from[0] + ux * L, from[1] + uy * L]; };
    if (!t.pts.length) { this.log("먼저 화면에서 첫 점을 찍으세요."); return true; }
    const last = t.pts.at(-1);
    if (t.k === "C") { const e = this.addEnt({ t: "ci", x: last[0], y: last[1], r: this.lenIn(n), w: this.cur.w, c: this.cur.color || undefined }, "원"); this.cancel(true); return !!e; }
    if (t.k === "REC" && nums.length >= 2) { const [x, y] = last, w = this.lenIn(nums[0]), h = this.lenIn(nums[1]); this.addEnt({ t: "pl", p: [x, y, x + w, y, x + w, y + h, x, y + h], z: 1, w: this.cur.w, c: this.cur.color || undefined }, "사각형"); this.cancel(true); return true; }
    if (t.k === "RO") { this._rotateBy(n * Math.PI / 180); return true; }
    this.click(...this.toS(...along(last)), true);
    return true;
  }
  _rotateBy(a) { const [cx, cy] = this.tool.pts[0]; this.edit(`회전 ${Math.round(a * 180 / Math.PI)}°`, this.selected(), e => this.rotate(e, cx, cy, a)); this.cancel(true); }
  // 점 찍기 (sx,sy 화면좌표). exact = 계산된 점 그대로
  click(sx, sy, exact) {
    const t = this.tool; if (!t || t.picking) return;
    const last = t.pts.at(-1);
    const p = exact ? this.toW(sx, sy) : this.point(sx, sy, last);
    const L = this.cur, base = { w: L.w, c: L.color || undefined };
    switch (t.k) {
      case "L": if (last) this.addEnt({ t: "pl", p: [...last, ...p], ...base }, "선"); t.pts.push(p); break;
      case "PL": case "H": t.pts.push(p); break;
      case "REC": if (!last) t.pts.push(p); else { const [a, b] = last; if (a !== p[0] && b !== p[1]) this.addEnt({ t: "pl", p: [a, b, p[0], b, p[0], p[1], a, p[1]], z: 1, ...base }, "사각형"); return this.cancel(true); } break;
      case "C": if (!last) t.pts.push(p); else { this.addEnt({ t: "ci", x: last[0], y: last[1], r: Math.max(1, Math.hypot(p[0] - last[0], p[1] - last[1])), ...base }, "원"); return this.cancel(true); } break;
      case "T": t.pts.push(p); this.cb.onAskText?.(); break;
      case "DIM": t.pts.push(p); if (t.pts.length === 3) { const [a, b, c] = t.pts, Ln = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / Ln, ny = (b[0] - a[0]) / Ln; this.addEnt({ t: "dm", p: [...a, ...b], o: (c[0] - a[0]) * nx + (c[1] - a[1]) * ny, c: L.color || undefined }, "치수"); this.log(`치수 ${this.fmtLen(Ln)}`); return this.cancel(true); } break;
      case "DI": t.pts.push(p); if (t.pts.length === 2) { const [a, b] = t.pts, d = Math.hypot(b[0] - a[0], b[1] - a[1]); this.log(`거리 = ${this.fmtLen(d)}   (가로 ${this.fmtLen(Math.abs(b[0] - a[0]))}, 세로 ${this.fmtLen(Math.abs(b[1] - a[1]))})`); return this.cancel(true); } break;
      case "M": case "CO": if (!last) t.pts.push(p); else { const dx = p[0] - last[0], dy = p[1] - last[1], S = this.selected();
          if (t.k === "M") { this.edit(`이동 ${S.length}개`, S, e => this.move(e, dx, dy)); return this.cancel(true); }
          const ch = S.map(e => { const c = clone(e); c.id = newId(); this.move(c, dx, dy); return { id: c.id, before: null, after: c }; }); this.commit(`복사 ${S.length}개`, ch); t.copied = (t.copied || 0) + 1; } break;
      case "RO": if (!last) t.pts.push(p); else { this._rotateBy(Math.atan2(p[1] - last[1], p[0] - last[0])); return; } break;
      case "CAL": if (t.pts.length < 2) t.pts.push(p); break;
    }
    this._promptFor(); this.render();
  }
  _drawTool() {
    const t = this.tool, { ctx } = this, ms = this.mouse;
    // 끌어서 고르기 상자
    if (this.box) { const b = this.box, cross = b.x1 < b.x0; ctx.fillStyle = cross ? "rgba(34,197,94,.12)" : "rgba(37,99,235,.12)"; ctx.strokeStyle = cross ? "#16a34a" : "#2563eb"; ctx.setLineDash(cross ? [5, 4] : []); ctx.lineWidth = 1;
      ctx.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); ctx.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); ctx.setLineDash([]); }
    if (t && !t.picking && this._in) {
      const last = t.pts.at(-1), p = this.point(ms.sx, ms.sy, last), S = q => this.toS(q[0], q[1]);
      ctx.strokeStyle = "#e11d48"; ctx.fillStyle = "rgba(225,29,72,.12)"; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      const poly = (pts, close, fill) => { ctx.beginPath(); pts.forEach((q, i) => { const [a, b] = S(q); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); if (close) ctx.closePath(); if (fill) ctx.fill(); ctx.stroke(); };
      let info = "";
      if (last) {
        if (t.k === "REC") poly([last, [p[0], last[1]], p, [last[0], p[1]]], true, false), info = `${this.fmtLen(Math.abs(p[0] - last[0]))} × ${this.fmtLen(Math.abs(p[1] - last[1]))}`;
        else if (t.k === "C") { const r = Math.hypot(p[0] - last[0], p[1] - last[1]), [cx, cy] = S(last); ctx.beginPath(); ctx.arc(cx, cy, r * this.view.s, 0, TAU); ctx.stroke(); poly([last, p]); info = `반지름 ${this.fmtLen(r)}`; }
        else if (t.k === "H") { poly([...t.pts, p], true, true); info = t.pts.length >= 2 ? `면적 ${this.fmtArea(polyArea([...t.pts, p].flat()))}` : ""; }
        else if (t.k === "PL") { poly([...t.pts, p]); info = this.fmtLen(Math.hypot(p[0] - last[0], p[1] - last[1])); }
        else if (t.k === "DIM" && t.pts.length === 2) poly([t.pts[0], t.pts[1], p]);
        else if (t.k === "M" || t.k === "CO") { poly([last, p]); const dx = (p[0] - last[0]) * this.view.s, dy = (p[1] - last[1]) * this.view.s; ctx.save(); ctx.translate(dx, dy); ctx.globalAlpha = .55; ctx.setLineDash([]);
          const { dpr } = this, v = this.view; ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * (v.ox + dx), dpr * (v.oy + dy)); ctx.lineWidth = 2 / v.s; for (const e of this.selected()) { if (e.t === "pl" || e.t === "ci" || e.t === "fill") ctx.stroke(this.path(e)); else { const b = this.bbox(e); ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); } } ctx.restore(); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); info = this.fmtLen(Math.hypot(p[0] - last[0], p[1] - last[1])); }
        else if (t.k === "RO") { poly([last, p]); info = `${Math.round(-Math.atan2(p[1] - last[1], p[0] - last[0]) * 180 / Math.PI)}°`; }
        else if (t.k !== "T") { poly([last, p]); info = this.fmtLen(Math.hypot(p[0] - last[0], p[1] - last[1])); }
      }
      ctx.setLineDash([]);
      if (info) { ctx.font = "600 12px Pretendard, sans-serif"; const w = ctx.measureText(info).width; ctx.fillStyle = "rgba(17,24,39,.85)"; ctx.fillRect(ms.sx + 16, ms.sy + 14, w + 12, 20); ctx.fillStyle = "#fff"; ctx.fillText(info, ms.sx + 22, ms.sy + 28); }
    }
    // 스냅 표시
    if (this.snap && this._in && this.editable) {
      const [x, y] = this.toS(this.snap.x, this.snap.y); ctx.strokeStyle = this.snap.soft ? "#16a34a" : "#f59e0b"; ctx.lineWidth = 2;
      if (this.snap.kind === "중간점") { ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y + 5); ctx.lineTo(x - 7, y + 5); ctx.closePath(); ctx.stroke(); }
      else if (this.snap.kind === "중심") { ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.stroke(); }
      else if (this.snap.soft) { ctx.setLineDash([3, 3]); const [lx, ly] = this.toS(...this.tool.pts.at(-1)); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]); }
      else ctx.strokeRect(x - 6, y - 6, 12, 12);
      ctx.font = "600 11px Pretendard, sans-serif"; ctx.fillStyle = "#b45309"; ctx.fillText(this.snap.kind, x + 10, y - 10);
    }
    // 캐드식 십자 커서
    if (this.editable && this._in && !this.panning) {
      const { sx, sy } = ms; ctx.strokeStyle = "rgba(15,23,42,.75)"; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(sx - 22, sy + .5); ctx.lineTo(sx - 5, sy + .5); ctx.moveTo(sx + 5, sy + .5); ctx.lineTo(sx + 22, sy + .5);
      ctx.moveTo(sx + .5, sy - 22); ctx.lineTo(sx + .5, sy - 5); ctx.moveTo(sx + .5, sy + 5); ctx.lineTo(sx + .5, sy + 22); ctx.stroke();
      if (!t || t.picking) ctx.strokeRect(sx - 4.5, sy - 4.5, 9, 9);
    }
  }

  /* ---------- 마우스 · 터치 ---------- */
  _bind() {
    const cv = this.cv, P = new Map();
    let down = null, pinch = null;
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.parentElement.addEventListener("wheel", e => { e.preventDefault(); const [x, y] = pos(e); this.zoomAt(x, y, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0016))); }, { passive: false });
    cv.addEventListener("contextmenu", e => e.preventDefault());
    cv.addEventListener("pointerenter", () => { this._in = true; });
    cv.addEventListener("pointerleave", () => { this._in = false; this.hover = null; this.render(); });
    cv.addEventListener("pointerdown", e => {
      cv.setPointerCapture(e.pointerId); const [sx, sy] = pos(e); P.set(e.pointerId, [sx, sy]);
      this.cb.onPointerDown?.();
      if (P.size === 2) { const [a, b] = [...P.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; down = null; this.box = null; return; }
      if (e.button === 1 || (e.button === 0 && (!this.editable || this._space))) { down = { pan: 1, sx, sy, ox: this.view.ox, oy: this.view.oy, moved: 0 }; this.panning = true; cv.style.cursor = "grabbing"; return; }
      if (e.button === 2) { if (this.editable) { if (this.tool) this.enter(); else if (this.sel.size) this.setSel([]); else if (this.last) this.run(this.last); } return; }
      if (!this.editable) return;
      const t = this.tool;
      if (t && !t.picking) { this.click(sx, sy); return; }
      const g = !t && this.gripAt(sx, sy);
      if (g) { down = { grip: g, orig: clone(g.e), gx: g.g.x, gy: g.g.y, sx, sy }; return; }
      const hit = this.pick(sx, sy);
      // 이미 고른 객체를 누르고 끌면 이동, 아닌 객체 위에서 끌면 고르기 상자 (원본 선을 실수로 옮기지 않게)
      if (hit && this.sel.has(hit.id) && !e.shiftKey && !t?.picking) down = { move: 1, sx, sy, w0: this.point(sx, sy), copy: e.ctrlKey || e.altKey, moved: 0 };
      else down = { box: 1, sx, sy, add: e.shiftKey || t?.picking, hit };
    });
    cv.addEventListener("pointermove", e => {
      const [sx, sy] = pos(e); this.mouse.sx = sx; this.mouse.sy = sy; this._shift = e.shiftKey;
      [this.mouse.x, this.mouse.y] = this.toW(sx, sy);
      if (P.has(e.pointerId)) P.set(e.pointerId, [sx, sy]);
      if (pinch && P.size === 2) { const [a, b] = [...P.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        this.view.ox += c[0] - pinch.c[0]; this.view.oy += c[1] - pinch.c[1]; this.zoomAt(c[0], c[1], d / pinch.d); pinch = { d, c }; return; }
      this.cb.onMouse?.(this.mouse);
      if (down?.pan) { down.moved = Math.max(down.moved, Math.abs(sx - down.sx) + Math.abs(sy - down.sy)); this.view.ox = down.ox + sx - down.sx; this.view.oy = down.oy + sy - down.sy; this.render(); this.cb.onView?.(); return; }
      if (down?.grip) { const { e: ent, g } = down.grip, live = this.byId.get(ent.id); if (!live) return; const p = this.point(sx, sy, [down.gx, down.gy]);
        Object.assign(live, clone(down.orig)); this.touch(live); this.applyGrip(live, g, p[0], p[1], { x: down.orig.x, y: down.orig.y }); down.moved = 1; this.render(); return; }
      if (down?.move) { const m = Math.abs(sx - down.sx) + Math.abs(sy - down.sy); if (m > 4 || down.moved) { down.moved = 1; const p = this.point(sx, sy, down.w0); down.dx = p[0] - down.w0[0]; down.dy = p[1] - down.w0[1];
          if (!down.snap) down.snap = this.selected().map(x => clone(x));
          for (const o of down.snap) { const live = this.byId.get(o.id); if (!live) continue; Object.assign(live, clone(o)); if (live.t === "pl" || live.t === "dm") live.p = [...o.p]; if (live.t === "fill") live.p = o.p.map(r => [...r]); this.touch(live); this.move(live, down.dx, down.dy); } this.render(); } return; }
      if (down?.box) { this.box = { x0: down.sx, y0: down.sy, x1: sx, y1: sy }; this.render(); return; }
      if (this.editable) { if (this.tool && !this.tool.picking) this.snap = this.findSnap(sx, sy); else { this.snap = null; const h = this.gripAt(sx, sy) ? null : this.pick(sx, sy); if (h !== this.hover) this.hover = h; } }
      this.render();
    });
    const up = e => {
      P.delete(e.pointerId); if (pinch) { if (P.size < 2) pinch = null; return; }
      const d = down; down = null; this.panning = false; cv.style.cursor = "";
      if (!d) return;
      const [sx, sy] = pos(e);
      if (d.pan) { if (d.moved < 4 && !this.editable) this.cb.onClick?.(...this.toW(sx, sy), sx, sy); return; }
      if (d.grip) { if (!d.moved) return; const live = this.byId.get(d.grip.e.id); const after = clone(live); Object.assign(live, clone(d.orig)); this.touch(live); this.commit("그립 편집", [{ id: live.id, before: d.orig, after }]); this.cb.onSel?.(this.selected()); return; }
      if (d.move) { if (!d.moved || !d.snap) return;
        const afters = d.snap.map(o => { const live = this.byId.get(o.id); const a = clone(live); Object.assign(live, clone(o)); if (live.p) live.p = clone(o).p; this.touch(live); return a; });
        if (d.copy) { this.commit(`복사 ${afters.length}개`, afters.map(a => { a.id = newId(); return { id: a.id, before: null, after: a }; })); }
        else this.commit(`이동 ${afters.length}개`, afters.map((a, i) => ({ id: a.id, before: d.snap[i], after: a })));
        this.cb.onSel?.(this.selected()); return; }
      if (d.box) { const b = this.box; this.box = null;
        if (!b || Math.abs(b.x1 - b.x0) + Math.abs(b.y1 - b.y0) < 4) { if (d.hit) this.setSel([d.hit.id], d.add); else if (!d.add) this.setSel([]); this.render(); return; }
        const [x0, y0] = this.toW(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1)), [x1, y1] = this.toW(Math.max(b.x0, b.x1), Math.max(b.y0, b.y1)), cross = b.x1 < b.x0;
        const ids = this.ents.filter(en => this.pickable(en) && this.inRect(en, [x0, y0, x1, y1], cross)).map(en => en.id);
        if (d.add) { ids.forEach(i => this.sel.add(i)); this.setSel([], true); } else this.setSel(ids);
        this.log(`${ids.length}개 선택 (${cross ? "걸치기" : "완전히 포함"})`); }
    };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  }
  key(e) {   // 앱에서 넘겨주는 키 입력. 처리했으면 true
    if (e.type === "keyup") { if (e.code === "Space") this._space = false; this._shift = e.shiftKey; return false; }
    this._shift = e.shiftKey;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (mod && k.toLowerCase() === "z") { this.undo(); return true; }
    if (mod && k.toLowerCase() === "y") { this.redo(); return true; }
    if (mod && k.toLowerCase() === "a" && this.editable) { this.setSel(this.ents.filter(x => this.pickable(x)).map(x => x.id)); return true; }
    if (k === "Escape") { if (this.tool) this.cancel(); else this.setSel([]); this.box = null; return true; }
    if (k === "F3") { this.osnap = !this.osnap; this.log(`객체 스냅 ${this.osnap ? "켬" : "끔"}`); this.cb.onMode?.(); return true; }
    if (k === "F8") { this.ortho = !this.ortho; this.log(`직교 ${this.ortho ? "켬" : "끔"}`); this.cb.onMode?.(); return true; }
    if ((k === "Delete" || k === "Backspace") && this.editable && !this.tool && this.sel.size) { this.erase(this.selected()); return true; }
    if (k === " " && !this.tool && !this.editable) { this._space = true; return true; }
    return false;
  }
  // 화면을 그림 파일로
  snapshot() { return this.cv.toDataURL("image/png"); }
}
