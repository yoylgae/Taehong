// 작업허가서(PTW) — 작업허가서 · 화학물질 사용계획서 · 화기작업 계획서 · 중량물 취급계획서 · 안전시설물 임시 해체/복구 계획서
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";
import { PPE, FIRE_CHECKS, grade, gradeCls, blankDoc, TABS } from "./ptw-data.js";
import { printPTW } from "./print.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toast = (m, ms = 2800) => { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, ms); };
const ymd = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDay = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
const WD = "일월화수목금토", wd = s => new Date(s + "T00:00:00").getDay();
const clone = o => JSON.parse(JSON.stringify(o ?? null));
const STATUS = ["작성중", "상신", "결재완료", "반려"];

let sb;
const S = { docs: [], cur: null, tab: "ptw" };
const cur = () => S.docs.find(x => x.id === S.cur);
const D = () => cur()?.data;

async function connect() {
  let t = "";
  try { const r = await fetch("/__dbtoken", { cache: "no-store" }); if (r.ok) t = (await r.json()).t || ""; } catch {}
  sb = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { headers: { "x-pms-token": t } }, auth: { persistSession: false } });
}

/* ================= 불러오기 · 저장 ================= */
async function loadAll() {
  const { data, error } = await sb.from("ptw_docs").select("*").order("start_date", { ascending: false }).order("id", { ascending: false });
  if (error) throw error;
  S.docs = (data || []).map(x => ({ ...x, data: fixDoc(x.data) }));
  fillLists();
}
// 빠진 칸 채우기 (예전 자료·새 칸 대비)
function fixDoc(d) {
  const b = blankDoc();
  for (const k of Object.keys(b)) if (d[k] == null) d[k] = clone(b[k]);
  for (const k of ["chem", "fire", "heavy", "sfac"]) for (const kk of Object.keys(b[k])) if (d[k][kk] == null) d[k][kk] = clone(b[k][kk]);
  for (const k of Object.keys(b.reviews)) if (!d.reviews[k]) d.reviews[k] = [];
  return d;
}
function fillLists() {
  const sets = { wt1: new Set(), wt2: new Set(), wt3: new Set(), eq: new Set(), size: new Set(), type: new Set(["추락", "낙하/비래", "협착", "충돌", "붕괴/도괴", "전도", "감전", "화재/폭발", "절단/베임", "업무상질병", "기타"]), names: new Set() };
  for (const { data: d } of S.docs) {
    for (const g of d.gongjong || []) { g.wt1 && sets.wt1.add(g.wt1); g.wt2 && sets.wt2.add(g.wt2); for (const n of String(g.leader || "").split(/[,\s]+/)) n && sets.names.add(n); }
    for (const p of d.perm || []) { p.wt2 && sets.wt2.add(p.wt2); p.wt3 && sets.wt3.add(p.wt3); p.eq && sets.eq.add(p.eq); p.size && sets.size.add(p.size); }
    for (const r of d.risks || []) { r.type && sets.type.add(r.type); r.wt3 && sets.wt3.add(r.wt3); }
    for (const k of Object.keys(d.sign || {})) d.sign[k] && sets.names.add(d.sign[k]);
  }
  for (const [k, s] of Object.entries(sets)) $("#dl-" + k).innerHTML = [...s].sort().map(v => `<option value="${esc(v)}">`).join("");
}
let saveT = null, pending = new Set();
function setSave(cls, t) { const el = $("#save"); el.className = "save " + (cls || ""); el.textContent = t; }
function touch() { const x = cur(); if (!x) return; pending.add(x.id); setSave("busy", "저장 중…"); clearTimeout(saveT); saveT = setTimeout(flush, 700); }
async function flush() {
  const ids = [...pending]; pending.clear(); if (!ids.length) return;
  for (const id of ids) {
    const x = S.docs.find(d => d.id === id); if (!x) continue; const d = x.data;
    const row = { ptw_no: d.ptwNo || null, start_date: d.start || null, end_date: d.end || null, status: x.status, data: d, updated_at: new Date().toISOString() };
    const { error } = await sb.from("ptw_docs").update(row).eq("id", id);
    if (error) { pending.add(id); setSave("err", "저장 실패 — 다시 시도 중"); console.error(error); clearTimeout(saveT); saveT = setTimeout(flush, 4000); return; }
  }
  setSave("ok", "저장됨 ✓"); drawList();
}
addEventListener("beforeunload", e => { if (pending.size) { flush(); e.preventDefault(); e.returnValue = ""; } });

