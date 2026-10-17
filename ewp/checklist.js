// 건설장비 일일점검표: 작업계획서 내용을 머리칸에 채워 A4 출력 문서를 만든다.
import { CHECKLISTS, EQUIP_CHECKLIST } from "./checklist-data.js";
export { CHECKLISTS, EQUIP_CHECKLIST };

const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const t = v => esc(v ?? "");
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

// 주 시작일(월요일) 기준으로 7일 날짜 라벨
export function weekDates(monday) {
  if (!monday) return DAYS.map(() => "");
  const d0 = new Date(monday + "T00:00:00");
  return DAYS.map((_, i) => { const d = new Date(d0); d.setDate(d0.getDate() + i); return `${d.getMonth() + 1}/${d.getDate()}`; });
}

// 이번 주 월요일 (YYYY-MM-DD)
export function thisMonday() {
  const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const CSS = `
@page{size:A4;margin:10mm 12mm 8mm}
*{box-sizing:border-box}
body{margin:0;font:10.5px/1.45 "Pretendard Variable",Pretendard,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{width:186mm;margin:0 auto}
.top{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #1d4ed8;padding-bottom:6px;margin-bottom:10px}
.top h1{margin:0;font-size:20px;font-weight:800;letter-spacing:-.5px}
.top h1 small{display:block;font-size:11px;font-weight:600;color:#2563eb;letter-spacing:.5px;margin-bottom:2px}
.top .eq{font-size:13px;font-weight:700;color:#374151;background:#eef2ff;border:1px solid #c7d2fe;border-radius:99px;padding:4px 14px}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{border:1px solid #cbd5e1;padding:4px 7px;vertical-align:middle}
th{background:#f1f5f9;font-weight:600;color:#334155;text-align:center}
.hdr td{font-weight:600;font-size:11.5px}
.hdr th{width:22%}
.sec{display:flex;align-items:center;gap:8px;margin:9px 0 4px;font-size:11.5px;font-weight:700;color:#1e293b}
.sec::before{content:"";width:4px;height:13px;background:#2563eb;border-radius:2px}
.fig{border:1px solid #cbd5e1;border-radius:6px;padding:6px;text-align:center;background:#fff}
.fig img{max-width:100%;max-height:64mm;object-fit:contain}
.cont td.n,.chk td.n{text-align:center;font-weight:700;color:#2563eb}
.chk th.d{width:9.5%}
.chk td.d{text-align:center;height:30px;font-size:12px}
.chk th.d small{display:block;font-weight:400;color:#94a3b8;font-size:11px;margin-top:2px;height:15px;line-height:15px}
.chk td.item{font-weight:600}
.legend{margin:6px 0 0;font-size:9.5px;color:#475569}
.legend b{color:#111}
.sign{margin-top:10px}
.sign th{width:12%}
.sign td{height:46px;text-align:right;color:#94a3b8;vertical-align:bottom;font-size:9.5px}
.note{margin:6px 0 0;font-size:9.5px;color:#64748b}
.foot{margin-top:10px;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:4px}
.ck{display:inline-block;width:11px;height:11px;border:1.5px solid #334155;border-radius:2px;vertical-align:-2px;margin:0 3px 0 6px}
`;

function headerStd(p, c) {
  return `<table class="hdr">
    <tr><th>현장명</th><td>${t(p.site_name)}</td><th>장비번호</th><td>${t(p.reg_no)}</td></tr>
    <tr><th>형식(모델명)</th><td>${t(p.model_name)}</td><th>연식</th><td>${t(p.make_year)}</td></tr>
    <tr><th>현장 반입일</th><td>${t(p.in_date)}</td><th>운전원</th><td>${t(p.driver)}</td></tr></table>`;
}
function headerLift(p) {
  return `<table class="hdr">
    <tr><th>현장명</th><td>${t(p.site_name)}</td><th>관리번호</th><td>${t(p.reg_no)}</td></tr>
    <tr><th>협력사</th><td>${t(p.company_name)}</td><th>조작방식</th><td><span class="ck"></span>자동 <span class="ck"></span>수동</td></tr>
    <tr><th>운반구 형식</th><td><span class="ck"></span>SINGLE <span class="ck"></span>TWIN</td><th>적재하중</th><td style="text-align:right">TON</td></tr>
    <tr><th>전원전압</th><td style="text-align:right">V</td><th>설치일자</th><td>${t(p.in_date)}</td></tr></table>`;
}

/* p: { site_name, reg_no, model_name, make_year, in_date, driver, company_name }
   key: 점검표 종류, imgBase: chk/ 그림 경로 앞부분, monday: 주 시작일 */
export function buildChecklistHtml({ key, plan: p, imgBase, monday, site }) {
  const c = CHECKLISTS[key]; if (!c) throw new Error("점검표가 없는 장비입니다.");
  const title = `건설장비 일일점검표 - ${c.name}${p.reg_no ? ` (${p.reg_no})` : ""}`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${t(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>${CSS}</style></head><body><div class="sheet">
<div class="top"><h1><small>DAILY EQUIPMENT CHECKLIST</small>건설장비 일일점검표</h1><span class="eq">${t(c.name)}</span></div>
${c.hdr === "lift" ? headerLift(p) : headerStd(p, c)}
<div class="sec">점검 부위</div>
<div class="fig"><img src="${imgBase}${key}.jpg" alt="${t(c.name)} 점검 부위"></div>
<div class="sec">점검 내용</div>
<table class="cont"><colgroup><col style="width:9%"><col></colgroup>
  <tr><th>번호</th><th>점검 내용</th></tr>
  ${c.content.map(([n, s]) => `<tr><td class="n">${t(n)}</td><td>${t(s)}</td></tr>`).join("")}</table>
<div class="sec">일일 점검 결과</div>
<table class="chk"><colgroup><col style="width:7%"><col><col style="width:7.6%"><col style="width:7.6%"><col style="width:7.6%"><col style="width:7.6%"><col style="width:7.6%"><col style="width:7.6%"><col style="width:7.6%"><col style="width:9%"></colgroup>
  <tr><th>번호</th><th>점검항목</th>${DAYS.map(d => `<th class="d">${d}<small class="slash">/</small></th>`).join("")}<th>비고</th></tr>
  ${c.items.map(([n, s]) => `<tr><td class="n">${t(n)}</td><td class="item">${t(s)}</td>${DAYS.map(() => `<td class="d"></td>`).join("")}<td></td></tr>`).join("")}</table>
<p class="legend">※ 검사결과 표기 — 정상 : <b>○</b>, 미흡(조건부 허용) : <b>△</b>, 불량·안전장치 이상 등(사용중지) : <b>X</b>, 해당없음 : <b>ㅡ</b></p>
<table class="sign"><tr><th>점검자</th><td>(인)</td><th>관리감독자</th><td>(인)</td><th>안전관리자</th><td>(인)</td></tr></table>
<p class="note">※ 관리감독자 구분 : 직영공사(원청), 하도급공사(협력업체)</p>
<div class="foot"><span>${t(site || p.site_name || "")}</span><span>건설장비 안전관리 가이드(2026) 일일점검표 기준</span></div>
</div>
<script>
  const imgs=[...document.images];
  Promise.all(imgs.map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r;}))).then(()=>{window.focus();window.print();});
<\/script></body></html>`;
}
