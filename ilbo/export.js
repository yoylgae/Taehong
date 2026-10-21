// 작업일보 · 안전교육일지 엑셀 저장 — 올린 양식 파일에서 값 칸만 바꾸고, 공사일보 (2)에는 날짜 묶음을 그대로 복사해 이어 붙임
import { openBook, Calc, NS, colName, splitRef, _shiftFormula as shiftFormula } from "../jy/export-xlsx.js";

const K = s => String(s ?? "").replace(/\s+/g, "");
const A = (c, r) => colName(c) + r;
export const serial = iso => { const [y, m, d] = iso.split("-").map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };
export const fromSerial = n => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
const isNumStr = v => typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim());
const val = v => v == null || v === "" ? null : typeof v === "number" ? v : isNumStr(v) ? Number(v) : String(v);

// 병합 칸 빨리 찾기 (줄 → 병합 목록)
function mergeIndex(sh) {
  const byRow = new Map();
  for (const m of sh.mergeRefs()) {
    const [a, b = a] = m.getAttribute("ref").split(":"); const p = splitRef(a), q = splitRef(b);
    const rect = { c1: p.c, r1: p.r, c2: q.c, r2: q.r };
    for (let r = p.r; r <= q.r; r++) { if (!byRow.has(r)) byRow.set(r, []); byRow.get(r).push(rect); }
  }
  return { at: (c, r) => (byRow.get(r) || []).find(m => c >= m.c1 && c <= m.c2), byRow };
}
// 묶음 안의 이름표 위치
function labels(sh, r0, r1, maxC = 30) {
  const lab = {};
  for (let r = r0; r <= r1; r++) { const row = sh.rows.get(r); if (!row) continue;
    for (const c of [...row.cells.keys()].sort((a, b) => a - b)) { if (c > maxC) continue; const k = K(sh.text(c, r)); if (k && !lab[k]) lab[k] = { c, r }; } }
  return lab;
}
// 값 쓰기: 수식 칸은 그대로 둠
function put(sh, c, r, v) { if (sh.formula(c, r) != null) return false; sh.set(c, r, val(v), sh.cell(c, r)); return true; }

