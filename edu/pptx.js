// PPT(.pptx) 글자 뽑기 + 교육내용용 요약 (브라우저 안에서만, 서버로 보내지 않음)
// readPptx(file, JSZip) → { slides:[{no, title, paras:[{t, sz, title}], notes}], name }
// summarize(deck, {level}) → 교육내용 문장 (짧게/보통/자세히)

const unxml = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
function paras(xml) {
  const out = [];
  for (const sp of xml.split(/<p:sp>|<p:sp /).slice(1)) {
    const isTitle = /<p:ph[^>]*type="(title|ctrTitle)"/.test(sp);
    let prev = null;
    for (const p of sp.match(/<a:p>[\s\S]*?<\/a:p>/g) || []) {
      const t = unxml((p.match(/<a:t>([^<]*)<\/a:t>/g) || []).map(x => x.slice(5, -6)).join("")).replace(/\s+/g, " ").trim();
      if (!t) { prev = null; continue; }
      const sz = Math.max(0, ...[...p.matchAll(/\bsz="(\d+)"/g)].map(m => +m[1]));
      // 한 문장이 줄바꿈으로 나뉜 경우 이어 붙이기
      if (prev && prev.t.length >= 25 && !/[.!?다음함됨임요)\]:]$/.test(prev.t) && !/^[-–·▶■□▣◆●○※*\d①-⑳]/.test(t)) { prev.t += " " + t; continue; }
      out.push(prev = { t, sz, title: isTitle });
    }
  }
  // 표(graphicFrame) 안 글자
  for (const tb of xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/g) || []) for (const p of tb.match(/<a:p>[\s\S]*?<\/a:p>/g) || []) {
    const t = unxml((p.match(/<a:t>([^<]*)<\/a:t>/g) || []).map(x => x.slice(5, -6)).join("")).replace(/\s+/g, " ").trim();
    if (t) out.push({ t, sz: 0, title: false, tbl: true });
  }
  return out;
}
export async function readPptx(file, JSZip) {
  const zip = await JSZip.loadAsync(file);
  const txt = n => zip.file(n)?.async("string");
  // 발표 순서: presentation.xml 의 sldIdLst → rels
  const pres = await txt("ppt/presentation.xml") || "", rels = await txt("ppt/_rels/presentation.xml.rels") || "";
  const rmap = Object.fromEntries([...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map(m => [m[1], m[2]]));
  let order = [...pres.matchAll(/<p:sldId [^>]*r:id="([^"]+)"/g)].map(m => rmap[m[1]]).filter(Boolean).map(t => "ppt/" + t.replace(/^\/?ppt\//, "").replace(/^\.\.\//, ""));
  if (!order.length) order = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  const slides = [];
  for (const [i, n] of order.entries()) {
    const xml = await txt(n); if (!xml) continue;
    if (/<p:sld [^>]*show="0"/.test(xml)) continue; // 숨긴 슬라이드
    const relx = await txt(n.replace("slides/", "slides/_rels/") + ".rels") || "";
    const nn = relx.match(/Target="\.\.\/notesSlides\/([^"]+)"/);
    let notes = "";
    if (nn) { const nx = await txt("ppt/notesSlides/" + nn[1]) || ""; notes = paras(nx).map(p => p.t).filter(t => !/^\d+$/.test(t)).join(" "); }
    slides.push({ no: i + 1, paras: paras(xml), notes });
  }
  return { name: file.name || "", slides };
}