/* ================= 왼쪽 목록 ================= */
const stCls = s => "s" + Math.max(0, STATUS.indexOf(s));
const md = s => s ? `${+s.slice(5, 7)}.${+s.slice(8)}` : "?";
function drawList() {
  let html = `<button type="button" class="btn primary new" id="new">+ 새 작업허가서</button>`, ym = "";
  for (const x of S.docs) {
    const d = x.data, m = (d.start || "").slice(0, 7);
    if (m !== ym) { ym = m; html += `<h4>${m ? `${+m.slice(0, 4)}년 ${+m.slice(5)}월` : "날짜 없음"}</h4>`; }
    const gj = [...new Set((d.gongjong || []).map(g => g.wt2).filter(Boolean))];
    html += `<div class="pl ${x.id === S.cur ? "on" : ""}" data-id="${x.id}"><b>${md(d.start)} ~ ${md(d.end)} <span class="st ${stCls(x.status)}">${esc(x.status)}</span></b>
      <small>${esc(d.ptwNo || "번호 없음")} · 위험성평가 ${(d.risks || []).length}건</small><small>${esc(gj.slice(0, 3).join(", ") || "공종 없음")}</small></div>`;
  }
  if (!S.docs.length) html += `<p class="muted" style="padding:10px;font-size:13px">아직 작업허가서가 없습니다.</p>`;
  $("#list").innerHTML = html;
}
$("#list").addEventListener("click", e => {
  if (e.target.closest("#new")) return newDoc();
  const p = e.target.closest(".pl"); if (p) { S.cur = +p.dataset.id; drawList(); draw(); }
});
// 새 허가서: 가장 최근 허가서를 이어서 (기간은 바로 다음 7일, 결재의견·상태는 비움)
function nextFrom(src) {
  const d = clone(src);
  d.start = src.end ? addDay(src.end, 1) : ymd(new Date()); d.end = addDay(d.start, 6);
  d.created = ymd(new Date()); d.ptwNo = "";
  for (const g of d.gongjong) g.days = [false, false, false, false, false, false, false];
  const clearRv = o => { for (const k of Object.keys(o)) o[k] = []; };
  clearRv(d.reviews); for (const k of ["chem", "fire", "heavy", "sfac"]) clearRv(d[k].reviews);
  return d;
}
async function newDoc(fromId) {
  const src = fromId ? S.docs.find(x => x.id === fromId) : S.docs.slice().sort((a, b) => (b.data.end || "").localeCompare(a.data.end || ""))[0];
  let d;
  if (src) {
    const how = fromId ? "copy" : await ask(src);
    if (!how) return;
    d = how === "blank" ? Object.assign(blankDoc(), { company: src.data.company, gongu: src.data.gongu, place: src.data.place, writer: src.data.writer, sign: clone(src.data.sign) }) : nextFrom(src.data);
    if (how === "blank") { d.start = src.data.end ? addDay(src.data.end, 1) : ymd(new Date()); d.end = addDay(d.start, 6); }
  } else { d = blankDoc(); d.start = ymd(new Date()); d.end = addDay(d.start, 6); }
  const { data: r, error } = await sb.from("ptw_docs").insert({ ptw_no: null, start_date: d.start, end_date: d.end, status: "작성중", data: d }).select().single();
  if (error) return toast("만들지 못했습니다: " + error.message);
  r.data = fixDoc(r.data); S.docs.unshift(r); S.docs.sort((a, b) => (b.data.start || "").localeCompare(a.data.start || "") || b.id - a.id);
  S.cur = r.id; S.tab = "ptw"; drawList(); draw(); toast(`${d.start} ~ ${d.end} 작업허가서를 만들었습니다.`);
}
function ask(src) {
  return new Promise(res => {
    const f = $("#dlg-f"), dlg = $("#dlg");
    f.innerHTML = `<h3>새 작업허가서</h3>
      <p style="margin:0 0 10px">가장 최근 허가서 <b>${esc(src.data.start)} ~ ${esc(src.data.end)}</b>를 바탕으로 만들 수 있습니다.</p>
      <ul class="notes"><li><b>이어서 만들기</b>: 공종·허가작업·장비·보호구·위험성평가를 그대로 가져오고, 허가기간은 다음 7일(${esc(addDay(src.data.end || ymd(new Date()), 1))}~)로 맞춥니다. 결재의견·작업일 체크는 비웁니다.</li>
      <li><b>빈 허가서</b>: 업체명·작업장소·작성자·결재자만 가져옵니다.</li></ul>
      <div class="dlg-btns"><button value="" class="btn ghost">취소</button><button value="blank" class="btn">빈 허가서</button><button value="copy" class="btn primary">📋 이어서 만들기</button></div>`;
    dlg.onclose = () => res(dlg.returnValue || null); dlg.returnValue = ""; dlg.showModal();
  });
}

