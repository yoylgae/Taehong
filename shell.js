import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

import { initRemind, loadRemind } from "./remind.js";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
// 접속 비밀번호로 열리는 테이블용 (일정 등)
let sbt = sb;
try { const r = await fetch("/__dbtoken", { cache: "no-store" }); const t = r.ok ? (await r.json()).t : ""; if (t) sbt = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { headers: { "x-pms-token": t } }, auth: { persistSession: false, storageKey: "pms-t" } }); } catch {}
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toast = msg => { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 2500); };
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
                set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

/* ================= 메뉴 =================
   새 화면을 만들면 여기에 한 줄 추가하면 됩니다.  (url 이 없으면 '준비 중' 화면)
   예) { id: "tbm", name: "TBM보고서", icon: "📋", url: "tbm/" }
   newWindow: true 를 붙이면 탭 대신 새 창으로 열림                                    */
const MENUS = [
  { name: "공사관리", items: [
    { id: "map", name: "현장 지적도", icon: "🗺", url: "map/" },
    { id: "ilbo", name: "작업일보", icon: "📝", url: "ilbo/" },
    { id: "jy", name: "직영실행", icon: "📒", url: "jy/" },
    { id: "waste", name: "폐기물 반출 현황", icon: "🚛", url: "https://meko-gdenc.vercel.app/", newWindow: true },
  ] },
  { name: "안전보건관리", items: [
    { id: "ewp", name: "건설장비 작업계획서", icon: "🏗", url: "ewp/" },
    { id: "ptw", name: "작업허가서(PTW)", icon: "📋", url: "ptw/" },
    { id: "ra", name: "위험성평가", icon: "⚠", url: "ra/" },
    { id: "edu", name: "안전보건교육 일지", icon: "🎓", url: "edu/" },
    { id: "safetycost", name: "산업안전보건관리비", icon: "💰", url: "https://safetycost-gdenc.vercel.app/", newWindow: true },
  ] },
  { name: "편의기능", items: [
    { id: "pdf", name: "PDF 편집·분할", icon: "📄", url: "tools/pdf/" },
  ] },
  { name: "현대건설 일일퀘스트", items: [
    { id: "q-dabs", name: "DABs 회의자료 취합", icon: "📝", url: "https://dabs-meeting.vercel.app/", newWindow: true },
    { id: "q-risk", name: "위험성평가 회의관리", icon: "⚠️", url: "https://hdec-yunsik.github.io/risk-meeting-web/", newWindow: true,
      sub: ["아이디 : gd@gf32.com", "비밀번호 : 123qwe"] },
    { id: "q-cost", name: "산업안전보건관리비(현대)", icon: "💰", url: "https://stellular-lokum-e9b6e2.netlify.app/", newWindow: true,
      sub: ["비밀번호 : GDGS"] },
  ] },
];
const ITEM = Object.fromEntries(MENUS.flatMap(m => m.items.map(i => [i.id, { ...i, top: m.name }])));

$("#nav").innerHTML = `<a href="#" data-open="home" class="active"><i class="ic">⌂</i><span>홈</span></a>` +
  MENUS.map(m => `<div class="grp"><span>${esc(m.name)}</span></div>` + m.items.map(i =>
    `<a href="#" data-open="${i.id}" class="${i.url ? "" : "todo"}"><i class="ic">${i.icon || "•"}</i><span class="nm">${esc(i.name)}${i.sub ? i.sub.map(x => `<small>${esc(x)}</small>`).join("") : ""}</span>${i.newWindow ? '<em class="ext" title="새 창으로 열림">↗</em>' : ""}${i.id === "ewp" ? '<em class="badge" id="nav-wait" hidden></em>' : ""}</a>`).join("")).join("");

document.addEventListener("click", e => {
  const a = e.target.closest("[data-open]"); if (!a) return;
  e.preventDefault();
  openTab(a.dataset.open, a.dataset.hash);
});

/* ================= 열린 화면 탭 ================= */
let tabs = [{ id: "home", name: "홈" }];
let active = "home";

