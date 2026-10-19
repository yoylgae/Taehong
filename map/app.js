// 현장 지적도 — 장비·작업 배치(말풍선) + 캐드식 도면 편집
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";
import { Cad, ALIAS, polyArea, polyLen } from "./cad.js";
import { KINDS, kindOf, guessKind } from "./icons.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toast = (m, ms = 2600) => { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, ms); };
const ls = { get(k, d) { try { return JSON.parse(localStorage.getItem("pms.map." + k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem("pms.map." + k, JSON.stringify(v)); } catch {} } };
const ymd = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDay = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
const md = s => s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : "";
const inFrame = window.parent !== window;

const S = {
  mode: "view", day: ymd(new Date()), all: false, bubble: ls.get("bubble", "full"),
  marks: [], plans: [], rev: 0, sel: null, placing: null, site: "",
};
let sb;
async function connect() {
  let t = "";
  try { const r = await fetch("/__dbtoken", { cache: "no-store" }); if (r.ok) t = (await r.json()).t || ""; } catch {}
  sb = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { headers: { "x-pms-token": t } }, auth: { persistSession: false } });
}

/* ================= 도면 ================= */
const cad = new Cad($("#cv"), {
  onDraw: () => layoutMarks(),
  onLog: m => log(m),
  onPrompt: m => { $("#cmd-p").textContent = m ? m + " :" : "명령:"; },
  onTool: k => { $$("#tools [data-cmd]").forEach(b => b.classList.toggle("on", (b.dataset.cmd === (k || "SEL")))); if (k) $("#cmd-in").focus({ preventScroll: true }); },
  onSel: () => { if (S.mode === "edit") { if (cad.sel.size) showTab("props"); drawProps(); } },
  onChange: () => { drawDirty(); drawProps(); if ($("#tab-layers").offsetParent) drawLayers(); },
  onMode: () => drawStatus(),
  onMouse: m => { const k = cad.settings.mPerDu; $("#st-xy").textContent = k ? `X ${(m.x * k).toFixed(2)}  Y ${(-m.y * k).toFixed(2)} m` : `${Math.round(m.x)}, ${Math.round(-m.y)}`; },
  onClick: (x, y) => { if (S.placing) placeAt(x, y); else closePop(); },
  onPointerDown: () => { closePop(); $("#q-list").hidden = true; },
  onAskText: () => { $("#cmd-in").focus(); },
});
window.cad = cad;   // 디버깅용

/* ================= 모드 ================= */
function setMode(m) {
  if (m === S.mode) return;
  S.mode = m; cad.editable = m === "edit"; cad.cancel(true); cad.setSel([]);
  $("#app").classList.toggle("edit", m === "edit");
  $$("#mode button").forEach(b => b.classList.toggle("on", b.dataset.mode === m));
  $("#palette").hidden = m === "edit"; $("#tools").hidden = m !== "edit"; $("#cmd").hidden = m !== "edit";
  cancelPlace(); closePop();
  showTab(m === "edit" ? "props" : "list");
  if (m === "edit") { drawCurLayer(); drawStatus(); drawDirty(); log("도면 편집 — 명령을 입력하거나 위 도구를 누르세요. 휠=확대/축소, 가운데 버튼 끌기=이동, 오른쪽 클릭=Enter"); }
  requestAnimationFrame(() => cad.resize());
}
$("#mode").onclick = e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.mode === "view" && cad.dirty && !confirm("저장하지 않은 도면 수정이 있습니다. 저장하지 않고 배치 모드로 갈까요?\n(수정 내용은 화면에 남아 있고, 다시 편집으로 와서 저장할 수 있습니다)")) return; setMode(b.dataset.mode); };

/* ================= 날짜 ================= */
function setDay(d) { S.day = d; $("#d-day").value = d; drawAll(); }
$("#d-day").onchange = e => e.target.value && setDay(e.target.value);
$("#d-prev").onclick = () => setDay(addDay(S.day, -1));
$("#d-next").onclick = () => setDay(addDay(S.day, 1));
$("#d-today").onclick = () => setDay(ymd(new Date()));
$("#d-all").onchange = e => { S.all = e.target.checked; drawAll(); };
const onDay = (f, t, d = S.day) => (!f || f <= d) && (!t || d <= t);
const visibleMarks = () => S.marks.filter(m => S.all || onDay(m.date_from, m.date_to));
function drawAll() { drawList(); layoutMarks(true); }

/* ================= 아이콘 모음 · 놓기 ================= */
$("#pal").innerHTML = KINDS.map(k => `<div class="pk" data-kind="${esc(k.id)}" style="--c:${k.color}" title="${esc(k.id)} — 끌어서 지도에 놓기"><i>${k.svg}</i><span>${esc(k.id)}</span></div>`).join("");
$("#pal").addEventListener("pointerdown", e => {
  const pk = e.target.closest(".pk"); if (!pk || e.button) return;
  e.preventDefault();
  const k = kindOf(pk.dataset.kind); let ghost = null; const x0 = e.clientX, y0 = e.clientY;
  const mv = ev => {
    if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) { ghost = document.createElement("div"); ghost.className = "ghost-drag"; ghost.style.setProperty("--c", k.color); ghost.innerHTML = k.svg; document.body.append(ghost); }
    if (ghost) { ghost.style.left = ev.clientX + "px"; ghost.style.top = ev.clientY + "px"; }
  };
  const upf = ev => {
    removeEventListener("pointermove", mv); removeEventListener("pointerup", upf);
    if (!ghost) { startPlace({ kind: k.id }); return; }   // 그냥 누르면 → 지도에서 위치 고르기
    ghost.remove();
    const r = $("#stage").getBoundingClientRect();
    if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
      const [x, y] = cad.toW(ev.clientX - r.left, ev.clientY - r.top + 22);   // 핀 끝이 손가락 아래
      openEditor({ kind: k.id, x, y, date_from: S.day, date_to: S.day });
    }
  };
  addEventListener("pointermove", mv); addEventListener("pointerup", upf);
});
function startPlace(preset) {
  S.placing = preset; const k = kindOf(preset.kind);
  $$(".pk").forEach(p => p.classList.toggle("on", p.dataset.kind === preset.kind));
  const h = $("#place-hint"); h.hidden = false;
  h.innerHTML = `<span>📍 <b>${esc(preset.name || k.id)}</b> 놓을 위치를 지도에서 누르세요</span><button type="button" id="ph-x">취소</button>`;
  $("#ph-x").onclick = cancelPlace;
}
function cancelPlace() { S.placing = null; $("#place-hint").hidden = true; $$(".pk.on").forEach(p => p.classList.remove("on")); }
function placeAt(x, y) { const p = S.placing; cancelPlace(); openEditor({ date_from: S.day, date_to: S.day, ...p, x, y }); }

