// 작업일보 — 날짜마다 공사일보 · 출력일보 · 안전교육일지를 고치고, 올린 양식 그대로 엑셀로 저장
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toast = (m, ms = 2800) => { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, ms); };
const ymd = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDay = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
const WD = "일월화수목금토", wd = s => new Date(s + "T00:00:00").getDay();
const clone = o => JSON.parse(JSON.stringify(o ?? null));
const N = v => v === "" || v == null || isNaN(Number(v)) ? null : Number(v);
const fmt = v => v == null || v === "" ? "" : typeof v === "number" ? v.toLocaleString("ko-KR", { maximumFractionDigits: 3 }) : v;
const BUCKET = "jy-files";

let sb;
const S = { days: [], byDay: new Map(), day: ymd(new Date()), tab: "report", eduTab: null, settings: {}, tpl: {}, names: [], showAll: false };

async function connect() {
  let t = "";
  try { const r = await fetch("/__dbtoken", { cache: "no-store" }); if (r.ok) t = (await r.json()).t || ""; } catch {}
  sb = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { headers: { "x-pms-token": t } }, auth: { persistSession: false } });
}

/* ================= 불러오기 · 저장 ================= */
async function loadAll() {
  const [d, s, w] = await Promise.all([
    sb.from("ilbo_days").select("*").order("day"),
    sb.from("ilbo_settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("jy_workers").select("name,team").order("name").then(r => r, () => ({ data: [] })),
  ]);
  if (d.error) throw d.error;
  S.days = d.data || []; S.byDay = new Map(S.days.map(x => [x.day, x]));
  S.settings = s.data?.data || {};
  // 이름·직종·장비 자동완성
  const names = new Set((w.data || []).map(x => x.name)), jobs = new Set(), eq = new Set();
  for (const x of S.days.slice(-60)) { for (const v of x.data.workers || []) { if (v.name) names.add(v.name); if (v.job) jobs.add(v.job); } for (const e of x.data.equip || []) if (e.name) eq.add(e.name.trim()); }
  $("#dl-names").innerHTML = [...names].map(n => `<option value="${esc(n)}">`).join("");
  $("#dl-jobs").innerHTML = [...jobs].map(n => `<option value="${esc(n)}">`).join("");
  $("#dl-equip").innerHTML = [...eq].map(n => `<option value="${esc(n)}">`).join("");
}
let saveT = null, pending = new Set();
function setSave(cls, t) { const el = $("#save"); el.className = "save " + (cls || ""); el.textContent = t; }
function touch(day = S.day) { const x = S.byDay.get(day); if (!x) return; x.edited = true; pending.add(day); setSave("busy", "저장 중…"); clearTimeout(saveT); saveT = setTimeout(flush, 700); }
async function flush() {
  const list = [...pending]; pending.clear(); if (!list.length) return;
  const rows = list.map(d => { const x = S.byDay.get(d); return { day: d, data: x.data, edited: true, src: x.src || "web", updated_at: new Date().toISOString() }; });
  const { data, error } = await sb.from("ilbo_days").upsert(rows, { onConflict: "day" }).select("id,day");
  if (error) { list.forEach(d => pending.add(d)); setSave("err", "저장 실패 — 다시 시도 중"); console.error(error); clearTimeout(saveT); saveT = setTimeout(flush, 4000); return; }
  for (const r of data || []) { const x = S.byDay.get(r.day); if (x) x.id = r.id; }
  setSave("ok", "저장됨 ✓"); drawDays();
}
addEventListener("beforeunload", e => { if (pending.size) { flush(); e.preventDefault(); e.returnValue = ""; } });

/* ================= 계산 ================= */
const sumN = (...a) => a.every(v => v == null || v === "") ? null : a.reduce((s, v) => s + (Number(v) || 0), 0);
function derive(d) {
  const w0 = d.waste?.[0]; const wTot = w0 ? sumN(w0.e, w0.g) : null;
  for (const e of d.equip || []) if (e.link === "waste") e.prev = wTot;
  return d;
}
const prevDayOf = day => { let best = null; for (const x of S.days) if (x.day < day && (!best || x.day > best.day)) best = x; return best; };
const nextDays = day => S.days.filter(x => x.day > day).sort((a, b) => a.day.localeCompare(b.day));

// 전날 일보로 새 날 만들기: 누계 → 전일, 명일 작업 → 금일 작업
function carry(p) {
  const d = clone(p.data);
  d.today = (p.data.tomorrow || []).slice(); d.tomorrow = (p.data.tomorrow || []).slice();
  while (d.today.length < (p.data.today || []).length) d.today.push("");
  d.equip = (p.data.equip || []).map(e => ({ ...e, prev: e.link ? null : sumN(e.prev, e.today) }));
  d.people = (p.data.people || []).map(x => ({ ...x, prev: sumN(x.prev, x.today) }));
  d.waste = (p.data.waste || []).map(w => ({ ...w, g: sumN(w.e, w.g), e: null, i: null }));
  d.prog = (p.data.prog || []).map(g => ({ ...g, prev: g.total == null && g.cum == null ? null : 0 }));
  d.notes = (p.data.notes || []).map(() => "");
  d.workers = clone(p.data.workers || []);
  if (d.edu) for (const k of Object.keys(d.edu)) if (d.edu[k].auto !== false) d.edu[k].attendees = [];
  return derive(d);
}
function blankFrom(p) {
  const d = carry(p);
  d.today = d.today.map(() => ""); d.tomorrow = d.tomorrow.map(() => "");
  d.equip.forEach(e => e.today = null); d.people.forEach(x => x.today = null); d.workers = [];
  return d;
}
// 뒤 날짜들의 전일·누계를 앞 날짜에 맞춰 다시 계산
function rechain(from) {
  let p = S.byDay.get(from), changed = 0;
  for (const x of nextDays(from)) {
    const d = x.data, pd = p.data;
    const find = (arr, a, i, key) => arr[i] && key(arr[i]) === key(a) ? arr[i] : arr.find(b => key(b) === key(a));
    const ek = e => (e.name || "").replace(/\s+/g, "") + "|" + (e.spec ?? ""), pk = e => (e.job || "").replace(/\s+/g, "");
    (d.equip || []).forEach((e, i) => { if (e.link) return; const q = find(pd.equip || [], e, i, ek); if (q) { const v = sumN(q.prev, q.today); if (v !== e.prev) { e.prev = v; changed++; } } });
    (d.people || []).forEach((e, i) => { const q = find(pd.people || [], e, i, pk); if (q) { const v = sumN(q.prev, q.today); if (v !== e.prev) { e.prev = v; changed++; } } });
    (d.waste || []).forEach((w, i) => { const q = (pd.waste || [])[i]; if (q) { const v = sumN(q.e, q.g); if (v !== w.g) { w.g = v; changed++; } } });
    derive(d); x.edited = true; pending.add(x.day); p = x;
  }
  if (pending.size) { setSave("busy", "저장 중…"); clearTimeout(saveT); saveT = setTimeout(flush, 300); }
  return changed;
}

/* ================= 왼쪽 날짜 목록 ================= */
function drawDays() {
  const list = S.days.slice().sort((a, b) => b.day.localeCompare(a.day));
  const shown = S.showAll ? list : list.slice(0, 45);
  let html = `<button type="button" class="btn primary new" id="new-day">+ ${S.byDay.has(ymd(new Date())) ? "새 날짜" : "오늘"} 일보</button>`, ym = "";
  for (const x of shown) {
    const m = x.day.slice(0, 7); if (m !== ym) { ym = m; html += `<h4>${+m.slice(0, 4)}년 ${+m.slice(5)}월</h4>`; }
    const w = wd(x.day), ppl = (x.data.people || []).reduce((s, p) => s + (Number(p.today) || 0), 0);
    html += `<div class="dy ${x.day === S.day ? "on" : ""}" data-day="${x.day}"><div class="dd ${w === 0 ? "sun" : w === 6 ? "sat" : ""}"><b>${+x.day.slice(8)}</b><small>${WD[w]}</small></div>
      <div class="tx"><div>${esc((x.data.today || []).find(Boolean) || "작업사항 없음")}</div><small>인원 ${ppl}명 · 출력 ${(x.data.workers || []).filter(v => v.name).length}명${x.src === "web" || x.edited ? '<span class="web">웹</span>' : ""}</small></div></div>`;
  }
  if (list.length > shown.length) html += `<button type="button" class="btn ghost more" id="more">이전 일보 ${list.length - shown.length}건 더 보기</button>`;
  $("#days").innerHTML = html;
}
$("#days").addEventListener("click", e => {
  if (e.target.closest("#more")) { S.showAll = true; drawDays(); return; }
  if (e.target.closest("#new-day")) { const t = ymd(new Date()); go(S.byDay.has(t) ? addDay(S.days.at(-1)?.day || t, 1) : t); return; }
  const d = e.target.closest(".dy"); if (d) go(d.dataset.day);
});
function go(day) { S.day = day; $("#d-day").value = day; drawDays(); draw(); const on = $(".dy.on"); on?.scrollIntoView({ block: "nearest" }); }
$("#d-day").onchange = e => e.target.value && go(e.target.value);
$("#d-prev").onclick = () => { const p = prevDayOf(S.day); go(p ? p.day : addDay(S.day, -1)); };
$("#d-next").onclick = () => { const n = nextDays(S.day)[0]; go(n ? n.day : addDay(S.day, 1)); };
$("#d-today").onclick = () => go(ymd(new Date()));

/* ================= 본문 ================= */
function draw() {
  const x = S.byDay.get(S.day), main = $("#main");
  const title = `${+S.day.slice(0, 4)}년 ${+S.day.slice(5, 7)}월 ${+S.day.slice(8)}일 (${WD[wd(S.day)]})`;
  if (!x) {
    const p = prevDayOf(S.day);
    main.innerHTML = `<div class="empty"><h2>${title} 일보가 없습니다</h2>
      <p>${p ? `<b>${p.day}</b> 일보를 바탕으로 만들면 누계가 전일로 넘어오고, 명일 작업사항이 금일 작업사항으로 들어갑니다.` : "아직 만든 일보가 없습니다."}</p>
      <div class="acts">${p ? `<button type="button" class="btn primary" id="mk-copy">📋 ${p.day.slice(5)} 일보 이어서 만들기</button><button type="button" class="btn" id="mk-blank">빈 칸으로 만들기 (전일·누계만 이어받기)</button>` : ""}</div></div>`;
    $("#mk-copy")?.addEventListener("click", () => create(carry(p)));
    $("#mk-blank")?.addEventListener("click", () => create(blankFrom(p)));
    return;
  }
  const later = nextDays(S.day).length;
  main.innerHTML = `<div class="tabs">${[["report", "공사일보"], ["att", "출력일보"], ["edu", "안전교육일지"]].map(([k, n]) => `<button type="button" data-tab="${k}" class="${S.tab === k ? "on" : ""}">${n}</button>`).join("")}
    <span class="sp"></span><span class="tinfo">${title}${x.src === "import" && !x.edited ? " · 엑셀에서 가져온 일보" : ""}</span>
    ${later ? `<button type="button" class="btn sm ghost" id="rechain" title="이 날짜를 고친 뒤, 다음 날들의 전일·누계를 다시 이어서 계산">↻ 다음 ${later}일 전일·누계 맞추기</button>` : ""}
    <button type="button" class="btn sm ghost danger" id="del-day">이 날 일보 삭제</button></div><div id="tab"></div>`;
  drawTab();
}
$("#main").addEventListener("click", async e => {
  const t = e.target.closest("[data-tab]"); if (t) { S.tab = t.dataset.tab; $$(".tabs [data-tab]").forEach(b => b.classList.toggle("on", b === t)); drawTab(); return; }
  if (e.target.closest("#rechain")) { const n = rechain(S.day); toast(n ? `다음 날들 전일·누계 ${n}칸을 맞췄습니다.` : "이미 맞습니다."); drawDays(); return; }
  if (e.target.closest("#del-day")) {
    if (!confirm(`${S.day} 일보를 지울까요? (되돌릴 수 없습니다)`)) return;
    const { error } = await sb.from("ilbo_days").delete().eq("day", S.day); if (error) return toast("지우지 못했습니다: " + error.message);
    S.days = S.days.filter(x => x.day !== S.day); S.byDay.delete(S.day); pending.delete(S.day); drawDays(); draw(); toast("지웠습니다.");
  }
});
async function create(data) {
  const row = { day: S.day, data, src: "web", edited: true };
  const { data: r, error } = await sb.from("ilbo_days").insert(row).select().single();
  if (error) return toast("만들지 못했습니다: " + error.message);
  S.days.push(r); S.days.sort((a, b) => a.day.localeCompare(b.day)); S.byDay.set(r.day, r);
  S.tab = "report"; drawDays(); draw(); toast(`${S.day} 일보를 만들었습니다.`);
}
const cur = () => S.byDay.get(S.day)?.data;
function drawTab() { const t = $("#tab"); if (!t) return; if (S.tab === "report") t.innerHTML = rReport(); else if (S.tab === "att") t.innerHTML = rAtt(); else t.innerHTML = rEdu(); refresh(); }

/* ---------- 입력 공통 (data-p = 경로) ---------- */
const getP = (o, p) => p.split(".").reduce((a, k) => a?.[k], o);
function setP(o, p, v) { const ks = p.split("."); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[ks[i]]; } a[ks.at(-1)] = v; }
const inp = (p, o = {}) => { const v = getP(cur(), p); if (o.ta) return `<textarea data-p="${p}" rows="2" class="ta">${esc(v ?? "")}</textarea>`; return `<input data-p="${p}" ${o.num ? 'data-num inputmode="decimal"' : ""} value="${esc(o.num ? (v ?? "") : (v ?? ""))}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ""} ${o.list ? `list="${o.list}"` : ""} class="${o.cls || ""}" ${o.dis ? "disabled" : ""}>`; };
$("#main").addEventListener("input", e => {
  const el = e.target.closest("[data-p]"); if (!el) return;
  const d = cur(); let v = el.value; if (el.hasAttribute("data-num")) v = N(v.replace(/,/g, "")); if (el.type === "checkbox") v = el.checked;
  setP(d, el.dataset.p, v); derive(d); refresh(); touch();
});

