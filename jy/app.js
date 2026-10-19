// 직영실행 — 월별 직영 실행 정산 (엑셀 '직영실행' 파일의 각 시트를 화면으로 옮김)
// 자료는 접속 비밀번호를 통과한 사람만 볼 수 있음: /__dbtoken 으로 받은 토큰을 DB 요청 헤더에 실어 보냄
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";
import * as P from "./print.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toast = msg => { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 2600); };
const uid = () => crypto.randomUUID();
const num = v => { if (v === "" || v == null) return null; const n = Number(String(v).replace(/[^\d.\-]/g, "")); return isFinite(n) ? n : null; };
const fmt = v => v == null || v === "" ? "" : Number(v).toLocaleString("ko-KR");
const fmt0 = v => Number(v || 0).toLocaleString("ko-KR");
const BUCKET = "jy-files";

export const SHEETS = [
  { id: "exec",   name: "실행내역서" },
  { id: "meal",   name: "식대" },
  { id: "labor",  name: "인건비" },
  { id: "pay",    name: "노무비명세서" },
  { id: "contract", name: "근로계약서" },
  { id: "people", name: "신분증·이수증·통장사본" },
  { id: "mat",    name: "자재구입" },
  { id: "photo",  name: "자재 사진대지" },
  { id: "doc",    name: "증빙서류" },
];
const DEFAULT_GROUPS = ["거래명세표", "정해산업보건연구소", "한강수병원", "장비(일신중기)", "장비(대두이앤지)", "장비(건하이앤지)",
  "장비(경남중기)", "장비(대두이앤지2)", "장비(성진철거)", "장비(부영중기)", "장비(비에이치인프라)", "장비(선유건기)",
  "장비((주)전진건설기계)", "주유((주)창성에너지)", "인력(드림에스앤앰)", "살수차(월드살수)", "(주)롯데칠성"];
const ID_SLOTS = ["신분증", "이수증", "통장사본"];
const DED = [["tax", "갑근세"], ["res", "주민세"], ["pen", "국민연금"], ["hea", "국민건강"], ["emp", "고용보험"], ["ltc", "장기요양"]];

/* ================= 상태 ================= */
const S = {
  site: "", months: [], month: null, sheet: "exec",
  rows: { exec: [], labor: [], meal: [], mat: [] },
  workers: [], files: [], urls: {},
  docGroup: null, showRrn: false, peopleAll: false, peopleQ: "",
  calc: null,
};
let sb;

async function connect() {
  let t = "";
  try { const r = await fetch("/__dbtoken", { cache: "no-store" }); if (r.ok) t = (await r.json()).t || ""; } catch {}
  sb = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { headers: { "x-pms-token": t } }, auth: { persistSession: false } });
  return t;
}

/* ================= 저장 (입력하면 잠시 뒤 자동 저장) ================= */
const pend = { rows: new Map(), workers: new Map(), files: new Map(), month: false };
let flushT = null, saving = false;
function setSave(state, text) { const el = $("#save"); if (!el) return; el.className = "save " + (state || ""); el.textContent = text; }
function mark(kind, obj) {
  if (kind === "month") pend.month = true; else pend[kind].set(obj.id, obj);
  setSave("busy", "저장 중…");
  clearTimeout(flushT); flushT = setTimeout(flush, 700);
}
async function flush() {
  clearTimeout(flushT);
  if (saving) { flushT = setTimeout(flush, 300); return; }
  const rows = [...pend.rows.values()], ws = [...pend.workers.values()], fs = [...pend.files.values()], mo = pend.month;
  pend.rows.clear(); pend.workers.clear(); pend.files.clear(); pend.month = false;
  if (!rows.length && !ws.length && !fs.length && !mo) return;
  saving = true;
  try {
    const now = new Date().toISOString();
    if (rows.length) { const { error } = await sb.from("jy_rows").upsert(rows.map(r => ({ id: r.id, month_id: r.month_id, sheet: r.sheet, sort: r.sort, data: r.data, updated_at: now }))); if (error) throw error; }
    if (ws.length) { const { error } = await sb.from("jy_workers").upsert(ws.map(({ id, name, team, rrn, address, phone, bank, rate, memo, active }) => ({ id, name: name || "", team, rrn, address, phone, bank, rate: rate || 0, memo, active }))); if (error) throw error; }
    if (fs.length) { const { error } = await sb.from("jy_files").upsert(fs.map(({ id, month_id, worker_id, sheet, grp, sort, path, name, caption }) => ({ id, month_id, worker_id, sheet, grp, sort, path, name, caption }))); if (error) throw error; }
    if (mo && S.month) { const m = S.month; const { error } = await sb.from("jy_months").update({ title: m.title, status: m.status, settings: m.settings, site: m.site, updated_at: now }).eq("id", m.id); if (error) throw error; }
    setSave("", "저장됨 ✓");
  } catch (e) {
    console.error(e);
    rows.forEach(r => pend.rows.set(r.id, r)); ws.forEach(r => pend.workers.set(r.id, r)); fs.forEach(r => pend.files.set(r.id, r)); if (mo) pend.month = true;
    setSave("err", "저장 실패 — 다시 시도 중");
    flushT = setTimeout(flush, 4000);
  } finally { saving = false; }
}
const hasPending = () => pend.rows.size || pend.workers.size || pend.files.size || pend.month;
window.addEventListener("beforeunload", e => { if (hasPending() || saving) { flush(); e.preventDefault(); e.returnValue = ""; } });

/* ================= 날짜 ================= */
const ymParts = ym => { const [y, m] = String(ym).split("-").map(Number); return { y, m }; };
const lastDay = ym => { const { y, m } = ymParts(ym); return new Date(y, m, 0).getDate(); };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const wday = (ym, d) => { const { y, m } = ymParts(ym); return new Date(y, m - 1, d).getDay(); };
// 엑셀에서 넘어온 자료에 그 달에 없는 날짜(예: 9월 31일) 칸 값이 있으면 그 칸까지 보여 줌
function nDays(ym, rows, keys) {
  let n = lastDay(ym);
  rows.forEach(r => keys.forEach(k => Object.keys(r.data[k] || {}).forEach(d => { if (+d > n && r.data[k][d]) n = Math.min(31, +d); })));
  return n;
}
function dayHead(ym, n = lastDay(ym)) {
  const last = lastDay(ym); let h = "";
  for (let d = 1; d <= n; d++) {
    if (d > last) { h += `<th class="day" title="이 달에는 없는 날짜입니다 (엑셀에서 넘어온 값)">${d}<small>-</small></th>`; continue; }
    const w = wday(ym, d); h += `<th class="day ${w === 6 ? "sat" : w === 0 ? "sun" : ""}">${d}<small>${WD[w]}</small></th>`;
  }
  return h;
}
const isWe = (ym, d) => { if (d > lastDay(ym)) return true; const w = wday(ym, d); return w === 0 || w === 6; };
const sumObj = o => Object.values(o || {}).reduce((a, b) => a + (Number(b) || 0), 0);

/* ================= 데이터 불러오기 ================= */
async function loadSite() {
  try { const { data } = await sb.from("site_settings").select("*").limit(1).maybeSingle(); S.site = data?.site_name || ""; } catch {}
}
async function signUrls(paths) {
  const need = [...new Set(paths)].filter(p => p && !S.urls[p]);
  for (let i = 0; i < need.length; i += 100) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(need.slice(i, i + 100), 3600 * 6);
    (data || []).forEach(d => { if (d.signedUrl) S.urls[d.path] = d.signedUrl; });
  }
}
async function loadMonth(id) {
  const [m, rows, ws, fs] = await Promise.all([
    sb.from("jy_months").select("*").eq("id", id).maybeSingle(),
    sb.from("jy_rows").select("*").eq("month_id", id).order("sort"),
    sb.from("jy_workers").select("*").order("name"),
    sb.from("jy_files").select("*").or(`month_id.eq.${id},sheet.in.(id,tpl-contract)`).order("sort"),
  ]);
  if (m.error || !m.data) throw m.error || new Error("없는 달입니다");
  S.month = m.data;
  S.month.settings = { meal_price: 0, groups: DEFAULT_GROUPS.slice(), approvals: ["담 당", "부사장", "대표이사"], ...(S.month.settings || {}) };
  S.rows = { exec: [], labor: [], meal: [], mat: [] };
  (rows.data || []).forEach(r => { (S.rows[r.sheet] ||= []).push(r); });
  S.workers = ws.data || [];
  S.files = fs.data || [];
  await signUrls(S.files.map(f => f.path));
}