/* ================= 지도 위 표시 + 말풍선 ================= */
const els = new Map();   // id → {mk, bb, key, w, h}
function markHTML(m) { const k = kindOf(m.kind); return `<div class="pin">${k.svg}</div>`; }
function bubbleHTML(m) {
  const k = kindOf(m.kind), short = S.bubble === "short";
  const range = m.date_from && m.date_to && m.date_from !== m.date_to ? `${md(m.date_from)}~${md(m.date_to)}` : "";
  if (short) return `<div class="t1"><b>${esc(k.id)}</b>${m.work ? esc(" · " + m.work) : ""}</div>`;
  return `<div class="t1"><b>${esc(k.id)}</b>${m.name ? `<small>${esc(m.name)}</small>` : ""}</div>
    ${m.work ? `<div class="t2">${esc(m.work)}</div>` : ""}
    ${m.company || range ? `<div class="t3">${esc([m.company, range].filter(Boolean).join(" · "))}</div>` : ""}`;
}
function layoutMarks(force) {
  const box = $("#marks"), W = cad.W || 0, H = cad.H || 0; if (!W) return;
  const list = visibleMarks(), keep = new Set();
  const placed = [], lines = [];
  const pins = list.map(m => { const [sx, sy] = cad.toS(m.x, m.y); return { m, sx, sy }; }).filter(p => p.sx > -150 && p.sx < W + 150 && p.sy > -150 && p.sy < H + 200);
  // 핀 자리도 피해서 말풍선 놓기
  const pinR = pins.map(p => [p.sx - 20, p.sy - 48, p.sx + 20, p.sy + 2]);
  const ov = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  pins.sort((a, b) => a.sy - b.sy || a.sx - b.sx);
  for (const p of pins) {
    const { m, sx, sy } = p; keep.add(m.id);
    let o = els.get(m.id);
    if (!o) {
      const mk = document.createElement("div"); mk.className = "mk"; mk.dataset.id = m.id;
      const bb = document.createElement("div"); bb.className = "bb"; bb.dataset.id = m.id;
      box.append(mk, bb); o = { mk, bb }; els.set(m.id, o);
    }
    const k = kindOf(m.kind), key = m.kind + "|" + bubbleHTML(m) + S.bubble;
    o.mk.style.setProperty("--c", k.color); o.bb.style.setProperty("--c", k.color);
    if (o.key !== key || force) { o.mk.innerHTML = markHTML(m) + `<span class="dot"></span>`; o.bb.innerHTML = bubbleHTML(m); o.bb.className = "bb" + (S.bubble === "short" ? " short" : ""); o.key = key; o.w = 0; }
    o.mk.classList.toggle("sel", S.sel === m.id);
    o.mk.style.transform = `translate(${sx}px,${sy}px)`;
    if (S.bubble === "off") { o.bb.hidden = true; continue; }
    o.bb.hidden = false;
    if (!o.w) { o.w = o.bb.offsetWidth; o.h = o.bb.offsetHeight; }
    const w = o.w, h = o.h, top = sy - 50;
    const cands = [[sx - w / 2, top - h - 6], [sx + 14, top - h - 2], [sx - w - 14, top - h - 2], [sx + 26, sy - 30 - h / 2], [sx - w - 26, sy - 30 - h / 2],
      [sx - w / 2, top - h - 6 - (h + 10)], [sx + 30, top - h - 30], [sx - w - 30, top - h - 30], [sx - w / 2, sy + 12], [sx - w / 2, top - h - 6 - 2 * (h + 10)]];
    let best = null, bs = Infinity;
    for (let i = 0; i < cands.length; i++) {
      const [x, y] = cands[i], r = [x - 3, y - 3, x + w + 3, y + h + 3];
      let s = i * 2;   // 가까운 자리를 먼저
      for (const q of placed) s += ov(r, q) * 10; for (const q of pinR) s += ov(r, q) * 4;
      if (x < 0) s += -x * 3; if (y < 0) s += -y * 3; if (x + w > W) s += (x + w - W) * 3;
      if (s < bs) { bs = s; best = [x, y]; } if (s === i * 2) break;
    }
    const [bx, by] = best; placed.push([bx, by, bx + w, by + h]);
    o.bb.style.transform = `translate(${Math.round(bx)}px,${Math.round(by)}px)`;
    // 핀 머리에서 말풍선까지 지시선
    const cx = Math.max(bx + 8, Math.min(bx + w - 8, sx)), cy = by + h <= top ? by + h : by > sy ? by : by + h / 2;
    const ex = by + h <= top || by > sy ? cx : (bx > sx ? bx : bx + w);
    lines.push(`<line x1="${sx}" y1="${sy - 44}" x2="${ex}" y2="${cy}" stroke="${k.color}" stroke-width="1.6" stroke-dasharray="${Math.hypot(ex - sx, cy - sy + 44) > 30 ? "4 3" : ""}"/>`);
  }
  for (const [id, o] of els) if (!keep.has(id)) { o.mk.remove(); o.bb.remove(); els.delete(id); }
  $("#leaders").innerHTML = lines.join("");
}

// 표시 끌기 · 누르기
$("#marks").addEventListener("pointerdown", e => {
  const el = e.target.closest(".mk,.bb"); if (!el || S.mode !== "view") return;
  e.preventDefault(); e.stopPropagation();
  const m = S.marks.find(x => x.id === el.dataset.id); if (!m) return;
  closePop();
  if (el.classList.contains("bb")) { openPop(m); return; }
  const o = els.get(m.id), r = $("#stage").getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, ox = m.x, oy = m.y; let moved = false;
  el.setPointerCapture(e.pointerId);
  const mv = ev => { if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return; moved = true; o.mk.classList.add("drag");
    const [x, y] = cad.toW(ev.clientX - r.left, ev.clientY - r.top); const [a, b] = cad.toW(x0 - r.left, y0 - r.top); m.x = ox + x - a; m.y = oy + y - b; layoutMarks(); };
  const upf = async () => { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", upf); o.mk.classList.remove("drag");
    if (!moved) { openPop(m); return; }
    const { error } = await sb.from("site_map_marks").update({ x: m.x, y: m.y, updated_at: new Date().toISOString() }).eq("id", m.id);
    if (error) { m.x = ox; m.y = oy; layoutMarks(); toast("옮기지 못했습니다: " + error.message); } else toast(`${kindOf(m.kind).id} 위치를 옮겼습니다.`); };
  el.addEventListener("pointermove", mv); el.addEventListener("pointerup", upf);
});