/* ---------- 공사일보 ---------- */
function rReport() {
  const d = derive(cur()), nL = Math.max(d.today?.length || 0, d.tomorrow?.length || 0, 9);
  const nE = Math.max(d.equip?.length || 0, d.people?.length || 0);
  const lines = (k, n) => `<div class="lines">${Array.from({ length: n }, (_, i) => `<div class="ln"><span>${i + 1}</span>${inp(`${k}.${i}`)}</div>`).join("")}</div>`;
  return `
  <div class="card"><h3>기본 정보</h3><div class="row-g">
    <label class="fld">날씨${inp("weather", { list: "dl-weather" })}</label>
    <label class="fld">현장명${inp("site")}</label>
    <label class="fld">공종${inp("gongjong")}</label>
    <label class="fld">소속/현장소장${inp("boss")}</label></div></div>
  <div class="grid2">
    <div class="card"><h3>금일 작업사항</h3>${lines("today", nL)}</div>
    <div class="card"><h3>명일 작업사항</h3>${lines("tomorrow", nL)}</div>
  </div><div style="height:14px"></div>
  <div class="grid2">
    <div class="card"><h3>장비 투입 현황 <small>누계 = 전일 + 금일</small></h3>
      <table class="tb"><thead><tr><th></th><th>장비명</th><th>규격</th><th>전일(대)</th><th>금일(대)</th><th>누계(대)</th><th></th></tr></thead><tbody>
      ${Array.from({ length: nE }, (_, i) => { const e = d.equip?.[i] || {}; return `<tr><td class="n">${i + 1}</td><td>${inp(`equip.${i}.name`, { cls: "l", list: "dl-equip" })}</td><td style="width:70px">${inp(`equip.${i}.spec`)}</td>
        <td style="width:84px">${e.link ? `<input class="link" disabled data-c="eqp${i}" title="잔재 반출 총수량과 같음 (엑셀 수식 그대로)">` : inp(`equip.${i}.prev`, { num: 1 })}</td><td style="width:72px">${inp(`equip.${i}.today`, { num: 1 })}</td><td class="calc" data-c="eq${i}"></td>
        <td class="x">${e.link ? '<span class="tag">반출 연동</span>' : `<button type="button" data-row="equip" data-i="${i}" data-a="up" title="위로">↑</button><button type="button" data-row="equip" data-i="${i}" data-a="del" title="이 줄 비우기">✕</button>`}</td></tr>`; }).join("")}
      </tbody><tfoot><tr><td></td><td>합계</td><td></td><td data-c="eqP"></td><td data-c="eqT"></td><td data-c="eqC"></td><td></td></tr></tfoot></table></div>
    <div class="card"><h3>인원 투입 현황 <span class="grow"></span><button type="button" class="btn sm" id="from-att" title="출력일보 명단의 직종별 인원 수를 금일(명)에 넣습니다">👷 출력일보에서 금일 인원 채우기</button></h3>
      <table class="tb"><thead><tr><th></th><th>직종</th><th>전일(명)</th><th>금일(명)</th><th>누계(명)</th><th>비고</th></tr></thead><tbody>
      ${Array.from({ length: nE }, (_, i) => `<tr><td class="n">${i + 1}</td><td>${inp(`people.${i}.job`, { list: "dl-jobs" })}</td><td style="width:84px">${inp(`people.${i}.prev`, { num: 1 })}</td><td style="width:72px">${inp(`people.${i}.today`, { num: 1 })}</td><td class="calc" data-c="pp${i}"></td><td style="width:90px">${inp(`people.${i}.note`)}</td></tr>`).join("")}
      </tbody><tfoot><tr><td></td><td>합계</td><td data-c="ppP"></td><td data-c="ppT"></td><td data-c="ppC"></td><td></td></tr></tfoot></table>
      <div class="acts"><small id="att-hint"></small></div></div>
  </div><div style="height:14px"></div>
  <div class="grid2">
    <div class="card"><h3>잔재 반출 현황 <small>총 반출수량 = 전일반출 + 누계</small></h3>
      <table class="tb"><thead><tr><th>성상</th><th>전일반출(대)</th><th>누계(대)</th><th>총 반출수량</th><th>단위</th></tr></thead><tbody>
      ${(d.waste || []).map((w, i) => `<tr><td>${inp(`waste.${i}.kind`)}</td><td>${inp(`waste.${i}.e`, { num: 1 })}</td><td>${inp(`waste.${i}.g`, { num: 1 })}</td><td class="calc" data-c="wa${i}"></td><td style="width:60px">${inp(`waste.${i}.unit`)}</td></tr>`).join("")}
      </tbody></table></div>
    <div class="card"><h3>공정율</h3>
      <table class="tb"><thead><tr><th>공종</th><th>총건물동수</th><th>전일철거동</th><th>누계동</th><th>잔여동</th><th>공정율</th></tr></thead><tbody>
      ${(d.prog || []).map((g, i) => `<tr><td style="width:120px">${inp(`prog.${i}.kind`, { ta: 1 })}</td><td>${inp(`prog.${i}.total`, { num: 1 })}</td><td>${inp(`prog.${i}.prev`, { num: 1 })}</td><td>${inp(`prog.${i}.cum`, { num: 1 })}</td><td class="calc" data-c="pr${i}"></td><td class="calc" data-c="rt${i}"></td></tr>`).join("")}
      </tbody></table><div class="acts"><small>총건물동수가 엑셀에서 수식(=135+193+113 등)인 칸은 엑셀 저장 때 수식 그대로 둡니다.</small></div></div>
  </div><div style="height:14px"></div>
  <div class="card"><h3>특이사항</h3>${lines("notes", Math.max(d.notes?.length || 0, 4))}</div>`;
}
function refresh() {
  const d = cur(); if (!d) return;
  const C = (k, v) => { const el = $(`[data-c="${k}"]`); if (!el) return; if (el.tagName === "INPUT") el.value = fmt(v); else el.textContent = fmt(v); };
  const nE = Math.max(d.equip?.length || 0, d.people?.length || 0);
  for (let i = 0; i < nE; i++) { const e = d.equip?.[i] || {}, p = d.people?.[i] || {}; C("eq" + i, sumN(e.prev, e.today)); C("eqp" + i, e.prev); C("pp" + i, sumN(p.prev, p.today)); }
  const tot = (arr, f) => (arr || []).reduce((s, x) => s + (Number(f(x)) || 0), 0);
  C("eqP", tot(d.equip, e => e.prev)); C("eqT", tot(d.equip, e => e.today)); C("eqC", tot(d.equip, e => sumN(e.prev, e.today)));
  C("ppP", tot(d.people, e => e.prev)); C("ppT", tot(d.people, e => e.today)); C("ppC", tot(d.people, e => sumN(e.prev, e.today)));
  (d.waste || []).forEach((w, i) => C("wa" + i, sumN(w.e, w.g)));
  (d.prog || []).forEach((g, i) => { C("pr" + i, g.total != null && g.cum != null ? g.total - g.cum : null); C("rt" + i, g.total && g.cum != null ? (g.cum / g.total * 100).toFixed(1) + "%" : null); });
  const ah = $("#att-hint"); if (ah) { const c = attCounts(d); ah.textContent = c.miss.length ? `출력일보 직종 중 맞는 칸이 없는 것: ${c.miss.join(", ")}` : (d.workers || []).length ? `출력일보 ${(d.workers || []).filter(w => w.name).length}명 기준으로 채울 수 있습니다` : ""; }
  const ac = $("#att-count"); if (ac) ac.innerHTML = attSummary(d);
}
// 출력일보 직종 → 인원 투입 현황 직종
function attCounts(d) {
  const al = S.settings.aliases || {}, rows = (d.people || []).map(p => (p.job || "").replace(/\s+/g, ""));
  const cnt = new Map(), miss = new Set();
  for (const w of d.workers || []) {
    if (!w.name) continue; const j = (w.job || "").replace(/\s+/g, ""); if (!j) continue;
    let i = rows.indexOf(j); if (i < 0 && al[j]) i = rows.indexOf(al[j].replace(/\s+/g, ""));
    if (i < 0) { const c = rows.map((r, k) => [r, k]).filter(([r]) => r && (r.startsWith(j) || j.startsWith(r))).sort((a, b) => a[0].length - b[0].length); if (c.length) i = c[0][1]; }
    if (i < 0) { miss.add(w.job); continue; }
    cnt.set(i, (cnt.get(i) || 0) + (Number(w.gongsu ?? 1) || 0));
  }
  return { cnt, miss: [...miss] };
}