/* ---------- 요약 ---------- */
const NOISE = /^(\*|※)?\s*(단위|출처|자료 ?출[처저]|동영상 재생|https?:|www\.|YouTube|Page|페이지)/i;
const KEY = /(재해|사망|중대|사고|예방|대책|원인|증가|감소|주의|금지|필수|착용|설치|점검|관리|대응|요령|수칙|위험|교육|증상|응급|조치|준수|확인)/g;
const cleanSec = s => s.replace(/^\d{1,2}\s*[./)]\s*|^0\d\s+/, "").replace(/^[\s\-–·▶■□▣◆●○]+/, "").trim();
const isNum = t => /^[\d\s/().,:~‘’'`%·-]+$/.test(t);
const cut = (s, n) => { if (s.length <= n) return s; const c = s.slice(0, n); const k = Math.max(c.lastIndexOf(", "), c.lastIndexOf(" 및 "), c.lastIndexOf(" ")); return (k > n * .6 ? c.slice(0, k) : c).replace(/[,\s]+$/, "") + "…"; };

export function summarize(deck, { level = "mid" } = {}) {
  const L = { short: { pts: 0, len: 70, subs: 3, max: 450 }, mid: { pts: 1, len: 90, subs: 5, max: 900 }, long: { pts: 3, len: 120, subs: 10, max: 1800 } }[level] || { pts: 1, len: 90, subs: 5, max: 900 };
  const keep = t => t.length > 1 && !NOISE.test(t) && !isNum(t) && !(/^\(.*\)$/.test(t) && !t.match(KEY));
  // 같은 내용 쪽(복사해 둔 쪽)은 한 번만
  const seenSlide = new Set();
  const S = deck.slides.map(s => ({ ...s, paras: s.paras.filter(p => keep(p.t)).map(p => ({ ...p, t: p.t.replace(/^\(?(.*?)\)?$/, (m, x) => /^\(.*\)$/.test(m) ? x : m) })) }))
    .filter(s => { const k = s.paras.map(p => p.t).join("|"); if (k.length > 40 && seenSlide.has(k)) return false; seenSlide.add(k); return true; });
  // 여러 쪽에 반복되는 글 = 머리말(구역 이름)
  const cnt = new Map(); for (const s of S) for (const t of new Set(s.paras.map(p => p.t))) cnt.set(t, (cnt.get(t) || 0) + 1);
  const run = t => (cnt.get(t) || 0) >= 4 && t.length <= 40;
  // 쪽 제목
  for (const s of S) {
    const own = s.paras.filter(p => !run(p.t));
    const ph = own.find(p => p.title);
    const big = own.filter(p => p.sz).sort((a, b) => b.sz - a.sz)[0];
    s.head = s.paras.filter(p => run(p.t)).map(p => p.t).sort((a, b) => b.length - a.length)[0] || "";
    s.title = cleanSec((ph || (big && big.t.length <= 40 ? big : null) || own.find(p => p.t.length <= 40) || { t: "" }).t);
    s.body = own.filter(p => cleanSec(p.t) !== s.title).map(p => p.t);
  }
  // 목차 쪽 (짧은 항목이 많고 번호가 섞인 쪽) → 목차로만 씀
  const agendaIdx = S.findIndex((s, i) => i < 4 && s.paras.length >= 6 && s.paras.filter(p => p.t.length <= 25).length >= 5 && deck.slides[i].paras.filter(p => /^\d{1,2}$/.test(p.t)).length >= 3);
  const agenda = agendaIdx >= 0 ? S[agendaIdx].paras.map(p => cleanSec(p.t)).filter(t => t && t.length <= 25 && t !== S[agendaIdx].title) : [];
  // 구역 나누기: 머리말이 바뀌거나, 글 하나뿐인 간지 쪽에서 새 구역
  const groups = []; let g = null;
  S.forEach((s, i) => {
    if (i === 0 || i === agendaIdx) return;
    const divider = s.paras.length <= 2 && s.paras.every(p => p.t.length <= 30);
    const key = s.head ? cleanSec(s.head) : divider ? s.title : null;
    if (!g || (key && key !== g.key)) { g = { key: key || s.title, subs: [], pts: [], slides: [] }; groups.push(g); }
    g.slides.push(s.no);
    if (s.title && s.title !== g.key && !g.subs.includes(s.title)) g.subs.push(s.title);
    for (const t of [...s.body, s.notes].filter(Boolean)) {
      if (t.length < 12) continue;
      const sc = Math.min(t.length, 140) / 40 + (/\d/.test(t) ? 2 : 0) + Math.min(3, (t.match(KEY) || []).length) + (/[다음함됨임요]\.?$/.test(t) ? 1 : 0);
      g.pts.push({ t, sc });
    }
  });
  // 글 없는 짧은 구역(업체명 쪽 등)은 한 줄로 묶기
  const merged = [];
  for (const x of groups) {
    const empty = !x.pts.length && !x.subs.length;
    const last = merged.at(-1);
    if (empty && last?.list) { last.list.push(x.key); continue; }
    merged.push(empty ? { list: [x.key], slides: x.slides } : x);
  }
  const lines = [];
  const first = deck.slides[0]?.paras || [], top = first.filter(p => p.t.length <= 40).sort((a, b) => b.sz - a.sz)[0];
  const title = top ? top.t : "";
  if (title) lines.push(`교육자료: ${title}${deck.name ? ` (${deck.name}, ${deck.slides.length}쪽)` : ""}`);
  if (agenda.length && level !== "short") lines.push(`목차: ${agenda.join(" · ")}`);
  let n = 0;
  for (const x of merged) {
    if (x.list) { if (x.list.length > 1) lines.push(`${++n}. ${x.list.join(" · ")}`); else if (level === "long") lines.push(`${++n}. ${x.list[0]}`); continue; }
    const HDR = /^(재해유형|재해경위|재해상황|재해원인|사진대지|구분|내용|비고|개선대책|사진)$/;
    let subs = x.subs.map(cleanSec).filter(t => t && t !== x.key && !HDR.test(t));
    // "주요 우수사례 (추락)", "주요 우수사례 (감전)" → "주요 우수사례: 추락, 감전"
    const pre = new Map(); for (const t of subs) { const m = t.match(/^(.+?)\s*\((.+)\)$/); if (m) pre.set(m[1], (pre.get(m[1]) || 0) + 1); }
    for (const [k, c] of pre) if (c >= 2) { const items = subs.filter(t => t.startsWith(k + " (") || t.startsWith(k + "(")).map(t => t.replace(/^.+?\((.+)\)$/, "$1")); const at = subs.findIndex(t => t.startsWith(k)); subs = subs.filter(t => !(t.startsWith(k + " (") || t.startsWith(k + "("))); subs.splice(at, 0, `${k}: ${items.slice(0, L.subs + 4).join("·")}`); }
    subs = subs.slice(0, L.subs);
    const seen = new Set(), pts = [];
    for (const p of x.pts.sort((a, b) => b.sc - a.sc)) { if (pts.length >= L.pts) break; const t = p.t.replace(/^[\s\-–·▶■□▣◆●○※*]+/, "").trim(); const k = t.replace(/\s+/g, "").slice(0, 30); if (seen.has(k) || t.length < 12) continue; seen.add(k); pts.push(cut(t, L.len)); }
    let line = `${++n}. ${x.key}`;
    if (subs.length) line += ` — ${subs.join(", ")}`;
    lines.push(line);
    for (const p of pts) lines.push(`   - ${p}`);
  }
  let out = lines.join("\n");
  // 길면 요점이 가장 많은 항목부터 하나씩 줄이기
  while (out.length > L.max) {
    let best = -1, bestN = 0;
    for (let i = 0; i < lines.length; i++) if (!lines[i].startsWith("   - ")) { let n = 0; while (lines[i + 1 + n]?.startsWith("   - ")) n++; if (n && n >= bestN) { bestN = n; best = i + n; } }
    if (best < 0) break; lines.splice(best, 1); out = lines.join("\n");
  }
  return out;
}
// AI 요약에 넘길 글 (쪽마다 한 줄)
export const deckText = deck => deck.slides.map(s => `[${s.no}] ${s.paras.map(p => p.t).join(" / ")}${s.notes ? ` (노트: ${s.notes})` : ""}`).join("\n");
