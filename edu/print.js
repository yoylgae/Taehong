// 안전ㆍ보건 교육 훈련 일지 인쇄 (A4 세로): 1쪽 일지, 2쪽 참석자 서명 명단, 3쪽 사진 대지
import { METHODS } from "./edu-data.js";
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const br = v => esc(v).replace(/\n/g, "<br>");
const WD = "일월화수목금토";
const mins = (a, b) => { if (!a || !b) return ""; const [h1, m1] = a.split(":").map(Number), [h2, m2] = b.split(":").map(Number); const m = h2 * 60 + m2 - (h1 * 60 + m1); return m > 0 ? `${Math.floor(m / 60) ? Math.floor(m / 60) + "시간 " : ""}${m % 60 ? (m % 60) + "분" : ""}`.trim() : ""; };

export function printDiary(d, urls = {}) {
  const att = d.attendees.filter(a => a.name), attend = d.attendCnt ?? att.length;
  const rate = d.targetCnt ? Math.round(attend / d.targetCnt * 1000) / 10 : "";
  const date = d.date ? `${d.date.slice(0, 4)}년 ${+d.date.slice(5, 7)}월 ${+d.date.slice(8)}일 (${WD[new Date(d.date + "T00:00:00").getDay()]})` : "";
  // 명단: 한 쪽에 2열 × 25줄
  const per = 50, pages = [];
  for (let i = 0; i < Math.max(att.length, 1); i += per) pages.push(att.slice(i, i + per));
  const listPage = (list, pi) => {
    const rows = []; for (let r = 0; r < 25; r++) rows.push([list[r], list[r + 25]].map((a, k) => { const n = pi * per + k * 25 + r + 1; return `<td class="c">${n}</td><td class="c">${esc(a?.name || "")}</td><td class="c">${esc(a?.job || "")}</td><td></td>`; }).join(""));
    return `<section class="pg"><h2>교육 참석자 명단 <small>${esc(d.name)} · ${esc(date)}</small></h2>
      <table class="g att"><tr>${"<th style='width:6%'>No.</th><th style='width:14%'>성명</th><th style='width:12%'>직종</th><th style='width:18%'>서명</th>".repeat(2)}</tr>${rows.map(r => `<tr>${r}</tr>`).join("")}</table></section>`;
  };
  const ph = d.photos.filter(p => urls[p.path]);
  const photoPages = []; for (let i = 0; i < ph.length; i += 4) photoPages.push(ph.slice(i, i + 4));
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>교육일지 ${esc(d.date)} ${esc(d.name)}</title>
<style>
@page{size:A4;margin:12mm}
*{box-sizing:border-box}
body{margin:0;font:11px/1.45 "Malgun Gothic","맑은 고딕","Apple SD Gothic Neo",sans-serif;color:#111}
.pg{page-break-after:always;break-after:page}.pg:last-child{page-break-after:auto;break-after:auto}
table{border-collapse:collapse;width:100%}
.g th,.g td{border:1px solid #777;padding:4px 6px;vertical-align:middle}
.g th{background:#eef0f3;font-weight:700;text-align:center;white-space:nowrap}
td.c{text-align:center}
.head{display:flex;align-items:stretch;gap:0;margin-bottom:8px}
.head .t{flex:1;border:1px solid #777;display:flex;flex-direction:column;align-items:center;justify-content:center}
.head .t h1{margin:0;font-size:22px;letter-spacing:2px;font-family:"Batang","바탕",serif}
.head .t div{font-size:12px;margin-top:4px}
.head table{width:46%}
.head table td{height:44px}
.ck{display:inline-block;margin-right:12px;white-space:nowrap}
.legal td,.content td{vertical-align:top}
.content td{height:118mm;font-size:11.5px;line-height:1.6}
h2{font-size:15px;margin:0 0 8px}h2 small{font-size:11px;font-weight:400;color:#555;margin-left:8px}
.att td{height:8.6mm}
.ph{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.ph figure{margin:0;border:1px solid #777}
.ph img{width:100%;height:95mm;object-fit:cover;display:block}
.ph figcaption{padding:4px 6px;border-top:1px solid #777;text-align:center;min-height:7mm}
@media screen{body{background:#e5e7eb}.pg{background:#fff;width:210mm;min-height:297mm;margin:10px auto;padding:12mm;box-shadow:0 2px 12px rgba(0,0,0,.15)}}
</style></head><body>
<section class="pg">
<div class="head"><div class="t"><h1>안전ㆍ보건 교육 훈련 일지</h1><div>${esc(d.company)}</div></div>
<table class="g"><tr><th rowspan="2" style="width:12%">결<br>재</th><th>작성</th><th>검토</th><th>승인</th></tr><tr><td class="c">${esc(d.sign?.writer)}</td><td class="c">${esc(d.sign?.check)}</td><td class="c">${esc(d.sign?.approve)}</td></tr></table></div>
<table class="g">
<tr><th style="width:15%">교육명</th><td colspan="3">${esc(d.name)}</td></tr>
<tr><th>교육장소</th><td style="width:35%">${esc(d.place)}</td><th style="width:15%">교육일자</th><td>${esc(date)}</td></tr>
<tr><th>교육시간</th><td>${esc(d.from)} ~ ${esc(d.to)} ${mins(d.from, d.to) ? `(${mins(d.from, d.to)})` : ""}</td><th>참석인원<br>(참석율)</th><td>대상 ${esc(d.targetCnt ?? "")} 명 / 참석 ${esc(attend)} 명 ${rate !== "" ? `(${rate}%)` : ""}</td></tr>
<tr><th>교육대상</th><td>${esc(d.target)}</td><th>교육구분</th><td>${esc(d.gubun)}</td></tr>
<tr><th>내부강사1</th><td>${esc(d.speaker1)}</td><th>내부강사2</th><td>${esc(d.speaker2)}</td></tr>
<tr><th>외부강사</th><td colspan="3">${esc(d.outSpeaker)}</td></tr>
<tr><th>교육방법</th><td colspan="3">${METHODS.map(m => `<span class="ck">${d.methods.includes(m) ? "☑" : "☐"} ${esc(m)}</span>`).join("")}</td></tr>
${d.taskName ? `<tr><th>작업명</th><td colspan="3">${esc(d.taskName)}</td></tr>` : ""}
</table>
<table class="g legal" style="margin-top:6px"><tr><th style="text-align:left">교육내용 (법적사항)</th></tr><tr><td>${br(d.legal) || "&nbsp;"}</td></tr></table>
<table class="g content" style="margin-top:6px"><tr><th style="text-align:left">교육내용${d.material ? ` <span style="font-weight:400">(교육자료: ${esc(d.material.name)})</span>` : ""}</th></tr><tr><td>${br(d.content)}</td></tr></table>
</section>
${pages.map(listPage).join("")}
${photoPages.map((g, i) => `<section class="pg"><h2>사진 대지 ${photoPages.length > 1 ? `(${i + 1}/${photoPages.length})` : ""} <small>${esc(d.name)} · ${esc(date)}</small></h2><div class="ph">${g.map(p => `<figure><img src="${esc(urls[p.path])}"><figcaption>${esc(p.cap || "")}</figcaption></figure>`).join("")}</div></section>`).join("")}
<script>const im=[...document.images];Promise.all(im.map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r;}))).then(()=>{window.focus();window.print();});<\/script>
</body></html>`;
}
