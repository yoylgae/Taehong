// 월간 위험성평가 — ① 위험성공종 세팅 ② 위험요인-대책 ③ 작업허가서(PTW) 연계
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";
import { grade, gradeCls, STD_WT1, DISASTER, RA_SRC, nk, actKey, riskKey, monthsOf, wt1Of } from "../ptw/ptw-data.js";
import { printRA } from "./print.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toast = (m, ms = 3000) => { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, ms); };
const clone = o => JSON.parse(JSON.stringify(o ?? null));
const ymNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const ymAdd = (ym, n) => { let y = +ym.slice(0, 4), m = +ym.slice(5) + n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${String(m).padStart(2, "0")}`; };
const ymLabel = ym => `${+ym.slice(0, 4)}년 ${+ym.slice(5)}월`;
const STATUS = ["작성중", "상신", "결재완료", "반려"];
const SIGN = [["sub", "협력사"], ["team", "수행담당"], ["health", "보건관리자"], ["safety", "안전관리자"], ["lead", "수행팀장(공구장)"]];

let sb;
const S = { months: [], ptws: [], cur: null, step: "rows", act: "", q: "" };
const cur = () => S.months.find(x => x.id === S.cur);
const D = () => cur()?.data;

async function connect() {
  let t = "";
  try { const r = await fetch("/__dbtoken", { cache: "no-store" }); if (r.ok) t = (await r.json()).t || ""; } catch {}
  sb = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { headers: { "x-pms-token": t } }, auth: { persistSession: false } });
}
const blank = (ym, company = "") => ({ ym, title: `${ymLabel(ym)} 위험성평가`, company, sign: Object.fromEntries(SIGN.map(([k]) => [k, { name: "", date: "" }])), tree: [], rows: [], files: { meeting: "", schedule: "" } });
function fix(d) { const b = blank(d.ym || ""); for (const k of Object.keys(b)) if (d[k] == null) d[k] = clone(b[k]); for (const [k] of SIGN) if (!d.sign[k]) d.sign[k] = { name: "", date: "" }; return d; }

/* ================= 불러오기 · 저장 ================= */
async function loadAll() {
  const [m, p] = await Promise.all([
    sb.from("ra_months").select("*").order("ym", { ascending: false }),
    sb.from("ptw_docs").select("id,start_date,end_date,status,ptw_no,data").order("start_date", { ascending: false }),
  ]);
  if (m.error) throw m.error;
  S.months = (m.data || []).map(x => ({ ...x, data: fix(x.data) }));
  S.ptws = p.data || [];
  fillLists();
}
function fillLists() {
  const w2 = new Set(), w3 = new Set(), ty = new Set(DISASTER), nm = new Set();
  for (const { data: d } of S.months) {
    for (const g of d.tree) for (const i of g.items) { w2.add(i.wt2); i.acts.forEach(a => w3.add(a)); }
    for (const r of d.rows) { r.type && ty.add(r.type); r.wt3 && w3.add(r.wt3); }
    for (const [k] of SIGN) d.sign[k]?.name && nm.add(d.sign[k].name);
  }
  for (const p of S.ptws) for (const r of p.data.perm || []) { r.wt2 && w2.add(r.wt2); r.wt3 && w3.add(r.wt3); }
  const put = (id, s) => $("#" + id).innerHTML = [...s].filter(Boolean).sort().map(v => `<option value="${esc(v)}">`).join("");
  put("dl-wt2", w2); put("dl-wt3", w3); put("dl-type", ty); put("dl-names", nm);
}
let saveT = null, pending = new Set();
function setSave(cls, t) { const el = $("#save"); el.className = "save " + (cls || ""); el.textContent = t; }
function touch(id = S.cur) { if (!id) return; pending.add(id); setSave("busy", "저장 중…"); clearTimeout(saveT); saveT = setTimeout(flush, 700); }
async function flush() {
  const ids = [...pending]; pending.clear();
  for (const id of ids) {
    const x = S.months.find(v => v.id === id); if (!x) continue;
    const { error } = await sb.from("ra_months").update({ ym: x.data.ym, status: x.status, data: x.data, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { pending.add(id); setSave("err", "저장 실패 — 다시 시도 중"); console.error(error); clearTimeout(saveT); saveT = setTimeout(flush, 4000); return; }
  }
  if (ids.length) { setSave("ok", "저장됨 ✓"); drawList(); }
}
addEventListener("beforeunload", e => { if (pending.size) { flush(); e.preventDefault(); e.returnValue = ""; } });

/* ================= 왼쪽 목록 ================= */
const stCls = s => "s" + Math.max(0, STATUS.indexOf(s));
function drawList() {
  let html = `<button type="button" class="btn primary new" id="new">+ 새 달 위험성평가</button>`;
  for (const x of S.months) {
    const d = x.data, acts = d.tree.reduce((s, g) => s + g.items.reduce((a, i) => a + i.acts.length, 0), 0);
    const pt = ptwsOf(d.ym).length;
    html += `<div class="pl ${x.id === S.cur ? "on" : ""}" data-id="${x.id}"><b>${ymLabel(d.ym)} <span class="st ${stCls(x.status)}">${esc(x.status)}</span></b>
      <small>위험요인 ${d.rows.length}건 · 작업활동 ${acts}개</small><small>작업허가서 ${pt}건 연계</small></div>`;
  }
  if (!S.months.length) html += `<p class="muted" style="padding:10px;font-size:13px">아직 위험성평가가 없습니다.</p>`;
  $("#list").innerHTML = html;
}
$("#list").addEventListener("click", e => {
  if (e.target.closest("#new")) return newMonth();
  const p = e.target.closest(".pl"); if (p) { S.cur = +p.dataset.id; S.act = ""; drawList(); draw(); }
});
async function newMonth() {
  const last = S.months[0];
  const ym = last ? ymAdd(last.data.ym, 1) : ymNow();
  const f = $("#dlg-f"), dlg = $("#dlg");
  f.innerHTML = `<h3>새 달 위험성평가</h3>
    <label class="fld" style="max-width:220px">평가년월<input type="month" id="nm-ym" value="${ym}"></label>
    ${last ? `<ul class="notes"><li><b>전월 이어서</b>: ${ymLabel(last.data.ym)}의 공종 세팅과 위험요인-대책을 그대로 가져옵니다 (구분은 '월간', 검토의견·결재일은 비움).</li><li><b>공종만</b>: 공종 세팅만 가져오고 위험요인은 '② 위험요인-대책'에서 작업활동별로 전월 것을 골라 넣습니다.</li></ul>` : ""}
    <div class="dlg-btns"><button value="" class="btn ghost">취소</button>${last ? `<button value="tree" class="btn">공종만</button><button value="copy" class="btn primary">📋 전월 이어서</button>` : `<button value="blank" class="btn primary">만들기</button>`}</div>`;
  dlg.returnValue = ""; dlg.showModal();
  dlg.onclose = async () => {
    const how = dlg.returnValue; if (!how) return;
    const y = $("#nm-ym").value; if (!y) return;
    if (S.months.some(x => x.data.ym === y)) return toast(`${ymLabel(y)} 위험성평가가 이미 있습니다.`);
    const d = blank(y, last?.data.company || "주식회사 지디건설");
    if (last) {
      d.tree = clone(last.data.tree);
      for (const [k] of SIGN) d.sign[k].name = last.data.sign[k]?.name || "";
      if (how === "copy") d.rows = last.data.rows.map(r => ({ ...clone(r), src: r.src === "최초" ? "최초" : "월간", comment: "" }));
    }
    const { data: r, error } = await sb.from("ra_months").insert({ ym: y, status: "작성중", data: d }).select().single();
    if (error) return toast("만들지 못했습니다: " + error.message);
    r.data = fix(r.data); S.months.push(r); S.months.sort((a, b) => b.data.ym.localeCompare(a.data.ym));
    S.cur = r.id; S.step = how === "tree" ? "setup" : "rows"; drawList(); draw(); toast(`${ymLabel(y)} 위험성평가를 만들었습니다.`);
  };
}

/* ================= 공통 ================= */
const ptwsOf = ym => S.ptws.filter(p => monthsOf(p.data.start || p.start_date, p.data.end || p.end_date).includes(ym));
const getP = (o, p) => p.split(".").reduce((a, k) => a?.[k], o);
function setP(o, p, v) { const ks = p.split("."); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[ks[i]]; } a[ks.at(-1)] = v; }
const inp = (p, o = {}) => {
  const v = getP(D(), p);
  if (o.ta) return `<textarea data-p="${p}" rows="${o.rows || 2}" class="ta">${esc(v ?? "")}</textarea>`;
  if (o.sel) return `<select data-p="${p}" ${o.num ? "data-num" : ""}>${o.sel.map(s => `<option ${String(s) === String(v ?? "") ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>`;
  return `<input data-p="${p}" ${o.type ? `type="${o.type}"` : ""} value="${esc(v ?? "")}" ${o.list ? `list="${o.list}"` : ""} ${o.ph ? `placeholder="${esc(o.ph)}"` : ""} class="${o.cls || ""}">`;
};
const actsOf = d => d.tree.flatMap(g => g.items.flatMap(i => i.acts.map(a => ({ wt1: g.wt1, wt2: i.wt2, wt3: a }))));
const countBy = d => { const m = new Map(); for (const r of d.rows) { const k = actKey(r.wt2, r.wt3); m.set(k, (m.get(k) || 0) + 1); } return m; };

/* ================= 본문 ================= */
function draw() {
  const x = cur(), main = $("#main");
  if (!x) { main.innerHTML = `<div class="empty"><h2>위험성평가를 고르거나 새로 만드세요</h2><div class="acts"><button type="button" class="btn primary" id="mk">+ 새 달 위험성평가</button></div></div>`; $("#mk").onclick = newMonth; return; }
  const d = x.data, np = ptwsOf(d.ym).length;
  main.innerHTML = `<div class="hd"><h2>${esc(d.title || ymLabel(d.ym) + " 위험성평가")}</h2><span class="sp"></span>
    <label class="fld" style="flex-direction:row;align-items:center;gap:6px">상태 <select id="status">${STATUS.map(s => `<option ${s === x.status ? "selected" : ""}>${s}</option>`).join("")}</select></label>
    <button type="button" class="btn sm ghost danger" id="del">삭제</button></div>
  <div class="card"><div class="row-g">
    <label class="fld">협력업체${inp("company")}</label><label class="fld">평가년월<input value="${esc(d.ym)}" disabled></label>
    <label class="fld">구분(제목)${inp("title")}</label><label class="fld">회의록 파일명${inp("files.meeting", { ph: "예: 26.10월 위험성평가 회의록.pdf" })}</label><label class="fld">공정표 파일명${inp("files.schedule", { ph: "예: 26년 10월 월간 공정표.xlsx" })}</label></div>
    <h3 style="margin-top:14px">결재 <small>이름 / 결재일</small></h3>
    <div class="sign5">${SIGN.map(([k, n]) => `<label><span>${n}</span>${inp(`sign.${k}.name`, { list: "dl-names" })}${inp(`sign.${k}.date`, { type: "date" })}</label>`).join("")}</div></div>
  <div class="steps">${[["setup", "① 위험성공종 세팅", `${actsOf(d).length}개`], ["rows", "② 위험요인-대책", `${d.rows.length}건`], ["ptw", "③ 작업허가서 연계", `${np}건`]].map(([k, n, c]) => `<button type="button" data-step="${k}" class="${S.step === k ? "on" : ""}">${n}<small>${c}</small></button>`).join("")}</div>
  <div id="step"></div>`;
  drawStep();
}
function drawStep() { const el = $("#step"); if (!el) return; el.innerHTML = { setup: rSetup, rows: rRows, ptw: rPtw }[S.step](); refresh(); }
function redrawKeep() { const m = $("#main"), y = m.scrollTop, f = document.activeElement?.dataset?.p; draw(); m.scrollTop = y; if (f) $(`[data-p="${f}"]`)?.focus(); }
function refresh() { const d = D(); if (!d) return; d.rows.forEach((r, i) => { const el = $(`[data-c="g${i}"]`); if (el) { const g = grade(r.freq, r.sev); el.innerHTML = g ? `<span class="grade ${gradeCls(g)}">${g}</span>` : ""; } }); }

/* ---------- ① 공종 세팅 ---------- */
function rSetup() {
  const d = D(), have = new Set(d.tree.map(g => g.wt1)), cnt = countBy(d), prev = S.months.find(x => x.data.ym < d.ym);
  const prevActs = new Set(prev ? actsOf(prev.data).map(a => a.wt1) : []), firstActs = new Set(S.months.filter(x => x.data.ym < d.ym).flatMap(x => x.data.tree.map(g => g.wt1)));
  const ptwActs = new Set(ptwsOf(d.ym).flatMap(p => (p.data.perm || []).map(r => actKey(r.wt2, r.wt3))));
  return `<div class="setup">
  <div class="card"><h3>현대건설 표준 위험성공종</h3><input id="std-q" placeholder="공종 검색" style="width:100%;margin-bottom:8px" value="${esc(S.q)}">
    <div class="std">${STD_WT1.filter(n => !S.q || n.includes(S.q)).map(n => `<div class="it ${have.has(n) ? "in" : ""}" data-std="${esc(n)}">${have.has(n) ? "✔" : "＋"} ${esc(n)}<small>${firstActs.has(n) ? "기작성" : ""}${prevActs.has(n) ? " · 전월" : ""}</small></div>`).join("")}</div>
    <p class="help">누르면 오른쪽 공종관리에 넣거나 뺍니다. 표에 없는 공종은 오른쪽 아래에서 직접 추가.</p></div>
  <div class="card tree"><h3>공종관리 (작업공종 - 세부공종 - 작업활동) <small>칩 숫자 = 위험요인 수, 분홍 = 이번 달 작업허가서에 있는 작업활동</small></h3>
    ${d.tree.map((g, gi) => `<div class="g1"><header>${esc(g.wt1)}<span class="grow"></span>
      <button type="button" class="btn sm ghost" data-g-up="${gi}" title="위로">↑</button><button type="button" class="btn sm ghost danger" data-g-del="${gi}">공종 빼기</button></header>
      ${g.items.map((it, ii) => `<div class="g2"><input class="w2" data-p="tree.${gi}.items.${ii}.wt2" value="${esc(it.wt2)}" list="dl-wt2" placeholder="세부공종">
        <div class="chips">${it.acts.map((a, ai) => `<span class="chip ${ptwActs.has(actKey(it.wt2, a)) ? "ptw" : ""}">${esc(a)}<b>${cnt.get(actKey(it.wt2, a)) || 0}</b><button type="button" data-a-del="${gi}.${ii}.${ai}" title="빼기">✕</button></span>`).join("")}
          <input data-a-add="${gi}.${ii}" placeholder="+ 작업활동 (Enter)" list="dl-wt3"></div>
        <button type="button" class="btn sm ghost" data-i-del="${gi}.${ii}" title="세부공종 빼기">✕</button></div>`).join("")}
      <div class="g2"><input data-i-add="${gi}" placeholder="+ 세부공종 (Enter)" list="dl-wt2"><span></span><span></span></div></div>`).join("") || `<p class="muted">왼쪽에서 작업공종을 고르세요.</p>`}
    <div class="acts"><input id="wt1-add" placeholder="표에 없는 작업공종 직접 추가 (Enter)" style="min-width:260px"></div></div></div>`;
}
/* ---------- ② 위험요인-대책 ---------- */
function rRows() {
  const d = D(), cnt = countBy(d), acts = actsOf(d), inTree = new Set(acts.map(a => actKey(a.wt2, a.wt3)));
  const orphan = d.rows.map((r, i) => [r, i]).filter(([r]) => !inTree.has(actKey(r.wt2, r.wt3)));
  const sel = S.act;
  const show = acts.filter(a => !sel || actKey(a.wt2, a.wt3) === sel);
  const nav = d.tree.map(g => `<h5>${esc(g.wt1)}</h5>${g.items.map(i => `<div class="w2">${esc(i.wt2)}</div>${i.acts.map(a => { const k = actKey(i.wt2, a), n = cnt.get(k) || 0; return `<a data-act="${esc(k)}" class="${sel === k ? "on" : ""} ${n ? "" : "z"}">${esc(a)}<i>${n}</i></a>`; }).join("")}`).join("")}`).join("");
  const grpHtml = (a, list) => `<div class="grp"><h4>${esc(a.wt1)} › ${esc(a.wt2)} › ${esc(a.wt3)} <small>${list.length}건</small><span class="grow"></span>
      <button type="button" class="btn sm ghost" data-prev="${esc(actKey(a.wt2, a.wt3))}" title="전월·다른 달 위험성평가에서 이 작업활동의 위험요인 가져오기">📚 이전 달에서</button>
      <button type="button" class="btn sm" data-add-row="${esc(JSON.stringify([a.wt1, a.wt2, a.wt3]))}">+ 위험요인</button></h4>
    <div class="tbw">${list.length ? table(list) : `<p class="muted" style="padding:10px 12px;margin:0">위험요인이 없습니다.</p>`}</div></div>`;
  return `<div class="ra2"><div class="card nav2"><a data-act="" class="${sel ? "" : "on"}">전체 보기<i>${d.rows.length}</i></a>${nav}${orphan.length ? `<h5>공종 세팅에 없음</h5><a data-act="__orphan" class="${sel === "__orphan" ? "on" : ""}">작업활동 미지정 등<i>${orphan.length}</i></a>` : ""}</div>
  <div>${acts.length ? "" : `<div class="warn">먼저 ① 위험성공종 세팅에서 작업활동을 고르세요.</div>`}
    ${sel === "__orphan" ? "" : show.map(a => grpHtml(a, d.rows.map((r, i) => [r, i]).filter(([r]) => actKey(r.wt2, r.wt3) === actKey(a.wt2, a.wt3)))).join("")}
    ${orphan.length && (!sel || sel === "__orphan") ? `<div class="grp orphan"><h4>공종 세팅에 없는 작업활동 <small>${orphan.length}건 — 세부공종·작업활동을 고치거나 ①에 작업활동을 추가하세요</small><span class="grow"></span><button type="button" class="btn sm" id="orphan-fix">①에 작업활동 모두 추가</button></h4><div class="tbw">${table(orphan, true)}</div></div>` : ""}
    <p class="help">[등급 기준] 빈도 × 강도 → 1 하(F) · 2 중(E) · 3 중(D) · 4 상(C) · 6 상(B) · 9 상(A)</p></div></div>`;
}
function table(list, showAct) {
  return `<table class="tb tw"><thead><tr><th></th>${showAct ? "<th>세부공종</th><th>작업활동</th>" : ""}<th>구분</th><th>위험요인</th><th>재해유형</th><th>빈도</th><th>강도</th><th>평가등급</th><th>개선대책</th><th>재평가등급</th><th>검토의견</th><th></th></tr></thead><tbody>
  ${list.map(([r, i], n) => `<tr><td class="n">${n + 1}</td>${showAct ? `<td style="width:110px">${inp(`rows.${i}.wt2`, { list: "dl-wt2" })}</td><td style="width:130px">${inp(`rows.${i}.wt3`, { list: "dl-wt3" })}</td>` : ""}
    <td style="width:80px">${inp(`rows.${i}.src`, { sel: RA_SRC.includes(r.src) ? RA_SRC : [...RA_SRC, r.src] })}</td><td style="min-width:220px">${inp(`rows.${i}.factor`, { ta: 1, rows: 3 })}</td>
    <td style="width:120px">${inp(`rows.${i}.type`, { list: "dl-type" })}</td><td style="width:52px">${inp(`rows.${i}.freq`, { sel: [1, 2, 3], num: 1 })}</td><td style="width:52px">${inp(`rows.${i}.sev`, { sel: [1, 2, 3], num: 1 })}</td>
    <td style="width:62px" data-c="g${i}"></td><td style="min-width:240px">${inp(`rows.${i}.measure`, { ta: 1, rows: 3 })}</td><td style="width:76px">${inp(`rows.${i}.re`, { sel: ["하(F)", "중(E)", "중(D)", "상(C)", "상(B)", "상(A)"] })}</td>
    <td style="min-width:120px">${inp(`rows.${i}.comment`, { ta: 1 })}</td><td class="x"><button type="button" data-row-dup="${i}" title="아래에 복사">⧉</button><button type="button" data-row-del="${i}" title="지우기">✕</button></td></tr>`).join("")}</tbody></table>`;
}
/* ---------- ③ 작업허가서 연계 ---------- */
function linkInfo(d) {
  const ptws = ptwsOf(d.ym), inTree = new Set(actsOf(d).map(a => actKey(a.wt2, a.wt3))), cnt = countBy(d), have = new Set(d.rows.map(riskKey));
  const acts = new Map(), newRisks = [];
  for (const p of ptws) {
    for (const r of p.data.perm || []) { if (!r.wt3) continue; const k = actKey(r.wt2, r.wt3); if (!acts.has(k)) acts.set(k, { wt2: r.wt2, wt3: r.wt3, wt1: wt1Of(d.tree, r.wt2) || (p.data.gongjong || []).find(g => nk(g.wt2) === nk(r.wt2))?.wt1 || "", ptws: [] }); acts.get(k).ptws.push(p); }
    for (const r of p.data.risks || []) { const k = riskKey(r); if (!have.has(k) && r.factor && !newRisks.some(x => x.k === k)) newRisks.push({ k, r, p }); }
  }
  return { ptws, acts: [...acts.values()].map(a => ({ ...a, inTree: inTree.has(actKey(a.wt2, a.wt3)), n: cnt.get(actKey(a.wt2, a.wt3)) || 0 })), newRisks };
}
const md = s => s ? `${+s.slice(5, 7)}.${+s.slice(8)}` : "";
function rPtw() {
  const d = D(), { ptws, acts, newRisks } = linkInfo(d), miss = acts.filter(a => !a.inTree), zero = acts.filter(a => a.n === 0);
  return `<div class="card"><h3>이번 달 작업허가서 <small>허가기간이 ${ymLabel(d.ym)}에 걸친 허가서</small></h3>
    ${ptws.length ? `<table class="tb"><thead><tr><th>허가기간</th><th>PTW 번호</th><th>상태</th><th>허가 작업</th><th>위험성평가</th><th></th></tr></thead><tbody>
      ${ptws.map(p => `<tr><td>${md(p.data.start)} ~ ${md(p.data.end)}</td><td>${esc(p.data.ptwNo || "-")}</td><td><span class="st ${stCls(p.status)}">${esc(p.status)}</span></td><td>${(p.data.perm || []).length}건</td><td>${(p.data.risks || []).length}건</td>
        <td><button type="button" class="btn sm" data-open-ptw="${p.id}">허가서 열기 ↗</button></td></tr>`).join("")}</tbody></table>` : `<p class="muted">이 달에 걸친 작업허가서가 없습니다.</p>`}</div>
  <div class="card"><h3>허가 작업 ↔ 위험성평가 공종 <small>작업허가서의 작업활동이 이 달 위험성평가에 들어 있는지</small><span class="grow"></span>
      ${miss.length ? `<button type="button" class="btn sm primary" id="add-miss">빠진 작업활동 ${miss.length}개 ①에 추가</button>` : ""}</h3>
    ${acts.length ? `<table class="tb lk"><thead><tr><th>작업공종</th><th>세부공종</th><th>작업활동</th><th>쓰는 허가서</th><th>공종 세팅</th><th>위험요인</th></tr></thead><tbody>
      ${acts.map(a => `<tr><td>${esc(a.wt1 || "?")}</td><td>${esc(a.wt2)}</td><td>${esc(a.wt3)}</td><td>${a.ptws.map(p => md(p.data.start) + "~" + md(p.data.end)).join(", ")}</td>
        <td>${a.inTree ? `<span class="ok">있음</span>` : `<span class="no">없음</span>`}</td><td>${a.n ? `${a.n}건` : `<span class="no">0건</span>`}</td></tr>`).join("")}</tbody></table>
      ${zero.length ? `<p class="help" style="color:#b45309">위험요인 0건인 작업활동 ${zero.length}개 — ②에서 위험요인을 넣거나, 아래 '작업허가서 위험요인'을 가져오세요.</p>` : ""}` : `<p class="muted">작업허가서에 허가 작업이 없습니다.</p>`}</div>
  <div class="card"><h3>작업허가서 위험요인 → 위험성평가 <small>허가서에만 있고 이 달 위험성평가에 없는 위험요인 (구분 'PTW'로 들어갑니다)</small><span class="grow"></span>
      ${newRisks.length ? `<button type="button" class="btn sm" id="nr-all">모두 선택</button><button type="button" class="btn sm primary" id="nr-add">선택한 위험요인 넣기</button>` : ""}</h3>
    ${newRisks.length ? `<div class="pick">${newRisks.map(({ r, p }, i) => { const g = grade(r.freq, r.sev); return `<label><input type="checkbox" value="${i}" ${r.src === "현장입력" ? "checked" : ""}><span class="gr"><span class="grade ${gradeCls(g)}">${g}</span></span>
      <span><b>${esc(r.wt2)} › ${esc(r.wt3)}</b> · ${esc(r.type)} <small>(${md(p.data.start)}~${md(p.data.end)} 허가서, ${esc(r.src)})</small><br>${esc(r.factor)}<br><small>대책: ${esc(r.measure)}</small></span></label>`; }).join("")}</div>
      <p class="help">'현장입력'(허가서에서 새로 쓴 것)은 미리 체크해 두었습니다.</p>` : `<p class="muted">허가서의 위험요인이 모두 위험성평가에 들어 있습니다. ✓</p>`}</div>`;
}

/* ================= 입력 · 버튼 ================= */
$("#main").addEventListener("input", e => {
  const el = e.target, d = D(); if (!d) return;
  if (el.id === "std-q") { S.q = el.value.trim(); const y = $("#main").scrollTop; drawStep(); $("#std-q").focus(); $("#std-q").setSelectionRange(99, 99); $("#main").scrollTop = y; return; }
  if (!el.dataset.p) return;
  let v = el.value; if (el.hasAttribute("data-num")) v = v === "" ? null : Number(v);
  const p = el.dataset.p;
  // 세부공종 이름을 바꾸면 그 아래 위험요인도 같이
  const m = p.match(/^tree\.(\d+)\.items\.(\d+)\.wt2$/);
  if (m) { const old = d.tree[+m[1]].items[+m[2]].wt2; for (const r of d.rows) if (nk(r.wt2) === nk(old) && nk(r.wt1 || d.tree[+m[1]].wt1) === nk(d.tree[+m[1]].wt1)) r.wt2 = v; }
  setP(d, p, v); refresh(); touch();
});
$("#main").addEventListener("change", e => {
  if (e.target.id === "status") { cur().status = e.target.value; touch(); drawList(); }
  if (e.target.dataset.p === "title") draw();
});
$("#main").addEventListener("keydown", e => {
  if (e.key !== "Enter" || e.isComposing) return;
  const el = e.target, d = D(), v = el.value.trim(); if (!v) return;
  if (el.dataset.aAdd != null) { const [gi, ii] = el.dataset.aAdd.split(".").map(Number); const it = d.tree[gi].items[ii]; if (!it.acts.some(a => nk(a) === nk(v))) it.acts.push(v); }
  else if (el.dataset.iAdd != null) { const g = d.tree[+el.dataset.iAdd]; if (!g.items.some(i => nk(i.wt2) === nk(v))) g.items.push({ wt2: v, acts: [] }); }
  else if (el.id === "wt1-add") { if (!d.tree.some(g => nk(g.wt1) === nk(v))) d.tree.push({ wt1: v, items: [] }); }
  else return;
  e.preventDefault(); touch(); const keep = el.dataset.aAdd ? `[data-a-add="${el.dataset.aAdd}"]` : el.dataset.iAdd ? `[data-i-add="${el.dataset.iAdd}"]` : "#wt1-add"; const y = $("#main").scrollTop; draw(); $("#main").scrollTop = y; $(keep)?.focus();
});
$("#main").addEventListener("click", async e => {
  const d = D(); const c = sel => e.target.closest(sel);
  let t;
  if ((t = c("[data-step]"))) { S.step = t.dataset.step; draw(); return; }
  if ((t = c("[data-std]"))) { const n = t.dataset.std, i = d.tree.findIndex(g => g.wt1 === n); if (i >= 0) { if (d.tree[i].items.some(x => x.acts.length) && !confirm(`${n} 공종을 뺄까요? (위험요인은 지우지 않습니다)`)) return; d.tree.splice(i, 1); } else d.tree.push({ wt1: n, items: [] }); touch(); redrawKeep(); return; }
  if ((t = c("[data-g-del]"))) { const g = d.tree[+t.dataset.gDel]; if (!confirm(`${g.wt1} 공종을 뺄까요? (위험요인은 지우지 않습니다)`)) return; d.tree.splice(+t.dataset.gDel, 1); touch(); redrawKeep(); return; }
  if ((t = c("[data-g-up]"))) { const i = +t.dataset.gUp; if (i > 0) { [d.tree[i - 1], d.tree[i]] = [d.tree[i], d.tree[i - 1]]; touch(); redrawKeep(); } return; }
  if ((t = c("[data-i-del]"))) { const [gi, ii] = t.dataset.iDel.split(".").map(Number); d.tree[gi].items.splice(ii, 1); touch(); redrawKeep(); return; }
  if ((t = c("[data-a-del]"))) { const [gi, ii, ai] = t.dataset.aDel.split(".").map(Number); d.tree[gi].items[ii].acts.splice(ai, 1); touch(); redrawKeep(); return; }
  if ((t = c("[data-act]"))) { S.act = t.dataset.act; drawStep(); $("#main").scrollTop = 0; return; }
  if ((t = c("[data-add-row]"))) { const [wt1, wt2, wt3] = JSON.parse(t.dataset.addRow); d.rows.push({ wt1, wt2, wt3, src: "월간", factor: "", type: "", freq: 1, sev: 2, measure: "", re: "하(F)", comment: "" }); touch(); redrawKeep(); return; }
  if ((t = c("[data-row-del]"))) { if (!confirm("이 위험요인을 지울까요?")) return; d.rows.splice(+t.dataset.rowDel, 1); touch(); redrawKeep(); return; }
  if ((t = c("[data-row-dup]"))) { const i = +t.dataset.rowDup; d.rows.splice(i + 1, 0, { ...clone(d.rows[i]), comment: "" }); touch(); redrawKeep(); return; }
  if ((t = c("[data-prev]"))) return pickPrev(t.dataset.prev);
  if (c("#orphan-fix")) { for (const r of d.rows) addAct(d, r.wt1 || wt1Of(d.tree, r.wt2) || "기타 공종", r.wt2, r.wt3); touch(); redrawKeep(); toast("공종 세팅에 작업활동을 추가했습니다."); return; }
  if (c("#add-miss")) { const { acts } = linkInfo(d); let n = 0; for (const a of acts) if (!a.inTree && addAct(d, a.wt1 || "공통공사", a.wt2, a.wt3)) n++; touch(); redrawKeep(); toast(`작업활동 ${n}개를 ① 공종 세팅에 넣었습니다.`); return; }
  if (c("#nr-all")) { $$(".pick input").forEach(x => x.checked = true); return; }
  if (c("#nr-add")) {
    const { newRisks } = linkInfo(d), sel = $$(".pick input:checked").map(x => newRisks[+x.value]); if (!sel.length) return toast("고른 위험요인이 없습니다.");
    for (const { r, p } of sel) { const wt1 = wt1Of(d.tree, r.wt2) || (p.data.gongjong || []).find(g => nk(g.wt2) === nk(r.wt2))?.wt1 || "공통공사"; addAct(d, wt1, r.wt2, r.wt3); d.rows.push({ wt1, wt2: r.wt2, wt3: r.wt3, src: "PTW", factor: r.factor, type: r.type, freq: r.freq, sev: r.sev, measure: r.measure, re: r.re || "하(F)", comment: "" }); }
    touch(); redrawKeep(); toast(`위험요인 ${sel.length}건을 넣었습니다 (구분 PTW).`); return;
  }
  if ((t = c("[data-open-ptw]"))) { const h = `#id=${t.dataset.openPtw}`; if (parent !== window) parent.postMessage({ pms: "open", id: "ptw", hash: h }, location.origin); else location.href = `../ptw/${h}`; return; }
  if (c("#del")) {
    if (!confirm(`${ymLabel(d.ym)} 위험성평가를 지울까요? (되돌릴 수 없습니다)`)) return;
    const { error } = await sb.from("ra_months").delete().eq("id", S.cur); if (error) return toast("지우지 못했습니다: " + error.message);
    pending.delete(S.cur); S.months = S.months.filter(x => x.id !== S.cur); S.cur = S.months[0]?.id ?? null; drawList(); draw(); toast("지웠습니다.");
  }
});
function addAct(d, wt1, wt2, wt3) {
  if (!wt2 || !wt3) return false;
  let g = d.tree.find(x => x.items.some(i => nk(i.wt2) === nk(wt2))) || d.tree.find(x => nk(x.wt1) === nk(wt1));
  if (!g) { g = { wt1, items: [] }; d.tree.push(g); }
  let it = g.items.find(i => nk(i.wt2) === nk(wt2)); if (!it) { it = { wt2, acts: [] }; g.items.push(it); }
  if (it.acts.some(a => nk(a) === nk(wt3))) return false;
  it.acts.push(wt3); return true;
}
// 다른 달에서 같은 작업활동의 위험요인 가져오기
function pickPrev(k) {
  const d = D(), have = new Set(d.rows.map(riskKey)), list = [];
  for (const x of S.months) { if (x.id === S.cur) continue; for (const r of x.data.rows) if (actKey(r.wt2, r.wt3) === k && !have.has(riskKey(r)) && !list.some(v => riskKey(v.r) === riskKey(r))) list.push({ r, ym: x.data.ym }); }
  const f = $("#dlg-f"), dlg = $("#dlg");
  f.innerHTML = `<h3>이전 달 위험성평가에서 가져오기</h3>${list.length ? `<div class="pick">${list.map(({ r, ym }, i) => { const g = grade(r.freq, r.sev); return `<label><input type="checkbox" value="${i}" checked><span class="gr"><span class="grade ${gradeCls(g)}">${g}</span></span><span>${esc(r.factor)} <small>(${ymLabel(ym)}, ${esc(r.type)})</small><br><small>대책: ${esc(r.measure)}</small></span></label>`; }).join("")}</div>`
    : `<p class="muted">다른 달에 이 작업활동의 새 위험요인이 없습니다.</p>`}<div class="dlg-btns"><button value="" class="btn ghost">닫기</button>${list.length ? `<button value="ok" class="btn primary">넣기</button>` : ""}</div>`;
  dlg.returnValue = ""; dlg.showModal();
  dlg.onclose = () => { if (dlg.returnValue !== "ok") return; const sel = $$(".pick input:checked", f).map(x => list[+x.value].r); for (const r of sel) d.rows.push({ ...clone(r), src: "월간", comment: "" }); if (sel.length) { touch(); redrawKeep(); toast(`${sel.length}건을 넣었습니다.`); } };
}

$("#print").onclick = async () => {
  const x = cur(); if (!x) return toast("위험성평가를 먼저 고르세요."); await flush();
  const w = window.open("", "_blank"); if (!w) return toast("팝업이 막혔습니다. 팝업을 허용해 주세요.");
  w.document.open(); w.document.write(printRA(x.data, x.status)); w.document.close();
};

(async () => {
  try {
    await connect(); await loadAll();
    const prm = () => new URLSearchParams(location.hash.slice(1) || location.search.slice(1)), want = () => prm().get("ym");
    const q = want(); S.cur = (q && S.months.find(x => x.data.ym === q)?.id) ?? S.months[0]?.id ?? null;
    if (["setup", "rows", "ptw"].includes(prm().get("step"))) S.step = prm().get("step");
    drawList(); draw();
    addEventListener("hashchange", async () => { const y = want(); await flush(); await loadAll(); const m = S.months.find(x => x.data.ym === y); if (m) { S.cur = m.id; S.step = "ptw"; } drawList(); draw(); });
  } catch (e) { console.error(e); $("#main").innerHTML = `<div class="empty"><h2>불러오지 못했습니다</h2><p>${esc(e.message || e)}</p></div>`; }
})();