/* ================= 화면 이동 ================= */
async function route() {
  if (hasPending()) await flush();
  const h = location.hash.replace(/^#\/?/, "");
  const [kind, id, sheet] = h.split("/");
  try {
    if (kind === "m" && id) {
      if (!S.month || S.month.id !== id) { $("#app").innerHTML = `<p class="muted pad">불러오는 중…</p>`; await loadMonth(id); S.docGroup = null; }
      S.sheet = SHEETS.some(s => s.id === sheet) ? sheet : "exec";
      renderMonth();
    } else { S.month = null; await renderList(); }
  } catch (e) { console.error(e); $("#app").innerHTML = `<div class="card lock"><h3>불러오지 못했습니다</h3><p class="muted">${esc(e.message || e)}</p><a class="btn" href="#/">목록으로</a></div>`; }
}
window.addEventListener("hashchange", route);

/* ================= 월 목록 ================= */
async function renderList() {
  const [{ data: months, error }, { data: rows }] = await Promise.all([
    sb.from("jy_months").select("*").order("ym", { ascending: false }),
    sb.from("jy_rows").select("month_id,sheet,data").in("sheet", ["exec", "labor", "mat"]),
  ]);
  if (error) throw error;
  S.months = months || [];
  const sum = {};
  (rows || []).forEach(r => {
    const s = sum[r.month_id] ||= { exec: 0, people: 0, mat: 0 };
    if (r.sheet === "exec") s.exec += (Number(r.data.supply) || 0) + (Number(r.data.vat) || 0);
    if (r.sheet === "labor" && r.data.name) s.people++;
    if (r.sheet === "mat") s.mat += Number(r.data.amount) || 0;
  });
  $("#app").innerHTML = `
    <div class="page-h"><div><h1>직영실행</h1><p class="hint">달마다 실행내역서·식대·인건비·노무비명세서·인적사항·자재·증빙서류를 한 묶음으로 관리합니다.</p></div>
      <button class="btn primary" id="btn-new">+ 새 달 만들기</button></div>
    ${S.months.length ? `<div class="months">${S.months.map(m => {
      const s = sum[m.id] || { exec: 0, people: 0, mat: 0 }; const { y, m: mm } = ymParts(m.ym);
      return `<a class="card mcard" href="#/m/${m.id}/exec">
        <div style="display:flex;justify-content:space-between;align-items:center"><span class="ym">${y}년 ${mm}월</span><span class="st ${m.status === "결재완료" ? "done" : ""}">${esc(m.status)}</span></div>
        <div class="tt">${esc(m.title || "직영 실행")}</div>
        <div class="nums"><span>실행 합계<b>${fmt0(s.exec)}</b></span><span>출역 인원<b>${s.people}명</b></span><span>자재구입<b>${fmt0(s.mat)}</b></span></div></a>`;
    }).join("")}</div>` : `<div class="card empty">아직 만든 달이 없습니다. <b>+ 새 달 만들기</b>로 시작하세요.</div>`}`;
  $("#btn-new").onclick = openNewDialog;
}

function openNewDialog() {
  const f = $("#f-new"), d = $("#dlg-new");
  const now = new Date(); const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  f.ym.value = ym;
  const setTitle = () => { const { m } = ymParts(f.ym.value || ym); f.title.placeholder = `${S.site || "현장"} 직영 실행 (${m}월)`; };
  f.ym.oninput = setTitle; setTitle(); f.title.value = "";
  f.copy.innerHTML = `<option value="">가져오지 않음 (빈 양식)</option>` + S.months.map(m => `<option value="${m.id}">${esc(m.ym)} · ${esc(m.title)}</option>`).join("");
  if (S.months[0]) f.copy.value = S.months[0].id;
  d.showModal();
  d.onclose = async () => {
    if (d.returnValue !== "ok") return;
    try { const id = await createMonth(f.ym.value, f.title.value.trim() || f.title.placeholder, f.copy.value); location.hash = `#/m/${id}/exec`; }
    catch (e) { console.error(e); toast("만들지 못했습니다: " + (e.message || e)); }
  };
}

async function createMonth(ym, title, copyFrom) {
  let settings = { meal_price: 0, groups: DEFAULT_GROUPS.slice(), approvals: ["담 당", "부사장", "대표이사"] };
  let rows = [];
  if (copyFrom) {
    const [{ data: pm }, { data: pr }] = await Promise.all([
      sb.from("jy_months").select("settings").eq("id", copyFrom).maybeSingle(),
      sb.from("jy_rows").select("*").eq("month_id", copyFrom).in("sheet", ["exec", "labor", "meal"]).order("sort"),
    ]);
    if (pm?.settings) settings = { ...settings, ...pm.settings };
    rows = (pr || []).map(r => {
      const d = r.data || {};
      if (r.sheet === "labor") return { sheet: "labor", sort: r.sort, data: { team: d.team || "", name: d.name || "", rate: d.rate ?? null, d: {}, ded: {}, memo: "" } };
      if (r.sheet === "meal") return { sheet: "meal", sort: r.sort, data: { name: d.name || "", team: d.team || "", jo: {}, jung: {}, memo: d.memo || "" } };
      const note = String(d.note || "").split("\n").filter(l => !/^\s*총\s*[\d.]+\s*일\s*근무/.test(l)).join("\n");
      return { sheet: "exec", sort: r.sort, data: { cat: d.cat || "", vendor: d.vendor || "", supply: null, vat: null, note } };
    });
  }
  const id = uid();
  const { error } = await sb.from("jy_months").insert({ id, ym, title, site: S.site, status: "작성중", settings });
  if (error) throw error;
  if (rows.length) { const { error: e2 } = await sb.from("jy_rows").insert(rows.map(r => ({ ...r, month_id: id }))); if (e2) throw e2; }
  return id;
}

/* ================= 월 화면 ================= */
function renderMonth() {
  const m = S.month; const { y, m: mm } = ymParts(m.ym);
  const cnt = { exec: S.rows.exec.length, labor: S.rows.labor.length, meal: S.rows.meal.length, mat: S.rows.mat.length,
    people: monthWorkers().length, photo: S.files.filter(f => f.sheet === "photo").length, doc: S.files.filter(f => f.sheet === "doc").length, pay: S.rows.labor.length };
  $("#app").innerHTML = `
    <div class="mhead">
      <a class="btn sm ghost back" href="#/">← 목록</a>
      <span class="st">${y}년 ${mm}월</span>
      <input class="title" id="m-title" value="${esc(m.title)}" title="제목 (인쇄물 맨 위에 들어갑니다)">
      <span class="grow"></span>
      <span class="save" id="save"></span>
      <button class="btn primary" id="m-xlsx" title="엑셀 양식 파일에 이 달 내용을 채워서 내려받기 (서식·수식 그대로)">📤 엑셀 양식으로 저장</button>
      <select id="m-status" title="상태"><option>작성중</option><option>결재완료</option></select>
      <button class="btn sm danger" id="m-del" title="이 달 자료를 모두 지웁니다">달 삭제</button>
    </div>
    <nav class="sheets">${SHEETS.map(s => `<button data-sheet="${s.id}" class="${s.id === S.sheet ? "active" : ""}">${s.name}${cnt[s.id] ? `<small>${cnt[s.id]}</small>` : ""}</button>`).join("")}</nav>
    <section class="sheet" id="sheet"></section>`;
  $("#m-status").value = m.status;
  $("#m-title").oninput = e => { m.title = e.target.value; mark("month"); };
  $("#m-status").onchange = e => { m.status = e.target.value; mark("month"); };
  $("#m-del").onclick = deleteMonth;
  $("#m-xlsx").onclick = exportDialog;
  $$(".sheets button").forEach(b => b.onclick = () => { location.hash = `#/m/${m.id}/${b.dataset.sheet}`; });
  renderSheet();
}
function renderSheet() {
  S.calc = null;
  ({ exec: rExec, labor: rLabor, meal: rMeal, pay: rPay, contract: rContract, people: rPeople, mat: rMat, photo: rPhoto, doc: rDoc })[S.sheet]();
  S.calc?.();
}
async function deleteMonth() {
  const m = S.month;
  if (!confirm(`${m.ym} 「${m.title}」 자료를 모두 지울까요?\n실행내역·인건비·식대·자재·사진·증빙서류가 함께 지워지고 되돌릴 수 없습니다.\n(사람 인적사항은 남습니다)`)) return;
  const paths = S.files.filter(f => f.month_id === m.id).map(f => f.path);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
  const { error } = await sb.from("jy_months").delete().eq("id", m.id);
  if (error) return toast("지우지 못했습니다: " + error.message);
  S.month = null; location.hash = "#/";
}

/* ---------- 행 공통 ---------- */
function newRow(sheet, data) {
  const list = S.rows[sheet];
  const r = { id: uid(), month_id: S.month.id, sheet, sort: (list.reduce((a, x) => Math.max(a, x.sort), 0) || 0) + 1, data };
  list.push(r); mark("rows", r); return r;
}
async function delRow(sheet, id) {
  S.rows[sheet] = S.rows[sheet].filter(r => r.id !== id);
  pend.rows.delete(id);
  const { error } = await sb.from("jy_rows").delete().eq("id", id);
  if (error) toast("지우지 못했습니다: " + error.message);
}
function moveRow(sheet, id, dir) {
  const list = S.rows[sheet].sort((a, b) => a.sort - b.sort); const i = list.findIndex(r => r.id === id); const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((r, k) => { if (r.sort !== k + 1) { r.sort = k + 1; mark("rows", r); } });
}
const sorted = sheet => S.rows[sheet].slice().sort((a, b) => a.sort - b.sort);
const findRow = id => { for (const k in S.rows) { const r = S.rows[k].find(x => x.id === id); if (r) return r; } };
const findObj = (k, id) => k === "rows" ? findRow(id) : k === "workers" ? S.workers.find(w => w.id === id) : S.files.find(f => f.id === id);

// 입력칸: data-k(rows|workers|files) data-id data-f(점 경로) [data-num]
const inp = (k, obj, f, { numeric, ph = "", cls = "", area } = {}) => {
  const v = f.split(".").reduce((o, p) => o?.[p], obj);
  const val = numeric ? fmt(v) : (v ?? "");
  const a = `data-k="${k}" data-id="${obj.id}" data-f="${f}" ${numeric ? 'data-num inputmode="decimal"' : ""} placeholder="${esc(ph)}" class="${numeric ? "n " : ""}${cls}"`;
  return area ? `<textarea ${a} rows="1">${esc(val)}</textarea>` : `<input ${a} value="${esc(val)}">`;
};
function setPath(obj, f, v) { const ps = f.split("."); let o = obj; ps.slice(0, -1).forEach(p => { o = (o[p] ||= {}); }); o[ps.at(-1)] = v; }

document.addEventListener("input", e => {
  const el = e.target.closest("[data-k][data-f]"); if (!el) return;
  const obj = findObj(el.dataset.k, el.dataset.id); if (!obj) return;
  setPath(obj, el.dataset.f, el.hasAttribute("data-num") ? num(el.value) : el.value);
  mark(el.dataset.k, obj);
  if (el.tagName === "TEXTAREA") autoSize(el);
  S.calc?.();
});
document.addEventListener("focusout", e => { const el = e.target; if (el.matches?.("[data-num]")) el.value = fmt(num(el.value)); });
document.addEventListener("focusin", e => { const el = e.target; if (el.matches?.("[data-num]")) { const v = num(el.value); el.value = v == null ? "" : v; el.select(); } });
const autoSize = el => { el.style.height = "auto"; el.style.height = Math.max(34, el.scrollHeight) + "px"; };
const sizeAreas = () => $$("#sheet textarea").forEach(autoSize);
const setCalc = (key, v) => $$(`[data-calc="${key}"]`).forEach(el => el.textContent = v);

/* ================= 실행내역서 ================= */
function rExec() {
  const rows = sorted("exec"), st = S.month.settings;
  $("#sheet").innerHTML = `
    <div class="bar">
      <button class="btn primary" id="x-add">+ 행 추가</button>
      <button class="btn" id="x-labor" title="업체(성명)가 인건비 명단과 같은 행에 금액과 '총 N일 근무'를 넣습니다">인건비 금액 반영</button>
      <label>결재란 <input id="x-appr" value="${esc(st.approvals.join(", "))}" style="width:200px" title="쉼표로 구분"></label>
      <span class="grow"></span><span class="sum-chip">합계 <span data-calc="x-all"></span>원</span>
      <button class="btn" id="x-print">🖨 인쇄</button>
    </div>
    <div class="scroll"><table class="t">
      <colgroup><col style="width:44px"><col style="width:170px"><col style="width:190px"><col style="width:120px"><col style="width:110px"><col style="width:120px"><col><col style="width:60px"></colgroup>
      <thead><tr><th>연번</th><th>품목</th><th>업체 · 성명</th><th>공급가</th><th>부가세</th><th>합계</th><th>비고 (사업자 및 통장번호)</th><th></th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr data-row="${r.id}">
        <td class="idx">${i + 1}</td><td>${inp("rows", r, "data.cat", { area: 1 })}</td><td>${inp("rows", r, "data.vendor", { area: 1 })}</td>
        <td>${inp("rows", r, "data.supply", { numeric: 1 })}</td><td>${inp("rows", r, "data.vat", { numeric: 1 })}</td>
        <td class="calc" data-calc="x-${r.id}"></td><td>${inp("rows", r, "data.note", { area: 1 })}</td>
        <td class="del"><button class="x" data-up="${r.id}" title="위로">▲</button><button class="x" data-dn="${r.id}" title="아래로">▼</button><button class="x" data-del="${r.id}" title="삭제">✕</button></td></tr>`).join("")
        || `<tr><td colspan="8" class="c muted" style="padding:30px">행이 없습니다. <b>+ 행 추가</b>로 시작하세요.</td></tr>`}</tbody>
      <tfoot><tr><td></td><td class="c" colspan="2">합 계</td><td class="n" data-calc="x-sup"></td><td class="n" data-calc="x-vat"></td><td class="n" data-calc="x-all"></td><td colspan="2"></td></tr></tfoot>
    </table></div>
    <p class="hint">공급가·부가세를 넣으면 합계가 자동으로 계산됩니다. 품목이 같은 행이 이어지면 인쇄할 때 품목 칸이 하나로 합쳐집니다.</p>`;
  sizeAreas();
  S.calc = () => {
    let a = 0, b = 0;
    S.rows.exec.forEach(r => { const s = Number(r.data.supply) || 0, v = Number(r.data.vat) || 0; a += s; b += v; setCalc("x-" + r.id, fmt0(s + v)); });
    setCalc("x-sup", fmt0(a)); setCalc("x-vat", fmt0(b)); setCalc("x-all", fmt0(a + b));
  };
  $("#x-add").onclick = () => { const last = sorted("exec").at(-1); newRow("exec", { cat: last?.data.cat || "", vendor: "", supply: null, vat: null, note: "" }); rExec(); S.calc(); focusLast(); };
  $("#x-appr").oninput = e => { st.approvals = e.target.value.split(",").map(s => s.trim()).filter(Boolean); mark("month"); };
  $("#x-print").onclick = () => P.printExec(S.month, sorted("exec"));
  $("#x-labor").onclick = () => {
    applyRates();
    const by = {}; S.rows.labor.forEach(l => { const n = (l.data.name || "").trim(); if (n) (by[n] ||= []).push(l); });
    const ex = {}; S.rows.exec.forEach(r => { const n = (r.data.vendor || "").trim(); if (n) (ex[n] ||= []).push(r); });
    let ok = 0; const skip = [];
    Object.entries(ex).forEach(([n, list]) => {
      const ls = by[n]; if (!ls) return;
      if (ls.length !== 1 || list.length !== 1) { skip.push(n); return; }
      const l = ls[0], days = sumObj(l.data.d), r = list[0];
      r.data.supply = days * (Number(l.data.rate) || 0);
      const lines = String(r.data.note || "").split("\n").filter(x => !/^\s*총\s*[\d.]+\s*일\s*근무/.test(x));
      r.data.note = [`총 ${days}일 근무`, ...lines].join("\n").trim();
      mark("rows", r); ok++;
    });
    rExec(); S.calc();
    toast(`${ok}명 반영했습니다.` + (skip.length ? ` 이름이 두 번 이상 나와 건너뜀: ${skip.join(", ")}` : ""));
  };
  bindRowOps("exec", rExec);
}
function bindRowOps(sheet, rerender) {
  $("#sheet").onclick = async e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.del) { const r = findRow(b.dataset.del); const label = r?.data.name || r?.data.vendor || r?.data.item || ""; if (!confirm(`${label ? `「${label}」 ` : ""}행을 지울까요?`)) return; await delRow(sheet, b.dataset.del); rerender(); S.calc?.(); }
    else if (b.dataset.up) { moveRow(sheet, b.dataset.up, -1); rerender(); S.calc?.(); }
    else if (b.dataset.dn) { moveRow(sheet, b.dataset.dn, 1); rerender(); S.calc?.(); }
  };
}
const focusLast = () => { const el = $$("#sheet tbody tr:last-child [data-f]")[0]; el?.focus(); el?.scrollIntoView({ block: "nearest" }); };

/* ================= 단가 규칙 (소속별) ================= */
// tier: 출역 min일 이상이면 hi, 아니면 lo / fixed: 항상 rate / 규칙이 없는 소속은 사람마다 직접 입력
const DEFAULT_RULES = [
  { team: "드림인력", type: "tier", min: 8, hi: 170000, lo: 160000 },
  { team: "직영", type: "fixed", rate: 160000 },
];
const rules = () => (S.month.settings.rateRules ||= DEFAULT_RULES.map(r => ({ ...r })));
const ruleOf = grp => rules().find(x => x.team && x.team === (grp || "").trim()) || null;   // 규칙은 '구분'(드림인력·직영 …) 기준
const TEAMS = ["지디", "비계"];
const ruleRate = (rule, days) => rule.type === "fixed" ? Number(rule.rate) || 0 : days >= (Number(rule.min) || 0) ? Number(rule.hi) || 0 : Number(rule.lo) || 0;
const ruleText = r => r.type === "fixed" ? `${fmt0(r.rate)}원 고정` : `${r.min}일 이상 ${fmt0(r.hi)}원 · 미만 ${fmt0(r.lo)}원`;
// 규칙이 있는 소속의 단가를 출역일수에 맞게 다시 정함 (바뀐 줄 수를 돌려줌)
function applyRates(list = S.rows.labor) {
  let n = 0;
  list.forEach(r => { const rule = ruleOf(r.data.group); if (!rule) return; const v = ruleRate(rule, sumObj(r.data.d)); if (Number(r.data.rate) !== v) { r.data.rate = v; mark("rows", r); n++; } });
  return n;
}

// 인건비 정렬: 구분 직영 → 건하이엔지 → 드림인력 → 비계 → (그 밖) → (빈칸), 같은 구분 안에서는 이름 가나다순
const GROUP_ORDER = ["직영", "건하이엔지", "드림인력", "비계"];
function sortLabor() {
  const rank = g => { g = (g || "").trim(); const i = GROUP_ORDER.indexOf(g); return i >= 0 ? i : g ? GROUP_ORDER.length : GROUP_ORDER.length + 1; };
  const list = sorted("labor");
  list.sort((a, b) => rank(a.data.group) - rank(b.data.group) || (a.data.group || "").localeCompare(b.data.group || "", "ko")
    || (a.data.name || "").trim().localeCompare((b.data.name || "").trim(), "ko") || a.sort - b.sort);
  list.forEach((r, k) => { if (r.sort !== k + 1) { r.sort = k + 1; mark("rows", r); } });
}

/* ================= 인건비 (인력 출력 현황) ================= */
function rLabor() {
  const ym = S.month.ym, rows = sorted("labor"), n = nDays(ym, rows, ["d"]);
  const dl = `<datalist id="dl-workers">${S.workers.map(w => `<option value="${esc(w.name)}">${esc(w.team)}</option>`).join("")}</datalist>`;
  const groups = [...new Set([...rules().map(r => r.team), ...S.rows.labor.map(r => r.data.group)].filter(Boolean))];
  $("#sheet").innerHTML = `${dl}<datalist id="dl-teams">${TEAMS.map(t => `<option value="${esc(t)}">`).join("")}</datalist><datalist id="dl-groups">${groups.map(t => `<option value="${esc(t)}">`).join("")}</datalist>
    <div class="bar">
      <button class="btn primary" id="l-add">+ 인원 추가</button>
      <label class="btn up" title="업체(인력사무소·협력사)에서 받은 정산 엑셀을 올리면 출역일·공수·단가를 자동으로 채웁니다">📥 업체 정산 엑셀 불러오기<input type="file" accept=".xlsx" multiple id="l-imp"></label>
      <button class="btn" id="l-sort" title="구분(직영 → 건하이엔지 → 드림인력 → 비계) 순서, 같은 구분 안에서는 이름 가나다순">정렬</button>
      <button class="btn" id="l-rules" title="${esc(rules().map(r => `${r.team}: ${ruleText(r)}`).join("\n"))}">⚙ 단가 규칙</button>
      <span class="muted" style="font-size:12px">날짜 칸을 누르면 <b style="color:#1e40af">1</b> → <b style="color:#b45309">0.5</b> → 빈칸 순서로 바뀝니다.</span>
      <span class="grow"></span><span class="sum-chip">출역 <span data-calc="l-days"></span>일 · <span data-calc="l-amt"></span>원</span>
      <button class="btn" id="l-print">🖨 인쇄</button>
    </div>
    <div class="scroll"><table class="t fit">
      <thead><tr><th class="stick" style="left:0;width:38px">번호</th><th style="width:62px">소속</th><th style="width:78px">성명</th><th style="width:84px" title="단가 규칙을 정하는 구분 (직영·드림인력 …)">구분</th><th style="width:84px">단가</th>${dayHead(ym, n)}<th style="width:52px">출역<br>일수</th><th style="width:96px">금액</th><th style="width:120px">비고</th><th style="width:76px"></th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr>
        <td class="idx stick">${i + 1}</td><td>${inp("rows", r, "data.team", { cls: "mw", ph: "소속" }).replace("<input", '<input list="dl-teams"')}</td>
        <td>${inp("rows", r, "data.name", { cls: "mw" }).replace("<input", '<input list="dl-workers"')}</td><td>${inp("rows", r, "data.group", { cls: "mw mw2", ph: "구분" }).replace("<input", '<input list="dl-groups"')}</td>
        ${ruleOf(r.data.group) ? `<td class="calc auto" title="${esc(r.data.group)} 단가 규칙: ${esc(ruleText(ruleOf(r.data.group)))}"><span data-calc="l-r-${r.id}"></span><small>자동</small></td>` : `<td>${inp("rows", r, "data.rate", { numeric: 1, cls: "mw" })}</td>`}
        ${Array.from({ length: n }, (_, k) => dcell(r, "d", k + 1, ym)).join("")}
        <td class="calc" data-calc="l-d-${r.id}" style="text-align:center"></td><td class="calc" data-calc="l-a-${r.id}"></td>
        <td>${inp("rows", r, "data.memo", { cls: "mw" })}</td>
        <td class="del"><button class="x" data-up="${r.id}">▲</button><button class="x" data-dn="${r.id}">▼</button><button class="x" data-del="${r.id}">✕</button></td></tr>`).join("")
        || `<tr><td colspan="${n + 9}" class="c muted" style="padding:30px">명단이 없습니다. <b>+ 인원 추가</b>로 시작하세요.</td></tr>`}</tbody>
      <tfoot><tr><td class="stick"></td><td colspan="4" class="c">일별 인원 / 합계</td>${Array.from({ length: n }, (_, k) => `<td class="dsum" data-calc="l-s-${k + 1}"></td>`).join("")}<td class="c" data-calc="l-days"></td><td class="n" data-calc="l-amt"></td><td colspan="2"></td></tr></tfoot>
    </table></div>
    <p class="hint">소속은 <b>지디 · 비계</b>. 단가는 <b>구분</b>으로 정합니다 — ${rules().map(r => `<b>${esc(r.team)}</b> ${esc(ruleText(r))}`).join(" · ") || "규칙 없음"} · 그 밖의 구분(건하이엔지·비계 등)은 사람마다 단가를 직접 입력합니다. 금액 = 출역일수 × 단가</p>`;
  S.calc = () => {
    applyRates();
    let td = 0, ta = 0; const per = {};
    S.rows.labor.forEach(r => {
      if (ruleOf(r.data.group)) setCalc("l-r-" + r.id, fmt0(r.data.rate));
      const d = sumObj(r.data.d), a = d * (Number(r.data.rate) || 0); td += d; ta += a;
      setCalc("l-d-" + r.id, d || ""); setCalc("l-a-" + r.id, fmt0(a));
      Object.entries(r.data.d || {}).forEach(([k, v]) => per[k] = (per[k] || 0) + (Number(v) || 0));
    });
    for (let k = 1; k <= n; k++) setCalc("l-s-" + k, per[k] || "");
    setCalc("l-days", td); setCalc("l-amt", fmt0(ta));
  };
  $("#l-add").onclick = () => { const last = sorted("labor").at(-1); newRow("labor", { team: last?.data.team || "지디", group: last?.data.group || "", name: "", rate: last?.data.rate ?? null, d: {}, ded: {}, memo: "" }); rLabor(); S.calc(); focusLast(); };
  $("#l-sort").onclick = () => { sortLabor(); rLabor(); S.calc(); toast("구분 → 이름 순으로 정렬했습니다."); };
  $("#l-print").onclick = () => P.printLabor(S.month, sorted("labor"));
  $("#l-rules").onclick = rulesDialog;
  $("#l-imp").onchange = e => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) vendorImport(fs); };
  bindRowOps("labor", rLabor);
}
// 인건비: 소속을 바꾸면 단가 규칙 적용 여부가 바뀌므로 다시 그림
document.addEventListener("change", e => {
  const el = e.target; if (S.sheet !== "labor" || !["data.team", "data.group"].includes(el.dataset?.f)) return;
  const r = findRow(el.dataset.id); if (r && !ruleOf(r.data.group)) { const w = S.workers.find(w => w.name === (r.data.name || "").trim() && w.rate); if (w && !r.data.rate) { r.data.rate = w.rate; mark("rows", r); } }
  rLabor(); S.calc();
});
// 인건비: 이름을 고르면 인적사항의 소속·단가로 채움
document.addEventListener("change", e => {
    const el = e.target; if (S.sheet !== "labor" || el.dataset?.f !== "data.name") return;
    const r = findRow(el.dataset.id), w = S.workers.find(w => w.name === el.value.trim()); if (!r || !w) return;
    let ch = false;
    if (!r.data.team && w.team) { r.data.team = w.team; ch = true; }
    if (!r.data.rate && w.rate) { r.data.rate = w.rate; ch = true; }
    if (ch) { mark("rows", r); rLabor(); S.calc(); }
});
function rulesDialog() {
  let dlg = $("#dlg-rules");
  if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "dlg-rules"; dlg.className = "imp rules"; document.body.append(dlg); }
  const list = rules().map(r => ({ ...r }));
  const teams = [...new Set(S.rows.labor.map(r => (r.data.group || "").trim()).filter(Boolean))];
  const draw = () => {
    dlg.innerHTML = `<form method="dialog">
      <h3>단가 규칙</h3>
      <p class="hint" style="margin:-8px 0 12px">인건비 탭의 <b>구분</b> 칸에 규칙 이름(예: 드림인력)이 적힌 사람은 출역일수에 맞춰 단가가 자동으로 정해집니다. 규칙이 없는 구분은 사람마다 단가를 직접 입력합니다. 새 달을 만들면 규칙도 함께 옮겨 갑니다.</p>
      <table class="t imp-t"><thead><tr><th>구분</th><th>방식</th><th colspan="3">단가</th><th></th></tr></thead><tbody>
      ${list.map((r, i) => `<tr>
        <td><input data-i="${i}" data-k="team" value="${esc(r.team)}" list="dl-rteams" style="width:120px"></td>
        <td><select data-i="${i}" data-k="type"><option value="tier" ${r.type === "tier" ? "selected" : ""}>출역일수 기준</option><option value="fixed" ${r.type === "fixed" ? "selected" : ""}>고정</option></select></td>
        ${r.type === "tier"
          ? `<td><input data-i="${i}" data-k="min" value="${esc(r.min)}" class="n" style="width:50px">일 이상</td><td><input data-i="${i}" data-k="hi" value="${fmt(r.hi)}" class="n" style="width:100px">원</td><td>미만 <input data-i="${i}" data-k="lo" value="${fmt(r.lo)}" class="n" style="width:100px">원</td>`
          : `<td colspan="3"><input data-i="${i}" data-k="rate" value="${fmt(r.rate)}" class="n" style="width:100px">원</td>`}
        <td><button type="button" class="x" data-rm="${i}">✕</button></td></tr>`).join("")}
      </tbody></table>
      <datalist id="dl-rteams">${teams.map(t => `<option value="${esc(t)}">`).join("")}</datalist>
      <button type="button" class="btn sm" id="r-add" style="margin-top:8px">+ 규칙 추가</button>
      <p class="hint">이 달 구분: ${teams.map(t => `<b>${esc(t)}</b>${list.some(r => r.team === t) ? " (규칙)" : " (직접 입력)"}`).join(" · ") || "-"}</p>
      <div class="dlg-btns"><button value="cancel" class="btn">닫기</button><button value="ok" class="btn primary">저장하고 다시 계산</button></div>
    </form>`;
    $$("[data-k]", dlg).forEach(el => el.onchange = () => { const r = list[+el.dataset.i], k = el.dataset.k; r[k] = ["min", "hi", "lo", "rate"].includes(k) ? num(el.value) : el.value.trim(); if (k === "type") { if (r.type === "fixed" && r.rate == null) r.rate = r.lo ?? 160000; if (r.type === "tier") { r.min ??= 8; r.hi ??= 170000; r.lo ??= 160000; } draw(); } });
    $$("[data-rm]", dlg).forEach(b => b.onclick = () => { list.splice(+b.dataset.rm, 1); draw(); });
    $("#r-add", dlg).onclick = () => { list.push({ team: "", type: "fixed", rate: 160000 }); draw(); };
  };
  draw(); dlg.showModal();
  dlg.onclose = () => {
    if (dlg.returnValue !== "ok") return;
    S.month.settings.rateRules = list.filter(r => r.team);
    mark("month");
    const n = applyRates();
    renderMonthKeepScroll();
    toast(`단가 규칙을 저장했습니다.${n ? ` ${n}명의 단가가 바뀌었습니다.` : ""}`);
  };
}
function dcell(r, key, d, ym, cycle = "half") {
  const v = r.data[key]?.[d];
  return `<td class="dc ${v == 1 ? "v1" : v ? "vh" : ""} ${isWe(ym, d) ? "we" : ""}" data-dc="${r.id}" data-key="${key}" data-day="${d}" data-cycle="${cycle}">${v ? (v == 0.5 ? "½" : v) : ""}</td>`;
}

