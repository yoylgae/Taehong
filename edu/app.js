// 안전ㆍ보건 교육 훈련 일지 — 작성 · PPT 교육자료 요약 → 교육내용 · 참석자(작업일보 연동) · 사진대지 · 인쇄
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";
import { TARGETS, GUBUN, METHODS, legalText, blankDiary } from "./edu-data.js";
import { readPptx, summarize, deckText } from "./pptx.js";
import { printDiary } from "./print.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toast = (m, ms = 3000) => { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, ms); };
const ymd = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const WD = "일월화수목금토", wd = s => new Date(s + "T00:00:00").getDay();
const clone = o => JSON.parse(JSON.stringify(o ?? null));
const BUCKET = "jy-files";
const busy = on => { let el = $(".busy-ov"); if (!on) return el?.remove(); if (!el) { el = document.createElement("div"); el.className = "busy-ov"; document.body.append(el); } el.innerHTML = `<div><span class="spin"></span>${esc(on)}</div>`; };

let sb;
const S = { list: [], cur: null, deck: null, level: "mid", urls: new Map() };
const cur = () => S.list.find(x => x.id === S.cur);
const D = () => cur()?.data;

async function connect() {
  let t = "";
  try { const r = await fetch("/__dbtoken", { cache: "no-store" }); if (r.ok) t = (await r.json()).t || ""; } catch {}
  sb = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { headers: { "x-pms-token": t } }, auth: { persistSession: false } });
}
function fix(d) { const b = blankDiary(d.date || ymd(new Date())); for (const k of Object.keys(b)) if (d[k] === undefined) d[k] = clone(b[k]); return d; }
async function loadAll() {
  const [e, w] = await Promise.all([
    sb.from("edu_diaries").select("*").order("edu_date", { ascending: false }).order("id", { ascending: false }),
    sb.from("jy_workers").select("name").order("name").then(r => r, () => ({ data: [] })),
  ]);
  if (e.error) throw e.error;
  S.list = (e.data || []).map(x => ({ ...x, data: fix(x.data) }));
  const names = new Set((w.data || []).map(x => x.name));
  for (const x of S.list) { for (const a of x.data.attendees) a.name && names.add(a.name); for (const k of ["speaker1", "speaker2"]) x.data[k] && names.add(x.data[k]); }
  $("#dl-names").innerHTML = [...names].filter(Boolean).sort().map(n => `<option value="${esc(n)}">`).join("");
}
let saveT = null, pending = new Set();
function setSave(cls, t) { const el = $("#save"); el.className = "save " + (cls || ""); el.textContent = t; }
function touch() { if (!S.cur) return; pending.add(S.cur); setSave("busy", "저장 중…"); clearTimeout(saveT); saveT = setTimeout(flush, 700); }
async function flush() {
  const ids = [...pending]; pending.clear();
  for (const id of ids) {
    const x = S.list.find(v => v.id === id); if (!x) continue;
    const { error } = await sb.from("edu_diaries").update({ edu_date: x.data.date || null, data: x.data, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { pending.add(id); setSave("err", "저장 실패 — 다시 시도 중"); console.error(error); clearTimeout(saveT); saveT = setTimeout(flush, 4000); return; }
  }
  if (ids.length) { setSave("ok", "저장됨 ✓"); drawList(); }
}
addEventListener("beforeunload", e => { if (pending.size) { flush(); e.preventDefault(); e.returnValue = ""; } });

/* ================= 목록 ================= */
function drawList() {
  let html = `<button type="button" class="btn primary new" id="new">+ 새 교육일지</button>`, ym = "";
  for (const x of S.list) {
    const d = x.data, m = (d.date || "").slice(0, 7);
    if (m !== ym) { ym = m; html += `<h4>${m ? `${+m.slice(0, 4)}년 ${+m.slice(5)}월` : "날짜 없음"}</h4>`; }
    html += `<div class="pl ${x.id === S.cur ? "on" : ""}" data-id="${x.id}"><b>${d.date ? `${+d.date.slice(5, 7)}.${+d.date.slice(8)} (${WD[wd(d.date)]})` : "날짜 없음"} <span class="st s0">${esc(d.gubun || "")}</span></b>
      <small>${esc(d.name || "교육명 없음")}</small><small>${esc(d.target)} · 참석 ${d.attendees.filter(a => a.name).length || d.attendCnt || 0}명${d.material ? " · 📎" : ""}</small></div>`;
  }
  if (!S.list.length) html += `<p class="muted" style="padding:10px;font-size:13px">아직 교육일지가 없습니다.</p>`;
  $("#list").innerHTML = html;
}
$("#list").addEventListener("click", e => {
  if (e.target.closest("#new")) return newDiary();
  const p = e.target.closest(".pl"); if (p) { S.cur = +p.dataset.id; S.deck = null; drawList(); draw(); }
});
async function newDiary() {
  const last = S.list[0]?.data, d = blankDiary(ymd(new Date()));
  if (last) { for (const k of ["company", "place", "from", "to", "speaker1", "speaker2", "methods", "sign"]) d[k] = clone(last[k]); }
  const { data: r, error } = await sb.from("edu_diaries").insert({ edu_date: d.date, data: d }).select().single();
  if (error) return toast("만들지 못했습니다: " + error.message);
  r.data = fix(r.data); S.list.unshift(r); S.cur = r.id; S.deck = null; drawList(); draw(); toast("새 교육일지를 만들었습니다.");
}

/* ================= 본문 ================= */
const getP = (o, p) => p.split(".").reduce((a, k) => a?.[k], o);
function setP(o, p, v) { const ks = p.split("."); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[ks[i]]; } a[ks.at(-1)] = v; }
const inp = (p, o = {}) => {
  const v = getP(D(), p);
  if (o.sel) return `<select data-p="${p}">${o.sel.map(s => `<option ${s === v ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>`;
  if (o.ta) return `<textarea data-p="${p}" class="${o.cls || ""}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ""}>${esc(v ?? "")}</textarea>`;
  return `<input data-p="${p}" ${o.num ? 'data-num inputmode="numeric"' : ""} ${o.type ? `type="${o.type}"` : ""} value="${esc(v ?? "")}" ${o.list ? `list="${o.list}"` : ""} ${o.ph ? `placeholder="${esc(o.ph)}"` : ""} class="${o.cls || ""}">`;
};
const rate = d => { const a = d.attendCnt ?? d.attendees.filter(x => x.name).length, t = d.targetCnt; return t ? Math.round(a / t * 1000) / 10 : null; };
function draw() {
  const x = cur(), main = $("#main");
  if (!x) { main.innerHTML = `<div class="empty"><h2>교육일지를 고르거나 새로 만드세요</h2><p>교육자료 PPT를 올리면 내용을 요약해 '교육내용'에 넣어 줍니다.</p><div class="acts"><button type="button" class="btn primary" id="mk">+ 새 교육일지</button></div></div>`; $("#mk").onclick = newDiary; return; }
  const d = x.data, r = rate(d), att = d.attendees.filter(a => a.name).length;
  main.innerHTML = `<div class="hd"><h2>안전ㆍ보건 교육 훈련 일지</h2><span class="muted">${esc(d.company)}</span><span class="sp"></span>
      <button type="button" class="btn sm" id="dup" title="이 일지를 복사해 새 날짜로">📋 복사해서 새로</button><button type="button" class="btn sm ghost danger" id="del">삭제</button></div>
  <div class="card"><h3>기본 정보</h3><div class="row-g">
    <label class="fld">교육명${inp("name", { ph: "예: 10월 정기안전교육" })}</label>
    <label class="fld">교육장소${inp("place", { list: "dl-place" })}</label>
    <label class="fld">교육일자${inp("date", { type: "date" })}</label>
    <label class="fld">교육시간 (시작)${inp("from", { type: "time" })}</label>
    <label class="fld">교육시간 (끝)${inp("to", { type: "time" })}</label>
    <label class="fld">교육대상${inp("target", { sel: TARGETS })}</label>
    <label class="fld">교육구분${inp("gubun", { sel: GUBUN[d.target] || GUBUN["근로자"] })}</label>
    <label class="fld">대상 인원(명)${inp("targetCnt", { num: 1 })}</label>
    <label class="fld">참석 인원(명) <small class="muted">비우면 명단 수 ${att}명</small>${inp("attendCnt", { num: 1, ph: String(att) })}</label>
    <label class="fld">참석율<input disabled value="${r == null ? "-" : r + " %"}" data-c="rate"></label>
    <label class="fld">내부강사1${inp("speaker1", { list: "dl-names" })}</label>
    <label class="fld">내부강사2${inp("speaker2", { list: "dl-names" })}</label>
    <label class="fld">외부강사${inp("outSpeaker")}</label>
    ${/특별/.test(d.gubun) ? `<label class="fld">작업명 (특별교육 대상작업)${inp("taskName")}</label>` : ""}</div>
    <h3 style="margin-top:14px">교육방법</h3>
    <div class="meth">${METHODS.map(m => `<label><input type="checkbox" data-meth="${esc(m)}" ${d.methods.includes(m) ? "checked" : ""}>${esc(m)}</label>`).join("")}</div>
    <h3 style="margin-top:14px">결재 <small>인쇄 결재란</small></h3>
    <div class="sign">${[["writer", "작성"], ["check", "검토"], ["approve", "승인"]].map(([k, n]) => `<label><span>${n}</span>${inp("sign." + k, { list: "dl-names" })}</label>`).join("")}</div></div>

  <div class="card"><h3>교육자료 (PPT) → 교육내용 요약</h3>
    <div class="ppt" id="drop"><div class="grow"><b>${d.material ? `📎 ${esc(d.material.name)}` : "교육자료 PPT(.pptx)를 올리세요"}</b><br>
      <small>${d.material ? `${d.material.slides}쪽 · ${Math.round(d.material.bytes / 1048576)}MB · 글자 ${d.material.chars}자 — 파일은 서버에 올리지 않고, 이 브라우저에서 글자만 뽑아 요약합니다.` : "여기로 끌어다 놓거나 단추를 누르세요. 파일 크기가 커도(동영상 포함) 글자만 읽습니다."}</small></div>
      <button type="button" class="btn" id="pick-ppt">📂 PPT 고르기</button></div>
    ${S.deck ? `<div class="acts" style="margin-top:12px"><span>요약 길이</span><span class="lv">${[["short", "짧게"], ["mid", "보통"], ["long", "자세히"]].map(([k, n]) => `<button type="button" data-lv="${k}" class="${S.level === k ? "on" : ""}">${n}</button>`).join("")}</span>
      <button type="button" class="btn sm" id="ai" title="AI가 문장으로 다듬어 요약 (관리자가 AI 키를 설정했을 때)">✨ AI로 다듬기</button>
      <small id="sum-n"></small></div>
      <div class="prev" id="sum-prev" style="margin-top:8px"></div>
      <div class="acts"><button type="button" class="btn primary" id="put" data-mode="replace">교육내용에 넣기 (바꾸기)</button><button type="button" class="btn" id="put-add">교육내용 끝에 덧붙이기</button></div>`
      : d.material ? `<p class="help">요약을 다시 만들려면 같은 PPT를 다시 올리세요.</p>` : ""}</div>

  <div class="card"><h3>교육내용 (법적사항) <small>산업안전보건법 시행규칙 [별표 5] — 교육대상·구분을 바꾸면 자동으로 바뀝니다</small><span class="grow"></span>
      ${d.legalAuto ? "" : `<button type="button" class="btn sm ghost" id="legal-reset">법정 내용으로 되돌리기</button>`}</h3>
    ${inp("legal", { ta: 1, cls: "legal", ph: "이 교육구분은 법정 내용을 직접 적어 주세요" })}</div>
  <div class="card"><h3>교육내용 <small>${(d.content || "").length}자</small></h3>${inp("content", { ta: 1, cls: "content", ph: "위에서 PPT를 올려 요약을 넣거나 직접 쓰세요" })}</div>

  <div class="card"><h3>참석자 명단 <small>${att}명</small><span class="grow"></span>
      <button type="button" class="btn sm" id="from-ilbo" title="이 날짜 작업일보 출력일보의 근로자를 넣습니다">👷 작업일보 출력인원 불러오기</button>
      <button type="button" class="btn sm" id="att-paste" title="엑셀 등에서 이름 목록 붙여넣기">📋 이름 붙여넣기</button>
      <button type="button" class="btn sm" id="att-add">+ 한 명</button>${att ? `<button type="button" class="btn sm ghost danger" id="att-clear">모두 지우기</button>` : ""}</h3>
    <div class="att-grid">${d.attendees.map((a, i) => `<div class="a"><span class="n">${i + 1}</span>${inp(`attendees.${i}.name`, { list: "dl-names", ph: "성명" })}${inp(`attendees.${i}.job`, { cls: "c", ph: "직종" })}<button type="button" data-att-del="${i}">✕</button></div>`).join("")}</div>
    ${d.attendees.length ? "" : `<p class="muted" style="margin:0">작업일보 출력인원을 불러오거나 이름을 붙여 넣으세요. 인쇄하면 서명란이 붙은 명단이 나옵니다.</p>`}</div>

  <div class="card"><h3>사진 대지 <small>${d.photos.length}장 · 인쇄 때 2쪽째에 들어갑니다</small><span class="grow"></span><button type="button" class="btn sm" id="add-photo">📷 사진 추가</button></h3>
    <div class="photos">${d.photos.map((p, i) => `<figure><img data-path="${esc(p.path)}" alt=""><button type="button" data-ph-del="${i}">✕</button><figcaption>${inp(`photos.${i}.cap`, { ph: "설명" })}</figcaption></figure>`).join("")}</div></div>`;
  loadPhotos(); showSum();
}
async function loadPhotos() {
  for (const img of $$("img[data-path]")) {
    const p = img.dataset.path; let u = S.urls.get(p);
    if (!u) { const { data } = await sb.storage.from(BUCKET).createSignedUrl(p, 3600); u = data?.signedUrl; if (u) S.urls.set(p, u); }
    if (u) img.src = u;
  }
}
function redrawKeep() { const m = $("#main"), y = m.scrollTop, f = document.activeElement?.dataset?.p; draw(); m.scrollTop = y; if (f) $(`[data-p="${f}"]`)?.focus(); }

/* ---------- 입력 ---------- */
$("#main").addEventListener("input", e => {
  const el = e.target, d = D(); if (!d) return;
  if (el.dataset.meth) { const s = new Set(d.methods); el.checked ? s.add(el.dataset.meth) : s.delete(el.dataset.meth); d.methods = METHODS.filter(m => s.has(m)); touch(); return; }
  if (!el.dataset.p) return;
  let v = el.value; if (el.hasAttribute("data-num")) v = v === "" ? null : Number(v.replace(/,/g, ""));
  const p = el.dataset.p; setP(d, p, v);
  if (p === "legal") d.legalAuto = false;
  if (p === "target") { if (!GUBUN[v].includes(d.gubun)) d.gubun = GUBUN[v][0]; }
  if ((p === "target" || p === "gubun") && d.legalAuto) d.legal = legalText(d.target, d.gubun);
  if (p === "target" || p === "gubun") { touch(); redrawKeep(); return; }
  if (p === "targetCnt" || p === "attendCnt" || /^attendees/.test(p)) { const r = rate(d); const c = $('[data-c="rate"]'); if (c) c.value = r == null ? "-" : r + " %"; }
  touch();
});
$("#main").addEventListener("change", e => { if (/^(date|attendees\.\d+\.name)$/.test(e.target.dataset.p || "")) drawList(); });
$("#main").addEventListener("click", async e => {
  const d = D(), c = s => e.target.closest(s); let t;
  if (c("#pick-ppt")) return $("#f-ppt").click();
  if ((t = c("[data-lv]"))) { S.level = t.dataset.lv; S.ai = null; $$("[data-lv]").forEach(b => b.classList.toggle("on", b === t)); showSum(); return; }
  if (c("#ai")) return aiSum();
  if (c("#put") || c("#put-add")) { const s = $("#sum-prev").textContent; if (!s) return; d.content = c("#put-add") && d.content ? d.content.replace(/\s+$/, "") + "\n\n" + s : s; touch(); redrawKeep(); toast("교육내용에 넣었습니다. 아래에서 더 고칠 수 있습니다."); return; }
  if (c("#legal-reset")) { d.legal = legalText(d.target, d.gubun); d.legalAuto = true; touch(); redrawKeep(); return; }
  if (c("#att-add")) { d.attendees.push({ name: "", job: "" }); touch(); redrawKeep(); $(`[data-p="attendees.${d.attendees.length - 1}.name"]`)?.focus(); return; }
  if ((t = c("[data-att-del]"))) { d.attendees.splice(+t.dataset.attDel, 1); touch(); redrawKeep(); return; }
  if (c("#att-clear")) { if (!confirm("참석자 명단을 모두 지울까요?")) return; d.attendees = []; touch(); redrawKeep(); return; }
  if (c("#att-paste")) return pasteNames();
  if (c("#from-ilbo")) return fromIlbo();
  if (c("#add-photo")) return $("#f-photo").click();
  if ((t = c("[data-ph-del]"))) { const p = d.photos[+t.dataset.phDel]; if (!confirm("이 사진을 뺄까요?")) return; d.photos.splice(+t.dataset.phDel, 1); touch(); redrawKeep(); sb.storage.from(BUCKET).remove([p.path]).catch(() => {}); return; }
  if (c("#dup")) { await flush(); const nd = clone(d); nd.date = ymd(new Date()); nd.attendees = []; nd.photos = []; nd.material = null; nd.attendCnt = null; const { data: r, error } = await sb.from("edu_diaries").insert({ edu_date: nd.date, data: nd }).select().single(); if (error) return toast(error.message); r.data = fix(r.data); S.list.unshift(r); S.cur = r.id; S.deck = null; drawList(); draw(); toast("복사했습니다. 날짜·참석자를 확인하세요."); return; }
  if (c("#del")) { if (!confirm(`${d.date} 교육일지를 지울까요? (되돌릴 수 없습니다)`)) return; const { error } = await sb.from("edu_diaries").delete().eq("id", S.cur); if (error) return toast(error.message); if (d.photos.length) sb.storage.from(BUCKET).remove(d.photos.map(p => p.path)).catch(() => {}); pending.delete(S.cur); S.list = S.list.filter(x => x.id !== S.cur); S.cur = S.list[0]?.id ?? null; drawList(); draw(); toast("지웠습니다."); }
});

/* ---------- PPT ---------- */
async function takePpt(file) {
  if (!file) return; if (!/\.pptx$/i.test(file.name)) return toast("pptx 파일만 읽을 수 있습니다. (예전 .ppt 는 파워포인트에서 pptx로 저장해 주세요)", 4500);
  const d = D(); if (!d) return;
  busy(`${file.name} 읽는 중…`);
  try {
    const deck = await readPptx(file, JSZip); deck.name = file.name;
    const chars = deck.slides.reduce((s, x) => s + x.paras.reduce((a, p) => a + p.t.length, 0), 0);
    if (!chars) { busy(false); return toast("PPT에서 글자를 찾지 못했습니다. (그림으로만 된 자료일 수 있습니다)", 4500); }
    S.deck = deck; S.ai = null;
    d.material = { name: file.name, slides: deck.slides.length, bytes: file.size, chars };
    if (!d.name) { const m = file.name.replace(/\.pptx$/i, "").replace(/_/g, " "); d.name = m; }
    touch(); busy(false); redrawKeep(); toast(`${deck.slides.length}쪽에서 글자 ${chars.toLocaleString()}자를 읽었습니다.`);
  } catch (err) { busy(false); console.error(err); toast("PPT를 읽지 못했습니다: " + (err.message || err), 5000); }
}
function showSum() {
  const el = $("#sum-prev"); if (!el || !S.deck) return;
  const s = S.ai?.[S.level] || summarize(S.deck, { level: S.level });
  el.textContent = s; $("#sum-n").textContent = `${s.length}자${S.ai?.[S.level] ? " · AI 요약" : " · 자동 요약 (PPT 글자에서 뽑음)"}`;
}
async function aiSum() {
  const d = D(); busy("AI가 요약하는 중… (10~30초)");
  try {
    const r = await fetch("/api/summarize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: deckText(S.deck), level: S.level, kind: `${d.target} ${d.gubun}` }) });
    const j = await r.json().catch(() => ({}));
    busy(false);
    if (r.status === 501) return toast("AI 요약은 아직 꺼져 있습니다 (관리자가 AI 키를 넣으면 켜집니다). 자동 요약을 쓰세요.", 5000);
    if (!r.ok) return toast("AI 요약 실패: " + (j.error || r.status), 5000);
    S.ai = { ...(S.ai || {}), [S.level]: j.text }; showSum();
  } catch (err) { busy(false); toast("AI 요약 실패: " + err.message, 5000); }
}
$("#f-ppt").onchange = e => { takePpt(e.target.files[0]); e.target.value = ""; };
$("#main").addEventListener("dragover", e => { if (e.target.closest("#drop")) { e.preventDefault(); $("#drop").classList.add("drag"); } });
$("#main").addEventListener("dragleave", e => { if (e.target.closest("#drop")) $("#drop").classList.remove("drag"); });
$("#main").addEventListener("drop", e => { if (!e.target.closest("#drop")) return; e.preventDefault(); $("#drop").classList.remove("drag"); takePpt(e.dataTransfer.files[0]); });

/* ---------- 참석자 ---------- */
async function fromIlbo() {
  const d = D(); if (!d.date) return toast("교육일자를 먼저 넣으세요.");
  const { data, error } = await sb.from("ilbo_days").select("data").eq("day", d.date).maybeSingle();
  if (error) return toast("작업일보를 불러오지 못했습니다: " + error.message);
  const ws = (data?.data?.workers || []).filter(w => w.name);
  if (!ws.length) return toast(`${d.date} 작업일보에 출력인원이 없습니다.`, 4000);
  const have = new Set(d.attendees.map(a => a.name)); let n = 0;
  for (const w of ws) if (!have.has(w.name)) { d.attendees.push({ name: w.name, job: w.job || "" }); have.add(w.name); n++; }
  d.attendees = d.attendees.filter(a => a.name || a.job);
  touch(); redrawKeep(); toast(`출력인원 ${ws.length}명 중 ${n}명을 넣었습니다.`);
}
function pasteNames() {
  const f = $("#dlg-f"), dlg = $("#dlg");
  f.innerHTML = `<h3>이름 붙여넣기</h3><p class="help" style="margin:0 0 8px">한 줄에 한 명. "이름 직종" 또는 엑셀에서 두 칸(이름·직종)을 복사해 붙여도 됩니다.</p>
    <textarea class="names" id="pn"></textarea><div class="dlg-btns"><button value="" class="btn ghost">취소</button><button value="ok" class="btn primary">넣기</button></div>`;
  dlg.returnValue = ""; dlg.showModal();
  dlg.onclose = () => {
    if (dlg.returnValue !== "ok") return; const d = D(), have = new Set(d.attendees.map(a => a.name)); let n = 0;
    for (const line of $("#pn").value.split(/\r?\n/)) { const [name, ...rest] = line.trim().split(/\t|\s{1,}/); if (!name || have.has(name)) continue; d.attendees.push({ name, job: rest.join(" ").trim() }); have.add(name); n++; }
    d.attendees = d.attendees.filter(a => a.name || a.job); touch(); redrawKeep(); toast(`${n}명을 넣었습니다.`);
  };
}

/* ---------- 사진 ---------- */
async function shrink(file, max = 1600) {
  const bmp = await createImageBitmap(file); const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, "image/jpeg", .85));
}
$("#f-photo").onchange = async e => {
  const files = [...e.target.files]; e.target.value = ""; const d = D(); if (!d || !files.length) return;
  busy(`사진 ${files.length}장 올리는 중…`);
  try {
    for (const f of files) {
      const blob = await shrink(f), path = `edu/${S.cur}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error; d.photos.push({ path, cap: "" });
    }
    touch(); busy(false); redrawKeep(); toast(`사진 ${files.length}장을 넣었습니다.`);
  } catch (err) { busy(false); toast("사진을 올리지 못했습니다: " + (err.message || err), 5000); }
};

/* ---------- 인쇄 ---------- */
$("#print").onclick = async () => {
  const x = cur(); if (!x) return toast("교육일지를 먼저 고르세요."); await flush();
  const w = window.open("", "_blank"); if (!w) return toast("팝업이 막혔습니다. 팝업을 허용해 주세요.");
  const urls = {};
  for (const p of x.data.photos) { let u = S.urls.get(p.path); if (!u) { const { data } = await sb.storage.from(BUCKET).createSignedUrl(p.path, 3600); u = data?.signedUrl; } urls[p.path] = u || ""; }
  w.document.open(); w.document.write(printDiary(x.data, urls)); w.document.close();
};

(async () => {
  try { await connect(); await loadAll(); S.cur = S.list[0]?.id ?? null; drawList(); draw(); }
  catch (e) { console.error(e); $("#main").innerHTML = `<div class="empty"><h2>불러오지 못했습니다</h2><p>${esc(e.message || e)}</p></div>`; }
})();