/* ================= 상세 보기 ================= */
function openPop(m) {
  S.sel = m.id; layoutMarks(); drawList();
  const k = kindOf(m.kind), p = $("#pop"), plan = S.plans.find(x => x.id === m.plan_id);
  const range = [m.date_from, m.date_to].filter(Boolean); const rs = range.length === 2 && range[0] !== range[1] ? `${range[0]} ~ ${range[1]}` : range[0] || "기간 없음";
  p.style.setProperty("--c", k.color);
  p.innerHTML = `<button type="button" class="x" id="p-x">✕</button>
    <h4><span class="mk-ic" style="--c:${k.color}">${k.svg}</span><span>${esc(k.id)} ${m.name ? `<small>${esc(m.name)}</small>` : ""}</span></h4>
    <dl><dt>작업</dt><dd><b>${esc(m.work || "-")}</b></dd><dt>업체</dt><dd>${esc(m.company || "-")}</dd>
    <dt>기간</dt><dd>${esc(rs)}</dd>${m.manager || m.phone ? `<dt>담당</dt><dd>${esc(m.manager || "")} ${m.phone ? `<a href="tel:${esc(m.phone)}">${esc(m.phone)}</a>` : ""}</dd>` : ""}
    ${plan ? `<dt>계획서</dt><dd>${esc(plan.work_name || "")} <small>(${esc(plan.status || "")})</small></dd>` : ""}
    ${m.memo ? `<dt>메모</dt><dd>${esc(m.memo)}</dd>` : ""}</dl>
    <div class="row">${plan ? `<button type="button" class="btn" id="p-plan">📋 작업계획서</button>` : ""}<button type="button" class="btn primary" id="p-edit">✏️ 고치기</button></div>`;
  p.hidden = false;
  const [sx, sy] = cad.toS(m.x, m.y), W = cad.W, pw = 270, ph = p.offsetHeight;
  p.style.left = Math.max(8, Math.min(W - pw - 8, sx + 28)) + "px";
  p.style.top = Math.max(8, Math.min(cad.H - ph - 8, sy - ph / 2 - 20)) + $("#stage").offsetTop + "px";
  $("#p-x").onclick = closePop;
  $("#p-edit").onclick = () => { closePop(); openEditor(m); };
  $("#p-plan")?.addEventListener("click", () => openPlan(m.plan_id));
}
function closePop() { if ($("#pop").hidden) return; $("#pop").hidden = true; S.sel = null; layoutMarks(); drawList(); }
function openPlan(id) {
  if (inFrame) window.parent.postMessage({ pms: "open", id: "ewp", hash: "#/edit/" + id }, location.origin);
  else window.open("../ewp/#/edit/" + id, "_blank");
}

/* ================= 입력 창 ================= */
let editing = null;
function openEditor(m) {
  editing = { ...m };
  const f = $("#f-mark"), d = $("#dlg-mark");
  for (const k of ["name", "company", "work", "manager", "phone", "date_from", "date_to", "memo"]) f[k].value = m[k] || "";
  const plans = S.plans.filter(p => p.id === m.plan_id || !m.date_from || !p.work_start || (p.work_start <= (m.date_to || m.date_from) && (!p.work_end || p.work_end >= m.date_from)));
  f.plan_id.innerHTML = `<option value="">연결 안 함</option>` + plans.map(p => `<option value="${p.id}">${esc([p.equip_type, p.reg_no].filter(Boolean).join(" "))} · ${esc(p.work_name || "")} (${md(p.work_start)}~${md(p.work_end)})</option>`).join("");
  f.plan_id.value = m.plan_id || "";
  drawKinds(); $("#m-del").hidden = !m.id;
  $("#m-title").textContent = m.id ? "장비·작업 고치기" : "장비·작업 놓기";
  d.showModal(); setTimeout(() => (f.work.value ? f.name : f.work).focus(), 30);
}
function drawKinds() {
  const k = kindOf(editing.kind); $("#m-ic").innerHTML = k.svg; $("#m-ic").style.setProperty("--c", k.color);
  $("#m-kinds").innerHTML = KINDS.map(x => `<button type="button" data-k="${esc(x.id)}" class="${x.id === editing.kind ? "on" : ""}" style="--c:${x.color}"><i>${x.svg}</i>${esc(x.id)}</button>`).join("");
}
$("#m-kinds").onclick = e => { const b = e.target.closest("[data-k]"); if (b) { editing.kind = b.dataset.k; drawKinds(); } };
$("#f-mark").plan_id.onchange = e => {
  const p = S.plans.find(x => x.id === e.target.value); if (!p) return; const f = $("#f-mark");
  if (!f.name.value) f.name.value = [p.spec, p.reg_no].filter(Boolean).join(" ");
  if (!f.company.value) f.company.value = p.company_name || "";
  if (!f.work.value) f.work.value = p.work_name || "";
  if (p.work_start) f.date_from.value = p.work_start; if (p.work_end) f.date_to.value = p.work_end;
  if (!editing.id) { editing.kind = guessKind(p.equip_type + " " + (p.spec || "")); drawKinds(); }
};
$("#dlg-mark").addEventListener("close", async () => {
  if ($("#dlg-mark").returnValue !== "save" || !editing) return;
  const f = $("#f-mark"), v = k => f[k].value.trim() || null;
  const row = { kind: editing.kind, x: editing.x, y: editing.y, name: v("name"), company: v("company"), work: v("work"), manager: v("manager"), phone: v("phone"),
    date_from: v("date_from"), date_to: v("date_to") || v("date_from"), memo: v("memo"), plan_id: v("plan_id"), updated_at: new Date().toISOString() };
  if (row.date_from && row.date_to && row.date_to < row.date_from) [row.date_from, row.date_to] = [row.date_to, row.date_from];
  if (editing.id) {
    const { error } = await sb.from("site_map_marks").update(row).eq("id", editing.id);
    if (error) return toast("저장하지 못했습니다: " + error.message);
    Object.assign(S.marks.find(x => x.id === editing.id), row);
  } else {
    const { data, error } = await sb.from("site_map_marks").insert(row).select().single();
    if (error) return toast("저장하지 못했습니다: " + error.message);
    S.marks.push(data);
    if (!S.all && !onDay(row.date_from, row.date_to)) toast(`저장했습니다. 작업 기간(${row.date_from}~)이 보고 있는 날짜와 달라 지금은 안 보입니다.`, 4500);
  }
  toast(`${kindOf(row.kind).id} — ${row.work || ""} 저장했습니다.`);
  editing = null; drawAll();
});
$("#m-del").onclick = async () => {
  if (!editing?.id || !confirm("이 장비·작업 표시를 지울까요?")) return;
  const { error } = await sb.from("site_map_marks").delete().eq("id", editing.id);
  if (error) return toast("지우지 못했습니다: " + error.message);
  S.marks = S.marks.filter(x => x.id !== editing.id); editing = null; $("#dlg-mark").close(); drawAll(); toast("지웠습니다.");
};