document.addEventListener("click", e => {
    const td = e.target.closest("td[data-dc]"); if (!td) return;
    const r = findRow(td.dataset.dc); const key = td.dataset.key, d = td.dataset.day;
    const o = (r.data[key] ||= {}); const cur = o[d];
    const next = td.dataset.cycle === "half" ? (!cur ? 1 : cur == 1 ? 0.5 : null) : (cur ? null : 1);
    if (next == null) delete o[d]; else o[d] = next;
    td.className = `dc ${next == 1 ? "v1" : next ? "vh" : ""} ${isWe(S.month.ym, +d) ? "we" : ""}`;
    td.textContent = next ? (next == 0.5 ? "½" : next) : "";
    mark("rows", r); S.calc?.();
});

/* ================= 업체 정산 엑셀 불러오기 ================= */
async function vendorImport(files) {
  const { parseVendorFile } = await import("./vendor-import.js");
  const ym = S.month.ym;
  const jobs = [];
  for (const f of files) {
    try { jobs.push({ file: f, ...(await parseVendorFile(f, ym)) }); }
    catch (e) { console.error(e); jobs.push({ file: f, error: e.message || String(e) }); }
  }
  // 소속은 지디·비계 두 가지: CS(비계) 파일만 비계, 나머지 업체(드림인력·건하이엔지 …)는 모두 지디
  // 구분(단가 규칙용): 파일 이름 → 이미 명단에 있는 사람들의 구분 → 없음.  사람 이름 옆 괄호(예: 박창현(드림인력))가 있으면 그 사람은 그것으로
  const majority = (sh, key) => { const cnt = {}; sh.people.forEach(p => S.rows.labor.filter(r => (r.data.name || "").trim() === p.name).forEach(r => { const v = r.data[key]; if (v) cnt[v] = (cnt[v] || 0) + 1; })); return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || ""; };
  const isScaffold = (j, sh) => /cs|씨에스|비계/i.test(j.file.name + " " + sh.name) || majority(sh, "team") === "비계";
  const guessTeam = (j, sh) => isScaffold(j, sh) ? "비계" : "지디";
  const guessGroup = (j, sh) => { const n = j.file.name + " " + sh.name; return /드림/.test(n) ? "드림인력" : /건하/.test(n) ? "건하이엔지" : isScaffold(j, sh) ? "비계" : majority(sh, "group"); };
  jobs.forEach(j => { if (!j.error) { j.sel = j.best; j.team = guessTeam(j, j.sheets[j.sel]); j.group = guessGroup(j, j.sheets[j.sel]); j.on = true; } });
  const noteOnly = p => /드림/.test(p.note) ? "드림인력" : /건하/.test(p.note) ? "건하이엔지" : "";   // 이름 옆 괄호로 확실히 적힌 구분
  const noteGroup = (p, j) => noteOnly(p) || j.group;

  let dlg = $("#dlg-imp");
  if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "dlg-imp"; dlg.className = "imp"; document.body.append(dlg); }
  const days = d => Object.values(d || {}).reduce((a, b) => a + b, 0);
  const statusOf = (p, team, group) => {
    const same = S.rows.labor.filter(r => (r.data.name || "").trim() === p.name);
    const sum = days(p.d), warn = [];
    if (p.gong != null && Math.abs(p.gong - sum) > 0.001) warn.push(`파일 공수 ${p.gong} ≠ 날짜 합 ${sum}`);
    if (p.amt != null && p.rate != null && Math.abs(p.amt - sum * p.rate) > 1) warn.push(`파일 금액 ${fmt0(p.amt)} ≠ 공수×단가 ${fmt0(sum * p.rate)}`);
    const tgt = (group && same.find(r => r.data.group === group)) || same.find(r => r.data.team === team && !r.data.group) || same.find(r => r.data.team === team) || same[0];
    return { tgt, sum, warn, isNew: !tgt, old: tgt ? days(tgt.data.d) : 0 };
  };
  const draw = () => {
    dlg.innerHTML = `<form method="dialog">
      <h3>업체 정산 엑셀 불러오기 <small class="muted">· ${esc(ym)}</small></h3>
      <p class="hint" style="margin:-8px 0 12px">사람 이름으로 인건비 명단과 맞춰서 <b>출역일(날짜 칸)·단가</b>를 파일 내용으로 바꿉니다. 명단에 없는 사람은 새로 추가합니다. 공제 금액이 있으면 노무비명세서에도 넣습니다.</p>
      ${jobs.map((j, ji) => j.error ? `<div class="imp-file err"><b>${esc(j.file.name)}</b><div class="ng">읽지 못했습니다 — ${esc(j.error)}</div></div>` : (() => {
        const sh = j.sheets[j.sel];
        const rows = sh.people.map(p => ({ p, st: statusOf(p, j.team, noteOnly(p)) }));
        const tot = rows.reduce((a, { p, st }) => (a.d += st.sum, a.a += p.amt ?? st.sum * (p.rate || 0), a), { d: 0, a: 0 });
        return `<div class="imp-file">
          <div class="imp-h"><label class="chk"><input type="checkbox" data-on="${ji}" ${j.on ? "checked" : ""}> <b>${esc(j.file.name)}</b></label>
            <label>시트 <select data-sheet="${ji}">${j.sheets.map((s, si) => `<option value="${si}" ${si === j.sel ? "selected" : ""}>${esc(s.name)}${s.ym ? ` (${s.ym})` : ""}</option>`).join("")}</select></label>
            <label>소속 <select data-team="${ji}">${TEAMS.map(t => `<option ${t === j.team ? "selected" : ""}>${t}</option>`).join("")}</select></label>
            <label>구분 <input data-group="${ji}" value="${esc(j.group)}" list="dl-igroups" style="width:110px" placeholder="예: 드림인력"></label>
            <span class="grow"></span><span class="sum-chip">${rows.length}명 · ${tot.d}공수 · ${fmt0(tot.a)}원</span></div>
          ${sh.ym && sh.ym !== ym ? `<div class="imp-warn">⚠ 이 시트는 <b>${esc(sh.ym)}</b> 자료로 보입니다. 지금 화면은 ${esc(ym)} 입니다. 맞는지 확인해 주세요.</div>` : ""}
          <table class="t imp-t"><thead><tr><th>성명</th><th>구분</th><th>공수</th><th>단가</th><th>금액</th><th>출역일</th><th>확인</th></tr></thead><tbody>
          ${rows.map(({ p, st }) => `<tr>
            <td class="c"><b>${esc(p.name)}</b>${p.note ? `<div class="muted" style="font-size:11px">${esc(p.note)}</div>` : ""}</td>
            <td class="c">${(() => { const g = st.isNew ? noteGroup(p, j) : (noteOnly(p) || st.tgt.data.group); return g ? `<div style="font-size:11px;color:#374151">${esc(g)}</div>` : ""; })()}${st.isNew ? '<span class="st new">새로 추가</span>' : `<span class="st">${esc(st.tgt.data.team || "")} 갱신</span>${st.old !== st.sum ? `<div class="muted" style="font-size:11px">${st.old} → ${st.sum}</div>` : ""}`}</td>
            <td class="c">${st.sum}</td><td class="n">${fmt(p.rate)}</td><td class="n">${fmt0(p.amt ?? st.sum * (p.rate || 0))}</td>
            <td class="days">${Object.entries(p.d).map(([d, v]) => `<span class="${v == 0.5 ? "h" : ""}">${d}</span>`).join("")}</td>
            <td>${st.warn.length ? `<span class="ng" style="font-size:12px">⚠ ${esc(st.warn.join(" / "))}</span>` : '<span class="ok">✓</span>'}</td></tr>`).join("")}
          </tbody></table></div>`;
      })()).join("")}
      <datalist id="dl-igroups">${[...new Set([...rules().map(r => r.team), "건하이엔지", "비계"])].map(g => `<option value="${esc(g)}">`).join("")}</datalist>
      <label class="chk" style="margin-top:6px"><input type="checkbox" id="imp-workers" checked> 인적사항(신분증·이수증·통장사본 탭)에 없는 사람은 추가하고, 비어 있는 주민번호·주소·전화번호를 채우기</label>
      <div class="dlg-btns"><button value="cancel" class="btn">닫기</button><button value="ok" class="btn primary" ${jobs.some(j => !j.error && j.on) ? "" : "disabled"}>인건비에 반영</button></div>
    </form>`;
    $$("[data-sheet]", dlg).forEach(el => el.onchange = () => { const j = jobs[+el.dataset.sheet]; j.sel = +el.value; j.team = guessTeam(j, j.sheets[j.sel]); j.group = guessGroup(j, j.sheets[j.sel]); draw(); });
    $$("[data-team]", dlg).forEach(el => el.onchange = () => { jobs[+el.dataset.team].team = el.value.trim(); draw(); });
    $$("[data-group]", dlg).forEach(el => el.onchange = () => { jobs[+el.dataset.group].group = el.value.trim(); draw(); });
    $$("[data-on]", dlg).forEach(el => el.onchange = () => { jobs[+el.dataset.on].on = el.checked; draw(); });
  };
  draw();
  dlg.showModal();
  dlg.onclose = async () => {
    if (dlg.returnValue !== "ok") return;
    const fillWorkers = $("#imp-workers", dlg)?.checked;
    let upd = 0, add = 0, wAdd = 0, wFill = 0; const used = new Set();
    for (const j of jobs) {
      if (j.error || !j.on) continue;
      for (const p of j.sheets[j.sel].people) {
        const grp = noteGroup(p, j), st = statusOf(p, j.team, noteOnly(p));
        // 같은 사람이 두 업체 파일에 다 나오면 앞 파일 내용을 덮어쓰지 않고 따로 한 줄 추가
        if (st.tgt && used.has(st.tgt.id)) st.tgt = S.rows.labor.find(r => !used.has(r.id) && (r.data.name || "").trim() === p.name && (r.data.group || "") === grp);
        if (st.tgt) {
          used.add(st.tgt.id);
          st.tgt.data.team = j.team; if (noteOnly(p) || !st.tgt.data.group) st.tgt.data.group = grp;   // 이미 구분이 있는 사람은 그대로
          st.tgt.data.d = { ...p.d };
          if (p.rate) st.tgt.data.rate = p.rate;
          if (Object.keys(p.ded).length) st.tgt.data.ded = { ...(st.tgt.data.ded || {}), ...p.ded };
          mark("rows", st.tgt); upd++;
        } else {
          used.add(newRow("labor", { team: j.team, group: grp, name: p.name, rate: p.rate, d: { ...p.d }, ded: { ...p.ded }, memo: p.note || "" }).id); add++;
        }
        if (fillWorkers) {
          const w = S.workers.find(x => x.name === p.name && (!x.team || x.team === j.team)) || S.workers.find(x => x.name === p.name);
          if (!w) { await addWorker({ name: p.name, team: j.team, rrn: p.rrn, address: p.address, phone: p.phone, rate: p.rate || 0 }); wAdd++; }
          else {
            let ch = false;
            for (const k of ["rrn", "address", "phone"]) if (!w[k] && p[k]) { w[k] = p[k]; ch = true; }
            if (!w.rate && p.rate) { w.rate = p.rate; ch = true; }
            if (ch) { mark("workers", w); wFill++; }
          }
        }
      }
    }
    const rc = applyRates();
    sortLabor();
    await flush();
    renderMonthKeepScroll();
    toast((rc ? `단가 규칙으로 ${rc}명 단가 조정 · ` : "") + `인건비 ${upd}명 갱신 · ${add}명 추가` + (fillWorkers ? ` / 인적사항 ${wAdd}명 추가 · ${wFill}명 보완` : "") + " — 실행내역서 탭의 '인건비 금액 반영'으로 금액도 맞출 수 있습니다.");
  };
}