/* ---------- 출력일보 ---------- */
function rAtt() {
  const d = cur(); d.workers = d.workers || [];
  const n = Math.max(d.workers.length + 1, 5);
  return `<div class="card"><h3>출력자 명부 <span class="grow"></span>
      <button type="button" class="btn sm" id="att-prev">📋 전날 명단 불러오기</button>
      <button type="button" class="btn sm" id="att-paste">여러 명 붙여넣기</button>
      <button type="button" class="btn sm primary" id="att-to-report" title="직종별 인원 수를 공사일보 인원 투입 현황 금일(명)에 넣기">공사일보 인원에 반영 →</button></h3>
    <div class="row-g" style="margin-bottom:10px"><label class="fld">현장명${inp("site")}</label><label class="fld">소속${inp("company", { ph: "㈜지디건설" })}</label></div>
    <div class="sum" id="att-count" style="margin-bottom:8px"></div>
    <table class="tb"><thead><tr><th>NO</th><th>성명</th><th>직종</th><th>공수</th><th></th></tr></thead><tbody>
    ${Array.from({ length: n }, (_, i) => `<tr><td class="n">${i + 1}</td><td>${inp(`workers.${i}.name`, { list: "dl-names" })}</td><td>${inp(`workers.${i}.job`, { list: "dl-jobs" })}</td><td style="width:80px">${inp(`workers.${i}.gongsu`, { num: 1, ph: "1" })}</td><td class="x">${i < d.workers.length ? `<button type="button" data-row="workers" data-i="${i}" data-a="up">↑</button><button type="button" data-row="workers" data-i="${i}" data-a="del">✕</button>` : ""}</td></tr>`).join("")}
    </tbody></table>
    <div class="acts"><small>맨 아래 빈 줄에 이름을 쓰면 줄이 늘어납니다. 공수를 비우면 1로 저장됩니다. 엑셀 양식은 44명까지 들어갑니다.</small></div></div>`;
}
function attSummary(d) {
  const ws = (d.workers || []).filter(w => w.name), by = {};
  for (const w of ws) by[w.job || "(직종 없음)"] = (by[w.job || "(직종 없음)"] || 0) + (Number(w.gongsu ?? 1) || 0);
  return `<span>합계 <b>${ws.reduce((s, w) => s + (Number(w.gongsu ?? 1) || 0), 0)}</b>명</span>` + Object.entries(by).map(([k, v]) => `<span>${esc(k)} <b>${v}</b></span>`).join("");
}