/* ================= 오른쪽: 작업 현황 ================= */
function drawList() {
  const list = visibleMarks().slice().sort((a, b) => KINDS.findIndex(k => k.id === a.kind) - KINDS.findIndex(k => k.id === b.kind) || (a.work || "").localeCompare(b.work || ""));
  const cnt = {}; list.forEach(m => cnt[m.kind] = (cnt[m.kind] || 0) + 1);
  const linked = new Set(S.marks.map(m => m.plan_id).filter(Boolean));
  const plans = S.plans.filter(p => !linked.has(p.id) && p.work_start && (S.all ? p.work_end >= ymd(new Date()) : onDay(p.work_start, p.work_end)));
  const day = S.all ? "전체 기간" : `${S.day} (${"일월화수목금토"[new Date(S.day + "T00:00:00").getDay()]})`;
  $("#tab-list").innerHTML = `
    <div class="sec-t"><span>${esc(day)} 작업</span><small>${list.length}건</small></div>
    ${list.length ? `<div class="sum">${Object.entries(cnt).map(([k, n]) => { const K = kindOf(k); return `<span style="--c:${K.color}"><i>${K.svg}</i>${esc(K.id)} ${n}</span>`; }).join("")}</div>` : ""}
    ${list.length ? list.map(m => { const k = kindOf(m.kind); return `<div class="it ${S.sel === m.id ? "sel" : ""}" data-id="${m.id}" style="--c:${k.color}"><span class="ic">${k.svg}</span><div class="tx"><b>${esc(k.id)}<em>${esc(m.name || "")}</em></b><div>${esc(m.work || "-")}</div><small>${esc([m.company, m.date_from && m.date_to && m.date_from !== m.date_to ? `${md(m.date_from)}~${md(m.date_to)}` : ""].filter(Boolean).join(" · "))}</small></div></div>`; }).join("")
      : `<div class="empty">이 날 지도에 놓인 장비·작업이 없습니다.<br>위 아이콘을 지도에 끌어다 놓으세요.</div>`}
    ${plans.length ? `<div class="sec-t" style="margin-top:14px"><span>작업계획서 장비 · 지도에 없음</span><small>${plans.length}건</small></div>
      ${plans.map(p => { const k = kindOf(guessKind(p.equip_type + " " + (p.spec || ""))); return `<div class="plan" style="--c:${k.color}"><span class="it" style="padding:0"><span class="ic" style="width:28px;height:28px">${k.svg}</span></span><div class="tx"><b>${esc([p.equip_type, p.spec].filter(Boolean).join(" "))} · ${esc(p.work_name || "")}</b><small>${esc(p.company_name || "")} ${md(p.work_start)}~${md(p.work_end)}</small></div><button type="button" data-plan="${p.id}">📍 위치 지정</button></div>`; }).join("")}` : ""}`;
}
$("#tab-list").addEventListener("click", e => {
  const pb = e.target.closest("[data-plan]");
  if (pb) { const p = S.plans.find(x => x.id === pb.dataset.plan); if (S.mode !== "view") setMode("view");
    startPlace({ kind: guessKind(p.equip_type + " " + (p.spec || "")), name: [p.spec, p.reg_no].filter(Boolean).join(" "), company: p.company_name, work: p.work_name, date_from: p.work_start, date_to: p.work_end, plan_id: p.id }); return; }
  const it = e.target.closest(".it[data-id]"); if (!it) return;
  const m = S.marks.find(x => x.id === it.dataset.id); if (!m) return;
  if (S.mode !== "view") setMode("view");
  cad.flyTo(m.x, m.y, Math.max(cad.view.s, 0.9)); setTimeout(() => openPop(m), 420);
});