/* ================= 엑셀 양식으로 저장 ================= */
// 양식 파일은 서버에 올리지 않고 이 브라우저(IndexedDB)에만 기억해 둠
const tplStore = {
  db: () => new Promise((ok, no) => { const r = indexedDB.open("pms-jy", 1); r.onupgradeneeded = () => r.result.createObjectStore("f"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }),
  async get() { try { const db = await this.db(); return await new Promise(ok => { const q = db.transaction("f").objectStore("f").get("template"); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch { return null; } },
  async set(v) { try { const db = await this.db(); await new Promise(ok => { const t = db.transaction("f", "readwrite"); t.objectStore("f").put(v, "template"); t.oncomplete = t.onerror = ok; }); } catch {} },
};
async function exportDialog() {
  applyRates();
  await flush();
  let dlg = $("#dlg-xlsx");
  if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "dlg-xlsx"; dlg.className = "imp"; document.body.append(dlg); }
  let saved = await tplStore.get(), picked = null, busy = false, result = null;
  const { y, m } = ymParts(S.month.ym);
  const outName = `${(S.month.site || S.site || "현장").replace(/\s+/g, "")}_직영실행_${String(y).slice(2)}_${m}월.xlsx`;
  const draw = () => {
    const tpl = picked || saved;
    dlg.innerHTML = `<form method="dialog">
      <h3>엑셀 양식으로 저장 <small class="muted">· ${esc(S.month.title)}</small></h3>
      <p class="hint" style="margin:-8px 0 12px">고른 엑셀 양식 파일에서 <b>값이 들어가는 칸만</b> 이 달 내용으로 바꿉니다. 서식·병합·인쇄 설정·그림·수식은 그대로 둡니다.
        (실행내역서 · 식대 · 인건비 · 노무비명세서 · 자재구입)</p>
      <div class="imp-file">
        <div class="imp-h"><b>양식 파일</b>
          ${tpl ? `<span>${esc(tpl.name)} <small class="muted">${picked ? "(방금 고름)" : `(지난번 사용 · ${esc(new Date(saved.date).toLocaleDateString("ko-KR"))})`} · ${(tpl.blob.size / 1048576).toFixed(1)}MB</small></span>` : '<span class="muted">아직 고른 양식이 없습니다</span>'}
          <span class="grow"></span><label class="btn up">${tpl ? "다른 양식 고르기" : "양식 파일 고르기"}<input type="file" accept=".xlsx" id="x-tpl"></label></div>
        <p class="hint" style="margin:0">지난달 엑셀 파일을 그대로 양식으로 쓰면 됩니다. <b>.xls</b> 파일은 엑셀에서 <b>다른 이름으로 저장 → Excel 통합 문서(*.xlsx)</b>로 한 번 저장한 뒤 골라 주세요. 양식 파일은 이 컴퓨터 브라우저에만 기억되고 서버에는 올라가지 않습니다.</p>
      </div>
      ${result ? `<div class="imp-file ${result.error ? "err" : ""}">${result.error ? `<div class="ng"><b>만들지 못했습니다</b> — ${esc(result.error)}</div>` : `<b class="ok">✓ ${esc(outName)} 을(를) 내려받았습니다</b><ul class="notes">${result.notes.map(n => `<li class="${n.startsWith("⚠") ? "ng" : ""}">${esc(n)}</li>`).join("")}</ul>`}</div>` : ""}
      <div class="dlg-btns"><button value="cancel" class="btn">닫기</button><button type="button" id="x-go" class="btn primary" ${tpl && !busy ? "" : "disabled"}>${busy ? "만드는 중…" : "📥 채워서 내려받기"}</button></div>
    </form>`;
    $("#x-tpl", dlg).onchange = e => { const f = e.target.files[0]; if (f) { picked = { name: f.name, date: Date.now(), blob: f }; result = null; draw(); } };
    $("#x-go", dlg).onclick = go;
  };
  const go = async () => {
    const tpl = picked || saved; if (!tpl) return;
    busy = true; result = null; draw();
    try {
      const { fillTemplate } = await import("./export-xlsx.js");
      const D = {
        ym: S.month.ym, title: S.month.title, site: S.month.site || S.site, mealPrice: Number(S.month.settings.meal_price) || 0,
        exec: sorted("exec").map(r => r.data),
        labor: sorted("labor").filter(r => (r.data.name || "").trim()).map(r => ({ ...r.data, name: r.data.name.trim() })),
        meal: sorted("meal").filter(r => (r.data.name || "").trim()).map(r => r.data),
        mat: sorted("mat").map(r => r.data),
        workerOf: p => workerOf({ data: p }),
      };
      const out = await fillTemplate(tpl.blob, D);
      const a = document.createElement("a"); a.href = URL.createObjectURL(out.blob); a.download = outName; a.hidden = true; dlg.append(a); a.click();   // 모달 창 바깥 요소는 비활성이라 창 안에 붙여서 누름
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
      if (picked) { await tplStore.set({ name: picked.name, date: Date.now(), blob: picked.blob }); saved = { ...picked }; picked = null; }
      result = { notes: out.notes };
    } catch (e) { console.error(e); result = { error: e.message || String(e) }; }
    busy = false; draw();
  };
  draw(); dlg.showModal();
}

/* ================= 식대 ================= */
function rMeal() {
  const ym = S.month.ym, rows = sorted("meal"), n = nDays(ym, rows, ["jo", "jung"]), st = S.month.settings;
  $("#sheet").innerHTML = `
    <div class="bar">
      <button class="btn primary" id="m-add">+ 인원 추가</button>
      <button class="btn" id="m-from" title="인건비 명단에 있는데 식대 명단에 없는 사람을 추가합니다">인건비 명단 불러오기</button>
      <label>1식 단가 <input id="m-price" class="n" inputmode="numeric" value="${fmt(st.meal_price)}" style="width:100px;text-align:right">원</label>
      <span class="muted" style="font-size:12px">칸을 누르면 1식 표시 / 해제</span>
      <span class="grow"></span><span class="sum-chip"><span data-calc="m-cnt"></span>식 · <span data-calc="m-amt"></span>원</span>
      <button class="btn" id="m-print">🖨 인쇄</button>
    </div>
    <div class="scroll"><table class="t fit">
      <thead><tr><th class="stick" style="width:38px">기호</th><th style="width:80px">이름</th><th style="width:76px">소속</th><th style="width:34px">구분</th>${dayHead(ym, n)}<th style="width:50px">합계</th><th style="width:92px">금액</th><th style="width:110px">비고</th><th style="width:76px"></th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr>
          <td class="idx stick" rowspan="2">${i + 1}</td><td rowspan="2">${inp("rows", r, "data.name", { cls: "mw" })}</td><td rowspan="2">${inp("rows", r, "data.team", { cls: "mw" })}</td>
          <td class="kind">조</td>${Array.from({ length: n }, (_, k) => dcell(r, "jo", k + 1, ym, "one")).join("")}
          <td class="calc" rowspan="2" data-calc="m-c-${r.id}" style="text-align:center"></td><td class="calc" rowspan="2" data-calc="m-a-${r.id}"></td>
          <td rowspan="2">${inp("rows", r, "data.memo")}</td>
          <td class="del" rowspan="2"><button class="x" data-up="${r.id}">▲</button><button class="x" data-dn="${r.id}">▼</button><button class="x" data-del="${r.id}">✕</button></td></tr>
        <tr class="meal-b"><td class="kind">중</td>${Array.from({ length: n }, (_, k) => dcell(r, "jung", k + 1, ym, "one")).join("")}</tr>`).join("")
        || `<tr><td colspan="${n + 8}" class="c muted" style="padding:30px">명단이 없습니다. <b>인건비 명단 불러오기</b>나 <b>+ 인원 추가</b>로 시작하세요.</td></tr>`}</tbody>
      <tfoot><tr><td class="stick"></td><td colspan="3" class="c">소 계</td>${Array.from({ length: n }, (_, k) => `<td class="dsum" data-calc="m-s-${k + 1}"></td>`).join("")}<td class="c" data-calc="m-cnt"></td><td class="n" data-calc="m-amt"></td><td colspan="2"></td></tr></tfoot>
    </table></div>
    <p class="hint">조 = 조식, 중 = 중식. 금액 = 식수 × 1식 단가</p>`;
  S.calc = () => {
    const price = Number(st.meal_price) || 0; let tc = 0; const per = {};
    S.rows.meal.forEach(r => {
      const c = sumObj(r.data.jo) + sumObj(r.data.jung); tc += c;
      setCalc("m-c-" + r.id, c || ""); setCalc("m-a-" + r.id, fmt0(c * price));
      [r.data.jo, r.data.jung].forEach(o => Object.entries(o || {}).forEach(([k, v]) => per[k] = (per[k] || 0) + (Number(v) || 0)));
    });
    for (let k = 1; k <= n; k++) setCalc("m-s-" + k, per[k] || "");
    setCalc("m-cnt", tc); setCalc("m-amt", fmt0(tc * price));
  };
  $("#m-price").oninput = e => { st.meal_price = num(e.target.value) || 0; mark("month"); S.calc(); };
  $("#m-price").onblur = e => e.target.value = fmt(st.meal_price);
  $("#m-add").onclick = () => { newRow("meal", { name: "", team: "", jo: {}, jung: {}, memo: "" }); rMeal(); S.calc(); focusLast(); };
  $("#m-from").onclick = () => {
    const have = new Set(S.rows.meal.map(r => (r.data.name || "").trim()));
    let k = 0; sorted("labor").forEach(l => { const nm = (l.data.name || "").trim(); if (nm && !have.has(nm)) { newRow("meal", { name: nm, team: l.data.team || "", jo: {}, jung: {}, memo: "" }); have.add(nm); k++; } });
    rMeal(); S.calc(); toast(k ? `${k}명 추가했습니다.` : "새로 추가할 사람이 없습니다.");
  };
  $("#m-print").onclick = () => P.printMeal(S.month, sorted("meal"));
  bindRowOps("meal", rMeal);
}

/* ================= 노무비명세서 ================= */
const workerOf = r => { const nm = (r.data.name || "").trim(); const c = S.workers.filter(w => w.name === nm); return c.find(w => w.team === r.data.team) || c[0]; };
const maskRrn = s => { s = String(s || ""); if (S.showRrn || !s) return s; const m = s.match(/^(\d{6})-?(\d)/); return m ? `${m[1]}-${m[2]}******` : s.replace(/.(?=.{0,0}$)/, "*"); };
const payOf = r => { const days = sumObj(r.data.d), amt = days * (Number(r.data.rate) || 0); const ded = DED.reduce((a, [k]) => a + (Number(r.data.ded?.[k]) || 0), 0); return { days, amt, ded, net: amt - ded }; };
function rPay() {
  applyRates();
  const ym = S.month.ym, rows = sorted("labor").filter(r => (r.data.name || "").trim());
  const dayRow = (r, from) => Array.from({ length: 16 }, (_, k) => { const d = from + k; const v = from === 1 && k === 15 ? null : r.data.d?.[d]; return `<td class="mini ${v ? "on" : ""}">${v ? (v == 0.5 ? "½" : v) : ""}</td>`; }).join("");
  $("#sheet").innerHTML = `
    <div class="bar">
      <button class="btn" id="p-tax" title="일용근로소득세: (일당 − 150,000원) × 2.7% (세율 6%, 세액공제 55%), 합계 1,000원 미만은 0원">갑근세·주민세 자동 계산</button>
      <button class="btn" id="p-clear">공제 모두 비우기</button>
      <label><input type="checkbox" id="p-rrn" ${S.showRrn ? "checked" : ""}> 주민번호 전체 보기</label>
      <span class="grow"></span><span class="sum-chip">지급액 <span data-calc="p-net"></span>원</span>
      <button class="btn" id="p-print">🖨 인쇄</button>
    </div>
    <div class="scroll"><table class="t pay">
      <thead><tr><th style="width:62px">성명</th><th style="width:118px">주민등록번호</th><th style="min-width:150px">주소</th><th colspan="16">출역 일자 (윗줄 1~15일 · 아랫줄 16~31일)</th><th style="width:46px">일수</th><th style="width:80px">단가</th><th style="width:92px">금액</th><th style="width:80px">갑근세<br>주민세</th><th style="width:80px">국민연금<br>국민건강</th><th style="width:80px">고용보험<br>장기요양</th><th style="width:96px">차감지급액</th><th style="width:110px">연락처</th></tr></thead>
      <tbody>${rows.map(r => { const w = workerOf(r);
        return `<tr><td rowspan="2" class="c"><b>${esc(r.data.name)}</b><div class="muted" style="font-size:11px">${esc(r.data.team || "")}</div></td>
          <td rowspan="2" class="c rrn">${w ? esc(maskRrn(w.rrn)) || '<span class="muted">-</span>' : '<span class="muted" title="인적사항 탭에 이 사람이 없습니다">미등록</span>'}</td>
          <td rowspan="2" style="padding:4px 8px;font-size:12px">${esc(w?.address || "")}</td>
          ${dayRow(r, 1)}
          <td rowspan="2" class="calc" style="text-align:center" data-calc="p-d-${r.id}"></td><td rowspan="2" class="calc">${fmt0(r.data.rate)}</td><td rowspan="2" class="calc" data-calc="p-a-${r.id}"></td>
          <td>${inp("rows", r, "data.ded.tax", { numeric: 1 })}</td><td>${inp("rows", r, "data.ded.pen", { numeric: 1 })}</td><td>${inp("rows", r, "data.ded.emp", { numeric: 1 })}</td>
          <td rowspan="2" class="calc" data-calc="p-n-${r.id}" style="font-weight:700"></td><td rowspan="2" class="c" style="font-size:12px">${esc(w?.phone || "")}</td></tr>
        <tr class="b">${dayRow(r, 16)}<td>${inp("rows", r, "data.ded.res", { numeric: 1 })}</td><td>${inp("rows", r, "data.ded.hea", { numeric: 1 })}</td><td>${inp("rows", r, "data.ded.ltc", { numeric: 1 })}</td></tr>`; }).join("")
        || `<tr><td colspan="27" class="c muted" style="padding:30px">인건비 탭에 명단이 없습니다.</td></tr>`}</tbody>
      <tfoot><tr><td colspan="19" class="c">합 계</td><td class="c" data-calc="p-days"></td><td></td><td class="n" data-calc="p-amt"></td><td class="n" colspan="3" data-calc="p-ded"></td><td class="n" data-calc="p-net"></td><td></td></tr></tfoot>
    </table></div>
    <p class="hint">출역일·단가·금액은 <b>인건비</b> 탭에서, 주민번호·주소·연락처는 <b>신분증·이수증·통장사본</b> 탭에서 가져옵니다. 이 화면에서는 공제 금액만 입력합니다.</p>`;
  S.calc = () => {
    let td = 0, ta = 0, tdd = 0, tn = 0;
    rows.forEach(r => { const p = payOf(r); td += p.days; ta += p.amt; tdd += p.ded; tn += p.net; setCalc("p-d-" + r.id, p.days); setCalc("p-a-" + r.id, fmt0(p.amt)); setCalc("p-n-" + r.id, fmt0(p.net)); });
    setCalc("p-days", td); setCalc("p-amt", fmt0(ta)); setCalc("p-ded", "공제 " + fmt0(tdd)); setCalc("p-net", fmt0(tn));
  };
  $("#p-rrn").onchange = e => { S.showRrn = e.target.checked; rPay(); S.calc(); };
  $("#p-tax").onclick = () => {
    rows.forEach(r => {
      const rate = Number(r.data.rate) || 0; let tax = 0;
      Object.values(r.data.d || {}).forEach(v => { tax += Math.max(0, rate * (Number(v) || 0) - 150000 * (Number(v) || 0)) * 0.027; });
      tax = Math.floor(tax / 10) * 10; if (tax < 1000) tax = 0;
      r.data.ded = { ...(r.data.ded || {}), tax, res: Math.floor(tax * 0.1 / 10) * 10 }; mark("rows", r);
    });
    rPay(); S.calc(); toast("갑근세·주민세를 계산해 넣었습니다. 반일(0.5) 근무는 일당의 절반으로 계산합니다.");
  };
  $("#p-clear").onclick = () => { if (!confirm("모든 사람의 공제 금액을 비울까요?")) return; rows.forEach(r => { r.data.ded = {}; mark("rows", r); }); rPay(); S.calc(); };
  $("#p-print").onclick = () => P.printPay(S.month, rows, workerOf);
}

/* ================= 근로계약서 ================= */
// 계약서 양식(.xlsx)은 비공개 저장소에 올려 두고 모든 달에서 같이 씀. 소속마다 어떤 양식 시트를 쓸지 정함.
const ctCache = {};   // 파일 id → { blob, sheets }
async function ctLoad(f) {
  if (ctCache[f.id]) return ctCache[f.id];
  const url = S.urls[f.path] || (await sb.storage.from(BUCKET).createSignedUrl(f.path, 3600)).data?.signedUrl;
  const blob = await (await fetch(url)).blob();
  const { inspectTemplate } = await import("./contract.js");
  return (ctCache[f.id] = { blob, sheets: await inspectTemplate(blob) });
}
const ctFiles = () => S.files.filter(f => f.sheet === "tpl-contract").sort((a, b) => a.sort - b.sort);
function ctSettings() {
  const { y, m } = ymParts(S.month.ym), last = lastDay(S.month.ym), mm = String(m).padStart(2, "0");
  const c = (S.month.settings.contract ||= {});
  c.teams ||= {};
  // 기간은 달이 바뀌면 그 달로 (새 달로 복사된 설정의 기간이 다른 달이면 다시 맞춤)
  if (!c.start || !c.start.startsWith(S.month.ym)) { c.start = `${y}-${mm}-01`; c.end = `${y}-${mm}-${last}`; }
  return c;
}
async function rContract() {
  const c = ctSettings(), files = ctFiles();
  const labor = sorted("labor").filter(r => (r.data.name || "").trim());
  const teams = [...new Set(labor.map(r => (r.data.team || "").trim() || "(소속 없음)"))];
  $("#sheet").innerHTML = `<p class="muted pad">계약서 양식을 읽는 중…</p>`;
  const loaded = [];
  for (const f of files) { try { loaded.push({ f, ...(await ctLoad(f)) }); } catch (e) { console.error(e); loaded.push({ f, sheets: [], error: e.message }); } }
  if (S.sheet !== "contract") return;
  const opts = loaded.flatMap(({ f, sheets }) => sheets.map(sh => ({ key: f.id + "|" + sh.sheet, label: `${f.name.replace(/\.xlsx$/i, "")} › ${sh.sheet.trim()}${sh.company ? ` (${sh.company})` : ""}`, sh })));
  // 소속별 기본 양식: 견본 직종·공종에 소속 이름이 들어 있으면 그것, 아니면 견본이 채워진 '지디' 양식
  const guess = t => (opts.find(o => t && (o.sh.job + o.sh.work).includes(t)) || opts.find(o => /지디/.test(o.sh.company) && o.sh.sample) || opts[0])?.key || "";
  teams.forEach(t => { const st = (c.teams[t] ||= {}); if (!st.tpl || !opts.some(o => o.key === st.tpl)) st.tpl = guess(t); });
  const sel = S.ctSel ||= {};
  const daysOf = r => sumObj(r.data.d);
  labor.forEach(r => { if (sel[r.id] == null) sel[r.id] = daysOf(r) > 0; });
  const optFor = t => opts.find(o => o.key === c.teams[t]?.tpl);
  $("#sheet").innerHTML = `
    <div class="bar">
      <label class="btn up">📎 계약서 양식 올리기 (.xlsx)<input type="file" accept=".xlsx" id="ct-up" multiple></label>
      ${loaded.map(({ f, sheets, error }) => `<span class="chip-f" title="${esc(sheets.map(s => s.sheet.trim()).join(", "))}">${esc(f.name)} <small>${error ? "읽기 실패" : sheets.length + "개 양식"}</small><button class="x" data-ctdel="${f.id}" title="양식 삭제">✕</button></span>`).join("") || '<span class="muted" style="font-size:13px">먼저 근로계약서 양식 엑셀을 올려 주세요 (여러 회사 양식이 시트로 들어 있어도 됩니다).</span>'}
      <span class="grow"></span>
      <button class="btn primary" id="ct-go" ${opts.length ? "" : "disabled"}>📄 근로계약서 만들기</button>
    </div>
    <div class="ct-grid">
      <div class="card ct-card"><h4>계약 조건</h4>
        <div class="ct-form">
          <label>계약기간 <span><input type="date" id="ct-start" value="${esc(c.start)}"> ~ <input type="date" id="ct-end" value="${esc(c.end)}"></span></label>
          <label>임금 지급일 <span>매월 <input id="ct-pay" value="${esc(c.payday ?? "")}" style="width:56px" placeholder="15"> 일 <small class="muted">(비우면 양식 그대로)</small></span></label>
        </div>
        <p class="hint">일당은 인건비 탭의 단가, 성명·주민번호·주소·전화·통장은 신분증·이수증·통장사본 탭의 인적사항이 들어갑니다. 통장구좌는 <b>직영·하태계·비계를 뺀 모든 사람은 '드림인력'</b>으로 적고, 그 외에는 양식에 계좌 칸이 채워져 있던 경우에만 본인 계좌를 넣습니다.</p>
      </div>
      <div class="card ct-card"><h4>소속별 양식</h4>
        <table class="t imp-t ct-teams"><thead><tr><th>소속</th><th>양식</th><th>근로장소</th><th>공종/수행업무</th><th>소속팀장</th><th>직종</th></tr></thead><tbody>
        ${teams.map(t => { const st = c.teams[t] || {}, o = optFor(t); const ph = k => o ? `양식대로: ${o.sh[k] || "(빈칸)"}` : "";
          return `<tr><td class="c"><b>${esc(t)}</b></td>
            <td><select data-ct="${esc(t)}" data-k="tpl">${opts.map(x => `<option value="${esc(x.key)}" ${x.key === st.tpl ? "selected" : ""}>${esc(x.label)}</option>`).join("") || "<option>양식 없음</option>"}</select></td>
            ${["place", "work", "leader", "job"].map(k => `<td><input data-ct="${esc(t)}" data-k="${k}" value="${esc(st[k] || "")}" placeholder="${esc(ph(k))}"></td>`).join("")}</tr>`; }).join("")}
        </tbody></table>
        <p class="hint">칸을 비워 두면 양식에 적힌 값을 그대로 씁니다.</p>
      </div>
    </div>
    <div class="bar" style="margin-top:12px"><b>근로자</b><label><input type="checkbox" id="ct-all"> 전체 선택</label><span class="muted" style="font-size:12px">출역이 있는 사람은 자동으로 골라 둡니다.</span><span class="grow"></span><span class="sum-chip"><span id="ct-n"></span>명 선택</span></div>
    <div class="scroll"><table class="t">
      <thead><tr><th style="width:40px"></th><th>성명</th><th>소속</th><th>양식</th><th>공수</th><th>일당(단가)</th><th>금액</th><th>주민번호</th><th>주소</th><th>전화</th><th>통장</th></tr></thead>
      <tbody>${labor.map(r => { const w = workerOf(r), d = daysOf(r), t = (r.data.team || "").trim() || "(소속 없음)", o = optFor(t);
        const ok = v => v ? '<span class="ok">✓</span>' : '<span class="ng">없음</span>';
        return `<tr><td class="c"><input type="checkbox" data-ctp="${r.id}" ${sel[r.id] ? "checked" : ""}></td><td class="c"><b>${esc(r.data.name)}</b></td><td class="c">${esc(t)}</td>
          <td style="font-size:12px;padding:4px 8px">${o ? esc(o.sh.sheet.trim()) : '<span class="ng">양식 없음</span>'}</td>
          <td class="c">${d || ""}</td><td class="n" style="padding:4px 8px">${fmt0(r.data.rate)}</td><td class="n" style="padding:4px 8px">${fmt0(d * (Number(r.data.rate) || 0))}</td>
          <td class="c">${ok(w?.rrn)}</td><td class="c">${ok(w?.address)}</td><td class="c">${ok(w?.phone)}</td><td class="c">${w?.bank ? '<span class="ok">✓</span>' : '<span class="muted">-</span>'}</td></tr>`; }).join("")
        || `<tr><td colspan="11" class="c muted" style="padding:30px">인건비 탭에 명단이 없습니다.</td></tr>`}</tbody></table></div>`;
  const count = () => { const n = labor.filter(r => sel[r.id]).length; $("#ct-n").textContent = n; $("#ct-all").checked = n === labor.length && n > 0; };
  count();
  $$("[data-ctp]").forEach(el => el.onchange = () => { sel[el.dataset.ctp] = el.checked; count(); });
  $("#ct-all").onchange = e => { labor.forEach(r => sel[r.id] = e.target.checked); $$("[data-ctp]").forEach(el => el.checked = e.target.checked); count(); };
  $("#ct-start").onchange = e => { c.start = e.target.value; mark("month"); };
  $("#ct-end").onchange = e => { c.end = e.target.value; mark("month"); };
  $("#ct-pay").onchange = e => { c.payday = e.target.value.replace(/\D/g, ""); mark("month"); };
  $$("[data-ct]").forEach(el => el.onchange = () => { (c.teams[el.dataset.ct] ||= {})[el.dataset.k] = el.value.trim(); mark("month"); if (el.dataset.k === "tpl") rContract(); });
  $("#ct-up").onchange = async e => {
    const fs = [...e.target.files]; e.target.value = "";
    for (const file of fs) {
      const path = `templates/contract/${uid()}.xlsx`;
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      if (error) { toast("올리지 못했습니다: " + error.message); continue; }
      const row = { id: uid(), month_id: null, worker_id: null, sheet: "tpl-contract", grp: "", sort: Date.now() % 1e9, path, name: file.name, caption: {} };
      const { error: e2 } = await sb.from("jy_files").insert(row);
      if (e2) { toast("저장하지 못했습니다: " + e2.message); continue; }
      S.files.push(row); ctCache[row.id] = { blob: file, sheets: await (await import("./contract.js")).inspectTemplate(file) };
    }
    rContract();
  };
  $$("[data-ctdel]").forEach(b => b.onclick = async e => {
    e.stopPropagation(); const f = S.files.find(x => x.id === b.dataset.ctdel); if (!f || !confirm(`계약서 양식 「${f.name}」을(를) 지울까요? (모든 달에서 지워집니다)`)) return;
    await sb.storage.from(BUCKET).remove([f.path]); await sb.from("jy_files").delete().eq("id", f.id);
    S.files = S.files.filter(x => x.id !== f.id); delete ctCache[f.id]; rContract();
  });
  $("#ct-go").onclick = async () => {
    await flush();
    const pick = labor.filter(r => sel[r.id]); if (!pick.length) return toast("근로자를 골라 주세요.");
    const groups = {};
    for (const r of pick) { const t = (r.data.team || "").trim() || "(소속 없음)", key = c.teams[t]?.tpl; if (!key) return toast(`${t} 소속의 양식을 골라 주세요.`); (groups[key] ||= { teams: new Set(), rows: [] }).rows.push(r); groups[key].teams.add(t); }
    const { buildContracts } = await import("./contract.js");
    const btn = $("#ct-go"); btn.disabled = true; btn.textContent = "만드는 중…";
    const months = Math.max(1, Math.round((new Date(c.end) - new Date(c.start)) / 2.6e9));
    const miss = [];
    try {
      for (const [key, g] of Object.entries(groups)) {
        const [fid, ...rest] = key.split("|"), sheetName = rest.join("|"), o = opts.find(x => x.key === key);
        const people = g.rows.map(r => {
          const w = workerOf(r) || {}; if (!w.rrn) miss.push(r.data.name);
          const st = c.teams[(r.data.team || "").trim() || "(소속 없음)"] || {};
          const o = {}; for (const k of ["place", "work", "leader", "job"]) if (st[k]) o[k] = st[k];
          // 통장구좌: 직영 구분·하태계·비계 소속을 뺀 모든 사람은 '드림인력'으로 기재
          const bankLabel = (r.data.group || "").trim() === "직영" || r.data.name.trim() === "하태계" || (r.data.team || "").trim() === "비계" ? "" : "드림인력";
          return { name: r.data.name.trim(), rrn: w.rrn || "", address: w.address || "", phone: w.phone || "", bank: w.bank || "", bankLabel, rate: Number(r.data.rate) || 0, o };
        });
        const out = await buildContracts(ctCache[fid].blob, sheetName, people, { start: c.start, end: c.end, months, payday: c.payday || "" });
        const { m } = ymParts(S.month.ym);
        const label = (o?.sh.company || sheetName.trim()).replace(/[㈜()\s]|주식회사/g, "");
        const a = document.createElement("a"); a.href = URL.createObjectURL(out.blob); a.download = `근로계약서_${label}_${[...g.teams].join("·")}_${m}월_${people.length}명.xlsx`; a.hidden = true; document.body.append(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
      }
      toast(`근로계약서 ${pick.length}명분을 만들었습니다 (한 사람에 한 시트).` + (miss.length ? ` 주민번호 없는 사람: ${miss.join(", ")}` : ""));
    } catch (e) { console.error(e); toast("만들지 못했습니다: " + (e.message || e)); }
    btn.disabled = false; btn.textContent = "📄 근로계약서 만들기";
  };
}

/* ================= 신분증·이수증·통장사본 (사람 인적사항) ================= */
function monthWorkers() {
  // 인건비 명단 순서 → 식대 명단 순서
  const order = [...sorted("labor"), ...sorted("meal")].map(r => (r.data.name || "").trim()).filter(Boolean);
  const idx = n => { const i = order.indexOf(n); return i < 0 ? 1e9 : i; };
  return S.workers.filter(w => order.includes(w.name)).sort((a, b) => idx(a.name) - idx(b.name));
}
function rPeople() {
  const q = S.peopleQ.trim();
  let list = S.peopleAll ? S.workers.slice() : monthWorkers();
  if (q) list = S.workers.filter(w => [w.name, w.team, w.phone].some(v => (v || "").includes(q)));
  const missing = [...new Set(sorted("labor").map(r => (r.data.name || "").trim()).filter(n => n && !S.workers.some(w => w.name === n)))];
  $("#sheet").innerHTML = `
    <div class="bar">
      <button class="btn primary" id="w-add">+ 사람 추가</button>
      ${missing.length ? `<button class="btn" id="w-miss" title="${esc(missing.join(", "))}">인건비 명단에서 빠진 ${missing.length}명 추가</button>` : ""}
      <label><input type="checkbox" id="w-all" ${S.peopleAll ? "checked" : ""}> 전체 사람 보기 (체크 해제 시 이번 달 명단만)</label>
      <input id="w-q" placeholder="이름·소속·전화 검색" value="${esc(S.peopleQ)}" style="width:180px">
      <span class="grow"></span><span class="muted" style="font-size:12px">${list.length}명</span>
      <button class="btn" id="w-print">🖨 인쇄</button>
    </div>
    <div class="people">${list.map(w => {
      const fs = S.files.filter(f => f.sheet === "id" && f.worker_id === w.id);
      return `<div class="pcard" data-w="${w.id}">
        <div class="ph">${inp("workers", w, "name", { cls: "nm", ph: "성명" })}<input data-k="workers" data-id="${w.id}" data-f="team" value="${esc(w.team)}" placeholder="소속" style="width:110px"><span class="grow"></span><button class="x" data-wdel="${w.id}" title="이 사람 삭제">✕</button></div>
        <div class="fields">
          <span>주민번호</span>${inp("workers", w, "rrn", { ph: "000000-0000000", cls: "rrn" })}<span>전화번호</span>${inp("workers", w, "phone", { ph: "010-" })}
          <span>주소</span><div class="wide">${inp("workers", w, "address")}</div>
          <span>은행·계좌</span>${inp("workers", w, "bank", { ph: "은행 계좌번호" })}<span>기본 단가</span>${inp("workers", w, "rate", { numeric: 1 })}
        </div>
        <div class="slots">${ID_SLOTS.map(g => `<div class="slot" data-drop="id" data-wid="${w.id}" data-grp="${g}">
          <div class="sl">${g}<label class="up">+ 올리기<input type="file" accept="image/*,application/pdf" multiple data-up="id" data-wid="${w.id}" data-grp="${g}"></label></div>
          <div class="thumbs">${fs.filter(f => f.grp === g).map(thumb).join("")}</div></div>`).join("")}</div>
      </div>`; }).join("") || `<div class="card empty" style="grid-column:1/-1">${q ? "찾는 사람이 없습니다." : "이번 달 명단에 해당하는 사람이 없습니다. <b>+ 사람 추가</b>를 누르거나 <b>전체 사람 보기</b>를 켜 보세요."}</div>`}</div>
    <p class="hint">사람 인적사항은 달이 바뀌어도 유지됩니다. 사진을 칸에 끌어다 놓아도 올라갑니다.</p>`;
  $("#w-add").onclick = async () => { const w = await addWorker({ name: "" }); S.peopleQ = ""; rPeople(); $(`.pcard[data-w="${w.id}"] input.nm`)?.focus(); };
  $("#w-miss")?.addEventListener("click", async () => { for (const n of missing) { const l = S.rows.labor.find(r => (r.data.name || "").trim() === n); await addWorker({ name: n, team: l?.data.team || "", rate: l?.data.rate || 0 }); } rPeople(); toast(`${missing.length}명 추가했습니다.`); });
  $("#w-all").onchange = e => { S.peopleAll = e.target.checked; rPeople(); };
  $("#w-q").oninput = e => { S.peopleQ = e.target.value; const pos = e.target.selectionStart; rPeople(); const el = $("#w-q"); el.focus(); el.setSelectionRange(pos, pos); };
  $("#w-print").onclick = () => P.printPeople(S.month, list, S.files, S.urls);
  $("#sheet").onclick = async e => {
    const b = e.target.closest("[data-wdel]"); if (!b) return;
    const w = S.workers.find(x => x.id === b.dataset.wdel);
    if (!confirm(`「${w.name || "이름 없음"}」의 인적사항과 첨부 사진을 지울까요? (모든 달에서 지워집니다)`)) return;
    const paths = S.files.filter(f => f.worker_id === w.id).map(f => f.path);
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    const { error } = await sb.from("jy_workers").delete().eq("id", w.id);
    if (error) return toast("지우지 못했습니다: " + error.message);
    pend.workers.delete(w.id);
    S.workers = S.workers.filter(x => x.id !== w.id); S.files = S.files.filter(f => f.worker_id !== w.id); rPeople();
  };
}
async function addWorker(p) {
  const w = { id: uid(), name: "", team: "", rrn: "", address: "", phone: "", bank: "", rate: 0, memo: "", active: true, ...p };
  const { error } = await sb.from("jy_workers").insert(w);
  if (error) { toast("추가하지 못했습니다: " + error.message); throw error; }
  S.workers.push(w); return w;
}

/* ================= 자재구입 ================= */
function rMat() {
  const rows = sorted("mat"); const { m } = ymParts(S.month.ym);
  $("#sheet").innerHTML = `
    <div class="bar">
      <button class="btn primary" id="t-add">+ 행 추가</button>
      <span class="grow"></span><span class="sum-chip">합계 <span data-calc="t-sum"></span>원</span>
      <button class="btn" id="t-print">🖨 인쇄</button>
    </div>
    <div class="scroll"><table class="t">
      <colgroup><col style="width:44px"><col style="width:60px"><col style="width:60px"><col><col style="width:130px"><col style="width:220px"><col style="width:76px"></colgroup>
      <thead><tr><th>연번</th><th>월</th><th>일</th><th>내역</th><th>금액</th><th>비고</th><th></th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr><td class="idx">${i + 1}</td><td>${inp("rows", r, "data.mm", { numeric: 1 })}</td><td>${inp("rows", r, "data.dd", { numeric: 1 })}</td>
        <td>${inp("rows", r, "data.item", { area: 1, ph: "예: 안전모 * 10EA" })}</td><td>${inp("rows", r, "data.amount", { numeric: 1 })}</td><td>${inp("rows", r, "data.note", { area: 1 })}</td>
        <td class="del"><button class="x" data-up="${r.id}">▲</button><button class="x" data-dn="${r.id}">▼</button><button class="x" data-del="${r.id}">✕</button></td></tr>`).join("")
        || `<tr><td colspan="7" class="c muted" style="padding:30px">구입 내역이 없습니다.</td></tr>`}</tbody>
      <tfoot><tr><td colspan="4" class="c">합 계</td><td class="n" data-calc="t-sum"></td><td colspan="2"></td></tr></tfoot>
    </table></div>
    <p class="hint">구입한 자재 사진은 <b>자재 사진대지</b> 탭에, 거래명세표는 <b>증빙서류</b> 탭에 올리세요.</p>`;
  sizeAreas();
  S.calc = () => setCalc("t-sum", fmt0(S.rows.mat.reduce((a, r) => a + (Number(r.data.amount) || 0), 0)));
  $("#t-add").onclick = () => { newRow("mat", { mm: m, dd: null, item: "", amount: null, note: "" }); rMat(); S.calc(); focusLast(); };
  $("#t-print").onclick = () => P.printMat(S.month, sorted("mat"));
  bindRowOps("mat", rMat);
}

/* ================= 자재 사진대지 ================= */
function rPhoto() {
  const list = S.files.filter(f => f.sheet === "photo" && f.month_id === S.month.id).sort((a, b) => a.sort - b.sort);
  $("#sheet").innerHTML = `
    <div class="bar">
      <label class="btn primary up" style="color:#fff">+ 사진 올리기<input type="file" accept="image/*" multiple data-up="photo"></label>
      <span class="muted" style="font-size:12px">사진마다 용도와 구입 날짜를 적어 두면 사진대지 양식으로 인쇄됩니다.</span>
      <span class="grow"></span><button class="btn" id="ph-print">🖨 인쇄</button>
    </div>
    <div class="photos" data-drop="photo">${list.map(f => `<div class="phcard">
      <div class="img" data-view="${f.id}">${S.urls[f.path] ? `<img src="${S.urls[f.path]}" alt="">` : ""}</div>
      <div class="meta"><span>용도</span>${inp("files", f, "caption.usage", { ph: "예: 안전모 * 10EA" })}<span>구입 날짜</span>${inp("files", f, "caption.date", { ph: "2026.09.30" })}</div>
      <div class="foot"><button class="x" data-left="${f.id}" title="앞으로">◀</button><button class="x" data-right="${f.id}" title="뒤로">▶</button><button class="x" data-fdel="${f.id}" title="삭제">✕ 삭제</button></div></div>`).join("")
      || `<div class="dropzone" style="grid-column:1/-1">사진을 여기에 끌어다 놓거나 <b>+ 사진 올리기</b>를 누르세요.</div>`}</div>`;
  $("#ph-print").onclick = () => P.printPhotos(S.month, list, S.urls);
  $("#sheet").onclick = e => {
    const b = e.target.closest("[data-left],[data-right]"); if (!b) return;
    const id = b.dataset.left || b.dataset.right, dir = b.dataset.left ? -1 : 1;
    const i = list.findIndex(f => f.id === id), j = i + dir; if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]]; list.forEach((f, k) => { if (f.sort !== k + 1) { f.sort = k + 1; mark("files", f); } }); rPhoto();
  };
}