/* ================= 본문 ================= */
const getP = (o, p) => p.split(".").reduce((a, k) => a?.[k], o);
function setP(o, p, v) { const ks = p.split("."); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[ks[i]]; } a[ks.at(-1)] = v; }
const inp = (p, o = {}) => {
  const v = getP(D(), p);
  if (o.ta) return `<textarea data-p="${p}" rows="${o.rows || 2}" class="ta" ${o.ph ? `placeholder="${esc(o.ph)}"` : ""}>${esc(v ?? "")}</textarea>`;
  if (o.sel) return `<select data-p="${p}" ${o.num ? "data-num" : ""}>${o.sel.map(s => `<option ${String(s) === String(v ?? "") ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>`;
  if (o.cb) return `<input type="checkbox" data-p="${p}" ${v ? "checked" : ""}>`;
  return `<input data-p="${p}" ${o.num ? 'data-num inputmode="numeric"' : ""} ${o.type ? `type="${o.type}"` : ""} value="${esc(v ?? "")}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ""} ${o.list ? `list="${o.list}"` : ""} class="${o.cls || ""}">`;
};
const del = (path, i) => `<td class="x"><button type="button" data-mv="${path}" data-i="${i}" title="위로">↑</button><button type="button" data-del="${path}" data-i="${i}" title="이 줄 지우기">✕</button></td>`;

function draw() {
  const x = cur(), main = $("#main");
  if (!x) {
    main.innerHTML = `<div class="empty"><h2>작업허가서를 고르거나 새로 만드세요</h2><p>왼쪽 목록에서 고르면 작업허가서와 함께 화학물질·화기작업·중량물·안전시설물 계획서를 고칠 수 있습니다.</p>
      <div class="acts"><button type="button" class="btn primary" id="mk">+ 새 작업허가서</button></div></div>`;
    $("#mk").onclick = () => newDoc(); return;
  }
  const d = x.data;
  main.innerHTML = `<div class="hd"><h2>작업 허가서(PTW)</h2><span class="muted">${esc(d.start)} ~ ${esc(d.end)}${d.ptwNo ? ` · PTW : ${esc(d.ptwNo)}` : ""}</span><span class="sp"></span>
      <label class="fld" style="flex-direction:row;align-items:center;gap:6px">상태 <select id="status">${STATUS.map(s => `<option ${s === x.status ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      <button type="button" class="btn sm" id="copy" title="이 허가서를 다음 7일로 복사">📋 다음 주로 복사</button>
      <button type="button" class="btn sm ghost danger" id="del-doc">삭제</button></div>
    <div class="ptabs">${TABS.map(([k, n]) => `<button type="button" data-tab="${k}" class="${S.tab === k ? "on" : ""}">${n} <i>${k === "ptw" || d.use[k] ? "⭕" : "❌"}</i></button>`).join("")}</div>
    <div id="tab"></div>`;
  drawTab();
}
function drawTab() {
  const t = $("#tab"); if (!t) return;
  t.innerHTML = { ptw: rPtw, chem: rChem, fire: rFire, heavy: rHeavy, sfac: rSfac }[S.tab]();
  refresh();
}
// 계산 칸(평가등급·번호) 다시 쓰기
function refresh() {
  const d = D(); if (!d) return;
  (d.risks || []).forEach((r, i) => { const el = $(`[data-c="g${i}"]`); if (el) { const g = grade(r.freq, r.sev); el.innerHTML = g ? `<span class="grade ${gradeCls(g)}">${g}</span>` : ""; } });
  const n = $("#risk-n"); if (n) n.textContent = `${(d.risks || []).length}건`;
}

/* ---------- 작업허가서 ---------- */
const days7 = d => Array.from({ length: 7 }, (_, i) => d.start ? addDay(d.start, i) : "");
function rPtw() {
  const d = D(), dd = days7(d);
  return `
  <div class="card"><h3>기본 정보</h3><div class="row-g">
    <label class="fld">업체명${inp("company")}</label>
    <label class="fld">공구명${inp("gongu")}</label>
    <label class="fld">작업장소${inp("place")}</label>
    <label class="fld">작성일${inp("created", { type: "date" })}</label>
    <label class="fld">허가기간 시작${inp("start", { type: "date" })}</label>
    <label class="fld">허가기간 끝${inp("end", { type: "date" })}</label>
    <label class="fld">작성자${inp("writer", { list: "dl-names" })}</label>
    <label class="fld">PTW 번호${inp("ptwNo", { ph: "예: GF32-2026-00232" })}</label></div>
    <h3 style="margin-top:14px">결재 <small>인쇄할 때 결재란에 들어갑니다</small></h3>
    <div class="sign">${[["sub", "협력업체"], ["team", "결재(수행)"], ["health", "보건"], ["safety", "안전"]].map(([k, n]) => `<label><span>${n}</span>${inp("sign." + k, { list: "dl-names" })}</label>`).join("")}</div></div>

  <div class="card"><h3>작업 공종 <small>작업하는 날에 체크</small><span class="grow"></span><button type="button" class="btn sm" data-add="gongjong">+ 공종 추가</button></h3>
    <div style="overflow:auto"><table class="tb"><thead><tr><th></th><th>작업공종</th><th>세부공종</th><th>작업팀장(or TBM 리더)</th><th>작업지휘자<br>대상</th>
      ${dd.map(s => `<th class="day ${wd(s) === 0 ? "sun" : wd(s) === 6 ? "sat" : ""}">${s ? `${s.slice(5)}<br>(${WD[wd(s)]})` : ""}</th>`).join("")}<th></th></tr></thead><tbody>
    ${(d.gongjong || []).map((g, i) => `<tr><td class="n">${i + 1}</td><td>${inp(`gongjong.${i}.wt1`, { list: "dl-wt1" })}</td><td>${inp(`gongjong.${i}.wt2`, { list: "dl-wt2" })}</td><td>${inp(`gongjong.${i}.leader`, { list: "dl-names" })}</td>
      <td class="c">${inp(`gongjong.${i}.cmdr`, { cb: 1 })}</td>${dd.map((_, k) => `<td class="c">${inp(`gongjong.${i}.days.${k}`, { cb: 1 })}</td>`).join("")}${del("gongjong", i)}</tr>`).join("")}
    </tbody></table></div>
    <div class="acts"><button type="button" class="btn sm ghost" id="all-days">모든 공종 7일 전부 체크</button></div></div>

  <div class="card"><h3>허가 작업 <small>세부공종별 작업활동과 장비</small><span class="grow"></span>
      <button type="button" class="btn sm" id="from-ewp" title="허가기간에 작업하는 건설장비 작업계획서의 장비를 가져옵니다">🏗 작업계획서 장비 가져오기</button><button type="button" class="btn sm" data-add="perm">+ 작업 추가</button></h3>
    <div style="overflow:auto"><table class="tb"><thead><tr><th></th><th>세부공종</th><th>작업활동</th><th>장비 종류</th><th>종류(기타)</th><th>규격</th><th>규격(기타)</th><th>대수</th><th></th></tr></thead><tbody>
    ${(d.perm || []).map((p, i) => `<tr><td class="n">${i + 1}</td><td>${inp(`perm.${i}.wt2`, { list: "dl-wt2", cls: "l" })}</td><td>${inp(`perm.${i}.wt3`, { list: "dl-wt3", cls: "l" })}</td><td>${inp(`perm.${i}.eq`, { list: "dl-eq" })}</td><td>${inp(`perm.${i}.eqEtc`)}</td>
      <td style="width:100px">${inp(`perm.${i}.size`, { list: "dl-size" })}</td><td style="width:90px">${inp(`perm.${i}.sizeEtc`)}</td><td style="width:64px">${inp(`perm.${i}.cnt`, { num: 1 })}</td>${del("perm", i)}</tr>`).join("")}
    </tbody></table></div></div>

  <div class="card"><h3>작업인원 · 보호구</h3>
    <div class="row-g" style="max-width:480px"><label class="fld">한국인 (명)${inp("workers.kr", { num: 1 })}</label><label class="fld">외국인 (명)${inp("workers.fr", { num: 1 })}</label></div>
    <div class="ppe" style="margin-top:12px">${PPE.map(n => `<label><input type="checkbox" data-ppe="${esc(n)}" ${(d.ppe || []).includes(n) ? "checked" : ""}>${esc(n)}</label>`).join("")}</div></div>

  <div class="card"><h3>작업 위험성 평가 <small id="risk-n"></small><span class="grow"></span>
      <button type="button" class="btn sm" id="pick-risk" title="이전에 쓴 위험성평가에서 골라 넣기">📚 이전 위험성평가에서 가져오기</button><button type="button" class="btn sm" data-add="risks">+ 위험요인 추가</button></h3>
    <div style="overflow:auto"><table class="tb wrap"><thead><tr><th>No.</th><th>구분</th><th>세부공종</th><th>작업활동</th><th>위험요인</th><th>재해유형</th><th>발생<br>빈도</th><th>위험<br>강도</th><th>평가<br>등급</th><th>위험저감대책</th><th>재평가<br>등급</th><th></th></tr></thead><tbody>
    ${(d.risks || []).map((r, i) => `<tr><td class="n">${i + 1}</td><td style="width:84px">${inp(`risks.${i}.src`, { sel: ["PTW", "현장입력"] })}</td>
      <td style="width:110px">${inp(`risks.${i}.wt2`, { list: "dl-wt2", ta: 1 })}</td><td style="width:130px">${inp(`risks.${i}.wt3`, { list: "dl-wt3", ta: 1 })}</td>
      <td style="min-width:200px">${inp(`risks.${i}.factor`, { ta: 1, rows: 3 })}</td><td style="width:96px">${inp(`risks.${i}.type`, { list: "dl-type" })}</td>
      <td style="width:54px">${inp(`risks.${i}.freq`, { sel: [1, 2, 3], num: 1 })}</td><td style="width:54px">${inp(`risks.${i}.sev`, { sel: [1, 2, 3], num: 1 })}</td><td data-c="g${i}" style="width:62px"></td>
      <td style="min-width:240px">${inp(`risks.${i}.measure`, { ta: 1, rows: 3 })}</td><td style="width:78px">${inp(`risks.${i}.re`, { sel: ["하(F)", "중(E)", "중(D)", "상(C)", "상(B)", "상(A)"] })}</td>${del("risks", i)}</tr>`).join("")}
    </tbody></table></div>
    <p class="help">[등급 기준] 발생빈도 × 위험강도 → 1 하(F) · 2 중(E) · 3 중(D) · 4 상(C) · 6 상(B) · 9 상(A) / 상(사망, 중상), 중(경미한 중·경상), 하(경상)</p></div>

  ${rReviews("reviews", [["team", "사업수행팀"], ["health", "보건관리자"], ["safety", "안전관리자"]], "작업허가서 검토 결재의견")}`;
}
function rReviews(base, groups, title) {
  const d = D();
  return `<div class="card"><h3>${title} <small>원청 검토의견을 옮겨 적어 두면 다음 허가서 작성 때 참고할 수 있습니다</small></h3>
    ${groups.map(([k, n]) => { const list = getP(d, `${base}.${k}`) || []; return `<div class="rv"><b>${n}</b><div>
      ${list.length ? `<table class="tb"><thead><tr><th></th><th>구분</th><th>검토의견</th><th>검토자</th><th>검토일</th><th></th></tr></thead><tbody>
      ${list.map((r, i) => `<tr><td class="n">${i + 1}</td><td style="width:84px">${inp(`${base}.${k}.${i}.type`, { sel: ["결재", "반려"] })}</td><td>${inp(`${base}.${k}.${i}.text`, { ta: 1, rows: Math.min(8, Math.max(2, String(r.text || "").split("\n").length)) })}</td>
        <td style="width:96px">${inp(`${base}.${k}.${i}.by`, { list: "dl-names" })}</td><td style="width:136px">${inp(`${base}.${k}.${i}.date`, { type: "date" })}</td>${del(`${base}.${k}`, i)}</tr>`).join("")}</tbody></table>` : ""}
      <button type="button" class="btn sm ghost" data-add="${base}.${k}">+ 의견 추가</button></div></div>`; }).join("")}</div>`;
}
const useBar = (k, n) => `<div class="usebar"><label class="chk"><input type="checkbox" data-use="${k}" ${D().use[k] ? "checked" : ""}> <b>${n} 작성함</b></label><span class="muted" style="font-size:12.5px">체크하면 탭에 ⭕ 표시되고 통합 인쇄에 들어갑니다.</span></div>`;
const head = (title, extra = "") => { const d = D(); return `<div class="card"><h3>${title}</h3><div class="row-g">
  <label class="fld">업체명<input value="${esc(d.company)}" disabled></label><label class="fld">작성일<input value="${esc(d.created)}" disabled></label>
  <label class="fld">작성자<input value="${esc(d.writer)}" disabled></label><label class="fld">허가기간<input value="${esc(d.start)} ~ ${esc(d.end)}" disabled></label>${extra}</div></div>`; };
const lines = (path, ph) => { const list = getP(D(), path) || []; return `<table class="tb"><tbody>${list.map((_, i) => `<tr><td class="n">${i + 1}</td><td>${inp(`${path}.${i}`, { ta: 1, ph })}</td>${del(path, i)}</tr>`).join("")}</tbody></table>
  <button type="button" class="btn sm ghost" data-add="${path}">+ 줄 추가</button>`; };

/* ---------- 화학물질 사용계획서 ---------- */
function rChem() {
  const d = D(), OX = ["", "O", "X"];
  return useBar("chem", "화학물질 사용계획서") + `<div class="${d.use.chem ? "" : "off"}">${head("화학물질 사용계획서")}
  <div class="card"><h3>화학물질 상세정보<span class="grow"></span><button type="button" class="btn sm" data-add="chem.items">+ 물질 추가</button></h3>
    <div style="overflow:auto"><table class="tb"><thead><tr><th></th><th>세부공종</th><th>제품명</th><th>제조사</th><th>사용용도</th><th>사용예정<br>수량</th><th>단위</th><th>보관장소</th><th>특수건강<br>진단 대상</th><th>작업환경<br>측정 대상</th><th>특별교육<br>(관리대상)</th><th>특별관리<br>물질 대상</th><th>MSDS<br>비치</th><th></th></tr></thead><tbody>
    ${d.chem.items.map((c, i) => `<tr><td class="n">${i + 1}</td><td>${inp(`chem.items.${i}.wt2`, { list: "dl-wt2" })}</td><td>${inp(`chem.items.${i}.product`)}</td><td>${inp(`chem.items.${i}.maker`)}</td><td>${inp(`chem.items.${i}.use`)}</td>
      <td style="width:70px">${inp(`chem.items.${i}.qty`, { num: 1 })}</td><td style="width:56px">${inp(`chem.items.${i}.unit`, { ph: "L" })}</td><td>${inp(`chem.items.${i}.storage`)}</td>
      ${["health", "env", "edu", "spc", "msds"].map(k => `<td style="width:62px">${inp(`chem.items.${i}.${k}`, { sel: OX })}</td>`).join("")}${del("chem.items", i)}</tr>`).join("")}
    </tbody></table></div></div>
  <div class="grid2"><div class="card"><h3>기타 위험요인 <small>물리적, 건강, 환경 유해/위험성 등</small></h3>${lines("chem.risks")}</div>
    <div class="card"><h3>기타 안전/보건조치 <small>예방, 저장, 폐기 등</small></h3>${lines("chem.measures")}</div></div><div style="height:14px"></div>
  ${rReviews("chem.reviews", [["team", "사업수행팀"], ["health", "보건관리자"], ["safety", "안전관리자"]], "화학물질 사용계획서 검토 결재의견")}</div>`;
}
/* ---------- 화기작업 계획서 ---------- */
function rFire() {
  const d = D();
  return useBar("fire", "화기작업 계획서") + `<div class="${d.use.fire ? "" : "off"}">${head("화기작업 계획서", `
    <label class="fld">작업시작 일자${inp("fire.fromD", { type: "date" })}</label><label class="fld">시간${inp("fire.fromT", { type: "time" })}</label>
    <label class="fld">작업종료 일자${inp("fire.toD", { type: "date" })}</label><label class="fld">시간${inp("fire.toT", { type: "time" })}</label>`)}
  <div class="card"><h3>작업자 명단(교육 이수자)<span class="grow"></span><button type="button" class="btn sm" data-add="fire.rows">+ 줄 추가</button></h3>
    <table class="tb"><thead><tr><th></th><th>작업장소</th><th>작업내용</th><th>화재감시자</th><th>작업자 명단(특별교육 이수자)</th><th></th></tr></thead><tbody>
    ${d.fire.rows.map((r, i) => `<tr><td class="n">${i + 1}</td><td>${inp(`fire.rows.${i}.place`)}</td><td>${inp(`fire.rows.${i}.desc`)}</td><td style="width:120px">${inp(`fire.rows.${i}.watcher`, { list: "dl-names" })}</td><td>${inp(`fire.rows.${i}.workers`)}</td>${del("fire.rows", i)}</tr>`).join("")}
    </tbody></table></div>
  <div class="card"><h3>안전조치 및 점검사항</h3><ul class="ck">
    ${FIRE_CHECKS.map((c, i) => `<li><span class="no">${i + 1}</span><span class="tx">${c.t.replace(/\{(\w+)\}/g, (_, k) => `<input type="number" min="0" data-p="fire.checks.n${i}_${k}" data-num value="${esc(getP(d, `fire.checks.n${i}_${k}`) ?? "")}">`)}</span>
      ${inp(`fire.checks.s${i}`, { sel: ["", "확인", "해당없음", "미조치"] })}</li>`).join("")}
    <li><span class="no">11</span><span class="tx">기타사항 ${inp("fire.checks.etc", { cls: "l" })}</span></li></ul></div>
  ${rReviews("fire.reviews", [["team", "사업수행팀"], ["safety", "안전관리자"]], "화기작업 계획서 검토 결재의견")}</div>`;
}
/* ---------- 중량물 취급계획서 ---------- */
function rHeavy() {
  const d = D();
  return useBar("heavy", "중량물 취급계획서") + `<div class="${d.use.heavy ? "" : "off"}">${head("중량물 취급 계획서")}
  <div class="card"><h3>작업 목록<span class="grow"></span><button type="button" class="btn sm" id="heavy-ewp" title="허가기간에 작업하는 건설장비 작업계획서를 가져옵니다">🏗 작업계획서에서 가져오기</button><button type="button" class="btn sm" data-add="heavy.rows">+ 줄 추가</button></h3>
    <table class="tb"><thead><tr><th></th><th>차량계 하역운반</th><th>건설기계 작업</th><th>중량물 취급 계획서</th><th>작업기간</th><th></th></tr></thead><tbody>
    ${d.heavy.rows.map((r, i) => `<tr><td class="n">${i + 1}</td><td>${inp(`heavy.rows.${i}.car`, { cls: "l" })}</td><td>${inp(`heavy.rows.${i}.machine`, { cls: "l" })}</td><td>${inp(`heavy.rows.${i}.heavy`, { cls: "l" })}</td><td style="width:210px">${inp(`heavy.rows.${i}.term`)}</td>${del("heavy.rows", i)}</tr>`).join("")}
    </tbody></table></div>
  ${rReviews("heavy.reviews", [["team", "사업수행팀"], ["safety", "안전관리자"]], "중량물 취급계획서 검토 결재의견")}</div>`;
}
/* ---------- 안전시설물 임시 해체/복구 ---------- */
function rSfac() {
  const d = D();
  return useBar("sfac", "안전시설물 임시 해체/복구 작업계획서") + `<div class="${d.use.sfac ? "" : "off"}">${head("안전시설물 임시 해체/복구 계획서", `
    <label class="fld">해체시작 일자${inp("sfac.fromD", { type: "date" })}</label><label class="fld">시간${inp("sfac.fromT", { type: "time" })}</label>
    <label class="fld">복구완료 일자${inp("sfac.toD", { type: "date" })}</label><label class="fld">시간${inp("sfac.toT", { type: "time" })}</label>`)}
  <div class="card"><h3>작업 세부내용</h3><div class="row-g" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">
    <label class="fld">안전시설물 해체위치${inp("sfac.place", { ta: 1 })}</label><label class="fld">해체 안전시설물${inp("sfac.facility", { ta: 1 })}</label>
    <label class="fld">해체구간 주변 안전조치 사항${inp("sfac.measure", { ta: 1 })}</label><label class="fld">해체구간 내 작업내용${inp("sfac.work", { ta: 1 })}</label></div></div>
  <div class="card"><h3>확인</h3><div class="row-g">
    <label class="fld">기존 안전시설물 설치업체${inp("sfac.company")}</label><label class="fld">설치업체 담당자${inp("sfac.companyBy", { list: "dl-names" })}</label>
    <label class="fld">복구완료 시 — 임시 해체복구 담당자${inp("sfac.restoreBy", { list: "dl-names" })}</label><label class="fld">원상 복구상태 확인 — 기존 설치업체 담당자${inp("sfac.checkBy", { list: "dl-names" })}</label></div></div>
  ${rReviews("sfac.reviews", [["team", "사업수행팀"], ["safety", "안전관리자"]], "안전시설물 임시 해체/복구 작업계획서 검토 결재의견")}</div>`;
}

/* ================= 입력 · 버튼 ================= */
const ROW = {
  gongjong: () => ({ wt1: "", wt2: "", leader: "", cmdr: false, days: [false, false, false, false, false, false, false] }),
  perm: () => ({ wt2: "", wt3: "", eq: "", eqEtc: "", size: "", sizeEtc: "", cnt: 0 }),
  risks: () => ({ src: "현장입력", wt2: "", wt3: "", factor: "", type: "", freq: 2, sev: 2, measure: "", re: "하(F)" }),
  "chem.items": () => ({ wt2: "", product: "", maker: "", use: "", qty: null, unit: "", storage: "", health: "", env: "", edu: "", spc: "", msds: "O" }),
  "fire.rows": () => ({ place: "", desc: "", watcher: "", workers: "" }),
  "heavy.rows": () => ({ car: "", machine: "", heavy: "", term: "" }),
};
const newRow = path => ROW[path] ? ROW[path]() : /reviews\./.test(path) ? { type: "결재", text: "", by: "", date: ymd(new Date()) } : "";
$("#main").addEventListener("input", e => {
  const el = e.target; const d = D(); if (!d) return;
  if (el.dataset.p) {
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (el.hasAttribute("data-num")) v = v === "" ? null : Number(String(v).replace(/,/g, ""));
    setP(d, el.dataset.p, v);
    if (el.dataset.p === "start" && v) { d.end = addDay(v, 6); const e2 = $('[data-p="end"]'); if (e2) e2.value = d.end; }
    if (el.dataset.p === "start" || el.dataset.p === "end") { drawHeadOnly(); if (el.dataset.p === "start") drawTabKeepScroll(); }
    refresh(); touch(); return;
  }
  if (el.dataset.ppe) { const s = new Set(d.ppe || []); el.checked ? s.add(el.dataset.ppe) : s.delete(el.dataset.ppe); d.ppe = PPE.filter(n => s.has(n)); touch(); return; }
  if (el.dataset.use) { d.use[el.dataset.use] = el.checked; touch(); draw(); }
});
$("#main").addEventListener("change", e => { if (e.target.id === "status") { cur().status = e.target.value; touch(); drawList(); } });
function drawHeadOnly() { const d = D(); const m = $(".hd .muted"); if (m) m.textContent = `${d.start} ~ ${d.end}${d.ptwNo ? ` · PTW : ${d.ptwNo}` : ""}`; }
function drawTabKeepScroll() { const m = $("#main"), y = m.scrollTop; const f = document.activeElement?.dataset?.p; drawTab(); m.scrollTop = y; if (f) $(`[data-p="${f}"]`)?.focus(); }
$("#main").addEventListener("click", async e => {
  const d = D();
  const t = e.target.closest("[data-tab]"); if (t) { S.tab = t.dataset.tab; draw(); return; }
  const a = e.target.closest("[data-add]"); if (a) { const p = a.dataset.add; const list = getP(d, p) || (setP(d, p, []), getP(d, p)); list.push(newRow(p)); touch(); drawTabKeepScroll(); return; }
  const x = e.target.closest("[data-del]"); if (x) { const list = getP(d, x.dataset.del); list.splice(+x.dataset.i, 1); touch(); drawTabKeepScroll(); return; }
  const m = e.target.closest("[data-mv]"); if (m) { const list = getP(d, m.dataset.mv), i = +m.dataset.i; if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; touch(); drawTabKeepScroll(); } return; }
  if (e.target.closest("#all-days")) { const on = !(d.gongjong || []).every(g => g.days.every(Boolean)); d.gongjong.forEach(g => g.days = g.days.map(() => on)); touch(); drawTabKeepScroll(); return; }
  if (e.target.closest("#pick-risk")) return pickRisk();
  if (e.target.closest("#from-ewp")) return fromEwp();
  if (e.target.closest("#heavy-ewp")) return heavyEwp();
  if (e.target.closest("#copy")) { await flush(); return newDoc(S.cur); }
  if (e.target.closest("#del-doc")) {
    if (!confirm(`${d.start} ~ ${d.end} 작업허가서를 지울까요? (되돌릴 수 없습니다)`)) return;
    const { error } = await sb.from("ptw_docs").delete().eq("id", S.cur); if (error) return toast("지우지 못했습니다: " + error.message);
    pending.delete(S.cur); S.docs = S.docs.filter(v => v.id !== S.cur); S.cur = S.docs[0]?.id ?? null; drawList(); draw(); toast("지웠습니다.");
  }
});

/* ---------- 이전 위험성평가에서 가져오기 ---------- */
function pickRisk() {
  const d = D(), key = r => [r.wt2, r.wt3, r.factor].map(s => String(s || "").replace(/\s+/g, "")).join("|");
  const have = new Set((d.risks || []).map(key)), seen = new Map();
  for (const x of S.docs) if (x.id !== S.cur) for (const r of x.data.risks || []) { const k = key(r); if (!have.has(k) && !seen.has(k) && r.factor) seen.set(k, { ...r, from: x.data.start }); }
  const all = [...seen.values()];
  const f = $("#dlg-f"), dlg = $("#dlg");
  f.innerHTML = `<h3>이전 위험성평가에서 가져오기</h3>
    ${all.length ? `<div style="display:flex;gap:8px;margin-bottom:8px"><input id="rq" placeholder="세부공종·작업활동·위험요인 검색" style="flex:1"><button type="button" class="btn sm" id="r-all">보이는 것 모두 선택</button></div>
    <div class="pick">${all.map((r, i) => { const g = grade(r.freq, r.sev); return `<label data-q="${esc([r.wt2, r.wt3, r.factor, r.type].join(" "))}"><input type="checkbox" value="${i}">
      <span class="gr"><span class="grade ${gradeCls(g)}">${g}</span></span><span><b>${esc(r.wt2)} › ${esc(r.wt3)}</b> · ${esc(r.type)}<br>${esc(r.factor)}<br><small>대책: ${esc(r.measure)}</small></span></label>`; }).join("")}</div>`
    : `<p class="muted">다른 허가서에 이 허가서에 없는 위험성평가가 없습니다.</p>`}
    <div class="dlg-btns"><button value="" class="btn ghost">닫기</button>${all.length ? `<button value="ok" class="btn primary">선택한 항목 넣기</button>` : ""}</div>`;
  $("#rq")?.addEventListener("input", e => { const q = e.target.value.trim(); $$(".pick label", f).forEach(l => l.hidden = q && !l.dataset.q.includes(q)); });
  $("#r-all")?.addEventListener("click", () => $$(".pick label:not([hidden]) input", f).forEach(c => c.checked = true));
  dlg.onclose = () => {
    if (dlg.returnValue !== "ok") return;
    const sel = $$(".pick input:checked", f).map(c => all[+c.value]); if (!sel.length) return;
    for (const r of sel) { const { from, ...rest } = r; d.risks.push(clone(rest)); }
    touch(); drawTabKeepScroll(); toast(`위험성평가 ${sel.length}건을 넣었습니다.`);
  };
  dlg.returnValue = ""; dlg.showModal();
}

/* ---------- 건설장비 작업계획서 연동 ---------- */
async function plansInPeriod() {
  const d = D();
  const { data, error } = await sb.from("ewp_plans").select("equip_type,spec,reg_no,work_name,work_start,work_end,status").lte("work_start", d.end).gte("work_end", d.start);
  if (error) { toast("작업계획서를 불러오지 못했습니다: " + error.message); return null; }
  return data || [];
}
async function fromEwp() {
  const d = D(), list = await plansInPeriod(); if (!list) return;
  if (!list.length) return toast(`${d.start} ~ ${d.end}에 작업하는 작업계획서가 없습니다.`);
  // 굴착기 = 굴삭기(무한궤도) 처럼 이름이 조금 달라도 같은 장비로 봄
  const norm = s => String(s || "").replace(/\(.*?\)/g, "").replace(/굴삭기/g, "굴착기").replace(/\s+/g, "");
  const grp = new Map();
  for (const p of list) { const k = norm(p.equip_type); if (!grp.has(k)) grp.set(k, { eq: p.equip_type || "", n: 0, specs: new Set() }); const g = grp.get(k); g.n++; if (p.spec) g.specs.add(p.spec); }
  const have = new Set(d.perm.filter(r => r.eq).map(r => norm(r.eq))), added = [], kept = [];
  for (const [k, g] of grp) {
    const label = `${g.eq} ${g.n}대`;
    if (have.has(k)) { kept.push(label); continue; }
    d.perm.push({ wt2: "", wt3: "", eq: g.eq, eqEtc: "", size: [...g.specs].join(", "), sizeEtc: "", cnt: g.n }); added.push(label);
  }
  if (added.length) { touch(); drawTabKeepScroll(); }
  toast(`작업계획서 ${list.length}건 (${[...grp.values()].map(g => `${g.eq} ${g.n}대`).join(", ")})` +
    (added.length ? ` — ${added.join(", ")} 줄 추가, 세부공종·작업활동을 채워 주세요` : " — 이미 허가 작업에 있는 장비입니다. 대수만 확인하세요"), 5500);
}
async function heavyEwp() {
  const d = D(), list = await plansInPeriod(); if (!list) return;
  if (!list.length) return toast(`${d.start} ~ ${d.end}에 작업하는 작업계획서가 없습니다.`);
  let add = 0;
  for (const p of list) {
    const machine = `${p.equip_type || ""}${p.spec ? ` ${p.spec}` : ""}${p.reg_no ? ` (${p.reg_no})` : ""} · ${p.work_name || ""}`.trim();
    if (d.heavy.rows.some(r => r.machine === machine)) continue;
    d.heavy.rows.push({ car: "", machine, heavy: "", term: `${p.work_start || ""} ~ ${p.work_end || ""}` }); add++;
  }
  touch(); drawTabKeepScroll(); toast(add ? `${add}건을 넣었습니다.` : "이미 모두 들어 있습니다.");
}

/* ================= 인쇄 ================= */
async function doPrint(all) {
  const x = cur(); if (!x) return toast("작업허가서를 먼저 고르세요.");
  await flush();
  const w = window.open("", "_blank"); if (!w) return toast("팝업이 막혔습니다. 팝업을 허용해 주세요.");
  w.document.open(); w.document.write(printPTW(x.data, { all, status: x.status })); w.document.close();
}
$("#p-main").onclick = () => doPrint(false);
$("#p-all").onclick = () => doPrint(true);

/* ================= 시작 ================= */
(async () => {
  try {
    await connect(); await loadAll();
    const q = new URLSearchParams(location.search).get("id");
    S.cur = q && S.docs.some(x => x.id === +q) ? +q : S.docs[0]?.id ?? null;
    drawList(); draw();
  } catch (e) { console.error(e); $("#main").innerHTML = `<div class="empty"><h2>불러오지 못했습니다</h2><p>${esc(e.message || e)}</p></div>`; }
})();