/* ================= 오른쪽 패널 탭 ================= */
function showTab(t) {
  $$("#side-tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  for (const x of ["list", "layers", "props"]) $("#tab-" + x).hidden = x !== t;
  if (t === "layers") drawLayers(); if (t === "props") drawProps(); if (t === "list") drawList();
}
$("#side-tabs").onclick = e => { const b = e.target.closest("button"); if (b) { $("#side").classList.remove("min"); showTab(b.dataset.tab); } };
$("#side-tg").onclick = () => { const s = $("#side"); s.classList.toggle("min"); $("#side-tg").textContent = s.classList.contains("min") ? "⟨" : "⟩"; ls.set("sideMin", s.classList.contains("min")); requestAnimationFrame(() => cad.resize()); };
if (ls.get("sideMin", innerWidth < 900)) { $("#side").classList.add("min"); $("#side-tg").textContent = "⟨"; }

/* ---------- 레이어 ---------- */
function drawLayers() {
  const n = {}; cad.ents.forEach(e => n[e.l] = (n[e.l] || 0) + 1);
  $("#tab-layers").innerHTML = `<div class="sec-t"><span>레이어</span><small>눈=보이기 · 자물쇠=잠금</small></div>` +
    cad.layers.map((l, i) => `<div class="lay ${cad.cur.layer === l.id ? "cur" : ""}" data-i="${i}">
      <button type="button" data-a="vis" class="${l.vis ? "" : "off"}" title="보이기/숨기기">👁</button>
      <button type="button" data-a="lock" class="${l.lock ? "" : "off"}" title="잠그면 고를 수 없음">${l.lock ? "🔒" : "🔓"}</button>
      <input type="color" data-a="color" value="${l.color}" title="레이어 색">
      <span class="nm" data-a="cur" title="${S.mode === "edit" ? "누르면 현재 레이어(새로 그리는 객체가 들어감)" : ""}">${esc(l.name)}</span><small>${n[l.id] || 0}</small>
      ${S.mode === "edit" && !n[l.id] && l.id !== "작업" ? `<button type="button" data-a="del" title="빈 레이어 지우기">✕</button>` : ""}</div>`).join("") +
    (S.mode === "edit" ? `<div class="lay-add"><input id="lay-new" placeholder="새 레이어 이름"><button type="button" class="btn" id="lay-add">추가</button></div>
      <p class="keys">레이어를 <b>잠그면</b> 그 선은 고를 수 없어 실수로 옮기지 않습니다. 원본 지적도 선은 잠가 두고 <b>작업</b> 레이어에 그리면 편합니다.</p>` : `<p class="keys">레이어 보이기·숨기기는 이 화면에서만 바뀝니다. 저장하려면 도면 편집에서 저장하세요.</p>`);
}
$("#tab-layers").addEventListener("click", e => {
  const a = e.target.closest("[data-a]"); if (e.target.id === "lay-add") return addLayer(); if (!a) return;
  const l = cad.layers[+a.closest(".lay").dataset.i];
  if (a.dataset.a === "vis") { l.vis = !l.vis; cad.dirty += S.mode === "edit" ? 1 : 0; }
  else if (a.dataset.a === "lock") { if (S.mode !== "edit") return; l.lock = !l.lock; cad.dirty++; if (l.lock) cad.setSel(cad.selected().filter(x => x.l !== l.id).map(x => x.id)); }
  else if (a.dataset.a === "cur") { if (S.mode !== "edit") return; cad.cur.layer = l.id; drawCurLayer(); }
  else if (a.dataset.a === "del") { cad.layers.splice(cad.layers.indexOf(l), 1); if (cad.cur.layer === l.id) cad.cur.layer = "작업"; cad.dirty++; drawCurLayer(); }
  else return;
  drawLayers(); drawDirty(); cad.render();
});
$("#tab-layers").addEventListener("change", e => { if (e.target.dataset.a !== "color") return; const l = cad.layers[+e.target.closest(".lay").dataset.i]; l.color = e.target.value; cad.dirty++; drawDirty(); cad.render(); });
$("#tab-layers").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "lay-new") addLayer(); });
function addLayer() {
  const nm = $("#lay-new").value.trim(); if (!nm) return;
  if (cad.layers.some(l => l.id === nm)) return toast("같은 이름의 레이어가 있습니다.");
  cad.layers.push({ id: nm, name: nm, color: "#" + Math.floor(Math.random() * 0xbbbbbb).toString(16).padStart(6, "0"), vis: true, lock: false });
  cad.cur.layer = nm; cad.dirty++; drawLayers(); drawCurLayer(); drawDirty();
}
function drawCurLayer() {
  $("#cur-layer").innerHTML = cad.layers.map(l => `<option ${l.id === cad.cur.layer ? "selected" : ""}>${esc(l.id)}</option>`).join("");
  $("#cur-bylayer").classList.toggle("on", !cad.cur.color);
}
$("#cur-layer").onchange = e => { cad.cur.layer = e.target.value; if ($("#tab-layers").offsetParent) drawLayers(); };
$("#cur-color").oninput = e => { cad.cur.color = e.target.value; drawCurLayer(); };
$("#cur-bylayer").onclick = () => { cad.cur.color = null; drawCurLayer(); };
$("#cur-w").onchange = e => cad.cur.w = +e.target.value;
$("#cur-fill").oninput = e => cad.cur.fill = e.target.value;