/* ================= 공사일보 한 묶음 채우기 ================= */
function blockInfo(sh, mi, r0, r1) {
  const lab = labels(sh, r0, r1);
  const right = k => { const p = lab[k]; if (!p) return null; const m = mi.at(p.c, p.r); return { c: (m ? m.c2 : p.c) + 1, r: p.r }; };
  const h1 = lab["[금일작업사항]"], h2 = lab["[장비투입현황]"], h3 = lab["[잔재반출현황]"], h4 = lab["[특이사항]"] || lab["[특기사항]"];
  if (!h1 || !h2 || !h3 || !h4) return null;
  const hdr = r => { const o = {}; const row = sh.rows.get(r); if (row) for (const c of row.cells.keys()) { const k = K(sh.text(c, r)); if (k && !o[k]) o[k] = c; } return o; };
  const eh = hdr(h2.r + 1), wh = hdr(h3.r + 1);
  let tot = h2.r + 2; while (tot < h3.r && K(sh.text(1, tot)) !== "합계") tot++;
  return { lab, right, h1, h2, h3, h4, eh, wh, tot, lc: lab["[명일작업사항]"]?.c || 12, r0, r1,
    // 모양 비교용 지문
    sig: [h1.r - r0, h2.r - r0, h3.r - r0, h4.r - r0, tot - r0, r1 - r0, JSON.stringify(eh), JSON.stringify(wh)].join("|") };
}
function fillBlock(sh, B, d, day, notes) {
  const set = (p, v) => p && put(sh, p.c, p.r, v);
  set(B.right("날짜"), serial(day));
  set(B.right("날씨"), d.weather); set(B.right("현장명"), d.site); set(B.right("공종"), d.gongjong); set(B.right("소속/현장소장"), d.boss);
  const nL = B.h2.r - B.h1.r - 1;
  for (let i = 0; i < nL; i++) { put(sh, 1, B.h1.r + 1 + i, d.today?.[i] || null); put(sh, B.lc, B.h1.r + 1 + i, d.tomorrow?.[i] || null); }
  const over = (arr, n, what) => { const k = (arr || []).filter(x => x && (typeof x === "string" ? x.trim() : Object.values(x).some(v => v !== null && v !== "" && v !== undefined))).length; if (k > n) notes.push(`⚠ ${day} ${what}: ${k}줄 중 양식 칸(${n}줄)만큼만 들어갔습니다.`); };
  over(d.today, nL, "금일 작업사항"); over(d.tomorrow, nL, "명일 작업사항");
  const E = B.eh, nE = B.tot - (B.h2.r + 2);
  for (let i = 0; i < nE; i++) {
    const r = B.h2.r + 2 + i, e = d.equip?.[i] || {}, p = d.people?.[i] || {};
    put(sh, 1, r, e.name || null); if (E["규격"]) put(sh, E["규격"], r, e.spec ?? null);
    if (E["전일(대)"]) put(sh, E["전일(대)"], r, e.prev ?? null); if (E["금일(대)"]) put(sh, E["금일(대)"], r, e.today ?? null);
    if (E["직종"]) put(sh, E["직종"], r, p.job || null); if (E["전일(명)"]) put(sh, E["전일(명)"], r, p.prev ?? null); if (E["금일(명)"]) put(sh, E["금일(명)"], r, p.today ?? null);
    if (E["비고"]) put(sh, E["비고"], r, p.note || null);
  }
  over(d.equip, nE, "장비"); over(d.people, nE, "인원");
  const W = B.wh, nW = B.h4.r - (B.h3.r + 2), ec = W["전일반출(대)"] || W["금일반출(대)"], ic = W["총반출수량"];
  for (let i = 0; i < nW; i++) {
    const r = B.h3.r + 2 + i, w = d.waste?.[i], g = d.prog?.[i] || {};
    if (w || i < (d.waste?.length || 0)) { put(sh, 1, r, w?.kind || null); if (W["규격"]) put(sh, W["규격"], r, w?.spec || null); if (ec) put(sh, ec, r, w?.e ?? null); if (W["누계(대)"]) put(sh, W["누계(대)"], r, w?.g ?? null); }
    if (W["공종"]) put(sh, W["공종"], r, g.kind || null); if (W["총건물동수"]) put(sh, W["총건물동수"], r, g.total ?? null);
    if (W["전일철거동"]) put(sh, W["전일철거동"], r, g.prev ?? null); if (W["누계동"]) put(sh, W["누계동"], r, g.cum ?? null);
  }
  const nN = B.r1 - B.h4.r;
  for (let i = 0; i < nN; i++) put(sh, 1, B.h4.r + 1 + i, d.notes?.[i] || null);
  over(d.notes, nN, "특이사항");
}
// 정해진 줄 범위의 수식만 다시 계산
async function recalc(calc, sh, r0, r1) {
  let fail = 0;
  for (let r = r0; r <= r1; r++) { const row = sh.rows.get(r); if (!row) continue;
    for (const c of row.cells.keys()) {
      const f = sh.formula(c, r); if (f == null) continue;
      const el = sh.cell(c, r), fe = el.getElementsByTagNameNS(NS, "f")[0];
      let v; try { v = await calc.value(sh, c, r); } catch { v = undefined; fail++; }
      for (const x of [...el.getElementsByTagNameNS(NS, "v")]) el.removeChild(x);
      el.removeAttribute("t"); if (v === undefined) continue;
      const ve = sh.doc.createElementNS(NS, "v");
      if (typeof v === "string") { el.setAttribute("t", "str"); ve.textContent = v; } else ve.textContent = String(v == null ? 0 : Math.round(v * 1e9) / 1e9);
      fe.after(ve);
    } }
  sh.dirty = true; return fail;
}

