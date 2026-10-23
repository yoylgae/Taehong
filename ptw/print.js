// 작업허가서 인쇄 — 원청 시스템 조회 화면과 같은 짜임으로 A4 가로
import { PPE, FIRE_CHECKS, grade } from "./ptw-data.js";

const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const br = v => esc(v).replace(/\n/g, "<br>");
const WD = "일월화수목금토";
const addDay = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

const signBox = (d, title, cols) => `<table class="ttl"><tr><td class="big" rowspan="${cols.length > 2 ? 4 : 2}">${esc(title)}</td>
  ${cols.slice(0, 2).map(([n]) => `<th class="sg">${n}</th>`).join("")}</tr>
  <tr>${cols.slice(0, 2).map(([, k]) => `<td class="sgn">${esc(d.sign?.[k] || "")}</td>`).join("")}</tr>
  ${cols.slice(2).map(([n, k]) => `<tr><th class="sg">${n}</th><td class="sgs">${esc(d.sign?.[k] || "")}</td></tr>`).join("")}</table>`;
const info = (rows) => `<table class="g info">${rows.map(r => `<tr>${r.map(([k, v, span]) => `<th>${k}</th><td ${span ? `colspan="${span}"` : ""}>${v}</td>`).join("")}</tr>`).join("")}</table>`;
const reviews = (groups, rv, title) => `<table class="g rv"><tr><th class="side" rowspan="${groups.length}">${title}</th>
  ${groups.map(([k, n], gi) => `${gi ? "<tr>" : ""}<td class="who">${n}</td><td class="inner"><table class="g in"><tr><th style="width:5%">No.</th><th style="width:8%">구분</th><th>검토의견</th><th style="width:10%">검토자</th><th style="width:12%">검토일</th></tr>
    ${(rv?.[k] || []).length ? rv[k].map((r, i) => `<tr><td class="c">${i + 1}</td><td class="c ${r.type === "반려" ? "rej" : "ok"}">[${esc(r.type)}]</td><td>${br(r.text)}</td><td class="c">${esc(r.by)}</td><td class="c">${esc(r.date)}</td></tr>`).join("")
      : `<tr><td colspan="5" class="c muted">&nbsp;</td></tr>`}</table></td></tr>`).join("")}</table>`;
const sub = t => `<div class="st">${t}</div>`;

