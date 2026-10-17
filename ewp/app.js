import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";
import { buildPrintHtml } from "./print.js";
import { CHECKLISTS, EQUIP_CHECKLIST, buildChecklistHtml, thisMonday } from "./checklist.js";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.getElementById("app");

const EQUIP = ["불도저","굴착기","로더","지게차","스크레이퍼","덤프트럭","기중기(이동식 크레인)","모터 그레이더","롤러","노상안정기","콘크리트 뱃칭 플랜트","콘크리트 피니셔","콘크리트 살포기","콘크리트 믹서트럭","콘크리트 펌프카","아스팔트 믹싱 플랜트","골재살포기","쇄석기","공기압축기","천공기","항타 및 항발기","사리채취기","준설선","특수건설기계","타워크레인","건설용 리프트","곤돌라","고소작업차(차량탑재형)","고소작업대(시저형)","고소작업대(자주식)","카고 크레인","압력용기","컨베이어","C.P.B.(Concrete Placing Boom)","이삿짐 운반용 리프트","갠트리(천정) 크레인","살수차(화물자동차)","집게차(재활용처리크레인)","아스팔트피니셔","콘크리트 분배기","기타"];
const RISKS = ["협착","붕괴","전도","낙하","추락"];
const ROLES = [
  { role:"신호수", cols:["name","sign_method","edu_date","cert_date"] },
  { role:"유도자", cols:["name","sign_method","edu_date","cert_date"] },
  { role:"작업자", cols:["name","sign_method","edu_date","remark"] },
  { role:"운전원", sel:true, cols:["name","edu_date","special_edu_date","sign_method","license","pledge"],
    labels:{ edu_date:"교육이수(최초 노무시 교육)", special_edu_date:"특별교육(※ 대상 작업 수행시)", license:"면허", pledge:"서약서" } },
  { role:"작업지휘자", sel:true, yn:"commander_yn", cols:["name","appoint","phone"], labels:{ appoint:"지정서" } },
];
const COL_LABEL = { name:"성명", sign_method:"신호방법", edu_date:"특별교육", cert_date:"자격검정", phone:"연락처", remark:"비고" };
const REQUIRED = new Set(["name", "phone"]);
const FILE_COLS = new Set(["license", "pledge"]);

const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const toast = msg => { const t = $("#toast"); (document.querySelector("dialog[open]") || document.body).append(t); t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 2500); };

const BUCKET = "ewp-files";
const CHK_IMG_BASE = "https://cdn.jsdelivr.net/gh/yoylgae/taehong@d45df39/ewp/chk/";
const MAX_MB = 10;
let curFiles = {};   // { insur: {path, name, type}, car_insp: ..., safe_insp: ..., precheck: ... }
let pendingImport = null;   // 엑셀에서 읽어 온 값 (새 작성 화면에 채워 넣음)
const HC = "H/C, 카고", HOIST = "크레인(호이스트)";
let liftState = {};
const fmt = x => x == null || isNaN(x) ? "" : String(+(+x).toFixed(2));

window.addEventListener("hashchange", route);
// 엑셀 불러오기 (목록·새 작성 화면 공통)
document.addEventListener("change", e => { if (e.target.matches(".xl-file")) { importExcel(e.target.files[0]); e.target.value = ""; } });
setupTips();
route();

/* ---------------- 툴팁 (! 마커) ---------------- */
function setupTips() {
  const pop = $("#tip-pop");
  let owner = null;
  const show = el => {
    owner = el;
    const host = el.closest("dialog") || document.body;   // 모달 안에서는 모달 위에 떠야 함
    if (pop.parentNode !== host) host.append(pop);
    pop.replaceChildren($("#" + el.dataset.tip).content.cloneNode(true));
    pop.hidden = false;
    const r = el.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    let left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    let top = r.bottom + 8;
    if (top + h > innerHeight - 8) top = r.top - h - 8 > 8 ? r.top - h - 8 : innerHeight - h - 8;
    pop.style.left = Math.max(8, left) + "px";
    pop.style.top = Math.max(8, top) + "px";
  };
  const hide = () => { owner = null; pop.hidden = true; };
  document.addEventListener("mouseover", e => { const t = e.target.closest(".tip"); if (t && t !== owner) show(t); });
  document.addEventListener("mouseout", e => { const t = e.target.closest(".tip"); if (t && !t.contains(e.relatedTarget)) hide(); });
  document.addEventListener("focusin", e => { if (e.target.matches(".tip")) show(e.target); });
  document.addEventListener("focusout", e => { if (e.target.matches(".tip")) hide(); });
  document.addEventListener("click", e => { const t = e.target.closest(".tip"); if (t) { e.preventDefault(); show(t); } else if (owner) hide(); }, true);
  addEventListener("scroll", hide, { passive: true });
}

/* ---------------- 첨부파일 ---------------- */
// box._store: 첨부 정보를 담을 객체 (기본: 계획서 본문 curFiles, 인원 행은 행별 객체)
function renderFile(box) {
  const store = box._store || curFiles;
  const key = box.dataset.key, f = store[key], compact = "compact" in box.dataset;
  const accept = box.dataset.accept || "image/*,application/pdf";
  if ("preview" in box.dataset) renderPreview(box._pv || document.getElementById("pv-" + key), f);
  box.innerHTML = `<label class="btn sm pick">${compact ? "등록" : "파일 선택"}<input type="file" accept="${accept}" hidden></label>
    ${f ? `<a href="#" class="fview" title="${esc(f.name)}">${esc(f.name)}</a> <button type="button" class="btn sm fdel" title="첨부 삭제">✕</button>`
        : compact ? "" : `<span class="muted fname">선택된 파일 없음</span>`}`;
  box.querySelector("input").onchange = e => uploadFile(box, e.target.files[0]);
  box.querySelector(".fview")?.addEventListener("click", async e => {
    e.preventDefault();
    const w = window.open("", "_blank");
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(f.path, 300);
    if (error) { w?.close(); return toast("파일 열기 실패: " + error.message); }
    if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
  });
  box.querySelector(".fdel")?.addEventListener("click", () => { delete store[key]; renderFile(box); });
}