function openTab(id, hash) {
  if (id === "home") return activate("home");
  const it = ITEM[id]; if (!it) return;
  if (it.newWindow) { window.open(it.url, "_blank", "noopener"); return; }
  if (!tabs.some(t => t.id === id)) {
    tabs.push({ id, name: it.name });
    const pane = document.createElement("section");
    pane.className = "pane"; pane.dataset.pane = id; pane.hidden = true;
    pane.innerHTML = it.url ? `<iframe title="${esc(it.name)}" src="${it.url}${hash || ""}" allow="camera; clipboard-read; clipboard-write; fullscreen"></iframe>`
      : `<div class="todo-page"><h2>${esc(it.name)}</h2><p>${esc(it.top)} › ${esc(it.name)} 화면은 아직 준비 중입니다.</p></div>`;
    $("#content").append(pane);
  } else if (hash) {
    const fr = $(`.pane[data-pane="${id}"] iframe`);
    if (fr) fr.contentWindow.location.hash = hash;
  }
  activate(id);
}

function closeTab(id) {
  if (id === "home") return;
  tabs = tabs.filter(t => t.id !== id);
  $(`.pane[data-pane="${id}"]`)?.remove();
  if (active === id) activate(tabs[tabs.length - 1].id); else drawTabs();
}

function activate(id) {
  active = id;
  document.querySelectorAll(".pane").forEach(p => p.hidden = p.dataset.pane !== id);
  document.querySelectorAll(".nav a").forEach(a => a.classList.toggle("active", a.dataset.open === id));
  const it = ITEM[id];
  $("#crumb").innerHTML = it ? `${esc(it.top)}<span class="sep">/</span>${esc(it.name)}` : "홈";
  $("#btn-pop").hidden = !it?.url;
  drawTabs();
  store.set("pms.tabs", tabs.filter(t => t.id !== "home").map(t => t.id));
  if (id === "home") loadDash();
}

function drawTabs() {
  // 홈만 열려 있으면 탭 줄은 비워 둠
  $("#tabbar").innerHTML = tabs.length < 2 ? "" : tabs.map(t => `<div class="t${t.id === active ? " active" : ""}" data-id="${t.id}">${esc(t.name)}${t.id === "home" ? "" : `<button type="button" class="x" title="닫기">✕</button>`}</div>`).join("");
}
$("#tabbar").addEventListener("click", e => {
  const t = e.target.closest(".t"); if (!t) return;
  if (e.target.matches(".x")) closeTab(t.dataset.id); else activate(t.dataset.id);
});
$("#tabbar").addEventListener("auxclick", e => { const t = e.target.closest(".t"); if (t && e.button === 1) closeTab(t.dataset.id); });
$("#logo").onclick = e => { e.preventDefault(); activate("home"); };
// 지금 화면을 새 창으로 열기 (로그인 등이 탭 안에서 막힐 때 사용)
$("#btn-pop").onclick = () => { const u = ITEM[active]?.url; if (u) window.open(new URL(u, location.href).href, "_blank", "noopener"); };

/* ================= 사이드바 접기 ================= */
const setMini = on => { document.body.classList.toggle("mini", on); $("#side-tg .ic").textContent = on ? "⟩" : "⟨"; store.set("pms.mini", on); };
$("#side-tg").onclick = () => setMini(!document.body.classList.contains("mini"));
setMini(innerWidth < 700 ? true : store.get("pms.mini", false));

/* ================= 현장 설정 ================= */
let site = {};
async function loadSite() {
  const { data } = await sb.from("site_settings").select("*").eq("id", 1).maybeSingle();
  site = data || {};
  $("#site-label").textContent = site.site_name ? `${site.site_name}${site.site_code ? ` · ${site.site_code}` : ""}` : "현장 설정 필요";
  $("#avatar").textContent = (site.user_name || "U").slice(0, 1);
  document.title = site.site_name ? `${site.site_name} - 현장관리시스템` : "현장관리시스템";
}
const openSettings = e => {
  e?.preventDefault();
  const f = $("#f-settings");
  for (const k of ["site_name", "site_code", "user_name", "start_date", "end_date"]) f[k].value = site[k] || "";
  $("#dlg-settings").showModal();
};
$("#btn-settings").onclick = openSettings;
document.addEventListener("click", e => { if (e.target.closest(".set-link")) openSettings(e); });
$("#dlg-settings").addEventListener("close", async () => {
  if ($("#dlg-settings").returnValue !== "save") return;
  const f = $("#f-settings"), v = k => f[k].value.trim() || null;
  const row = { id: 1, site_name: v("site_name"), site_code: v("site_code"), user_name: v("user_name"), start_date: v("start_date"), end_date: v("end_date"), updated_at: new Date().toISOString() };
  if (row.start_date && row.end_date && row.end_date < row.start_date) return toast("공사 종료일이 시작일보다 빠릅니다.");
  const { error } = await sb.from("site_settings").upsert(row);
  if (error) return toast("저장 실패: " + error.message);
  toast("현장 설정을 저장했습니다.");
  await loadSite(); loadDash();
});