/* ================= 작업일보 (공사일보 (2) · 출력일보) ================= */
// days: [{day, data, edited}] 날짜순, target: 이 날짜까지 저장
export async function exportReport(file, days, target, opts = {}) {
  const notes = [], book = await openBook(await file.arrayBuffer());
  const name = book.list.map(s => s.name).find(n => /공사일보/.test(n) && /\(2\)/.test(n)) || book.find(n => /공사일보/.test(n));
  if (!name) throw new Error("양식에서 '공사일보' 시트를 찾지 못했습니다.");
  const sh = await book.sheet(name), mi = mergeIndex(sh), calc = new Calc(book);
  const starts = [...sh.rows.keys()].filter(r => K(sh.text(1, r)) === "공사일보").sort((a, b) => a - b);
  if (!starts.length) throw new Error(`'${name}' 시트에서 '공 사 일 보' 제목을 찾지 못했습니다.`);
  const maxRow = Math.max(...sh.rows.keys());
  const span = starts.length > 1 ? starts.at(-1) - starts.at(-2) : maxRow - starts[0] + 1;
  const ends = starts.map((s, i) => i + 1 < starts.length ? starts[i + 1] - 1 : Math.max(s + span - 1, maxRow));
  const blocks = starts.map((s, i) => { const B = blockInfo(sh, mi, s, ends[i]); const dp = B?.right("날짜"); const v = dp ? sh.raw(dp.c, dp.r) : null; return { s, e: ends[i], B, day: typeof v === "number" ? fromSerial(v) : null }; });
  const last = blocks.at(-1); if (!last.B) throw new Error("마지막 공사일보 묶음의 모양을 읽지 못했습니다.");
  const byDay = new Map(blocks.filter(b => b.day).map(b => [b.day, b]));
  const lastDay = blocks.map(b => b.day).filter(Boolean).sort().at(-1) || "0000";
  // 복사할 원본 줄 (채우기 전에 떠 둠)
  const L = last.e - last.s + 1;
  const srcRows = []; for (let k = 0; k < L; k++) srcRows.push(sh.rows.get(last.s + k)?.el.cloneNode(true) || null);
  const srcMerges = sh.mergeRefs().map(m => m.getAttribute("ref")).filter(ref => { const [a, b = a] = ref.split(":"); const p = splitRef(a), q = splitRef(b); return p.r >= last.s && q.r <= last.e; });
  const brks = sh.doc.getElementsByTagNameNS(NS, "rowBreaks")[0];
  const hadBreak = brks && [...brks.getElementsByTagNameNS(NS, "brk")].some(b => +b.getAttribute("id") === last.s - 1);
  let tail = last.e, added = 0, updated = 0, skipped = [], touched = [], targetRow = null;
  const want = days.filter(x => x.day <= target).sort((a, b) => a.day.localeCompare(b.day));
  for (const x of want) {
    const b = byDay.get(x.day);
    if (b) {
      if (!x.edited) { if (x.day === target) targetRow = b.s; continue; }
      if (!b.B || b.B.sig !== last.B.sig) { skipped.push(x.day); if (x.day === target) targetRow = b.s; continue; }
      fillBlock(sh, b.B, x.data, x.day, notes); touched.push([b.s, b.e]); updated++; if (x.day === target) targetRow = b.s; continue;
    }
    if (x.day < lastDay) { skipped.push(x.day); continue; }
    // 마지막 묶음을 그대로 복사해 아래에 붙이기
    const ns = tail + 1, dr = ns - last.s;
    for (let k = 0; k < L; k++) {
      const src = srcRows[k]; if (!src) continue;
      const el = src.cloneNode(true), r = ns + k; el.setAttribute("r", r); el.removeAttribute("spans");
      const cells = new Map();
      for (const c of [...el.getElementsByTagNameNS(NS, "c")]) {
        const p = splitRef(c.getAttribute("r")); c.setAttribute("r", A(p.c, r)); cells.set(p.c, c);
        const f = c.getElementsByTagNameNS(NS, "f")[0];
        if (f) { f.textContent = shiftFormula(f.textContent, dr, 0); for (const v of [...c.getElementsByTagNameNS(NS, "v")]) c.removeChild(v); }
      }
      sh.sd.append(el); sh.rows.set(r, { el, cells });
    }
    sh.setMerges(() => false, srcMerges.map(ref => ref.split(":").map(a => { const p = splitRef(a); return A(p.c, p.r + dr); }).join(":")));
    for (const ref of srcMerges) { const [a, b2 = a] = ref.split(":"); const p = splitRef(a), q = splitRef(b2); for (let r = p.r; r <= q.r; r++) { const rr = r + dr; if (!mi.byRow.has(rr)) mi.byRow.set(rr, []); mi.byRow.get(rr).push({ c1: p.c, r1: p.r + dr, c2: q.c, r2: q.r + dr }); } }
    if (hadBreak) { const bk = sh.doc.createElementNS(NS, "brk"); bk.setAttribute("id", ns - 1); bk.setAttribute("max", "16383"); bk.setAttribute("man", "1"); brks.append(bk); brks.setAttribute("count", brks.getElementsByTagNameNS(NS, "brk").length); brks.setAttribute("manualBreakCount", brks.getElementsByTagNameNS(NS, "brk").length); }
    const B = blockInfo(sh, mi, ns, ns + L - 1);
    fillBlock(sh, B, x.data, x.day, notes);
    touched.push([ns, ns + L - 1]); tail = ns + L - 1; added++; if (x.day === target) targetRow = ns;
  }
  sh.dirty = true;
  let fail = 0; for (const [a, b] of touched) fail += await recalc(calc, sh, a, b);
  const dim = sh.doc.getElementsByTagNameNS(NS, "dimension")[0]; if (dim) dim.setAttribute("ref", dim.getAttribute("ref").replace(/\d+$/, String(Math.max(tail, maxRow))));
  // 열면 그 날짜 묶음이 보이게
  if (targetRow) { const sv = sh.doc.getElementsByTagNameNS(NS, "sheetView")[0]; if (sv) { sv.setAttribute("topLeftCell", "A" + targetRow); for (const s of [...sv.getElementsByTagNameNS(NS, "selection")]) { s.setAttribute("activeCell", "C" + (targetRow + 5)); s.setAttribute("sqref", "C" + (targetRow + 5)); s.removeAttribute("pane"); } } }
  notes.push(`${name}: ${added ? `${added}일치 묶음을 이어 붙임` : "새로 붙인 날짜 없음"}${updated ? `, 웹에서 고친 ${updated}일치를 덮어씀` : ""} (양식 마지막 날짜 ${lastDay})`);
  if (skipped.length) notes.push(`⚠ 양식 모양이 달라 바꾸지 않은 날짜: ${skipped.slice(0, 8).join(", ")}${skipped.length > 8 ? ` 외 ${skipped.length - 8}일` : ""}`);
  if (fail) notes.push(`수식 ${fail}칸은 엑셀이 열 때 계산합니다.`);
  // 출력일보
  const cur = want.find(x => x.day === target);
  if (cur) fillAttendance(book, await book.sheet(book.find(n => /출력일보|출력자명부/.test(n)) || ""), cur, notes);
  return { blob: await book.save(), notes };
}
function fillAttendance(book, sh, x, notes) {
  if (!sh) return;
  const mi = mergeIndex(sh), lab = labels(sh, 1, 12);
  const right = k => { const key = Object.keys(lab).find(z => z.replace(/:$/, "") === k); if (!key) return null; const p = lab[key], m = mi.at(p.c, p.r); return { c: (m ? m.c2 : p.c) + 1, r: p.r }; };
  const d = x.data, put2 = (p, v) => p && put(sh, p.c, p.r, v);
  put2(right("일자"), serial(x.day)); if (d.site) put2(right("현장명"), d.site); if (d.company) put2(right("소속"), d.company);
  const no = lab["NO"]; if (!no) return;
  const H = {}; const row = sh.rows.get(no.r); for (const c of row.cells.keys()) { const k = K(sh.text(c, no.r)); if (k) H[k] = c; }
  const rows = []; let r = no.r + 1; while (sh.rows.has(r) && K(sh.text(1, r)) !== "계") { rows.push(r); r++; if (r > no.r + 300) break; }
  const ws = (d.workers || []).filter(w => (w.name || "").trim());
  rows.forEach((rr, i) => { const w = ws[i]; if (H["성명"]) put(sh, H["성명"], rr, w?.name || null); if (H["직종"]) put(sh, H["직종"], rr, w?.job || null); if (H["공수"]) put(sh, H["공수"], rr, w ? (w.gongsu ?? 1) : null); });
  if (H["공수"] && sh.rows.has(r)) put(sh, H["공수"], r, ws.reduce((a, w) => a + (Number(w.gongsu ?? 1) || 0), 0));
  if (ws.length > rows.length) notes.push(`⚠ 출력일보: ${ws.length}명 중 ${rows.length}명만 들어갔습니다 (양식 칸 부족).`);
  notes.push(`출력일보: ${Math.min(ws.length, rows.length)}명 채움`);
}