function pagePtw(d) {
  const dd = Array.from({ length: 7 }, (_, i) => d.start ? addDay(d.start, i) : "");
  const dlabel = s => s ? `${s.slice(5)} (${WD[new Date(s + "T00:00:00").getDay()]})` : "";
  return `<section class="pg">
  ${signBox(d, "작업 허가서(PTW)", [["협력업체", "sub"], ["결재(수행)", "team"], ["보건", "health"], ["안전", "safety"]])}
  ${info([[["업체명", esc(d.company)], ["공구명", esc(d.gongu)], ["작업장소", esc(d.place)]], [["작성일", esc(d.created)], ["허가기간", `${esc(d.start)} ~ ${esc(d.end)}`], ["작성자", esc(d.writer)]]])}
  ${d.ptwNo ? `<div class="no">PTW : ${esc(d.ptwNo)}</div>` : ""}
  ${sub("작업 공종")}
  <table class="g"><tr><th>작업공종</th><th>세부공종</th><th>작업팀장(or TBM 리더)</th><th style="width:7%">작업지휘자 대상</th>${dd.map(s => `<th style="width:6.2%">${dlabel(s)}</th>`).join("")}</tr>
  ${(d.gongjong || []).map(g => `<tr><td>${esc(g.wt1)}</td><td>${esc(g.wt2)}</td><td class="c">${esc(g.leader)}</td><td class="c">${g.cmdr ? "✔" : ""}</td>${dd.map((_, i) => `<td class="c">${g.days?.[i] ? "●" : ""}</td>`).join("")}</tr>`).join("")}</table>
  ${sub("허가 작업")}
  <table class="g"><tr><th rowspan="2">세부공종</th><th rowspan="2">작업활동</th><th colspan="5">장비현황</th></tr><tr><th>종류</th><th>종류(기타)</th><th>규격</th><th>규격(기타)</th><th style="width:6%">대수</th></tr>
  ${(d.perm || []).map(p => `<tr><td>${esc(p.wt2)}</td><td>${esc(p.wt3)}</td><td class="c">${esc(p.eq)}</td><td class="c">${esc(p.eqEtc)}</td><td class="c">${esc(p.size)}</td><td class="c">${esc(p.sizeEtc)}</td><td class="r">${esc(p.cnt ?? 0)}</td></tr>`).join("")}</table>
  <table class="g info" style="margin-top:8px"><tr><th>작업인원</th><td>한국인: ${esc(d.workers?.kr ?? 0)} 명 / 외국인: ${esc(d.workers?.fr ?? 0)} 명</td></tr>
    <tr><th>보호구</th><td class="ppe">${PPE.map(n => `<span>${(d.ppe || []).includes(n) ? "☑" : "☐"} ${esc(n)}</span>`).join("")}</td></tr></table>
  ${sub("작업 위험성 평가")}
  <table class="g risk"><tr><th rowspan="2" style="width:3%">No.</th><th rowspan="2" style="width:5.5%">구분</th><th rowspan="2" style="width:8%">세부공종</th><th rowspan="2" style="width:10%">작업활동</th><th rowspan="2">위험요인</th><th rowspan="2" style="width:6%">재해유형</th><th colspan="3">평가등급</th><th rowspan="2" style="width:27%">위험저감대책</th><th rowspan="2" style="width:5%">재평가<br>등급</th></tr>
    <tr><th style="width:4%">발생<br>빈도</th><th style="width:4%">위험<br>강도</th><th style="width:5%">평가<br>등급</th></tr>
  ${(d.risks || []).map((r, i) => `<tr><td class="c">${i + 1}</td><td class="c ${r.src === "PTW" ? "ptw" : ""}">${esc(r.src)}</td><td>${esc(r.wt2)}</td><td>${br(r.wt3)}</td><td>${br(r.factor)}</td><td class="c">${esc(r.type)}</td><td class="c">${esc(r.freq)}</td><td class="c">${esc(r.sev)}</td><td class="c">${grade(r.freq, r.sev)}</td><td>${br(r.measure)}</td><td class="c">${esc(r.re)}</td></tr>`).join("")}
  <tr><td colspan="11" class="c legend">[등급인력참조] 등급 상(사망, 중상), 중(경미한 중,경상), 하(경상)</td></tr></table>
  ${reviews([["team", "사업수행팀"], ["health", "보건관리자"], ["safety", "안전관리자"]], d.reviews, "작업허가서<br>검토 결재의견")}
  </section>`;
}
const head2 = (d, title, cols, extra = []) => signBox(d, title, cols) + info([[["업체명", esc(d.company)], ["작성일", esc(d.created)]], [["작성자", esc(d.writer)], ["허가기간", `${esc(d.start)} ~ ${esc(d.end)}`]], ...extra]) + (d.ptwNo ? `<div class="no">PTW : ${esc(d.ptwNo)}</div>` : "");
function pageChem(d) {
  const c = d.chem;
  return `<section class="pg">${head2(d, "화학물질 사용계획서", [["협력업체", "sub"], ["결재(수행)", "team"], ["보건", "health"], ["안전", "safety"]])}
  ${sub("화학물질 상세정보")}
  <table class="g"><tr><th>세부공종</th><th>제품명</th><th>제조사</th><th>사용용도</th><th>사용예정수량</th><th>단위</th><th>보관장소</th><th>특수건강진단<br>대상</th><th>작업환경측정<br>대상</th><th>특별교육대상<br>(관리대상)</th><th>특별관리물질<br>대상</th><th>MSDS<br>비치</th></tr>
  ${c.items.length ? c.items.map(x => `<tr><td>${esc(x.wt2)}</td><td>${esc(x.product)}</td><td>${esc(x.maker)}</td><td>${esc(x.use)}</td><td class="r">${esc(x.qty ?? "")}</td><td class="c">${esc(x.unit)}</td><td>${esc(x.storage)}</td>${["health", "env", "edu", "spc", "msds"].map(k => `<td class="c">${esc(x[k])}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="12" class="c">&nbsp;</td></tr>`}</table>
  <table class="g info" style="margin-top:8px"><tr><th>기타 위험요인</th><td>${c.risks.filter(Boolean).map(br).join("<br>") || "&nbsp;"}</td></tr><tr><th>기타 안전/보건조치</th><td>${c.measures.filter(Boolean).map(br).join("<br>") || "&nbsp;"}</td></tr></table>
  ${reviews([["team", "사업수행팀"], ["health", "보건관리자"], ["safety", "안전관리자"]], c.reviews, "화학물질<br>사용계획서<br>검토 결재의견")}</section>`;
}
function pageFire(d) {
  const f = d.fire, ck = f.checks || {};
  return `<section class="pg">${head2(d, "화기작업 계획서", [["협력업체", "sub"], ["결재(수행)", "team"], ["안전", "safety"]], [[["작업시작 일자 및 시간", `${esc(f.fromD)} ${esc(f.fromT)}`], ["작업종료 일자 및 시간", `${esc(f.toD)} ${esc(f.toT)}`]]])}
  ${sub("작업자 명단(교육 이수자)")}
  <table class="g"><tr><th>작업장소</th><th>작업내용</th><th>화재감시자</th><th>작업자 명단(특별교육 이수자)</th></tr>
  ${f.rows.length ? f.rows.map(r => `<tr><td>${esc(r.place)}</td><td>${esc(r.desc)}</td><td class="c">${esc(r.watcher)}</td><td>${esc(r.workers)}</td></tr>`).join("") : `<tr><td colspan="4">&nbsp;</td></tr>`}</table>
  <table class="g" style="margin-top:8px"><tr><th rowspan="12" style="width:8%">안전조치<br>및<br>점검사항</th><th style="width:5%">NO</th><th>조치상태 확인사항</th><th style="width:10%">조치상태</th></tr>
  ${FIRE_CHECKS.map((c, i) => `<tr><th>${i + 1}</th><td>${esc(c.t).replace(/\{(\w+)\}/g, (_, k) => `<u>&nbsp;${esc(ck[`n${i}_${k}`] ?? "  ")}&nbsp;</u>`)}</td><td class="c">${esc(ck[`s${i}`] || "")}</td></tr>`).join("")}
  <tr><th>11</th><td colspan="2">기타사항( ${esc(ck.etc || "")} )</td></tr></table>
  ${reviews([["team", "사업수행팀"], ["safety", "안전관리자"]], f.reviews, "화기작업 계획서<br>검토 결재의견")}</section>`;
}
function pageHeavy(d) {
  const h = d.heavy;
  return `<section class="pg">${head2(d, "중량물 취급 계획서", [["협력업체", "sub"], ["결재(수행)", "team"], ["안전", "safety"]])}
  ${sub("작업 목록")}
  <table class="g"><tr><th>차량계 하역운반</th><th>건설기계 작업</th><th>중량물 취급 계획서</th><th style="width:20%">작업기간</th></tr>
  ${h.rows.length ? h.rows.map(r => `<tr><td>${esc(r.car)}</td><td>${esc(r.machine)}</td><td>${esc(r.heavy)}</td><td class="c">${esc(r.term)}</td></tr>`).join("") : `<tr><td colspan="4">&nbsp;</td></tr>`}</table>
  ${reviews([["team", "사업수행팀"], ["safety", "안전관리자"]], h.reviews, "중량물 취급계획서<br>검토 결재의견")}</section>`;
}
function pageSfac(d) {
  const s = d.sfac;
  return `<section class="pg">${head2(d, "안전시설물 임시 해체/복구 계획서", [["협력업체", "sub"], ["결재(수행)", "team"], ["안전", "safety"]], [[["해체시작 일자 및 시간", `${esc(s.fromD)} ${esc(s.fromT)}`], ["복구완료 일자 및 시간", `${esc(s.toD)} ${esc(s.toT)}`]]])}
  ${sub("작업 세부내용")}
  <table class="g info"><tr><th style="width:25%">안전시설물 해체위치</th><td>${br(s.place)}</td></tr><tr><th>해체 안전시설물</th><td>${br(s.facility)}</td></tr><tr><th>해체구간 주변 안전조치 사항</th><td>${br(s.measure)}</td></tr><tr><th>해체구간 내 작업내용</th><td>${br(s.work)}</td></tr></table>
  <table class="g info" style="margin-top:8px"><tr><th style="width:20%">기존 안전시설물 설치업체</th><td style="width:30%">${esc(s.company)}</td><th style="width:20%">담당자 확인</th><td>성명 : ${esc(s.companyBy)} (서명)</td></tr></table>
  ${sub("복구완료 후 현장확인")}
  <table class="g info"><tr><th style="width:35%">안전시설물 해체 후 복구완료 시</th><td class="c" style="width:30%">임시 해체복구 담당자 확인</td><td>성명 : ${esc(s.restoreBy)} (서명)</td></tr>
    <tr><th>원상 복구상태 확인 시</th><td class="c">기존 설치업체 담당자 확인</td><td>성명 : ${esc(s.checkBy)} (서명)</td></tr></table>
  ${reviews([["team", "사업수행팀"], ["safety", "안전관리자"]], s.reviews, "안전시설물<br>임시 해체/복구<br>작업계획서<br>검토 결재의견")}</section>`;
}

export function printPTW(d, { all }) {
  let body = pagePtw(d);
  if (all) { if (d.use?.chem) body += pageChem(d); if (d.use?.fire) body += pageFire(d); if (d.use?.heavy) body += pageHeavy(d); if (d.use?.sfac) body += pageSfac(d); }
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>작업허가서 ${esc(d.start)}~${esc(d.end)}</title>
<style>
@page{size:A4 landscape;margin:9mm}
*{box-sizing:border-box}
body{margin:0;font:10.5px/1.35 "Malgun Gothic","맑은 고딕","Apple SD Gothic Neo",sans-serif;color:#111}
.pg{page-break-after:always;break-after:page}.pg:last-child{page-break-after:auto;break-after:auto}
table{border-collapse:collapse;width:100%}
.g th,.g td{border:1px solid #9aa3ad;padding:3px 5px;vertical-align:middle}
.g th{background:#eceef1;font-weight:700;text-align:center}
.g td.c{text-align:center}.g td.r{text-align:right}
tr{page-break-inside:avoid;break-inside:avoid}
.ttl{border:1px solid #9aa3ad;margin-bottom:6px}
.ttl td,.ttl th{border:1px solid #9aa3ad}
.ttl .big{font-size:22px;font-weight:800;text-align:center;letter-spacing:1px;width:70%;font-family:"Batang","바탕",serif}
.ttl .sg{background:#eceef1;font-size:10.5px;padding:3px;width:15%}
.ttl .sgn{height:52px;text-align:center;font-size:13px;font-weight:700}
.ttl .sgs{text-align:center;font-weight:700;height:20px}
.info th{width:9%;white-space:nowrap}
.no{text-align:right;font-weight:700;margin:3px 0}
.st{font-weight:800;font-size:11.5px;margin:9px 0 4px;padding-left:6px;border-left:3px solid #1e3a8a}
.ppe span{display:inline-block;margin-right:10px;white-space:nowrap}
.risk td{font-size:10px}
.risk td.ptw{background:#f6d4dc;font-weight:700;font-size:9px}
.legend{background:#eceef1;font-size:10px}
.rv{margin-top:9px}
.rv .side{width:9%;background:#eceef1}
.rv .who{width:8%;text-align:center;background:#f7f8fa;font-weight:700}
.rv .inner{padding:4px}
.in td.ok{color:#1d4ed8}.in td.rej{color:#dc2626}
.muted{color:#999}
@media screen{body{background:#e5e7eb}.pg{background:#fff;width:297mm;min-height:200mm;margin:10px auto;padding:9mm;box-shadow:0 2px 12px rgba(0,0,0,.15)}}
</style></head><body>${body}<script>setTimeout(()=>{window.focus();window.print();},300)<\/script></body></html>`;
}