/* ---------- 속성 ---------- */
const TN = { pl: "선", fill: "채움", ci: "원", tx: "글자", gl: "지번 글자", dm: "치수" };
function drawProps() {
  const el = $("#tab-props"); if (el.hidden) return;
  const s = cad.selected();
  if (!s.length) {
    el.innerHTML = `<div class="props"><div class="info"><b>고른 객체 없음</b><br><span class="hint">선을 누르거나 끌어서 고르세요. 왼쪽→오른쪽으로 끌면 <b>완전히 들어간 것</b>만, 오른쪽→왼쪽은 <b>걸친 것</b>도 고릅니다. Shift+누르기 = 추가/빼기</span></div>
      <div class="keys"><b>단축키</b><br>
      <kbd>L</kbd> 선 <kbd>PL</kbd> 폴리선 <kbd>REC</kbd> 사각형 <kbd>C</kbd> 원 <kbd>H</kbd> 영역 <kbd>T</kbd> 글자<br>
      <kbd>DIM</kbd> 치수 <kbd>DI</kbd> 거리 <kbd>M</kbd> 이동 <kbd>CO</kbd> 복사 <kbd>RO</kbd> 회전 <kbd>E</kbd>/<kbd>Del</kbd> 삭제<br>
      <kbd>Enter</kbd>/<kbd>Space</kbd>/오른쪽 클릭 = 끝내기·직전 명령 반복 · <kbd>Esc</kbd> 취소<br>
      <kbd>Ctrl+Z</kbd> 실행취소 <kbd>Ctrl+Y</kbd> 다시 · <kbd>F3</kbd> 스냅 <kbd>F8</kbd> 직교(Shift)<br>
      선을 그리는 중 숫자를 치면 그 <b>길이</b>만큼 그려집니다. 고른 객체의 파란 네모(그립)를 끌면 꼭짓점이 움직이고, 객체를 끌면 이동, <kbd>Ctrl</kbd>+끌기는 복사입니다.<br>
      <kbd>CAL</kbd> 축척 맞추기: 실제 길이를 아는 두 점을 찍고 m 를 넣으면 거리·면적이 m·㎡ 로 나옵니다.</div></div>`;
    return;
  }
  const one = s.length === 1 ? s[0] : null, types = [...new Set(s.map(e => e.t))];
  const same = f => { const v = s.map(f); return v.every(x => x === v[0]) ? v[0] : undefined; };
  const lay = same(e => e.l), col = same(e => e.c ?? null), w = same(e => e.w || 1);
  let info = one ? TN[one.t] : `${s.length}개 (${types.map(t => TN[t]).join(", ")})`;
  if (one?.t === "pl") info += ` · 길이 ${cad.fmtLen(polyLen(one.p, one.z))}` + (one.z ? ` · 면적 ${cad.fmtArea(polyArea(one.p))}` : "");
  if (one?.t === "ci") info += ` · 반지름 ${cad.fmtLen(one.r)} · 면적 ${cad.fmtArea(Math.PI * one.r * one.r)}`;
  if (one?.t === "dm") info += ` · ${cad.fmtLen(Math.hypot(one.p[2] - one.p[0], one.p[3] - one.p[1]))}`;
  const fillable = s.every(e => (e.t === "pl" && e.z) || e.t === "ci"), texty = one && (one.t === "tx" || one.t === "gl");
  const fillOn = fillable && s.every(e => e.f);
  el.innerHTML = `<div class="props">
    <div class="info"><b>${esc(info)}</b>${one?.s && one.t === "gl" ? `<br><span class="hint">PDF 원본 글자 "${esc(one.s)}" — 내용을 고치면 일반 글자로 바뀝니다</span>` : ""}</div>
    <div class="row"><span>레이어</span><select data-p="l">${lay === undefined ? `<option value="">(여러 개)</option>` : ""}${cad.layers.map(l => `<option ${l.id === lay ? "selected" : ""}>${esc(l.id)}</option>`).join("")}</select></div>
    ${types.some(t => t !== "fill") || types.includes("fill") ? `<div class="row"><span>색</span><div class="cl"><input type="color" data-p="c" value="${col || (lay ? (cad.layers.find(l => l.id === lay)?.color || "#000000") : "#000000")}"><label><input type="checkbox" data-p="bylayer" ${col === null ? "checked" : ""}> 레이어 색</label></div></div>` : ""}
    ${types.some(t => t === "pl" || t === "ci") ? `<div class="row"><span>굵기</span><select data-p="w">${w === undefined ? `<option value="">(여러 개)</option>` : ""}${[[1, "가늘게"], [2, "보통"], [4, "굵게"], [8, "아주 굵게"]].map(([v, n]) => `<option value="${v}" ${v === w ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div class="row"><span>선 모양</span><label><input type="checkbox" data-p="d" ${s.every(e => e.d) ? "checked" : ""}> 점선</label></div>` : ""}
    ${fillable ? `<div class="row"><span>채우기</span><div class="cl"><label><input type="checkbox" data-p="fon" ${fillOn ? "checked" : ""}> 칠함</label><input type="color" data-p="f" value="${same(e => e.f) || cad.cur.fill}"></div></div>
      <div class="row"><span>투명도</span><input type="range" min="0.05" max="1" step="0.05" data-p="fo" value="${same(e => e.fo ?? 0.3) ?? 0.3}"></div>` : ""}
    ${texty ? `<div class="row"><span>글자</span><textarea data-p="s" rows="2">${esc(one.s || "")}</textarea></div>
      <div class="row"><span>크기</span><input type="number" data-p="h" value="${Math.round(one.h || 21)}" min="1"></div>
      ${one.t === "tx" ? `<div class="row"><span>모양</span><div class="cl"><label><input type="checkbox" data-p="b" ${one.b ? "checked" : ""}> 굵게</label><label><input type="checkbox" data-p="bg" ${one.bg ? "checked" : ""}> 흰 바탕</label></div></div>` : ""}` : ""}
    <div class="dlg-btns"><button type="button" class="btn danger" id="pp-del">🗑 삭제</button><span class="grow"></span><button type="button" class="btn" id="pp-zoom">이 객체로 확대</button></div>
  </div>`;
}
$("#tab-props").addEventListener("change", e => {
  const p = e.target.dataset.p; if (!p) return; const s = cad.selected(); if (!s.length) return; const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
  const F = {
    l: x => { if (v) x.l = v; }, c: x => { x.c = v; }, bylayer: x => { if (v) delete x.c; else x.c = cad.colorOf(x); }, w: x => { if (v && x.t !== "fill") x.w = +v; },
    d: x => { if (x.t === "pl" || x.t === "ci") { if (v) x.d = 1; else delete x.d; } }, fon: x => { if (v) { x.f = x.f || cad.cur.fill; x.fo = x.fo ?? 0.3; } else { delete x.f; delete x.fo; } },
    f: x => { x.f = v; x.fo = x.fo ?? 0.3; }, fo: x => { x.fo = +v; },
    s: x => { if (x.t === "gl") { Object.keys(x).forEach(k => k !== "id" && k !== "l" && k !== "c" && delete x[k]); Object.assign(x, { t: "tx", x: s[0].x, y: s[0].y, h: s[0].h || 21 }); } x.s = v; },
    h: x => { x.h = Math.max(1, +v); }, b: x => { if (v) x.b = 1; else delete x.b; }, bg: x => { if (v) x.bg = "#ffffff"; else delete x.bg; },
  }[p];
  if (!F) return;
  cad.edit("속성 바꾸기", s, F); drawProps();
});
$("#tab-props").addEventListener("click", e => {
  if (e.target.id === "pp-del") cad.erase(cad.selected());
  if (e.target.id === "pp-zoom") { const s = cad.selected(); if (!s.length) return; const b = s.map(x => cad.bbox(x)).reduce((a, q) => [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[2]), Math.max(a[3], q[3])]); const pad = Math.max(b[2] - b[0], b[3] - b[1]) * 0.3 + 30; cad.fit([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]); }
});

/* ================= 명령줄 ================= */
const logs = [];
function log(m) { if (!m) return; logs.push(m); if (logs.length > 3) logs.shift(); $("#cmd-log").innerHTML = logs.map(x => `<div>${esc(x)}</div>`).join(""); }
$("#cmd-in").addEventListener("keydown", e => {
  if (e.key === "Enter" || (e.key === " " && !(cad.tool?.k === "T" && cad.tool.pts.length))) {
    e.preventDefault(); const v = e.target.value; e.target.value = "";
    if (!v.trim()) { cad.enter(); return; }
    if (!cad.tool) log("명령: " + v);
    cad.input(v);
    return;
  }
  if (e.key === "Escape") { e.target.value = ""; cad.cancel(); e.target.blur(); return; }
  if (["F3", "F8"].includes(e.key) || ((e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key))) { e.preventDefault(); cad.key(e); }
});
$$("#tools [data-cmd]").forEach(b => b.onclick = () => { if (b.dataset.cmd === "SEL") cad.cancel(true); else cad.run(b.dataset.cmd); });
$("#undo").onclick = () => cad.undo(); $("#redo").onclick = () => cad.redo();
$("#st-snap").onclick = () => { cad.osnap = !cad.osnap; drawStatus(); };
$("#st-ortho").onclick = () => { cad.ortho = !cad.ortho; drawStatus(); };
$("#st-scale").onclick = () => cad.run("CAL");
function drawStatus() {
  $("#st-snap").classList.toggle("on", cad.osnap); $("#st-ortho").classList.toggle("on", cad.ortho);
  const k = cad.settings.mPerDu; $("#st-scale").textContent = k ? `축척 1m = ${Math.round(1 / k)}단위` : "축척 없음";
  $("#st-scale").classList.toggle("on", !!k);
}
function drawDirty() { $("#dirty").textContent = cad.dirty ? `저장 안 한 수정 있음` : ""; $("#save").disabled = false; drawStatus(); }

/* ================= 키보드 ================= */
addEventListener("keydown", e => {
  const inField = e.target.closest?.("input,textarea,select,dialog");
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (S.mode === "edit") saveDoc(); return; }
  if (inField) return;
  if (e.key === "Escape" && S.placing) { cancelPlace(); return; }
  if (S.mode !== "edit") { if (e.key === "Escape") closePop(); return; }
  if (cad.key(e)) { e.preventDefault(); return; }
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cad.enter(); return; }
  // 그냥 글자를 치면 명령줄로
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { $("#cmd-in").focus(); }
});
addEventListener("keyup", e => cad.key(e));