/* ================= 일일 안전교육 일지 ================= */
export async function exportEdu(file, x, opts = {}) {
  const notes = [], book = await openBook(await file.arrayBuffer());
  const [y, m, dd] = x.day.split("-").map(Number);
  for (const name of book.names) {
    const e = x.data.edu?.[name]; const sh = await book.sheet(name);
    if (!e || e.skip) { notes.push(`${name}: 양식 그대로`); continue; }
    const mi = mergeIndex(sh), lab = labels(sh, 1, 20, 12);
    const right = k => { const p = lab[k]; if (!p) return null; const mm = mi.at(p.c, p.r); return { c: (mm ? mm.c2 : p.c) + 1, r: p.r }; };
    const P = (k, v) => { const p = right(k); if (p) put(sh, p.c, p.r, v); };
    P("교육일시", `${y}년    ${m}  월     ${dd} 일`);
    if (e.project) P("공사명", e.project); if (e.company) P("회사명", e.company); if (e.place != null) P("교육장소", e.place);
    P("교육담당", `   ${e.teacher || ""}    (서명)`); P("현장소장", `${e.boss || ""}    (서명)`);
    const ct = lab["교육내용"]; if (ct) { const mm = mi.at(ct.c, ct.r), c = (mm ? mm.c2 : ct.c) + 1, n = mm ? mm.r2 - mm.r1 + 1 : 1; for (let i = 0; i < n; i++) put(sh, c, ct.r + i, e.items?.[i] || null); }
    // 참석자 명단: '성명' 칸 묶음마다 아래로
    const hdr = Object.entries(lab).find(([k]) => k === "번호"); if (!hdr) continue;
    const hr = hdr[1].r, cols = []; const row = sh.rows.get(hr); for (const c of [...row.cells.keys()].sort((a, b) => a - b)) if (K(sh.text(c, hr)) === "성명") cols.push(c);
    const names = (e.attendees || []).filter(Boolean); let n = 0, cap = 0;
    for (const c of cols) { let r = hr + 1; while (sh.rows.has(r) && typeof sh.raw(c - 1, r) === "number") { put(sh, c, r, names[n++] || null); cap++; r++; } }
    if (names.length > cap) notes.push(`⚠ ${name}: 참석자 ${names.length}명 중 ${cap}명만 들어갔습니다.`);
    notes.push(`${name}: ${x.day} · 참석자 ${Math.min(names.length, cap)}명`);
  }
  return { blob: await book.save(), notes };
}

/* ================= 양식에서 기본값 읽기 (안전교육일지 시트 목록 등) ================= */
export async function readEduDefaults(file) {
  const book = await openBook(await file.arrayBuffer()), out = {};
  for (const name of book.names) {
    const sh = await book.sheet(name), mi = mergeIndex(sh), lab = labels(sh, 1, 20, 12);
    const right = k => { const p = lab[k]; if (!p) return ""; const mm = mi.at(p.c, p.r); return sh.text((mm ? mm.c2 : p.c) + 1, p.r); };
    const ct = lab["교육내용"], items = [];
    if (ct) { const mm = mi.at(ct.c, ct.r), c = (mm ? mm.c2 : ct.c) + 1, n = mm ? mm.r2 - mm.r1 + 1 : 1; for (let i = 0; i < n; i++) items.push(sh.text(c, ct.r + i)); }
    out[name] = { project: right("공사명"), company: right("회사명"), place: right("교육장소"), teacher: right("교육담당").replace(/\(서명\)/, "").trim(), boss: right("현장소장").replace(/\(서명\)/, "").trim(), items, rows: items.length };
  }
  return out;
}