// 첨부한 사진을 표 아래 칸에 미리보기로 표시 (비공개 저장소라 1시간짜리 임시 링크 사용)
async function renderPreview(pv, f) {
  if (!pv) return;
  if (!f || !/^image\//.test(f.type || "")) { pv.innerHTML = ""; return; }
  pv.innerHTML = `<span class="loading">사진 불러오는 중…</span>`;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(f.path, 3600);
  if (error) { pv.innerHTML = `<span class="loading">사진을 불러오지 못했습니다.</span>`; return; }
  pv.innerHTML = `<img alt="${esc(f.name)}" src="${data.signedUrl}">`;
}

async function uploadFile(box, file) {
  if (!file) return;
  if (box.dataset.accept === "image/*") { if (!/^image\//.test(file.type)) return toast("사진 파일만 올릴 수 있습니다."); }
  else if (!/^image\/|^application\/pdf$/.test(file.type)) return toast("사진 또는 PDF 파일만 올릴 수 있습니다.");
  if (file.size > MAX_MB * 1024 * 1024) return toast(`파일은 ${MAX_MB}MB 이하만 가능합니다.`);
  box.querySelector(".pick").classList.add("busy");
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${box.dataset.key}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) { box.querySelector(".pick").classList.remove("busy"); return toast("업로드 실패: " + error.message); }
  (box._store || curFiles)[box.dataset.key] = { path, name: file.name, type: file.type };
  renderFile(box);
  toast("파일을 첨부했습니다. 저장 버튼을 눌러야 반영됩니다.");
}

/* 해당/미해당에 따라 기간·첨부 활성화 */
function syncPeriods() {
  document.querySelectorAll("td.period").forEach(td => {
    const v = td.querySelector(`[name="${td.dataset.yn}"]:checked`)?.value;
    const off = v === "미해당";
    td.querySelectorAll('input[type="date"], .file input').forEach(i => i.disabled = off);
    td.classList.toggle("off", off);
  });
  // 점검강화대상 / 구조변경사항: '해당'일 때만 점검일·첨부 표시
  document.querySelectorAll("td.cond").forEach(td => {
    td.classList.toggle("on", td.querySelector(`[name="${td.dataset.yn}"]:checked`)?.value === "해당");
  });
  // 지형·지반: 해당 항목을 골랐을 때만 조치 입력칸 활성화
  document.querySelectorAll("input[data-when]").forEach(i => {
    const [n, v] = i.dataset.when.split("=");
    i.disabled = document.querySelector(`[name="${n}"]:checked`)?.value !== v;
  });
  // 운행경로 내부장소 등: 조건에 맞을 때만 표시
  document.querySelectorAll("[data-show-when]").forEach(el => {
    const [n, v] = el.dataset.showWhen.split("=");
    el.classList.toggle("hide", document.querySelector(`[name="${n}"]:checked`)?.value !== v);
  });
  // 작업지휘자 미해당이면 표 숨김
  document.querySelectorAll(".pgroup[data-yn]").forEach(g => {
    g.classList.toggle("off", document.querySelector(`[name="${g.dataset.yn}"]:checked`)?.value === "미해당");
  });
  // 중량물작업 '기타' 선택 시 양중/중량물 체크
  const etc = $("#heavy-etc");
  if (etc) etc.hidden = document.querySelector('[name="heavy_work"]:checked')?.value !== "기타";
}

function route() {
  const h = location.hash.replace(/^#\/?/, "");
  if (!h) return renderList();
  if (h === "new") return renderEdit(null);
  if (h.startsWith("edit/")) return renderEdit(h.slice(5));
  renderList();
}

/* ---------------- 목록 (원본 SSEquipWorkPlanList 와 같은 구성) ---------------- */
async function renderList() {
  app.replaceChildren($("#tpl-list").content.cloneNode(true));
  const srch = $("#srch");
  // 등록일 기본: 최근 1개월 (원본과 같음)
  const today = new Date(), ago = new Date(today); ago.setMonth(ago.getMonth() - 1);
  const ymd = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  srch.rs.value = ymd(ago); srch.re.value = ymd(today);
  const { data, error } = await sb.from("ewp_plans")
    .select("id,site_name,company_name,reg_no,equip_type,model_name,make_year,in_date,heavy_work,work_name,work_start,work_end,work_place,status,created_at,ewp_personnel(name,role)")
    .order("created_at", { ascending: false });
  if (error) return toast("조회 실패: " + error.message);
  const rows0 = data.map(r => {
    const drv = (r.ewp_personnel || []).filter(x => x.role === "운전원").map(x => x.name).filter(Boolean);
    return { ...r, driver: drv.length > 1 ? `${drv[0]} 외 ${drv.length - 1}명` : drv[0] || "", drivers: drv.join(" "), reg: r.created_at.slice(0, 10) };
  });
  let shown = [];
  const draw = () => {
    const q = Object.fromEntries(new FormData(srch));
    const has = (v, k) => !q[k] || (v || "").includes(q[k].trim());
    shown = rows0.filter(r => has(r.company_name, "company") && has(r.reg_no, "reg_no") && has(r.drivers, "driver") && has(r.work_name, "work_name")
      && (!q.status || r.status === q.status)
      && (!q.ws || (r.work_end || "") >= q.ws) && (!q.we || (r.work_start || "") <= q.we)
      && (!q.rs || r.reg >= q.rs) && (!q.re || r.reg <= q.re));
    $("#list-count").textContent = `총 ${shown.length}건`;
    $("#list-body").innerHTML = shown.length ? shown.map((r, i) => `
      <tr data-id="${r.id}"><td class="c">${i + 1}</td><td>${esc(r.site_name)}</td><td>${esc(r.company_name)}</td><td class="c">${esc(r.reg_no)}</td>
      <td class="c">${esc(r.driver)}</td><td>${esc(r.equip_type)}</td><td class="c">${esc(r.heavy_work)}</td><td>${esc(r.work_name) || "<span class=muted>(무제)</span>"}</td>
      <td class="c">${esc(r.work_start)} ~ ${esc(r.work_end)}</td><td>${esc(r.work_place)}</td>
      <td class="c st st-${esc(r.status)}">${esc(r.status)}</td><td class="c">${r.reg}</td></tr>`).join("")
      : `<tr><td colspan="12" class="muted c">조회된 작업계획서가 없습니다.</td></tr>`;
  };
  draw();
  $("#btn-search").onclick = draw;
  srch.onsubmit = e => { e.preventDefault(); draw(); };
  srch.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); draw(); } });
  srch.addEventListener("change", draw);
  $("#btn-excel").onclick = () => {
    const head = ["No","현장명","협력업체","차량번호","운전원","장비","중량물작업","작업명","작업시작","작업종료","작업장소","결재상태","등록일"];
    const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [head, ...shown.map((r, i) => [i + 1, r.site_name, r.company_name, r.reg_no, r.drivers, r.equip_type, r.heavy_work, r.work_name, r.work_start, r.work_end, r.work_place, r.status, r.reg])]
      .map(a => a.map(cell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `건설장비작업계획서_${ymd(new Date())}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  $("#list-body").onclick = e => { const tr = e.target.closest("tr[data-id]"); if (tr) location.hash = "#/edit/" + tr.dataset.id; };

  // ---- 일일점검표 탭 ----
  document.querySelectorAll(".subtabs button").forEach(b => b.onclick = () => {
    document.querySelectorAll(".subtabs button").forEach(x => x.classList.toggle("active", x === b));
    document.querySelectorAll(".sub").forEach(x => x.hidden = x.dataset.sub !== b.dataset.sub);
    sessionStorage.setItem("ewp.sub", b.dataset.sub);
  });
  $("#chk-week").value = thisMonday();
  $("#chk-blank-kind").innerHTML = Object.entries(CHECKLISTS).map(([k, c]) => `<option value="${k}">${esc(c.name)}</option>`).join("");
  const drawChk = () => {
    const q = $("#chk-q").value.trim();
    const rows = rows0.filter(r => !q || [r.work_name, r.reg_no, r.drivers, r.equip_type].some(v => (v || "").includes(q)));
    $("#chk-body").innerHTML = rows.length ? rows.map((r, i) => {
      const keys = EQUIP_CHECKLIST[r.equip_type] || [];
      const pick = keys.length > 1 ? `<select data-kind>${keys.map(k => `<option value="${k}">${esc(CHECKLISTS[k].name)}</option>`).join("")}</select>`
        : keys.length ? esc(CHECKLISTS[keys[0]].name) : `<span class="none">해당 점검표 없음</span>`;
      return `<tr data-id="${r.id}"><td class="c">${i + 1}</td><td>${esc(r.equip_type)}</td><td class="c">${esc(r.reg_no)}</td><td>${esc(r.model_name)}</td><td class="c">${esc(r.make_year)}</td>
        <td class="c">${esc(r.in_date)}</td><td class="c">${esc(r.driver)}</td><td class="c">${esc(r.work_start)} ~ ${esc(r.work_end)}</td>
        <td class="c">${pick}</td><td class="c">${keys.length ? `<button type="button" class="btn primary chk-print">출력</button>` : ""}</td></tr>`;
    }).join("") : `<tr><td colspan="10" class="muted c">작업계획서가 없습니다.</td></tr>`;
  };
  drawChk();
  $("#chk-q").oninput = drawChk;
  $("#chk-body").onclick = e => {
    if (!e.target.matches(".chk-print")) return;
    const tr = e.target.closest("tr"), r = rows0.find(x => x.id === tr.dataset.id);
    const key = tr.querySelector("[data-kind]")?.value || EQUIP_CHECKLIST[r.equip_type][0];
    printChecklist(key, { ...r, driver: r.drivers.split(" ")[0] || "" });
  };
  $("#chk-blank").onclick = () => printChecklist($("#chk-blank-kind").value, {});
  if (sessionStorage.getItem("ewp.sub") === "chk") document.querySelector('.subtabs button[data-sub="chk"]').click();
}

// 일일점검표 출력 (새 창)
function printChecklist(key, plan) {
  const w = window.open("", "_blank");
  if (!w) return toast("팝업이 차단되었습니다. 팝업을 허용해주세요.");
  // 점검 부위 그림은 GitHub 저장소(yoylgae/taehong)의 ewp/chk/ 에서 불러옴
  const html = buildChecklistHtml({ key, plan, imgBase: CHK_IMG_BASE, monday: $("#chk-week")?.value || "" });
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  w.location.replace(url);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ---------------- 등록/수정 ---------------- */
async function renderEdit(id) {
  app.replaceChildren($("#tpl-edit").content.cloneNode(true));
  const f = $("#f");
  $("#equip_type").innerHTML = `<option value="">선택</option>` + EQUIP.map(e => `<option>${e}</option>`).join("");
  const y = new Date().getFullYear();
  $("#make_year").innerHTML = `<option value="">선택</option>` + Array.from({ length: 46 }, (_, i) => `<option>${y - i}</option>`).join("");
  f.querySelectorAll(".radios").forEach(el => {
    el.innerHTML = el.dataset.opts.split(el.dataset.sep || ",").map(o =>
      `<label><input type="radio" name="${el.dataset.name}" value="${o}"> ${o}</label>`).join("");
  });

  // 탭
  f.querySelectorAll(".tabs button").forEach(b => b.onclick = () => {
    f.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("active", x === b));
    f.querySelectorAll(".tab").forEach(p => p.hidden = p.dataset.pane !== b.dataset.tab);
  });

  // 작업인원
  $("#personnel").innerHTML = ROLES.map(r => {
    const label = c => (r.labels?.[c] || COL_LABEL[c]);
    const head = r.cols.map(c => `<th>${REQUIRED.has(c) && r.sel ? '<span class="req">*</span>' : ""}${label(c)}</th>`).join("");
    const yn = r.yn ? ` <span class="pyn">(<label><input type="radio" name="${r.yn}" value="해당"> 해당</label> <label><input type="radio" name="${r.yn}" value="미해당"> 미해당</label>)</span>` : "";
    return `
    <div class="pgroup${r.sel ? " sel" : ""}" data-role="${r.role}"${r.yn ? ` data-yn="${r.yn}"` : ""}>
      <h4><span>■ ${r.role}${yn}</span><span class="pbtns"><button type="button" class="btn sm dark" data-add="${r.role}">행추가</button>${r.sel ? `<button type="button" class="btn sm dark" data-del="${r.role}">행삭제</button>` : ""}</span></h4>
      <table class="grid rows"><thead><tr>${r.sel ? '<th class="chk"><input type="checkbox" class="chk-all"></th>' : ""}${head}${r.sel ? "" : '<th style="width:40px"></th>'}</tr></thead><tbody></tbody></table>
    </div>`;
  }).join("");
  $("#personnel").onclick = e => {
    const add = e.target.dataset.add, del = e.target.dataset.del;
    if (add) addPerson(add, {});
    if (del) {
      const rows = [...document.querySelectorAll(`.pgroup[data-role="${del}"] tbody .row-chk:checked`)].map(c => c.closest("tr"));
      if (!rows.length) return toast("삭제할 행을 선택해주세요.");
      rows.forEach(tr => tr.remove());
      document.querySelector(`.pgroup[data-role="${del}"] .chk-all`).checked = false;
    }
    if (e.target.matches(".chk-all")) e.target.closest("table").querySelectorAll(".row-chk").forEach(c => c.checked = e.target.checked);
    if (e.target.matches(".btn-appoint")) printAppointment(e.target.closest("tr"));
  };

  $("#add-work").onclick = () => addWork({});
  $("#del-work").onclick = () => {
    const rows = [...document.querySelectorAll("#work-body .row-chk:checked")].map(c => c.closest("tr"));
    if (!rows.length) return toast("삭제할 행을 선택해주세요.");
    rows.forEach(tr => tr.remove());
    f.querySelector("table.work .chk-all").checked = false;
  };
  f.querySelector("table.work .chk-all").onchange = e =>
    document.querySelectorAll("#work-body .row-chk").forEach(c => c.checked = e.target.checked);
  $("#add-heavy").onclick = () => { addHeavy({}); calc(); };
  $("#del-heavy").onclick = () => {
    const rows = [...document.querySelectorAll("#heavy-body .row-chk:checked")].map(c => c.closest("tr"));
    if (!rows.length) return toast("삭제할 행을 선택해주세요.");
    rows.forEach(tr => tr.remove());
    f.querySelector("table.heavy .chk-all").checked = false;
    calc();
  };
  f.querySelector("table.heavy .chk-all").onchange = e =>
    document.querySelectorAll("#heavy-body .row-chk").forEach(c => c.checked = e.target.checked);
  $("#heavy-body").addEventListener("click", e => { if (e.target.matches(".btn-rope")) openRope(e.target.closest("tr")); });
  f.addEventListener("click", e => { if (e.target.matches(".del-row")) { e.target.closest("tr").remove(); calc(); } });
  // 양중 숫자칸: 소수 둘째 자리까지, 와이어로프 수는 정수만 (원본과 같음)
  f.addEventListener("input", e => {
    const el = e.target; if (!el.matches("input.ln")) return;
    let s = el.value.replace("int" in el.dataset ? /[^0-9]/g : /[^0-9.]/g, "");
    const [a, b] = s.split("."); if (b !== undefined) s = a + "." + b.replace(/\./g, "").slice(0, 2);
    if (s !== el.value) el.value = s;
  }, true);
  f.addEventListener("input", calc);
  f.addEventListener("change", e => { if (e.target.type !== "file") { syncTabs(); syncPeriods(); calc(); } });

  curFiles = {};
  let plan = {};
  if (id) {
    const [p, pe, w, h] = await Promise.all([
      sb.from("ewp_plans").select("*").eq("id", id).single(),
      sb.from("ewp_personnel").select("*").eq("plan_id", id),
      sb.from("ewp_work_items").select("*").eq("plan_id", id).order("seq"),
      sb.from("ewp_heavy_items").select("*").eq("plan_id", id),
    ]);
    if (p.error) { toast("불러오기 실패: " + p.error.message); location.hash = "#/"; return; }
    plan = p.data;
    curFiles = { ...(plan.files || {}) };
    fill(f, plan);
    (pe.data || []).forEach(r => addPerson(r.role, r));
    (w.data || []).forEach(addWork);
    // 기본 5개 재해유형 중 빠진 것은 행을 채워 둠
    RISKS.filter(k => !(w.data || []).some(x => x.risk === k)).forEach(risk => addWork({ risk }));
    (h.data || []).forEach(addHeavy);
  } else if (pendingImport) {
    // 엑셀에서 읽어 온 내용으로 채움 (저장은 사용자가 확인 후)
    const im = pendingImport; pendingImport = null;
    $("#btn-del").hidden = true;
    plan = im.plan;
    curFiles = { ...(plan.files || {}) };
    fill(f, plan);
    im.personnel.forEach(r => addPerson(r.role, r));
    im.work.forEach(addWork);
    RISKS.filter(k => !im.work.some(x => x.risk === k)).forEach(risk => addWork({ risk }));
    showImportNote(im);
  } else {
    $("#btn-del").hidden = true;
    f.querySelector('[name="commander_yn"][value="해당"]').checked = true;
    RISKS.forEach(risk => addWork({ risk }));
  }
  if (id) $("#xl-edit").hidden = true;
  f.querySelectorAll(".file").forEach(renderFile);
  syncTabs(); syncPeriods(); calc();

  $("#btn-print").onclick = printPlan;

  $("#btn-del").onclick = async () => {
    if (!confirm("이 작업계획서를 삭제할까요?")) return;
    const { error } = await sb.from("ewp_plans").delete().eq("id", id);
    if (error) return toast("삭제 실패: " + error.message);
    toast("삭제했습니다."); location.hash = "#/";
  };

  f.onsubmit = async e => {
    e.preventDefault();
    calc();
    const data = collect(f);
    const err = validate(data) || validateLift(data.plan);
    if (err) return toast(err);
    const btn = f.querySelector("[type=submit]"); btn.disabled = true;
    try {
      const saved = await save(id, data);
      toast("저장을 성공했습니다.");
      if (!id) location.hash = "#/edit/" + saved; else renderEdit(id);
    } catch (ex) { toast("저장 실패: " + ex.message); }
    finally { btn.disabled = false; }
  };
}

let rowSeq = 0;
function addPerson(role, r) {
  const def = ROLES.find(x => x.role === role);
  const tb = document.querySelector(`.pgroup[data-role="${role}"] tbody`);
  const tr = document.createElement("tr");
  if (def.sel) return addSelPerson(def, tb, tr, r);
  tr.innerHTML = def.cols.map(c => {
    if (c === "sign_method") return `<td><select data-k="${c}"><option value="">선택</option><option>수신호</option><option>무전기</option></select></td>`;
    const type = c.endsWith("_date") ? "date" : c === "phone" ? "tel" : "text";
    return `<td><input type="${type}" data-k="${c}" value="${esc(r[c])}"></td>`;
  }).join("") + `<td><button type="button" class="btn sm del-row">✕</button></td>`;
  if (r.sign_method) tr.querySelector("select").value = r.sign_method;
  tb.append(tr);
}

// 운전원 / 작업지휘자: 선택 체크 + 첨부 + 지정서 인쇄
function addSelPerson(def, tb, tr, r) {
  const uid = ++rowSeq;
  tr._files = { ...(r.files || {}) };
  if (r.id) tr.dataset.saved = "1";
  const cell = c => {
    switch (c) {
      case "name": return `<td><input data-k="name" value="${esc(r.name)}"></td>`;
      case "phone": return `<td><input type="tel" data-k="phone" value="${esc(r.phone)}"></td>`;
      case "edu_date": return `<td><div class="dcell"><input type="date" data-k="edu_date" value="${esc(r.edu_date)}"><div class="file" data-key="edu" data-compact></div></div></td>`;
      case "special_edu_date": return `<td><input type="date" data-k="special_edu_date" value="${esc(r.special_edu_date)}"></td>`;
      case "sign_method": return `<td class="nowrap">${["수신호","무전기"].map(v =>
        `<label><input type="radio" name="sign_${uid}" data-k="sign_method" value="${v}" ${r.sign_method === v ? "checked" : ""}> ${v}</label>`).join(" ")}</td>`;
      case "appoint": return `<td class="center">${r.id ? `<button type="button" class="btn sm dark btn-appoint">인쇄</button>` : `<span class="muted">작업지휘자 등록 후 출력 가능</span>`}</td>`;
      default: return FILE_COLS.has(c) ? `<td><div class="file" data-key="${c}" data-compact></div></td>` : `<td></td>`;
    }
  };
  tr.innerHTML = `<td class="chk"><input type="checkbox" class="row-chk"></td>` + def.cols.map(cell).join("");
  tr.querySelectorAll(".file").forEach(b => { b._store = tr._files; renderFile(b); });
  tb.append(tr);
}

/* 작업지휘자 지정서 인쇄 */
function printAppointment(tr) {
  const name = tr.querySelector('[data-k="name"]').value.trim();
  const company = (document.querySelector('[name="company_name"]').value || "").trim();
  if (!name) return toast("작업지휘자 성명을 입력해주세요.");
  const items = [
    "항타기나 항발기를 조립 · 해체 · 변경 또는 이동하여 하는 작업",
    "차량계 하역운반기계등을 사용하는 작업<br><span class=\"note\">※ 지게차, 화물자동차, 고소작업대, 로더(스키드)</span>",
    "굴착면의 높이가 2미터 이상이 되는 지반의 굴착작업",
    "교량(높이 5미터, 지간 30미터 이상)의 설치 · 해체 또는 변경 작업",
    "구축물, 건축물, 그 밖의 시설물 등의 해체작업",
    "중량물의 취급작업",
    "승강기의 설치 · 조립 · 수리 · 점검 또는 해체 작업",
    "리프트의 설치 · 조립 · 수리 · 점검 또는 해체 작업",
    "공작 · 수송 · 건설기계 작업 (기계가 갑자기 가동될 우려 있는 경우)",
    "차량계하역운반기계등의 수리 또는 부속장치의 장착 및 해체작업",
    "차량계건설기계의 수리나 부속장치의 장착 및 제거작업",
    "화학설비와 그 부속설비의 개조 · 수리 및 청소 등을 위하여 해당 설비를 분해하거나 해당 설비의 내부에서 작업",
    "관리대상 유해물질이 들어있던 탱크 등을 개조 · 수리 또는 청소를 하거나 해당 설비나 탱크 등의 내부에 들어가서 작업",
  ];
  const circ = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬";
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>작업지휘자 지정서 - ${esc(name)}</title>
<style>
  @page{size:A4;margin:15mm}
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.7 "Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#000}
  .page{border:2px solid #000;padding:28px 34px;min-height:calc(297mm - 30mm - 4px);display:flex;flex-direction:column}
  h1{text-align:center;font-size:28px;letter-spacing:2px;margin:6px 0 26px}
  .who{margin-left:auto;width:260px;margin-bottom:28px}
  .who div{margin:2px 0}
  .lead{text-indent:2em;margin:0 0 26px}
  .center{text-align:center;margin:0 0 22px}
  .duty{margin:0 0 22px 2em}
  ol{list-style:none;margin:0 0 0 3em;padding:0}
  li{display:flex;gap:6px;margin:3px 0}
  li b{font-weight:normal;flex:none}
  .note{display:inline-block;margin-left:1em}
  .date{text-align:center;margin:30px 0 0}
  .sign{margin-top:auto;padding-top:34px;text-align:right;font-weight:700}
  .sign span{display:inline-block;width:180px}
</style></head><body><div class="page">
<h1>작업지휘자 지정서</h1>
<div class="who"><div>소 속 : ${esc(company)}</div><div>성 명 : ${esc(name)}</div></div>
<p class="lead">귀하를 산업안전보건기준에 관한 규칙에 따른 당 현장 관계수급업체(${esc(company)})의 작업지휘자로 지정하는 바, 아래의 직무내용을 성실히 수행하시기 바랍니다.</p>
<p class="center">- 아 래 -</p>
<p class="duty">다음의 작업에 대하여 작성된 작업계획서를 확인하고 이에 따라<br>작업이 이루어지도록 작업을 지휘 한다.</p>
<ol>${items.map((t, i) => `<li><b>${circ[i]}</b><span>${t}</span></li>`).join("")}</ol>
<p class="date">20&emsp;&emsp;년&emsp;&emsp;월&emsp;&emsp;일</p>
<div class="sign">안전보건관리책임자 : <span></span>(인)</div>
</div><script>window.onload=()=>{window.focus();window.print();}<\/script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return toast("팝업이 차단되었습니다. 팝업을 허용해주세요.");
  w.document.open(); w.document.write(html); w.document.close();
}

// 순서는 행 위치대로 자동 번호 (화면은 CSS 카운터, 저장 시 collect에서 매김)
function addWork(r) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td class="chk"><input type="checkbox" class="row-chk"></td><td class="seq"></td>
    <td><input data-k="work_name" value="${esc(r.work_name)}"></td>
    <td><select data-k="risk"><option value="">선택</option>${RISKS.map(x => `<option>${x}</option>`).join("")}</select></td>
    <td><input data-k="risk_remark" value="${esc(r.risk_remark)}"></td>
    <td><input data-k="safety_measure" value="${esc(r.safety_measure)}"></td>`;
  tr.querySelector("select").value = r.risk || "";
  $("#work-body").append(tr);
}

/* ---------------- 중량물 취급계획서 ---------------- */
function addHeavy(r) {
  const tr = document.createElement("tr");
  tr._files = { ...(r.files || {}) };
  tr._rope = r.rope_detail || null;
  const n = k => `<td><input type="number" step="0.01" data-k="${k}" value="${esc(r[k])}"></td>`;
  tr.innerHTML = `<td class="chk"><input type="checkbox" class="row-chk"></td>
    <td><div class="shape"><div class="thumb"></div><div class="file" data-key="shape" data-accept="image/*" data-preview data-compact></div></div></td>
    <td><input data-k="tie_method" value="${esc(r.tie_method)}"></td><td><input data-k="kind" value="${esc(r.kind)}"></td>
    ${n("length_m")}${n("height_m")}${n("width_m")}${n("weight_ton")}
    <td class="center"><input type="checkbox" data-k="rope_review" ${r.rope_review ? "checked" : ""}></td>
    <td class="center"><button type="button" class="btn sm dark btn-rope">입력</button></td>`;
  const box = tr.querySelector(".file");
  box._store = tr._files; box._pv = tr.querySelector(".thumb");
  renderFile(box);
  syncRopeBtn(tr);
  $("#heavy-body").append(tr);
}

const syncRopeBtn = tr => {
  const b = tr.querySelector(".btn-rope");
  b.textContent = tr._rope ? "수정" : "입력";
  b.classList.toggle("done", !!tr._rope);
};

/* 줄걸이 검토 계산 (원본 팝업과 같은 식)
   - 와이어로프: 안전하중 = 파단하중 × 줄걸이수 ÷ (안전계수 × 장력계수)
   - 라운드슬링: 안전하중 = 규격 × 줄걸이수 ÷ (방법계수[일자 1 / 초크 1.2] × 장력계수)
   - 수동입력  : 안전하중 = 규격 × 줄걸이수 ÷ (안전계수 × 장력계수)
   결과: 안전하중 > 중량물 무게 → OK
   - 공도구: 능력 = 사용하중 × 수량, 사용율 = 중량 ÷ 능력 × 100, 100% 이하 → OK */
function calcRope(d, weight) {
  const v = k => (d[k] === "" || d[k] == null || isNaN(parseFloat(d[k]))) ? null : parseFloat(d[k]);
  const W = weight == null || weight === "" ? null : parseFloat(weight);
  const judge = safe => safe == null || W == null ? "" : (safe > W ? "OK" : "NG");
  const safeOf = (a, b, c, e) => [a, b, c, e].some(x => x == null) || c * e === 0 ? null : +(a * b / (c * e)).toFixed(2);
  const o = {};
  if (d.lineKind === "01") { o.safe = safeOf(v("wF"), v("wQty"), v("wR1"), v("wR2")); }
  else if (d.lineKind === "02") {
    o.rR1 = d.rMethod === "01" ? 1 : d.rMethod === "02" ? 1.2 : null;
    o.safe = safeOf(v("rSize"), v("rQty"), o.rR1, v("rR2"));
  }
  else if (d.lineKind === "03") { o.safe = safeOf(v("mSize"), v("mQty"), v("mR1"), v("mR2")); }
  o.rslt = d.lineKind ? judge(o.safe) : "";
  o.tools = [1, 2, 3, 4].map(i => {
    const tw = v(`t${i}Weight`), tq = v(`t${i}Qty`);
    if (tw == null || tq == null) return { ability: null, rate: null, rslt: "" };
    const ability = +(tw * tq).toFixed(2);
    if (W == null || !ability) return { ability, rate: null, rslt: "" };
    const rate = +(W / ability * 100).toFixed(2);
    return { ability, rate, rslt: rate <= 100 ? "OK" : "NG" };
  });
  return o;
}

let ropeRow = null;
function setupRopeDialog() {
  const dlg = $("#rope-dlg");
  $("#rp-tools").innerHTML = [1, 2, 3, 4].map(i => `<tr>
    ${i === 1 ? '<th colspan="2" rowspan="4">공도구</th>' : ""}
    <td colspan="2"><input data-r="t${i}Name"></td><th>사용하중</th><td colspan="2"><input data-r="t${i}Weight" inputmode="decimal"></td><td>Ton</td>
    <th>수량</th><td><input data-r="t${i}Qty" inputmode="numeric"></td><td>EA</td>
    <th>능력</th><td data-o="t${i}Ability"></td><th>사용율</th><td colspan="2" data-o="t${i}Rate"></td><th>결과</th><td data-o="t${i}Rslt"></td></tr>`).join("");
  const read = () => {
    const d = { lineKind: dlg.querySelector('[name="rp-kind"]:checked')?.value || "" };
    dlg.querySelectorAll("[data-r]").forEach(el => d[el.dataset.r] = el.value.trim());
    return d;
  };
  const refresh = () => {
    const d = read(), w = ropeRow.querySelector('[data-k="weight_ton"]').value, o = calcRope(d, w);
    paintRope(dlg, d, o);
    return { d, o };
  };
  dlg.addEventListener("input", refresh);
  dlg.addEventListener("change", refresh);
  // 숫자칸: 소수 둘째 자리까지만, 수량은 정수만
  dlg.addEventListener("input", e => {
    const el = e.target; if (!el.matches("[inputmode]")) return;
    let s = el.value.replace(el.inputMode === "numeric" ? /[^0-9]/g : /[^0-9.]/g, "");
    const [a, b] = s.split("."); if (b !== undefined) s = a + "." + b.replace(/\./g, "").slice(0, 2);
    if (s !== el.value) el.value = s;
  }, true);
  $("#rp-close").onclick = () => dlg.close();
  $("#rp-save").onclick = () => {
    const { d, o } = refresh();
    const need = (k, msg) => !d[k] ? msg : null;
    const err =
      (!d.lineKind && "줄걸이 종류를 선택해주세요.") ||
      (d.lineKind === "01" && (need("wF", "와이어로프 파단하중을 입력해주세요.") || need("wSize", "와이어로프 길이를 입력해주세요.") ||
        need("wQty", "와이어로프 줄걸이 수를 입력해주세요.") || need("wR1", "와이어로프 안전계수를 입력해주세요.") || need("wR2", "와이어로프 장력계수를 입력해주세요."))) ||
      (d.lineKind === "02" && (need("rMethod", "라운드슬링 줄걸이 방법을 선택해주세요.") || need("rSize", "라운드슬링 규격을 입력해주세요.") ||
        need("rQty", "라운드슬링 줄걸이 수를 입력해주세요.") || need("rR2", "라운드슬링 장력계수를 입력해주세요."))) ||
      (d.lineKind === "03" && (need("mKind", "수동입력 종류를 입력해주세요.") || need("mF", "수동입력 파단하중을 입력해주세요.") ||
        need("mSize", "수동입력 규격 입력해주세요.") || need("mQty", "수동입력 줄걸이 수를 입력해주세요.") ||
        need("mR1", "수동입력 안전계수를 입력해주세요.") || need("mR2", "수동입력 장력계수를 입력해주세요."))) ||
      (![1, 2, 3, 4].some(i => d[`t${i}Name`]) && "공도구는 1개 이상 입력해주세요.") ||
      (o.rslt === "NG" && `${{ "01": "와이어로프", "02": "라운드슬링", "03": "수동입력" }[d.lineKind]} 줄걸이 검토 결과가 NG입니다. 수정 후 다시 저장 해주세요.`) ||
      (o.tools.findIndex(t => t.rslt === "NG") >= 0 && `공도구 ${d[`t${o.tools.findIndex(t => t.rslt === "NG") + 1}Name`]} 검토 결과가 NG입니다. 수정 후 다시 저장 해주세요.`);
    if (err) return toast(err);
    ropeRow._rope = d;
    ropeRow.querySelector('[data-k="rope_review"]').checked = true;
    syncRopeBtn(ropeRow);
    dlg.close();
    calc();
    toast("줄걸이 검토를 반영했습니다. 저장 버튼을 눌러야 저장됩니다.");
  };
  dlg._refresh = refresh;
}

function openRope(tr) {
  const w = tr.querySelector('[data-k="weight_ton"]').value;
  if (!w) return toast("중량(Ton)을 먼저 입력해주세요.");
  const dlg = $("#rope-dlg");
  if (!dlg._refresh) setupRopeDialog();
  ropeRow = tr;
  const d = tr._rope || {};
  dlg.querySelectorAll('[name="rp-kind"]').forEach(r => r.checked = r.value === d.lineKind);
  dlg.querySelectorAll("[data-r]").forEach(el => el.value = d[el.dataset.r] ?? "");
  $("#rp-weight").textContent = `중량물 무게 ${w} Ton`;
  dlg._refresh();
  dlg.showModal();
}

/* ---------- 폼 <-> 데이터 ---------- */
function fill(f, p) {
  const lift = p.lifting || {};
  for (const el of f.elements) {
    if (!el.name) continue;
    const v = el.name.startsWith("lift.") ? lift[el.name.slice(5)] : p[el.name];
    if (v == null) continue;
    if (el.type === "radio") el.checked = el.value === v;
    else if (el.type === "checkbox") el.checked = !!v;
    else el.value = v;
  }
}

function rowsOf(tbody) {
  return [...tbody.querySelectorAll("tr")].map(tr => {
    const o = {};
    if (tr._files) o.files = { ...tr._files };
    if ("_rope" in tr) o.rope_detail = tr._rope;
    tr.querySelectorAll("[data-k]").forEach(el => {
      const k = el.dataset.k;
      if (el.type === "radio") { if (el.checked) o[k] = el.value; else if (!(k in o)) o[k] = null; return; }
      o[k] = el.type === "checkbox" ? el.checked : el.value === "" ? null : el.type === "number" ? Number(el.value) : el.value;
    });
    return o;
  });
}

function collect(f) {
  const plan = { lifting: {} };
  plan.files = { ...curFiles };
  for (const el of f.elements) {
    if (!el.name || el.dataset.k || (el.type === "radio" && !el.checked)) continue;
    let v = el.type === "checkbox" ? el.checked : el.value === "" ? null : el.type === "number" ? Number(el.value) : el.value;
    if (el.dataset.when && el.disabled) v = null;   // 선택 안 된 조치칸은 비움
    if (el.name.startsWith("lift.")) plan.lifting[el.name.slice(5)] = v; else plan[el.name] = v;
  }
  // '해당'이 아니면 딸린 값은 저장하지 않음
  if (plan.inspection_yn !== "해당") { plan.inspection_date = null; delete plan.files.inspection; }
  if (plan.change_issue_yn !== "해당") delete plan.files.change_issue;
  if (plan.route_in_yn !== "해당") delete plan.files.route_in;
  if (plan.heavy_work !== "기타") { plan.heavy_etc_lift = false; plan.heavy_etc_heavy = false; }
  const personnel = [];
  document.querySelectorAll(".pgroup").forEach(g => {
    if (g.dataset.yn && plan[g.dataset.yn] === "미해당") return;   // 미해당이면 인원 저장 안 함
    rowsOf(g.querySelector("tbody")).forEach(r => { if (r.name || r.phone) personnel.push({ ...r, role: g.dataset.role }); });
  });
  return { plan, personnel, work: rowsOf($("#work-body")).map((r, i) => ({ ...r, seq: i + 1 })), heavy: rowsOf($("#heavy-body")).filter(r => r.kind || r.tie_method || r.weight_ton != null || r.rope_detail || Object.keys(r.files || {}).length) };
}

function validate({ plan, work, personnel, heavy }) {
  const hreq = { tie_method: "자재운반시 결박방법", kind: "종류", length_m: "길이", height_m: "높이", width_m: "넓이", weight_ton: "중량" };
  for (const [i, h] of heavy.entries()) {
    for (const [k, label] of Object.entries(hreq)) if (h[k] == null || h[k] === "") return `중량물 ${i + 1}번째 행: ${label}을(를) 입력해주세요.`;
    if (h.rope_review && !h.rope_detail) return `중량물 ${i + 1}번째 행: 줄걸이 검토를 입력해주세요.`;
    if (h.rope_review && h.rope_detail) {   // 중량이 바뀌었을 수 있으니 다시 계산
      const o = calcRope(h.rope_detail, h.weight_ton);
      if (o.rslt === "NG" || o.tools.some(t => t.rslt === "NG")) return `중량물 ${i + 1}번째 행: 줄걸이 검토 결과가 NG입니다. 상세보기에서 수정해주세요.`;
    }
  }
  for (const p of personnel) {
    if (!p.name) return `${p.role} 성명을 입력해주세요.`;
    if (p.role === "작업지휘자" && !p.phone) return "작업지휘자 연락처를 입력해주세요.";
  }
  if (plan.commander_yn === "해당" && !personnel.some(p => p.role === "작업지휘자")) return "작업지휘자를 1명 이상 등록해주세요.";
  const req = [["work_start","작업기간(시작)"],["work_end","작업기간(종료)"],["work_name","작업명"],["work_place","작업장소"],["in_date","반입일"],["out_date","반출예정일"],["equip_type","장비명"],["reg_no","차량번호"]];
  for (const [k, label] of req) if (!plan[k]) return `${label}을(를) 입력해주세요.`;
  if (plan.work_end < plan.work_start) return "작업기간 종료일이 시작일보다 빠릅니다.";
  for (const [k, label] of [["insur_end","보험유효기간"],["car_insp_end","검사유효기간(차량)"]])
    if (plan[k] && plan.work_end > plan[k]) return `작업기간은 ${label}을 초과할 수 없습니다.`;
  for (const i of document.querySelectorAll("input[data-when]:not(:disabled)"))
    if (!i.value.trim()) return `${i.dataset.label} 내용을 입력해주세요.`;
  if (plan.inspection_yn === "해당" && !plan.inspection_date) return "점검강화대상 점검일을 입력해주세요.";
  if (plan.heavy_work === "기타" && !plan.heavy_etc_lift && !plan.heavy_etc_heavy) return "중량물작업 기타: 양중 또는 중량물을 선택해주세요.";
  for (const r of RISKS) if (!work.some(w => w.risk === r)) return `작업내용의 위험요인 중 ${r}이(가) 선택되지 않았습니다.`;
  return null;
}

async function save(id, { plan, personnel, work, heavy }) {
  plan.updated_at = new Date().toISOString();
  let planId = id;
  if (id) {
    const { error } = await sb.from("ewp_plans").update(plan).eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await sb.from("ewp_plans").insert(plan).select("id").single();
    if (error) throw error;
    planId = data.id;
  }
  // 하위 목록은 단순하게 전체 교체
  for (const [table, rows] of [["ewp_personnel", personnel], ["ewp_work_items", work], ["ewp_heavy_items", heavy]]) {
    const d = await sb.from(table).delete().eq("plan_id", planId);
    if (d.error) throw d.error;
    if (rows.length) {
      const ins = await sb.from(table).insert(rows.map(r => ({ ...r, plan_id: planId })));
      if (ins.error) throw ins.error;
    }
  }
  return planId;
}

/* ---------- 화면 연동 ---------- */
function syncTabs() {
  const hw = document.querySelector('[name="heavy_work"]:checked')?.value;
  const t2 = $("#tab2"), t3 = $("#tab3");
  if (!t2) return;
  const etcLift = document.querySelector('[name="heavy_etc_lift"]').checked;
  const etcHeavy = document.querySelector('[name="heavy_etc_heavy"]').checked;
  // 기타: 체크한 항목의 탭만 표시
  t2.hidden = !(hw === "굴착기" || hw === "크레인" || (hw === "기타" && etcLift));
  t3.hidden = !hw || hw === "미해당" || (hw === "기타" && !etcHeavy);
  // 출력 시 해당 없는 탭은 인쇄하지 않음
  document.querySelector('.tab[data-pane="2"]').dataset.off = t2.hidden;
  document.querySelector('.tab[data-pane="3"]').dataset.off = t3.hidden;
  const active = document.querySelector(".tabs button.active");
  if (active?.hidden) document.querySelector('.tabs button[data-tab="1"]').click();
  const model = document.querySelector('[name="model_name"]').value;
  $("#lift-model").textContent = model;
}

/* ---------------- 양중 작업계획서 (원본 fnTxtChange 와 같은 식) ----------------
   - 중량물: 줄걸이검토 '해당'인 중량물 중 가장 무거운 행 (없으면 첫 행)
   - 정격 총하중 = 중량물 무게 + 줄걸이·훅 중량
   - 사용율 = 정격 총하중 ÷ 최대 양중능력 × 100  → 85% 이하 OK (T/C·크레인(호이스트) 100%)
   - 접지하중 = (장비 중량 + 정격 총하중) × 1.3 × 0.5 × 1.5        (H/C, 카고 限)
   - 필요 지내력 = 접지하중 ÷ (받침 철판 가로 × 세로), 현장 지내력 > 필요 지내력 → OK
   - 줄걸이 사용율 = 중량물 무게 ÷ 줄걸이 안전하중 × 100 → 위와 같은 기준 */
function calc() {
  const tbl = document.querySelector("table.lift");
  if (!tbl) return;
  const L = n => document.querySelector(`[name="lift.${n}"]`);
  const num = n => { const v = L(n).value; return v === "" || isNaN(parseFloat(v)) ? null : parseFloat(v); };
  const out = (k, v, rslt) => { const el = tbl.closest("section").querySelector(`[data-lo="${k}"]`); el.textContent = v ?? ""; if (rslt) el.className = v === "NG" ? "ng" : v === "OK" ? "ok" : ""; };
  const crane = document.querySelector('[name="lift.crane_kind"]:checked')?.value || "";
  const limit = crane === "T/C" || crane === HOIST ? 100 : 85;

  // 양중기 종류에 따른 입력칸 잠금
  const isHC = crane === HC;
  tbl.querySelectorAll("input.hc").forEach(i => { i.disabled = !isHC; if (!isHC) i.value = ""; });
  const lq = L("line_qty"); lq.disabled = !crane || crane === HOIST; if (crane === HOIST) lq.value = "";

  // 대상 중량물 선택
  const trs = [...document.querySelectorAll("#heavy-body tr")];
  const wOf = tr => parseFloat(tr.querySelector('[data-k="weight_ton"]').value) || 0;
  const cands = trs.filter(tr => tr.querySelector('[data-k="rope_review"]').checked);
  let pick = trs[0] || null;
  cands.forEach(tr => { if (!pick || !cands.includes(pick) || wOf(tr) > wOf(pick)) pick = tr; });
  trs.forEach(tr => tr.classList.toggle("picked", tr === pick));
  const val = (tr, k) => tr ? tr.querySelector(`[data-k="${k}"]`).value : "";
  out("kind", val(pick, "kind")); out("size1", val(pick, "length_m")); out("size2", val(pick, "height_m")); out("size3", val(pick, "width_m"));
  const wRaw = val(pick, "weight_ton"); out("weight", wRaw);
  const W = wRaw === "" ? null : parseFloat(wRaw);

  // 중량물 목록
  const list = $("#lift-heavy-list tbody");
  list.innerHTML = trs.length ? `<tr><th colspan="4">중량물 종류</th><th colspan="11">규격</th><th colspan="3">무게</th></tr>` + trs.map(tr =>
    `<tr><td colspan="4">${esc(val(tr, "kind"))}</td><td colspan="2">${esc(val(tr, "length_m"))}</td><td>m</td><td>X</td><td colspan="2">${esc(val(tr, "height_m"))}</td><td>m</td><td>X</td>
     <td colspan="2">${esc(val(tr, "width_m"))}</td><td>m</td><td colspan="2">${esc(val(tr, "weight_ton"))}</td><td>Ton</td></tr>`).join("") : "";

  // 줄걸이 (중량물 탭에서 입력한 값)
  const d = pick?._rope || null;
  tbl.querySelectorAll("[data-lk]").forEach(r => r.checked = d?.lineKind === r.dataset.lk);
  const ro = d ? calcRope(d, W) : null;
  renderRopeView(d, ro);

  // 정격 총하중 / 사용율
  const hook = num("hook_weight"), max = num("max_capacity"), equ = num("equ_weight");
  const total = W == null && hook == null ? null : (W || 0) + (hook || 0);
  out("total", fmt(total)); out("total2", fmt(total)); out("maxcap", fmt(max));
  const totalRate = total != null && max ? +(total / max * 100).toFixed(2) : null;
  const totalRslt = totalRate == null ? "" : totalRate <= limit ? "OK" : "NG";
  out("total_rate", totalRate == null ? "" : totalRate + "%"); out("total_rslt", totalRslt, true);

  // 지내력 (H/C, 카고)
  let load = null, need = null, siteRslt = "";
  if (isHC && equ != null && total != null) {
    load = +((equ + total) * 1.3 * 0.5 * 1.5).toFixed(2);
    const iw = num("iron_w"), ih = num("iron_h"), site = num("site_rate");
    if (iw && ih) { need = +(load / (iw * ih)).toFixed(2); if (site != null) siteRslt = site > need ? "OK" : "NG"; }
  }
  out("ground_load", fmt(load)); out("need_bearing", fmt(need)); out("site_rslt", siteRslt, true);

  // 줄걸이 안전하중 사용율
  const safe = ro?.safe ?? null;
  const ropeRate = safe && W != null ? +(W / safe * 100).toFixed(2) : null;
  const ropeRslt = ropeRate == null ? "" : ropeRate <= limit ? "OK" : "NG";
  out("rope_safe", safe == null ? "" : safe.toFixed(2)); out("rope_rate", ropeRate == null ? "" : ropeRate + "%"); out("rope_rslt", ropeRslt, true);

  liftState = { crane, d, ro, totalRslt, siteRslt, ropeRslt };
}

// 중량물 탭에서 입력한 줄걸이 검토를 양중 탭에 읽기 전용으로 표시
function renderRopeView(d, o) {
  const box = $("#lift-rope");
  if (!box) return;
  $("#lift-rope-empty").hidden = !!d;
  if (!d) { box.innerHTML = ""; return; }
  const dlg = $("#rope-dlg");
  if (!dlg._refresh) setupRopeDialog();
  const t = dlg.querySelectorAll("table.rp")[1].cloneNode(true);
  t.querySelector("#rp-tools")?.removeAttribute("id");
  t.querySelectorAll("[data-r]").forEach(el => { el.value = d[el.dataset.r] ?? ""; el.disabled = true; });
  paintRope(t, d, o);
  box.replaceChildren(t);
}

// 줄걸이 검토 결과칸 채우기 (검토 창과 양중 탭 공용)
function paintRope(root, d, o) {
  const out = (k, val, isRslt) => {
    const el = root.querySelector(`[data-o="${k}"]`); if (!el) return;
    el.textContent = val ?? "";
    if (isRslt) el.className = val === "NG" ? "ng" : val === "OK" ? "ok" : "";
  };
  ["01", "02", "03"].forEach(k => root.querySelectorAll(".k" + k).forEach(el => el.hidden = d.lineKind !== k));
  out("wF", d.wF); out("wQty", d.wQty); out("rSize", d.rSize); out("rQty", d.rQty); out("mSize", d.mSize); out("mQty", d.mQty);
  out("rR1", o.rR1);
  const p = { "01": "w", "02": "r", "03": "m" }[d.lineKind];
  ["w", "r", "m"].forEach(x => { out(x + "Safe", x === p ? o.safe?.toFixed(2) : ""); out(x + "Rslt", x === p ? o.rslt : "", true); });
  o.tools.forEach((t, i) => { out(`t${i + 1}Ability`, t.ability?.toFixed(2)); out(`t${i + 1}Rate`, t.rate == null ? "" : t.rate + "%"); out(`t${i + 1}Rslt`, t.rslt, true); });
}

// 양중 탭 저장 전 확인 (원본 저장 검사와 같은 순서·문구)
function validateLift(plan) {
  if ($("#tab2").hidden) return null;
  const l = plan.lifting, s = liftState, crane = l.crane_kind;
  const need = [];
  if (!s.d?.lineKind) return "줄걸이 종류를 선택해주세요. (중량물 취급계획서 탭의 줄걸이검토에서 입력)";
  if (!crane) return "양중기 종류를 선택해주세요.";
  need.push(["boom", "Boom 길이를"]);
  if (crane !== HOIST) {
    need.push(["line_qty", "권상용 와이어로프 수를"]);
    if (crane === HC) need.push(["equ_weight", "건설기계(장비) 중량을"], ["iron_w", "받침 철판(가로)을"], ["iron_h", "받침 철판(세로)을"], ["site_rate", "현장 지내력을"]);
  }
  need.push(["luffing_len", "Luffing(보조) 붐 길이를"], ["luffing_angle", "Luffing(보조) 붐 각도를"], ["radius", "작업반경을"], ["height", "양중높이를"],
    ["counter_weight", "Counter weight를"], ["outrigger_front", "아우트리거 길이(전면)를"], ["outrigger_back", "아우트리거 길이(후면)를"],
    ["hook_weight", "줄걸이, 훅 중량을"], ["max_capacity", "최대 양중능력을"]);
  for (const [k, label] of need) if (l[k] == null || l[k] === "") return `${label} 입력해주세요.`;
  const nm = { "01": "와이어로프", "02": "라운드슬링", "03": "수동입력" }[s.d.lineKind];
  if (crane === HC && s.siteRslt === "NG") return "현장 지내력 검토 결과가 NG입니다. 수정 후 다시 저장 해주세요.";
  if (s.totalRslt === "NG") return "정격 총하중 검토 결과가 NG입니다. 수정 후 다시 저장 해주세요.";
  if (s.ropeRslt === "NG") return `${nm} 안전하중 검토 결과가 NG입니다. 수정 후 다시 저장 해주세요.`;
  if (s.ro?.rslt === "NG") return `${nm} 줄걸이 검토 결과가 NG입니다. 수정 후 다시 저장 해주세요.`;
  const ti = s.ro?.tools.findIndex(t => t.rslt === "NG") ?? -1;
  if (ti >= 0) return `공도구 ${s.d[`t${ti + 1}Name`] || ""} 검토 결과가 NG입니다. 수정 후 다시 저장 해주세요.`;
  return null;
}

/* ---------------- 출력 (원본 출력물 양식) ---------------- */
async function printPlan() {
  const w = window.open("", "_blank");
  if (!w) return toast("팝업이 차단되었습니다. 팝업을 허용해주세요.");
  w.document.write('<p style="font:14px sans-serif;padding:24px">출력 준비 중…</p>');
  calc();
  const { plan, personnel, work, heavy } = collect($("#f"));
  const showLift = !$("#tab2").hidden, showHeavy = !$("#tab3").hidden;

  // 사진은 비공개 저장소라 임시 링크를 받아서 넣음
  const want = {};
  for (const k of ["route_out", "route_in", "lift_plan", "lift_elev"]) {
    const f = plan.files?.[k]; if (f && /^image\//.test(f.type || "")) want[k] = f.path;
  }
  heavy.forEach((h, i) => { const f = h.files?.shape; if (f) want["shape" + i] = f.path; });
  const urls = {};
  await Promise.all(Object.entries(want).map(async ([k, path]) => {
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 600);
    if (data) urls[k] = data.signedUrl;
  }));

  const lo = k => document.querySelector(`[data-lo="${k}"]`)?.textContent || "";
  const sz = [lo("size1"), lo("size2"), lo("size3")];
  const lift = {
    lineKind: liftState.d?.lineKind, kind: lo("kind"), weight: lo("weight"),
    size: sz.some(Boolean) ? `${sz.join(" × ")} m` : "",
    total: lo("total"), totalRate: lo("total_rate"), totalRslt: lo("total_rslt"),
    ropeSafe: lo("rope_safe"), ropeRate: lo("rope_rate"), ropeRslt: lo("rope_rslt"),
    groundLoad: lo("ground_load"), needBearing: lo("need_bearing"), siteRslt: lo("site_rslt"),
    ropeHtml: ropePrintHtml(liftState.d),
  };
  // 새 창에 문서로 띄움 (document.write 보다 사진 로딩이 안정적)
  const blob = new Blob([buildPrintHtml({ plan, personnel, work, heavy, urls, lift, showLift, showHeavy })], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  w.location.replace(url);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// 양중 탭의 줄걸이 검토 표를 인쇄용(입력칸 → 글자)으로 변환
function ropePrintHtml(d) {
  const tb = $("#lift-rope table");
  if (!tb || !d) return "";
  const c = tb.cloneNode(true);
  c.querySelectorAll("tr[hidden], .tip").forEach(x => x.remove());
  const METHOD = { "01": "일자걸이", "02": "초크걸이" };
  c.querySelectorAll("[data-r]").forEach(el => {
    const k = el.dataset.r, s = document.createElement("span");
    s.textContent = k === "rMethod" ? METHOD[d[k]] || "" : d[k] ?? "";
    el.replaceWith(s);
  });
  c.className = "rope";
  return c.outerHTML;
}

/* ---------------- 엑셀 불러오기 ---------------- */
async function importExcel(file) {
  if (!file) return;
  if (!/\.xlsx$/i.test(file.name)) return toast("엑셀(.xlsx) 파일만 불러올 수 있습니다.");
  document.querySelectorAll(".xl-pick").forEach(b => b.classList.add("busy"));
  toast("엑셀을 읽는 중…");
  try {
    const { parseEwpExcel } = await import("./import.js");
    const im = await parseEwpExcel(file, { EQUIP, RISKS, ROLES: ROLES.map(r => r.role) });
    // 운행경로 사진은 저장소에 올려 첨부로 연결
    const files = {};
    for (const [k, blob] of Object.entries(im.images)) {
      const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
      const path = `${k}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type });
      if (error) im.notes.push(`운행경로 사진을 올리지 못했습니다: ${error.message}`);
      else files[k] = { path, name: `${k === "route_out" ? "현장외곽" : "내부장소"}_엑셀.${ext}`, type: blob.type };
    }
    im.plan.files = files;
    im.fileName = file.name;
    pendingImport = im;
    if (location.hash === "#/new") renderEdit(null); else location.hash = "#/new";
  } catch (ex) {
    console.error(ex);
    toast("엑셀을 읽지 못했습니다: " + ex.message);
  } finally {
    document.querySelectorAll(".xl-pick").forEach(b => b.classList.remove("busy"));
  }
}

function showImportNote(im) {
  const box = $("#import-note"); if (!box) return;
  const cnt = (r) => im.personnel.filter(p => p.role === r).length;
  const roles = ["신호수", "유도자", "작업자", "운전원", "작업지휘자"].filter(cnt).map(r => `${r} ${cnt(r)}명`).join(", ");
  box.innerHTML = `<div class="in-head"><b>엑셀에서 불러왔습니다</b><span class="muted">${esc(im.fileName)}</span><button type="button" class="btn sm" id="in-close">닫기</button></div>
    <p>작업개요 · 장비정보 · 결재자 · 작업인원(${esc(roles || "없음")}) · 지형지반 · 작업내용 ${im.work.length}건${Object.keys(im.images).length ? " · 운행경로 사진" : ""}을 옮겨 적었습니다. 내용을 확인한 뒤 <b>저장</b>을 눌러야 등록됩니다.</p>
    ${im.notes.length ? `<ul>${im.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}`;
  box.hidden = false;
  $("#in-close").onclick = () => box.hidden = true;
  toast("엑셀 내용을 채웠습니다. 확인 후 저장해주세요.");
}