/* ================= 증빙서류 (거래명세표 · 병원 · 장비 · 주유 · 인력 …) ================= */
function rDoc() {
  const st = S.month.settings; const groups = st.groups;
  const docs = S.files.filter(f => f.sheet === "doc" && f.month_id === S.month.id);
  // 묶음 이름이 목록에 없는 파일도 보이게
  docs.forEach(f => { if (!groups.includes(f.grp)) groups.push(f.grp); });
  if (!S.docGroup || !groups.includes(S.docGroup)) S.docGroup = groups[0] || null;
  const g = S.docGroup; const list = docs.filter(f => f.grp === g).sort((a, b) => a.sort - b.sort);
  $("#sheet").innerHTML = `
    <div class="docs">
      <div class="glist">${groups.map(x => { const c = docs.filter(f => f.grp === x).length; return `<a data-g="${esc(x)}" class="${x === g ? "active" : ""}"><span>${esc(x)}</span><small>${c || ""}</small></a>`; }).join("")}
        <div class="add"><input id="g-new" placeholder="새 묶음 이름 (예: 장비(OO중기))"><button class="btn sm" id="g-add">추가</button></div></div>
      <div>${g ? `
        <div class="bar">
          <b style="font-size:16px">${esc(g)}</b><span class="muted" style="font-size:12px">${list.length}장</span>
          <button class="btn sm ghost" id="g-ren">이름 바꾸기</button><button class="btn sm ghost danger" id="g-del">묶음 삭제</button>
          <span class="grow"></span>
          <label class="btn primary up" style="color:#fff">+ 파일 올리기<input type="file" accept="image/*,application/pdf" multiple data-up="doc" data-grp="${esc(g)}"></label>
          <button class="btn" id="d-print1">🖨 이 묶음 인쇄</button><button class="btn" id="d-printall">🖨 전체 인쇄</button>
        </div>
        <div class="dgrid" data-drop="doc" data-grp="${esc(g)}">${list.map(f => `<div class="dcard">
          <div class="img" data-view="${f.id}">${isPdf(f) ? '<span class="pdf">PDF</span>' : S.urls[f.path] ? `<img src="${S.urls[f.path]}" alt="">` : ""}</div>
          <div class="meta">${inp("files", f, "caption.memo", { ph: esc(f.name) })}<button class="x" data-fdel="${f.id}" title="삭제">✕</button></div></div>`).join("")
          || `<div class="dropzone" style="grid-column:1/-1">사업자등록증·통장사본·거래명세서·세금계산서 등을 여기에 끌어다 놓거나 <b>+ 파일 올리기</b>를 누르세요.</div>`}</div>`
        : `<div class="empty">왼쪽에서 묶음을 추가하세요.</div>`}</div>
    </div>`;
  $$(".glist a").forEach(a => a.onclick = () => { S.docGroup = a.dataset.g; rDoc(); });
  const addG = () => { const v = $("#g-new").value.trim(); if (!v) return; if (!groups.includes(v)) { groups.push(v); mark("month"); } S.docGroup = v; rDoc(); };
  $("#g-add").onclick = addG; $("#g-new").onkeydown = e => { if (e.key === "Enter") addG(); };
  $("#g-ren")?.addEventListener("click", () => {
    const v = prompt("새 이름", g)?.trim(); if (!v || v === g) return;
    if (groups.includes(v)) return toast("같은 이름의 묶음이 이미 있습니다.");
    groups[groups.indexOf(g)] = v; docs.filter(f => f.grp === g).forEach(f => { f.grp = v; mark("files", f); }); mark("month"); S.docGroup = v; rDoc();
  });
  $("#g-del")?.addEventListener("click", () => {
    if (list.length) return toast("파일이 남아 있는 묶음은 지울 수 없습니다. 파일을 먼저 지워 주세요.");
    groups.splice(groups.indexOf(g), 1); mark("month"); S.docGroup = null; rDoc();
  });
  $("#d-print1")?.addEventListener("click", () => P.printDocs(S.month, [[g, list]], S.urls));
  $("#d-printall")?.addEventListener("click", () => P.printDocs(S.month, groups.map(x => [x, docs.filter(f => f.grp === x).sort((a, b) => a.sort - b.sort)]).filter(([, l]) => l.length), S.urls));
}
const isPdf = f => /\.pdf$/i.test(f.path);