/* ---------- 안전교육일지 ---------- */
function eduOf(d, name) {
  d.edu = d.edu || {};
  if (!d.edu[name]) {
    const pv = S.days.filter(x => x.day < S.day && x.data.edu?.[name]).at(-1)?.data.edu[name];
    if (pv) { d.edu[name] = clone(pv); if (d.edu[name].auto !== false) d.edu[name].attendees = []; return d.edu[name]; }
    const df = S.eduDefaults?.[name] || {}; d.edu[name] = { project: df.project || "", company: df.company || "", place: df.place || "", teacher: df.teacher || "", boss: df.boss || "", items: (df.items || []).slice(), attendees: [], auto: true, skip: false }; }
  return d.edu[name];
}
function rEdu() {
  const d = cur(); const names = [...new Set([...Object.keys(S.eduDefaults || {}), ...Object.keys(d.edu || {})])];
  if (!names.length) return `<div class="card"><p class="muted">안전교육일지 양식을 읽는 중이거나, 양식 파일이 없습니다. 위 ⚙ 양식에서 안전교육일지 양식을 올려 주세요.</p></div>`;
  if (!S.eduTab || !names.includes(S.eduTab)) S.eduTab = names.find(n => !(d.edu?.[n]?.skip)) || names[0];
  const n = S.eduTab, e = eduOf(d, n), base = `edu.${n}`;
  const att = e.auto !== false ? (d.workers || []).filter(w => w.name).map(w => w.name) : (e.attendees || []);
  const rows = Math.max(e.items?.length || 0, 10);
  return `<div class="subtabs">${names.map(k => `<button type="button" data-edu="${esc(k)}" class="${k === n ? "on" : ""}">${esc(k)}${d.edu?.[k]?.skip ? " (안 씀)" : ""}</button>`).join("")}</div>
  <div class="card"><h3>${esc(n)} <span class="grow"></span><label class="chk"><input type="checkbox" data-p="${base}.skip" ${e.skip ? "checked" : ""}> 이 시트는 안 씀 (엑셀 저장 때 양식 그대로)</label></h3>
    <div class="row-g"><label class="fld">공사명${inp(`${base}.project`)}</label><label class="fld">회사명${inp(`${base}.company`)}</label><label class="fld">교육장소${inp(`${base}.place`)}</label>
      <label class="fld">교육담당${inp(`${base}.teacher`)}</label><label class="fld">현장소장${inp(`${base}.boss`, { ph: "이 동 근" })}</label><label class="fld">교육일시<input value="${S.day.replace(/-/g, ". ")}" disabled></label></div></div>
  <div class="grid2"><div class="card"><h3>교육내용</h3><div class="lines">${Array.from({ length: rows }, (_, i) => `<div class="ln"><span>${i + 1}</span>${inp(`${base}.items.${i}`)}</div>`).join("")}</div></div>
  <div class="card"><h3>참석자 명단 <small>${att.length}명</small><span class="grow"></span>
    <label class="chk"><input type="checkbox" id="edu-auto" ${e.auto !== false ? "checked" : ""}> 출력일보 명단 그대로</label></h3>
    ${e.auto !== false ? `<div class="att">${att.map((a, i) => `<span><i>${i + 1}</i>${esc(a)}</span>`).join("") || '<span class="muted">출력일보에 이름을 넣으면 여기 나옵니다</span>'}</div>`
      : `<textarea class="names" id="edu-names" placeholder="한 줄에 한 명씩">${esc((e.attendees || []).join("\n"))}</textarea>`}
    <div class="acts"><small>양식에는 60명까지 들어갑니다.</small></div></div></div>`;
}
$("#main").addEventListener("click", e => {
  const b = e.target.closest("[data-edu]"); if (b) { S.eduTab = b.dataset.edu; drawTab(); }
});
$("#main").addEventListener("change", e => {
  if (e.target.id === "edu-auto") { const ed = eduOf(cur(), S.eduTab); ed.auto = e.target.checked; if (!ed.auto && !(ed.attendees || []).length) ed.attendees = (cur().workers || []).filter(w => w.name).map(w => w.name); touch(); drawTab(); }
  if (e.target.matches("[data-p$='.skip']")) drawTab();
});
$("#main").addEventListener("input", e => { if (e.target.id === "edu-names") { eduOf(cur(), S.eduTab).attendees = e.target.value.split(/\n/).map(s => s.trim()).filter(Boolean); touch(); } });