/* ================= 찾기 ================= */
let found = [];
$("#q").addEventListener("input", () => {
  const q = $("#q").value.replace(/\s+/g, ""), L = $("#q-list");
  if (!q) { L.hidden = true; return; }
  found = cad.ents.filter(e => (e.t === "gl" || e.t === "tx") && e.s && e.s.replace(/\s+/g, "").includes(q)).slice(0, 40);
  const ms = S.marks.filter(m => [m.kind, m.name, m.work, m.company].some(v => (v || "").replace(/\s+/g, "").includes(q))).slice(0, 10);
  L.innerHTML = [...ms.map(m => `<div data-m="${m.id}"><span>${esc(kindOf(m.kind).id)} · ${esc(m.work || "")}</span><small>${esc(m.date_from || "")}</small></div>`),
    ...found.map((e, i) => `<div data-i="${i}"><span>${esc(e.s)}</span><small>${e.t === "gl" ? "지번" : "글자"}</small></div>`)].join("") || `<div><small>찾는 글자가 없습니다</small></div>`;
  L.hidden = false;
});
$("#q").addEventListener("keydown", e => { if (e.key === "Enter") $("#q-list div[data-i],#q-list div[data-m]")?.click(); if (e.key === "Escape") { $("#q-list").hidden = true; $("#q").blur(); } });
$("#q-list").addEventListener("click", e => {
  const d = e.target.closest("div[data-i],div[data-m]"); if (!d) return; $("#q-list").hidden = true;
  if (d.dataset.m) { const m = S.marks.find(x => x.id === d.dataset.m); if (!m) return; if (!S.all && !onDay(m.date_from, m.date_to)) setDay(m.date_from); cad.flyTo(m.x, m.y, Math.max(cad.view.s, 0.9)); setTimeout(() => openPop(m), 420); return; }
  const t = found[+d.dataset.i], b = cad.bbox(t);
  cad.flyTo((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, Math.max(cad.view.s, 2.2));
  cad.flash = { b, until: performance.now() + 2600 }; const tick = () => { cad.render(); if (performance.now() < cad.flash.until) requestAnimationFrame(tick); else { cad.flash = null; cad.render(); } }; tick();
});
// 찾은 자리 반짝임 (cad 그리기 뒤에 덧그림)
const _draw = cad._draw.bind(cad);
cad._draw = function () { _draw(); const f = cad.flash; if (!f) return; const c = cad.ctx, [x0, y0] = cad.toS(f.b[0], f.b[1]), [x1, y1] = cad.toS(f.b[2], f.b[3]), k = (Math.sin(performance.now() / 160) + 1) / 2;
  c.setTransform(cad.dpr, 0, 0, cad.dpr, 0, 0); c.strokeStyle = `rgba(234,88,12,${0.5 + k * 0.5})`; c.lineWidth = 3; const p = 8 + k * 6; c.strokeRect(x0 - p, y0 - p, x1 - x0 + 2 * p, y1 - y0 + 2 * p); };

/* ================= 화면 맞춤 · 확대 ================= */
$("#fit").onclick = () => cad.fit();
$("#z-in").onclick = () => cad.zoomAt(cad.W / 2, cad.H / 2, 1.4);
$("#z-out").onclick = () => cad.zoomAt(cad.W / 2, cad.H / 2, 1 / 1.4);
$("#bubble-mode").onclick = e => { const b = e.target.closest("button"); if (!b) return; S.bubble = b.dataset.b; ls.set("bubble", S.bubble); $$("#bubble-mode button").forEach(x => x.classList.toggle("on", x === b)); layoutMarks(true); };
$$("#bubble-mode button").forEach(x => x.classList.toggle("on", x.dataset.b === S.bubble));
if (inFrame) $("#popout").href = location.pathname; else $("#popout").hidden = true;

/* ================= 그림으로 저장 ================= */
$("#shot").onclick = async () => {
  const W = cad.W, H = cad.H, dpr = Math.max(2, cad.dpr), c = document.createElement("canvas"); c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext("2d"); const old = cad.editable; cad.editable = false; cad._in = false; cad._draw(); cad.editable = old;
  g.drawImage(cad.cv, 0, 0, c.width, c.height); g.scale(dpr, dpr);
  const img = svg => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" ')); });
  // 지시선
  for (const l of $$("#leaders line")) { g.strokeStyle = l.getAttribute("stroke"); g.lineWidth = 1.6; g.setLineDash(l.getAttribute("stroke-dasharray") ? [4, 3] : []); g.beginPath(); g.moveTo(+l.getAttribute("x1"), +l.getAttribute("y1")); g.lineTo(+l.getAttribute("x2"), +l.getAttribute("y2")); g.stroke(); }
  g.setLineDash([]);
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const pos = el => { const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform); return m ? [+m[1], +m[2]] : [0, 0]; };
  for (const [id, o] of els) {
    const m = S.marks.find(x => x.id === id), k = kindOf(m.kind), [sx, sy] = pos(o.mk);
    g.fillStyle = "#fff"; g.strokeStyle = k.color; g.lineWidth = 3; g.beginPath(); g.arc(sx, sy - 25, 19, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = k.color; g.beginPath(); g.moveTo(sx - 6, sy - 7); g.lineTo(sx + 6, sy - 7); g.lineTo(sx, sy); g.fill();
    const im = await img(k.svg.replace(/currentColor/g, k.color)); if (im) g.drawImage(im, sx - 15, sy - 40, 30, 30);
    if (o.bb.hidden) continue;
    const [bx, by] = pos(o.bb), h = o.h; let w = o.w;
    for (const line of o.bb.children) { g.font = line.className === "t1" ? "800 12.5px Pretendard, sans-serif" : "500 12px Pretendard, sans-serif"; w = Math.max(w, g.measureText(line.textContent.trim()).width + 18); } g.fillStyle = "#fff"; g.strokeStyle = k.color; g.lineWidth = 1.5; rr(bx, by, w, h, S.bubble === "short" ? h / 2 : 10); g.fill(); g.stroke();
    let ty = by + 17; g.textBaseline = "alphabetic";
    for (const line of o.bb.children) { const cls = line.className; g.font = cls === "t1" ? "800 12.5px Pretendard, sans-serif" : cls === "t2" ? "500 12px Pretendard, sans-serif" : "500 10.5px Pretendard, sans-serif";
      g.fillStyle = cls === "t1" ? k.color : cls === "t2" ? "#374151" : "#9aa1ad"; g.fillText(line.textContent.trim(), bx + 9, ty); ty += cls === "t1" ? 16 : 15; }
  }
  const title = `${S.site || "현장"} · ${S.all ? "전체 기간" : S.day} 장비·작업 배치`;
  g.font = "700 15px Pretendard, sans-serif"; const tw = g.measureText(title).width; g.fillStyle = "rgba(255,255,255,.92)"; rr(10, 10, tw + 24, 32, 9); g.fill(); g.fillStyle = "#111827"; g.fillText(title, 22, 31);
  const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `지적도_${S.all ? "전체" : S.day}.png`; a.click(); cad.render();
};

/* ================= 저장 ================= */
async function saveDoc() {
  if (!cad.dirty) return toast("바뀐 내용이 없습니다.");
  const btn = $("#save"); btn.disabled = true; btn.textContent = "저장 중…";
  try {
    const { data: cur } = await sb.from("site_map_doc").select("rev,updated_at").eq("id", 1).maybeSingle();
    if (cur && cur.rev !== S.rev && !confirm(`다른 곳에서 ${new Date(cur.updated_at).toLocaleString("ko-KR")}에 도면을 저장했습니다.\n지금 내용으로 덮어쓸까요? (취소하면 저장하지 않습니다)`)) return;
    const edits = cad.diff(), rev = (cur?.rev || 0) + 1;
    const { error } = await sb.from("site_map_doc").upsert({ id: 1, edits, rev, updated_at: new Date().toISOString() });
    if (error) throw error;
    S.rev = rev; cad.dirty = 0; drawDirty();
    toast(`도면을 저장했습니다 (추가 ${edits.add.length} · 수정 ${Object.keys(edits.mod).length} · 삭제 ${edits.del.length}).`);
  } catch (e) { console.error(e); toast("저장하지 못했습니다: " + (e.message || e), 5000); }
  finally { btn.disabled = false; btn.textContent = "💾 저장"; }
}
$("#save").onclick = saveDoc;
$("#revert").onclick = async () => {
  if (cad.dirty && !confirm("저장하지 않은 수정을 버리고 저장된 도면을 다시 불러올까요?")) return;
  await loadDoc(); toast("저장된 도면을 다시 불러왔습니다.");
};
addEventListener("beforeunload", e => { if (cad.dirty && S.mode === "edit") { e.preventDefault(); e.returnValue = ""; } });

/* ================= 불러오기 ================= */
let BASE = null;
async function loadDoc() {
  const { data, error } = await sb.from("site_map_doc").select("*").eq("id", 1).maybeSingle();
  if (error) toast("도면 수정 내용을 불러오지 못했습니다: " + error.message, 5000);
  S.rev = data?.rev || 0;
  const view = cad.W && cad.doc ? { ...cad.view } : null;
  cad.base = new Map();
  cad.load(JSON.parse(JSON.stringify(BASE)), data?.edits || {});
  if (view) { cad.view = view; cad.render(); }
  drawCurLayer(); drawDirty(); drawLayers();
}
async function loadMarks() {
  const { data, error } = await sb.from("site_map_marks").select("*").order("created_at");
  if (error) { toast("장비·작업 표시를 불러오지 못했습니다: " + error.message, 5000); return; }
  S.marks = data || [];
}
async function loadPlans() {
  const { data } = await sb.from("ewp_plans").select("id,work_name,reg_no,equip_type,spec,company_name,work_start,work_end,status").order("work_start", { ascending: false }).limit(300);
  S.plans = data || [];
}
async function start() {
  $("#d-day").value = S.day;
  await connect();
  const [base] = await Promise.all([fetch("base.json").then(r => r.json()), loadMarks(), loadPlans(),
    sb.from("site_settings").select("site_name").eq("id", 1).maybeSingle().then(r => { S.site = r.data?.site_name || ""; }, () => {})]);
  BASE = base;
  await loadDoc();
  $("#loading").hidden = true;
  cad.resize(); cad.fit();
  drawAll();
  // 다른 사람이 놓은 표시 반영
  const refresh = async () => { if (document.hidden || $("#dlg-mark").open || S.sel) return; await loadMarks(); drawAll(); };
  setInterval(refresh, 60000); addEventListener("focus", refresh);
}
start().catch(e => { console.error(e); $("#loading").innerHTML = "지적도를 불러오지 못했습니다: " + esc(e.message || e); });
