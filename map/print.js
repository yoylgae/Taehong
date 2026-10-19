// 지적도 출력 · 그림 저장: 도면을 원하는 크기로 다시 그리고 장비 표시·말풍선을 캔버스에 직접 그림
import { kindOf } from "./icons.js";

const FONT = 'Pretendard, "Malgun Gothic", sans-serif';
const md = s => s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : "";
const icons = new Map();
function icon(k) {
  if (icons.has(k.id)) return icons.get(k.id);
  const p = new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null);
    i.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(k.svg.replace(/currentColor/g, k.color).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" ')); });
  icons.set(k.id, p); return p;
}

// 말풍선 줄 (화면과 같은 내용)
export function lines(m, mode) {
  const k = kindOf(m.kind), range = m.date_from && m.date_to && m.date_from !== m.date_to ? `${md(m.date_from)}~${md(m.date_to)}` : "";
  if (mode === "short") return [{ c: "t1", t: k.id + (m.work ? " · " + m.work : "") }];
  const out = [{ c: "t1", t: k.id, sub: m.name || "" }];
  if (m.work) out.push({ c: "t2", t: m.work });
  const t3 = [m.company, range].filter(Boolean).join(" · "); if (t3) out.push({ c: "t3", t: t3 });
  return out;
}
const F = { t1: `800 12.5px ${FONT}`, sub: `600 11px ${FONT}`, t2: `500 12px ${FONT}`, t3: `500 10.5px ${FONT}` };
const LH = { t1: 16, t2: 15, t3: 14 };
function measure(g, ls, pre = "") {
  let w = 0, h = 8;
  for (const l of ls) { g.font = F[l.c]; let lw = g.measureText((l.c === "t1" ? pre : "") + l.t).width; if (l.sub) { g.font = F.sub; lw += 5 + g.measureText(l.sub).width; } w = Math.max(w, lw); h += LH[l.c]; }
  return { w: Math.min(260, Math.ceil(w) + 18), h: h + 3 };
}

// 말풍선 자리 고르기 — 다른 말풍선·핀과 겹치지 않는 가까운 자리
export function place(pins, W, H) {
  const placed = [], pinR = pins.map(p => [p.sx - 20, p.sy - 48, p.sx + 20, p.sy + 2]);
  const ov = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  for (const p of [...pins].sort((a, b) => a.sy - b.sy || a.sx - b.sx)) {
    if (!p.w) continue;
    const { sx, sy, w, h } = p, top = sy - 50;
    const cands = [[sx - w / 2, top - h - 6], [sx + 14, top - h - 2], [sx - w - 14, top - h - 2], [sx + 26, sy - 30 - h / 2], [sx - w - 26, sy - 30 - h / 2],
      [sx - w / 2, top - h - 6 - (h + 10)], [sx + 30, top - h - 30], [sx - w - 30, top - h - 30], [sx - w / 2, sy + 12], [sx - w / 2, top - h - 6 - 2 * (h + 10)]];
    let best = null, bs = Infinity;
    for (let i = 0; i < cands.length; i++) {
      const [x, y] = cands[i], r = [x - 3, y - 3, x + w + 3, y + h + 3];
      let s = i * 2;
      for (const q of placed) s += ov(r, q) * 10; for (const q of pinR) s += ov(r, q) * 4;
      if (x < 0) s += -x * 3; if (y < 0) s += -y * 3; if (x + w > W) s += (x + w - W) * 3; if (y + h > H) s += (y + h - H) * 3;
      if (s < bs) { bs = s; best = [x, y]; } if (s === i * 2) break;
    }
    const [bx, by] = best; placed.push([bx, by, bx + w, by + h]);
    p.bx = bx; p.by = by;
    const cx = Math.max(bx + 8, Math.min(bx + w - 8, sx)), cy = by + h <= top ? by + h : by > sy ? by : by + h / 2;
    p.lx = by + h <= top || by > sy ? cx : (bx > sx ? bx : bx + w); p.ly = cy;
  }
  return pins;
}

