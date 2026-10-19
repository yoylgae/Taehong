// 중요 일정 알리미 — 홈 카드, 위쪽 종 아이콘, 하루 첫 접속 알림, 시간 알람(사이트가 열려 있는 동안)
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ymd = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const DAY = 86400000;
const dd = (a, b) => Math.round((new Date(a + "T00:00:00") - new Date(b + "T00:00:00")) / DAY);   // a - b (일)
const WD = "일월화수목금토";
const fmtDate = s => { const d = new Date(s + "T00:00:00"); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
const REPEAT = { none: "", weekly: "매주", monthly: "매월", yearly: "매년" };
const ls = { get(k, d) { try { return JSON.parse(localStorage.getItem("pms.remind." + k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem("pms.remind." + k, JSON.stringify(v)); } catch {} } };

let sb, toast, openTab, rows = [], autos = [], showDone = false, timer = null;

export function initRemind(deps) {
  ({ sb, toast, openTab } = deps);
  $("#r-add").onclick = () => edit();
  $("#r-list").addEventListener("click", onListClick);
  $("#r-done-tg").onclick = () => { showDone = !showDone; draw(); };
  $("#bell").onclick = () => { openTab("home"); setTimeout(() => $("#remind").scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  $("#r-notify").onclick = askNotify;
  $("#dlg-remind").addEventListener("close", onSave);
  $("#rm-del").onclick = onDelete;
  $("#alarm").addEventListener("click", e => { if (e.target.closest("[data-x]")) $("#alarm").hidden = true; if (e.target.closest("[data-go]")) { $("#alarm").hidden = true; $("#bell").click(); } });
  drawNotifyBtn();
}

/* ---------- 불러오기 ---------- */
export async function loadRemind(plans = []) {
  const { data, error } = await sb.from("site_reminders").select("*").order("due_date").order("due_time", { nullsFirst: true });
  if (error) { $("#r-list").innerHTML = `<div class="r-empty">일정을 불러오지 못했습니다: ${esc(error.message)}</div>`; return; }
  rows = data || [];
  autos = planAlerts(plans);
  draw();
  dailyPopup();
  if (!timer) { timer = setInterval(tick, 20000); tick(); }
}
// 작업계획서의 보험·검사 만료 (진행 중이거나 앞으로 할 작업만)
function planAlerts(plans) {
  const today = ymd(new Date()), out = [];
  const F = [["insur_end", "보험 만료"], ["car_insp_end", "자동차검사 만료"], ["safe_insp_end", "안전검사 만료"]];
  for (const p of plans) {
    if (p.status === "반려" || (p.work_end && p.work_end < today)) continue;
    for (const [k, label] of F) {
      const d = p[k]; if (!d) continue;
      const left = dd(d, today), endBefore = p.work_end && d < p.work_end;
      if (left <= 14 || endBefore) out.push({ auto: 1, id: `${p.id}:${k}`, plan: p.id, title: `${label} · ${[p.equip_type, p.reg_no].filter(Boolean).join(" ")}`, memo: endBefore && left > 14 ? `작업 끝(${p.work_end})보다 먼저 만료` : p.work_name || "", due_date: d, remind_days: 14, important: left <= 3 });
    }
  }
  return out;
}

/* ---------- 상태 ---------- */
function state(r, today = ymd(new Date())) {
  const left = dd(r.due_date, today);
  if (left < 0) return { cls: "over", badge: `지남 ${-left}일`, left };
  if (left === 0) return { cls: "today", badge: r.due_time ? `오늘 ${r.due_time.slice(0, 5)}` : "오늘", left };
  if (left <= (r.remind_days ?? 3)) return { cls: "soon", badge: `D-${left}`, left };
  return { cls: "later", badge: `D-${left}`, left };
}
const alerting = () => [...rows.filter(r => !r.done), ...autos].filter(r => state(r).cls !== "later");

/* ---------- 그리기 ---------- */
function item(r) {
  const s = state(r);
  return `<div class="r-it ${s.cls}${r.done ? " done" : ""}${r.important ? " imp" : ""}" data-id="${esc(r.id)}" ${r.auto ? `data-plan="${esc(r.plan)}"` : ""}>
    ${r.auto ? `<span class="r-ck auto" title="작업계획서에서 자동으로 알림">🏗</span>` : `<button type="button" class="r-ck" data-done title="${r.done ? "완료 취소" : r.repeat !== "none" ? "완료 → 다음 반복 일정으로" : "완료"}">${r.done ? "✓" : ""}</button>`}
    <span class="r-badge">${r.done ? "완료" : esc(s.badge)}</span>
    <div class="r-tx"><b>${r.important ? "★ " : ""}${esc(r.title)}</b>
      <small>${fmtDate(r.due_date)}${r.due_time ? " " + r.due_time.slice(0, 5) : ""}${REPEAT[r.repeat] ? ` · 🔁 ${REPEAT[r.repeat]}` : ""}${r.memo ? ` · ${esc(r.memo)}` : ""}</small></div>
  </div>`;
}
function draw() {
  const act = [...rows.filter(r => !r.done), ...autos].sort((a, b) => a.due_date.localeCompare(b.due_date) || (a.due_time || "").localeCompare(b.due_time || "") || (b.important - a.important));
  const done = rows.filter(r => r.done).sort((a, b) => (b.done_at || "").localeCompare(a.done_at || "")).slice(0, 20);
  $("#r-list").innerHTML = act.length ? act.map(item).join("") : `<div class="r-empty">등록된 일정이 없습니다. <b>+ 일정 추가</b>로 점검·납부·회의·인허가 마감 같은 중요한 날을 넣어 두세요.</div>`;
  if (showDone) $("#r-list").innerHTML += done.length ? `<div class="r-sep">완료한 일정</div>` + done.map(item).join("") : `<div class="r-sep">완료한 일정이 없습니다</div>`;
  $("#r-done-tg").textContent = showDone ? "완료 숨기기" : `완료한 일정 ${rows.filter(r => r.done).length}`;
  const n = alerting().length, b = $("#bell-n");
  b.textContent = n; b.hidden = !n; $("#bell").classList.toggle("on", n > 0);
  $("#r-sum").textContent = n ? `확인할 일정 ${n}건` : "";
}

/* ---------- 목록 누르기 ---------- */
async function onListClick(e) {
  const it = e.target.closest(".r-it"); if (!it) return;
  if (it.dataset.plan) { openTab("ewp", "#/edit/" + it.dataset.plan); return; }
  const r = rows.find(x => x.id === it.dataset.id); if (!r) return;
  if (e.target.closest("[data-done]")) return toggleDone(r);
  edit(r);
}
const nextDate = (d, rep) => { const x = new Date(d + "T00:00:00"); if (rep === "weekly") x.setDate(x.getDate() + 7); else if (rep === "monthly") x.setMonth(x.getMonth() + 1); else if (rep === "yearly") x.setFullYear(x.getFullYear() + 1); return ymd(x); };
async function toggleDone(r) {
  let patch;
  if (!r.done && r.repeat && r.repeat !== "none") {
    let nd = nextDate(r.due_date, r.repeat); const today = ymd(new Date());
    while (nd < today) nd = nextDate(nd, r.repeat);
    patch = { due_date: nd };
  } else patch = { done: !r.done, done_at: r.done ? null : new Date().toISOString() };
  patch.updated_at = new Date().toISOString();
  const { error } = await sb.from("site_reminders").update(patch).eq("id", r.id);
  if (error) return toast("저장 실패: " + error.message);
  Object.assign(r, patch); draw();
  toast(patch.due_date ? `다음 일정: ${fmtDate(patch.due_date)}` : r.done ? `'${r.title}' 완료` : "완료를 취소했습니다");
}

/* ---------- 입력 창 ---------- */
let cur = null;
function edit(r) {
  cur = r || null;
  const f = $("#f-remind");
  f.title.value = r?.title || ""; f.due_date.value = r?.due_date || ymd(new Date()); f.due_time.value = r?.due_time?.slice(0, 5) || "";
  f.remind_days.value = String(r?.remind_days ?? 3); f.repeat.value = r?.repeat || "none"; f.important.checked = !!r?.important; f.memo.value = r?.memo || "";
  $("#rm-title").textContent = r ? "일정 고치기" : "중요 일정 추가"; $("#rm-del").hidden = !r;
  $("#dlg-remind").showModal(); setTimeout(() => f.title.focus(), 30);
}
async function onSave() {
  if ($("#dlg-remind").returnValue !== "save") return;
  const f = $("#f-remind");
  const row = { title: f.title.value.trim(), due_date: f.due_date.value, due_time: f.due_time.value || null, remind_days: +f.remind_days.value, repeat: f.repeat.value, important: f.important.checked, memo: f.memo.value.trim() || null, updated_at: new Date().toISOString() };
  if (!row.title || !row.due_date) return;
  if (cur) {
    const { error } = await sb.from("site_reminders").update(row).eq("id", cur.id);
    if (error) return toast("저장 실패: " + error.message);
    Object.assign(cur, row);
  } else {
    const { data, error } = await sb.from("site_reminders").insert(row).select().single();
    if (error) return toast("저장 실패: " + error.message);
    rows.push(data);
  }
  rows.sort((a, b) => a.due_date.localeCompare(b.due_date));
  draw(); toast(`'${row.title}' 일정을 저장했습니다 (${fmtDate(row.due_date)})`);
}
async function onDelete() {
  if (!cur || !confirm(`'${cur.title}' 일정을 지울까요?`)) return;
  const { error } = await sb.from("site_reminders").delete().eq("id", cur.id);
  if (error) return toast("지우지 못했습니다: " + error.message);
  rows = rows.filter(x => x.id !== cur.id); $("#dlg-remind").close(); draw(); toast("지웠습니다.");
}

/* ---------- 알림 ---------- */
// 하루 첫 접속 때 오늘 확인할 일정 보여주기
function dailyPopup() {
  const today = ymd(new Date()); if (ls.get("seen") === today) return;
  const list = alerting().sort((a, b) => a.due_date.localeCompare(b.due_date)); if (!list.length) return;
  ls.set("seen", today);
  showAlarm("오늘 확인할 일정", list.slice(0, 6).map(r => { const s = state(r); return `<li class="${s.cls}"><span>${esc(s.badge)}</span>${r.important ? "★ " : ""}${esc(r.title)}</li>`; }).join("") + (list.length > 6 ? `<li class="more">외 ${list.length - 6}건</li>` : ""));
}
function showAlarm(title, body) {
  const a = $("#alarm");
  a.innerHTML = `<div class="al-h"><b>🔔 ${esc(title)}</b><button type="button" data-x>✕</button></div><ul>${body}</ul><div class="al-f"><button type="button" class="btn" data-x>닫기</button><button type="button" class="btn primary" data-go>일정 보기</button></div>`;
  a.hidden = false;
}
// 시간 정한 일정: 30분 전, 정각에 알림
function tick() {
  const now = new Date(), today = ymd(now), fired = ls.get("fired", {});
  for (const k of Object.keys(fired)) if (!k.endsWith(today)) delete fired[k];
  for (const r of rows) {
    if (r.done || r.due_date !== today || !r.due_time) continue;
    const [h, m] = r.due_time.split(":").map(Number), at = new Date(now); at.setHours(h, m, 0, 0);
    const diff = (at - now) / 60000;
    for (const [key, cond, label] of [["30", diff <= 30 && diff > 0, `30분 뒤 (${r.due_time.slice(0, 5)})`], ["0", diff <= 0 && diff > -60, `지금 (${r.due_time.slice(0, 5)})`]]) {
      const id = `${r.id}:${key}:${today}`; if (!cond || fired[id]) continue;
      fired[id] = 1; notify(`${label} ${r.title}`, r.memo || "");
    }
  }
  ls.set("fired", fired);
  // 날짜가 바뀌면 다시 그림
  if (tick.day && tick.day !== today) { draw(); dailyPopup(); }
  tick.day = today;
}
function notify(title, body) {
  showAlarm("일정 알림", `<li class="today"><span>⏰</span>${esc(title)}${body ? `<br><small>${esc(body)}</small>` : ""}</li>`);
  try { if ("Notification" in window && Notification.permission === "granted") new Notification("현장관리시스템 · " + title, { body, tag: title }); } catch {}
  try { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.setValueAtTime(0.15, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.8); o.start(); o.stop(c.currentTime + 0.8); } catch {}
}
async function askNotify() {
  if (!("Notification" in window)) return toast("이 브라우저는 바탕화면 알림을 지원하지 않습니다.");
  if (Notification.permission === "denied") return toast("브라우저 설정에서 이 사이트 알림이 차단되어 있습니다. 주소창 자물쇠 → 알림 허용으로 바꿔 주세요.", 5000);
  const p = await Notification.requestPermission(); drawNotifyBtn();
  if (p === "granted") { toast("바탕화면 알림을 켰습니다."); try { new Notification("현장관리시스템", { body: "일정 시간이 되면 이렇게 알려 드립니다." }); } catch {} }
}
function drawNotifyBtn() {
  const b = $("#r-notify"), ok = "Notification" in window && Notification.permission === "granted";
  b.textContent = ok ? "🔔 바탕화면 알림 켜짐" : "🔕 바탕화면 알림 켜기"; b.classList.toggle("on", ok);
}