/* ---------- 줄 · 버튼 ---------- */
$("#main").addEventListener("click", e => {
  const r = e.target.closest("[data-row]");
  if (r) {
    const d = cur(), arr = d[r.dataset.row], i = +r.dataset.i;
    if (r.dataset.a === "del") { if (r.dataset.row === "workers") arr.splice(i, 1); else arr[i] = { name: "", spec: "", prev: null, today: null }; }
    if (r.dataset.a === "up" && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
    touch(); drawTab(); return;
  }
  const id = e.target.closest("button")?.id;
  if (id === "from-att" || id === "att-to-report") {
    const d = cur(), { cnt, miss } = attCounts(d);
    if (!(d.workers || []).some(w => w.name)) return toast("출력일보에 명단이 없습니다.");
    (d.people || []).forEach((p, i) => { if (cnt.has(i)) p.today = cnt.get(i); else if (p.job && p.job.replace(/\s+/g, "") !== "현장직원") p.today = p.prev == null && p.today == null ? p.today : 0; });
    touch(); if (id === "att-to-report") { S.tab = "report"; draw(); } else drawTab();
    toast(`출력일보 인원을 금일(명)에 넣었습니다.${miss.length ? ` 맞는 직종이 없는 것: ${miss.join(", ")}` : ""} 현장직원은 그대로 둡니다.`, 4500);
  }
  if (id === "att-prev") {
    const p = prevDayOf(S.day); if (!p || !(p.data.workers || []).length) return toast("전날 명단이 없습니다.");
    if ((cur().workers || []).some(w => w.name) && !confirm("지금 명단을 전날 명단으로 바꿀까요?")) return;
    cur().workers = clone(p.data.workers); touch(); drawTab(); toast(`${p.day} 명단 ${p.data.workers.length}명을 불러왔습니다.`);
  }
  if (id === "att-paste") {
    const t = prompt("한 줄에 한 명씩 '이름 직종 공수' 로 붙여 넣으세요. (직종·공수는 빼도 됩니다)\n예) 홍길동 유도 1"); if (!t) return;
    const add = t.split(/\n/).map(s => s.trim()).filter(Boolean).map(s => { const [name, job = "", g] = s.split(/[\t ,]+/); return { name, job, gongsu: N(g) ?? 1 }; });
    cur().workers = [...(cur().workers || []).filter(w => w.name), ...add]; touch(); drawTab(); toast(`${add.length}명 추가했습니다.`);
  }
});
// 출력일보 맨 아래 빈 줄에 쓰면 줄 늘리기
$("#main").addEventListener("input", e => { const p = e.target.dataset?.p; if (p && /^workers\.\d+\.name$/.test(p) && S.tab === "att") { const i = +p.split(".")[1]; if (i >= cur().workers.length - 1 && e.target.closest("tr") === $("#tab tbody tr:last-child")) { cur().workers = cur().workers.filter((w, k) => k <= i || w); const pos = e.target.selectionStart; drawTab(); const el = $(`[data-p="${p}"]`); el?.focus(); el?.setSelectionRange(pos, pos); } } });

/* ================= 양식 파일 ================= */
const tplCache = {};
async function getTpl(kind) {
  if (tplCache[kind]) return tplCache[kind];
  const t = S.settings.tpl?.[kind]; if (!t) throw new Error(`${kind === "report" ? "작업일보" : "안전교육일지"} 양식 파일이 없습니다. ⚙ 양식에서 올려 주세요.`);
  const { data, error } = await sb.storage.from(BUCKET).download(t.path);
  if (error) throw new Error("양식 파일을 받지 못했습니다: " + error.message);
  return (tplCache[kind] = new File([data], t.name || kind + ".xlsx"));
}
function busy(on, t = "만드는 중…") { let o = $(".busy-ov"); if (!on) { o?.remove(); return; } if (!o) { o = document.createElement("div"); o.className = "busy-ov"; document.body.append(o); } o.innerHTML = `<div><span class="spin"></span>${esc(t)}</div>`; }
function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000); }
function showNotes(title, notes, file) {
  $("#dlg-f").innerHTML = `<h3>${esc(title)}</h3><p>✓ <b>${esc(file)}</b> 을(를) 내려받았습니다.</p><ul class="notes">${notes.map(n => `<li class="${n.startsWith("⚠") ? "ng" : ""}">${esc(n)}</li>`).join("")}</ul><div class="dlg-btns"><button class="btn primary" value="ok">확인</button></div>`;
  $("#dlg").showModal();
}
$("#x-report").onclick = async () => {
  if (!S.byDay.has(S.day)) return toast("이 날짜 일보가 없습니다.");
  await flush(); busy(true, "작업일보 통합 엑셀 만드는 중… (모든 날짜)");
  try {
    const { exportReport } = await import("./export.js");
    const tpl = await getTpl("report");
    const r = await exportReport(tpl, S.days.map(x => ({ day: x.day, data: derive(x.data), edited: x.edited || x.src === "web" })), S.day);
    const name = `작업일보_통합_${S.day}까지.xlsx`; download(r.blob, name); busy(false); showNotes("작업일보 통합 엑셀", r.notes, name);
  } catch (e) { console.error(e); busy(false); toast("만들지 못했습니다: " + (e.message || e), 6000); }
};
const eduReady = d => { d = clone(d); for (const n of Object.keys(S.eduDefaults || {})) eduOf(d, n); for (const e of Object.values(d.edu || {})) if (e.auto !== false) e.attendees = (d.workers || []).filter(w => w.name).map(w => w.name); return d; };
$("#x-day").onclick = async () => {
  const x = S.byDay.get(S.day); if (!x) return toast("이 날짜 일보가 없습니다.");
  await flush(); busy(true, `${S.day} 일보 엑셀 만드는 중…`);
  try {
    const { exportDaily } = await import("./export.js");
    if (!S.eduDefaults) await loadEduDefaults();
    const [rep, edu] = await Promise.all([getTpl("report"), getTpl("edu").catch(() => null)]);
    const r = await exportDaily(rep, edu, [{ day: x.day, data: eduReady(derive(x.data)), edited: x.edited || x.src === "web" }], S.day);
    const name = `작업일보_${S.day}.xlsx`; download(r.blob, name); busy(false); showNotes(`${S.day} 일보 엑셀`, r.notes, name);
  } catch (e) { console.error(e); busy(false); toast("만들지 못했습니다: " + (e.message || e), 6000); }
};
$("#x-tpl").onclick = () => {
  const t = S.settings.tpl || {}, row = (k, n) => `<div class="tplrow"><div><b>${n}</b><small>${t[k] ? `${esc(t[k].name)} · ${new Date(t[k].date).toLocaleDateString("ko-KR")} 등록` : "없음"}</small></div><label class="btn sm">바꾸기<input type="file" accept=".xlsx" data-tpl="${k}"></label></div>`;
  $("#dlg-f").innerHTML = `<h3>엑셀 양식</h3>${row("report", "작업일보 (공사일보 · 출력일보 · 공사일보 (2))")}${row("edu", "일일 안전교육 일지")}
    <p class="muted" style="font-size:12.5px;line-height:1.6">엑셀로 저장할 때 이 파일을 그대로 쓰고 값 칸만 바꿉니다. 작업일보는 <b>공사일보 (2)</b> 시트 맨 아래 묶음을 복사해 새 날짜를 이어 붙입니다.
    엑셀에서 직접 고친 최신 파일을 여기에 올리면 그 파일 기준으로 이어 붙습니다. (.xls 는 엑셀에서 .xlsx 로 저장한 뒤 올려 주세요)</p>
    <div class="dlg-btns"><button class="btn" value="x">닫기</button></div>`;
  $("#dlg").showModal();
};
$("#dlg").addEventListener("change", async e => {
  const f = e.target.files?.[0], k = e.target.dataset.tpl; if (!f || !k) return;
  busy(true, "양식 올리는 중…");
  try {
    const path = `templates/ilbo/${k}.xlsx`;
    const { error } = await sb.storage.from(BUCKET).upload(path, f, { upsert: true, contentType: f.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    if (error) throw error;
    S.settings.tpl = { ...(S.settings.tpl || {}), [k]: { path, name: f.name, date: new Date().toISOString() } };
    const r = await sb.from("ilbo_settings").upsert({ id: 1, data: S.settings, updated_at: new Date().toISOString() }); if (r.error) throw r.error;
    delete tplCache[k]; if (k === "edu") await loadEduDefaults();
    busy(false); $("#dlg").close(); toast("양식을 바꿨습니다.");
  } catch (er) { busy(false); toast("올리지 못했습니다: " + (er.message || er), 5000); }
});
async function loadEduDefaults() {
  try { const { readEduDefaults } = await import("./export.js"); S.eduDefaults = await readEduDefaults(await getTpl("edu")); } catch (e) { console.warn(e); S.eduDefaults = S.eduDefaults || {}; }
}

/* ================= 시작 ================= */
(async () => {
  try {
    await connect(); await loadAll();
    const last = S.days.at(-1);
    S.day = S.byDay.has(ymd(new Date())) || !last ? ymd(new Date()) : ymd(new Date());
    $("#d-day").value = S.day; drawDays(); draw();
    loadEduDefaults().then(() => { if (S.tab === "edu") drawTab(); });
  } catch (e) { console.error(e); $("#main").innerHTML = `<p class="pad">불러오지 못했습니다: ${esc(e.message || e)}</p>`; }
})();