/* ================= 홈 대시보드 ================= */
const ymd = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const DAY = 86400000;
async function loadDash() {
  const now = new Date(), today = ymd(now);
  const h = now.getHours();
  $("#d-hello").textContent = `${h < 12 ? "좋은 아침입니다" : h < 18 ? "안녕하세요" : "수고하셨습니다"}, ${site.user_name || "사용자"}님`;
  $("#d-now").textContent = `${today} ${["일", "월", "화", "수", "목", "금", "토"][now.getDay()]}요일 · ${site.site_name || "현장 설정을 해주세요"}`;

  if (site.start_date && site.end_date) {
    const s = new Date(site.start_date), e = new Date(site.end_date), total = Math.round((e - s) / DAY) + 1;
    const done = Math.min(Math.max(Math.round((new Date(today) - s) / DAY) + 1, 0), total), left = total - done;
    const pd = total ? Math.round(done / total * 100) : 0;
    $("#d-term").textContent = `${site.start_date} ~ ${site.end_date}`;
    $("#d-done").textContent = `${done}일 (${pd}%)`;
    $("#d-left").textContent = `${left}일`;
    $("#p-done").style.width = pd + "%";
  } else {
    $("#d-term").innerHTML = `<a href="#" class="link set-link">현장 설정에서 공사기간을 입력하세요</a>`;
    $("#d-done").textContent = $("#d-left").textContent = "-";
    $("#p-done").style.width = "0";
  }

  const { data, error } = await sb.from("ewp_plans")
    .select("id,work_name,reg_no,status,created_at,work_start,work_end,in_date,equip_type,insur_end,car_insp_end,safe_insp_end")
    .order("created_at", { ascending: false });
  if (error) { loadRemind([]); return toast("홈 화면 조회 실패: " + error.message); }
  const cnt = s => data.filter(r => r.status === s).length;
  $("#k-total").textContent = data.length;
  $("#k-wait").textContent = cnt("상신");
  $("#k-today").textContent = data.filter(r => r.work_start && r.work_end && r.work_start <= today && today <= r.work_end).length;
  $("#k-month").textContent = data.filter(r => (r.in_date || "").startsWith(today.slice(0, 7))).length;
  const nb = $("#nav-wait"); if (nb) { nb.textContent = cnt("상신"); nb.hidden = !cnt("상신"); }
  loadRemind(data);

  const title = r => `${r.work_name || "(무제)"}${r.reg_no ? ` · ${r.reg_no}` : ""}`;
  const recent = data.slice(0, 6);
  $("#d-recent").innerHTML = recent.length ? recent.map(r => `<li data-id="${r.id}"><span class="st st-${esc(r.status)}">${esc(r.status)}</span><span class="t" title="${esc(title(r))}">${esc(title(r))}</span><small>${esc((r.work_start || "").slice(5))}${r.work_end && r.work_end !== r.work_start ? " ~ " + esc(r.work_end.slice(5)) : ""}</small></li>`).join("")
    : `<li class="none">아직 작성한 작업계획서가 없습니다.</li>`;
}
document.addEventListener("click", e => {
  const r = e.target.closest("#d-recent li[data-id]");
  if (r) openTab("ewp", "#/edit/" + r.dataset.id);
});

// 지도(iframe)에서 다른 화면 열기 요청
addEventListener("message", e => {
  if (e.origin !== location.origin || e.data?.pms !== "open") return;
  if (ITEM[e.data.id]) openTab(e.data.id, e.data.hash);
});

initRemind({ sb: sbt, toast, openTab });

/* ================= 시작 ================= */
await loadSite();
store.get("pms.tabs", []).forEach(id => { if (ITEM[id] && !ITEM[id].newWindow) openTab(id); });
activate("home");