// 장비 표시 그리기 (g 는 CSS 픽셀 기준으로 맞춰 둔 캔버스)
export async function drawMarks(g, marks, toS, W, H, mode = "full", numbered = false) {
  const pins = marks.map((m, i) => { const [sx, sy] = toS(m.x, m.y); return { m, sx, sy, n: i + 1 }; }).filter(p => p.sx > -40 && p.sx < W + 40 && p.sy > -10 && p.sy < H + 50);
  if (mode !== "off") for (const p of pins) { p.ls = lines(p.m, mode); Object.assign(p, measure(g, p.ls, numbered ? `${p.n}. ` : "")); }
  place(pins, W, H);
  // 지시선
  for (const p of pins) { if (p.bx == null) continue; const k = kindOf(p.m.kind); g.strokeStyle = k.color; g.lineWidth = 1.4; g.setLineDash(Math.hypot(p.lx - p.sx, p.ly - p.sy + 44) > 30 ? [4, 3] : []); g.beginPath(); g.moveTo(p.sx, p.sy - 44); g.lineTo(p.lx, p.ly); g.stroke(); }
  g.setLineDash([]);
  for (const p of pins) {
    const k = kindOf(p.m.kind), { sx, sy } = p;
    g.fillStyle = k.color; g.beginPath(); g.moveTo(sx - 6, sy - 9); g.lineTo(sx + 6, sy - 9); g.lineTo(sx, sy - 1); g.fill();
    g.fillStyle = "#fff"; g.strokeStyle = k.color; g.lineWidth = 3; g.beginPath(); g.arc(sx, sy - 26, 17, 0, Math.PI * 2); g.fill(); g.stroke();
    const im = await icon(k); if (im) g.drawImage(im, sx - 13, sy - 39, 26, 26);
    g.beginPath(); g.arc(sx, sy, 3.2, 0, Math.PI * 2); g.fillStyle = k.color; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.stroke();
    if (numbered) { g.fillStyle = "#111827"; g.beginPath(); g.arc(sx + 14, sy - 40, 8.5, 0, Math.PI * 2); g.fill(); g.fillStyle = "#fff"; g.font = `700 10px ${FONT}`; g.textAlign = "center"; g.fillText(String(p.n), sx + 14, sy - 36.5); g.textAlign = "start"; }
  }
  for (const p of pins) {
    if (p.bx == null) continue;
    const k = kindOf(p.m.kind), { bx, by, w, h } = p;
    g.fillStyle = "#fff"; g.strokeStyle = k.color; g.lineWidth = 1.5; g.beginPath(); g.roundRect(bx, by, w, h, mode === "short" ? h / 2 : 9); g.fill(); g.stroke();
    let y = by + 5; g.textBaseline = "alphabetic";
    for (const l of p.ls) {
      y += LH[l.c]; g.font = F[l.c]; g.fillStyle = l.c === "t1" ? k.color : l.c === "t2" ? "#1f2937" : "#6b7280";
      const prefix = numbered ? `${p.n}. ` : "";
      const t = (l.c === "t1" ? prefix : "") + l.t; g.fillText(t, bx + 9, y - 3, w - 18);
      if (l.sub) { const tw = g.measureText(t).width; g.font = F.sub; g.fillStyle = "#6b7280"; g.fillText(l.sub, bx + 9 + tw + 5, y - 3, Math.max(10, w - 23 - tw)); }
    }
  }
  return pins;
}

// 도면만 따로 그리기 (화면 크기와 상관없이)
export function renderMap(cad, W, H, dpr, view) {
  const c = document.createElement("canvas"); c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  const keys = ["cv", "ctx", "W", "H", "dpr", "view", "editable", "_in", "sel", "hover", "tool", "box", "snap", "flash"];
  const save = Object.fromEntries(keys.map(k => [k, cad[k]])), onDraw = cad.cb.onDraw;
  Object.assign(cad, { cv: c, ctx: c.getContext("2d"), W, H, dpr, view, editable: false, _in: false, sel: new Set(), hover: null, tool: null, box: null, snap: null, flash: null });
  cad.cb.onDraw = null;
  try { cad._draw(); } finally { Object.assign(cad, save); cad.cb.onDraw = onDraw; }
  return c;
}
// 보이는 범위(도면좌표) → 주어진 크기에 꽉 차게 하는 화면 맞춤
export function viewFor(b, W, H, pad = 0) {
  const s = Math.min((W - pad * 2) / Math.max(1, b[2] - b[0]), (H - pad * 2) / Math.max(1, b[3] - b[1]));
  return { s, ox: W / 2 - (b[0] + b[2]) / 2 * s, oy: H / 2 - (b[1] + b[3]) / 2 * s };
}