/* ================= 파일 올리기 · 보기 · 삭제 (공통) ================= */
function thumb(f) {
  return `<div class="th" data-view="${f.id}" title="${esc(f.name)}">${isPdf(f) ? '<div class="pdf">PDF</div>' : S.urls[f.path] ? `<img src="${S.urls[f.path]}" alt="">` : ""}<button class="rm" data-fdel="${f.id}">✕</button></div>`;
}
async function shrink(file) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const max = 2400, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 1.5e6) return file;
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.88));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}
async function upload(files, { sheet, grp = "", wid = null }) {
  files = [...files].filter(f => f.type.startsWith("image/") || f.type === "application/pdf");
  if (!files.length) return;
  toast(`${files.length}개 올리는 중…`);
  const base = sheet === "id" ? `workers/${wid}` : `${S.month.id}/${sheet}`;
  let sort = S.files.filter(f => f.sheet === sheet && f.grp === grp && f.worker_id === wid).reduce((a, f) => Math.max(a, f.sort), 0);
  let ok = 0;
  for (const raw of files) {
    const file = await shrink(raw);
    const ext = (file.name.match(/\.(\w+)$/)?.[1] || (file.type === "application/pdf" ? "pdf" : "jpg")).toLowerCase();
    const path = `${base}/${uid()}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) { console.error(error); toast("올리지 못했습니다: " + error.message); continue; }
    const row = { id: uid(), month_id: sheet === "id" ? null : S.month.id, worker_id: wid, sheet, grp, sort: ++sort, path, name: raw.name, caption: {} };
    const { error: e2 } = await sb.from("jy_files").insert(row);
    if (e2) { console.error(e2); toast("저장하지 못했습니다: " + e2.message); await sb.storage.from(BUCKET).remove([path]); continue; }
    S.files.push(row); ok++;
  }
  await signUrls(S.files.map(f => f.path));
  renderMonthKeepScroll();
  toast(`${ok}개 올렸습니다.`);
}
function renderMonthKeepScroll() { const y = scrollY; renderMonth(); scrollTo(0, y); }
document.addEventListener("change", e => {
  const el = e.target; if (!el.matches('input[type=file][data-up]')) return;
  upload(el.files, { sheet: el.dataset.up, grp: el.dataset.grp || "", wid: el.dataset.wid || null }); el.value = "";
});
document.addEventListener("dragover", e => { const z = e.target.closest("[data-drop]"); if (!z) return; e.preventDefault(); z.classList.add("drop"); });
document.addEventListener("dragleave", e => { e.target.closest?.("[data-drop]")?.classList.remove("drop"); });
document.addEventListener("drop", e => {
  const z = e.target.closest("[data-drop]"); if (!z) return; e.preventDefault(); z.classList.remove("drop");
  upload(e.dataTransfer.files, { sheet: z.dataset.drop, grp: z.dataset.grp || "", wid: z.dataset.wid || null });
});
document.addEventListener("click", async e => {
  const del = e.target.closest("[data-fdel]");
  if (del) {
    e.stopPropagation();
    const f = S.files.find(x => x.id === del.dataset.fdel); if (!f || !confirm(`「${f.caption?.usage || f.caption?.memo || f.name}」 파일을 지울까요?`)) return;
    await sb.storage.from(BUCKET).remove([f.path]);
    const { error } = await sb.from("jy_files").delete().eq("id", f.id);
    if (error) return toast("지우지 못했습니다: " + error.message);
    pend.files.delete(f.id); S.files = S.files.filter(x => x.id !== f.id); renderMonthKeepScroll(); return;
  }
  const v = e.target.closest("[data-view]");
  if (v) {
    const f = S.files.find(x => x.id === v.dataset.view); const url = f && S.urls[f.path]; if (!url) return;
    $("#view-body").innerHTML = isPdf(f) ? `<iframe src="${url}"></iframe>` : `<img src="${url}" alt="">`;
    $("#dlg-view").showModal();
  }
});

/* ================= 시작 ================= */
(async () => {
  const t = await connect();
  if (!t) {
    $("#app").innerHTML = `<div class="card lock"><h3>🔒 직영실행 자료는 접속 비밀번호를 거쳐야 볼 수 있습니다</h3><p class="muted">현장관리시스템 주소로 들어와 비밀번호를 입력한 뒤 다시 열어 주세요.</p></div>`;
    return;
  }
  await loadSite();
  route();
})();
