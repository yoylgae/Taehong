// 작업계획서 출력 (원본 출력물 23.pdf 와 같은 양식)
// 화면 입력값을 받아 깔끔한 A4 문서를 새 창에 만들고 인쇄한다.

const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const t = v => v == null || v === "" ? "" : esc(v);
const range = (a, b) => a || b ? `${t(a)} ~ ${t(b)}` : "";
const fname = f => f ? `<div class="fn">${t(f.name)}</div>` : "";
const NODATA = cols => `<tr><td colspan="${cols}" class="c nodata">데이터가 없습니다.</td></tr>`;

const CSS = `
@page{size:A4;margin:10mm}
*{box-sizing:border-box}
body{margin:0;font:10.5px/1.45 "Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h2{font-size:12px;margin:14px 0 4px;font-weight:700}
h4{font-size:11px;margin:8px 0 3px;font-weight:700}
table{width:100%;border-collapse:collapse;table-layout:fixed;page-break-inside:auto}
tr{page-break-inside:avoid}
th,td{border:1px solid #000;padding:3px 5px;vertical-align:middle;word-break:break-all}
th{background:#e6e6e6;font-weight:400;text-align:center}
td.c{text-align:center}
td.nodata{color:#333}
.fn{font-size:9.5px;color:#222}
.head{display:flex;border:1px solid #000;margin-bottom:6px}
.head .title{flex:1;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;letter-spacing:1px}
.head table{width:236px;flex:none;border-left:1px solid #000}
.head th,.head td{border:0;border-left:1px solid #000;border-bottom:1px solid #000}
.head tr:last-child th,.head tr:last-child td{border-bottom:0}
.head .sign{height:46px}
.head .nm{height:20px;text-align:center}
.imgcell{height:290px;text-align:center;vertical-align:middle;padding:4px}
.imgcell img{max-width:100%;max-height:280px;object-fit:contain}
.thumb img{max-width:100%;max-height:70px}
.ok{font-weight:700}.ng{font-weight:700;color:#c00}
.pb{page-break-before:always}
.rope td{text-align:center}
.small{font-size:9.5px}
`;

function header(p) {
  const nm = n => `<td class="nm">${t(n)}</td>`;
  return `<div class="head"><div class="title">건설장비 작업계획서</div>
  <table>
    <tr><th>현장소장</th><th>관리감독자</th></tr>
    <tr><td class="sign"></td><td class="sign"></td></tr>
    <tr>${nm(p.approver1)}${nm(p.approver2)}</tr>
    <tr><th rowspan="2">안전관리자</th><td class="sign"></td></tr>
    <tr>${nm(p.approver3)}</tr>
    <tr><th rowspan="2">운전원</th><td class="sign"></td></tr>
    <tr>${nm(p.approver4)}</tr>
  </table></div>`;
}

function sec1(p) {
  return `<h2>1. 작업개요</h2><table>
  <colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col></colgroup>
  <tr><th>현장명</th><td class="c">${t(p.site_name)}</td><th>작업기간</th><td class="c">${range(p.work_start, p.work_end)}</td></tr>
  <tr><th>작업명</th><td colspan="3" class="c">${t(p.work_name)}</td></tr>
  <tr><th>업체명</th><td class="c">${t(p.company_name)}</td><th>작업장소</th><td class="c">${t(p.work_place)}</td></tr>
  <tr><th>반입일</th><td class="c">${t(p.in_date)}</td><th>반출예정일</th><td class="c">${t(p.out_date)}</td></tr></table>`;
}

function sec2(p) {
  const F = p.files || {};
  const yn = (v, body) => v === "미해당" ? "미해당" : body;
  const heavy = p.heavy_work === "기타"
    ? `기타 (${[p.heavy_etc_lift && "양중", p.heavy_etc_heavy && "중량물"].filter(Boolean).join(", ")})` : t(p.heavy_work);
  return `<h2>2. 기계, 장비정보</h2><table>
  <colgroup><col style="width:10%"><col style="width:8%"><col style="width:32%"><col style="width:18%"><col></colgroup>
  <tr><th colspan="2">장비명</th><td class="c">${t(p.equip_type)}</td><th>차량번호</th><td class="c">${t(p.reg_no)}</td></tr>
  <tr><th colspan="2">제조사</th><td class="c">${t(p.manufacturer)}</td><th>모델명</th><td class="c">${t(p.model_name)}</td></tr>
  <tr><th colspan="2">제작년도</th><td class="c">${t(p.make_year)}</td><th>점검강화대상</th>
      <td class="c">${p.inspection_yn === "해당" ? `해당 (점검일 : ${t(p.inspection_date)})${fname(F.inspection)}` : t(p.inspection_yn)}</td></tr>
  <tr><th colspan="2">규격</th><td class="c">${t(p.spec)}</td><th>구조변경사항</th><td class="c">${t(p.change_issue_yn)}${p.change_issue_yn === "해당" ? fname(F.change_issue) : ""}</td></tr>
  <tr><th colspan="2">보험유효기간</th><td class="c">${yn(p.insur_yn, range(p.insur_start, p.insur_end) + fname(F.insur))}</td><th>중량물작업</th><td class="c">${heavy}</td></tr>
  <tr><th rowspan="2">검사<br>유효기간</th><th>차량</th><td class="c">${yn(p.car_insp_yn, range(p.car_insp_start, p.car_insp_end) + fname(F.car_insp))}</td>
      <th>굴착작업</th><td class="c">${t(p.excavation_yn)}</td></tr>
  <tr><th>안전검사</th><td class="c">${p.safe_insp_yn === "해당" ? range(p.safe_insp_start, p.safe_insp_end) + fname(F.safe_insp) : "N/A"}</td>
      <th>반입전 점검표</th><td class="c">${F.precheck ? t(F.precheck.name) : ""}</td></tr></table>`;
}

function sec3(p, personnel) {
  const by = r => personnel.filter(x => x.role === r);
  const simple = (role, last, lastLabel) => {
    const rows = by(role);
    return `<h4>■ ${role}</h4><table><tr><th>성명</th><th>신호방법</th><th>교육이수 합격일(특별교육)</th><th>${lastLabel}</th></tr>
    ${rows.length ? rows.map(r => `<tr><td class="c">${t(r.name)}</td><td class="c">${t(r.sign_method)}</td><td class="c">${t(r.edu_date)}</td><td class="c">${t(r[last])}</td></tr>`).join("") : NODATA(4)}</table>`;
  };
  const drv = by("운전원");
  const fn = (r, k) => r.files?.[k] ? t(r.files[k].name) : "";
  const driver = `<h4>■ 운전원</h4><table>
    <colgroup><col style="width:12%"><col style="width:13%"><col style="width:14%"><col style="width:21%"><col style="width:12%"><col style="width:14%"><col></colgroup>
    <tr><th>성명</th><th colspan="2">교육이수(최초 노무시 교육)</th><th>특별교육(※ 대상 작업 수행시)</th><th>신호방법</th><th>면허</th><th>서약서</th></tr>
    ${drv.length ? drv.map(r => `<tr><td class="c">${t(r.name)}</td><td class="c">${t(r.edu_date)}</td><td class="c small">${fn(r, "edu")}</td><td class="c">${t(r.special_edu_date)}</td>
      <td class="c">${t(r.sign_method)}</td><td class="c small">${fn(r, "license")}</td><td class="c small">${fn(r, "pledge")}</td></tr>`).join("") : NODATA(7)}</table>`;
  const cmd = by("작업지휘자");
  const commander = p.commander_yn === "미해당" ? `<h4>■ 작업지휘자 (미해당)</h4>` :
    `<h4>■ 작업지휘자</h4><table><colgroup><col style="width:35%"><col></colgroup><tr><th>성명</th><th>연락처</th></tr>
    ${cmd.length ? cmd.map(r => `<tr><td class="c">${t(r.name)}</td><td class="c">${t(r.phone)}</td></tr>`).join("") : NODATA(2)}</table>`;
  return `<h2>3. 작업인원(연락방법)</h2>` + simple("신호수", "cert_date", "자격검정") + simple("유도자", "cert_date", "자격검정")
    + simple("작업자", "remark", "비고") + driver + commander;
}

function sec4(p) {
  const act = (v, yesVal, note, label = "조치") => v === yesVal ? `${t(v)} : ${label} ${t(note)}` : t(v);
  const status = p.ground_status === "특이사항" ? `특이사항 (${t(p.ground_status_note)})` : t(p.ground_status);
  return `<h2>4. 작업장소의 지형 · 지반 상태</h2><table>
  <colgroup><col style="width:21%"><col style="width:23%"><col></colgroup>
  <tr><th rowspan="2">작업장소의 지형 · 지반<br>상태</th><th>작업장소 지형 및 지반 상태</th><td>지반 종류 : ${t(p.ground_type)}<br>지반 상태 : ${status}</td></tr>
  <tr><th>지하수위 등 함수 상태</th><td>${act(p.water_status, "불량", p.water_action)}</td></tr>
  <tr><th rowspan="3">주변 작업 · 이동 및 지장물<br>간섭</th><th>작업반경 내 출입금지 조치</th><td>${p.no_entry === "기타" ? `기타 : ${t(p.no_entry_etc)}` : t(p.no_entry)}</td></tr>
  <tr><th>주변 가공전선 접촉가능 여부</th><td>${act(p.contact_wire, "있음", p.contact_wire_action)}</td></tr>
  <tr><th>주변 지장물 간섭 여부</th><td>${act(p.interference, "있음", p.interference_action)}</td></tr></table>`;
}

function sec5(p, url) {
  const img = k => url[k] ? `<img src="${url[k]}">` : "";
  return `<h2 class="pb">5. 운행경로</h2><table><tr><th>현장외곽</th><th>내부장소${p.route_in_yn === "미해당" ? " (미해당)" : ""}</th></tr>
  <tr><td class="imgcell">${img("route_out")}</td><td class="imgcell">${p.route_in_yn === "미해당" ? "" : img("route_in")}</td></tr></table>`;
}

function sec6(work) {
  return `<h2>6. 작업내용(순서), 재해유형별 안전조치</h2><table>
  <colgroup><col style="width:5%"><col style="width:19%"><col style="width:6%"><col style="width:20%"><col></colgroup>
  <tr><th>순서</th><th>작업내용</th><th colspan="2">위험요인</th><th>안전대책</th></tr>
  ${work.length ? work.map(w => `<tr><td class="c">${t(w.seq)}</td><td>${t(w.work_name)}</td><td class="c">${t(w.risk)}</td><td>${t(w.risk_remark)}</td><td>${t(w.safety_measure)}</td></tr>`).join("") : NODATA(5)}</table>`;
}

function sec7(p) {
  const F = p.files || {};
  const rows = [["att_tower", "타워크레인, 항타기<br>설치해체작업계획서", "타워크레인, 항타기 설치·조립·변경 계획서 업로드"],
    ["att_ndt", "비파괴검사", "비파괴 검사 증명서(크레인, 양중함, 양중공도구등)"], ["att_bearing", "지내력검토서", "크롤러크레인 지내력 검토서"],
    ["att_lift_review", "양중검토서", "복합양중, 2줄걸이 이상 작업시(요청시 첨부)"], ["att_spec", "제원표", "장비 제원표(크레인 및 굴착기 양중 작업시, 인양제원표 등)"],
    ["att_counterweight", "카운터웨이트 구성도", "인양작업 시 카운터웨이트 중량/구성도(이동식크레인, 항타기 등)"]];
  return `<h2>7. 첨부파일</h2><table><colgroup><col style="width:24%"><col style="width:26%"><col></colgroup>
  ${rows.map(([k, label, desc]) => `<tr><th>${label}</th><td class="c small">${F[k] ? t(F[k].name) : ""}</td><td>· ${desc}</td></tr>`).join("")}</table>`;
}

// 양중 작업계획서 (화면에서 계산한 값 L 을 그대로 사용)
function secLift(p, L, url) {
  const l = p.lifting || {};
  const img = k => url[k] ? `<img src="${url[k]}">` : "";
  const r = v => v ? `<span class="${v === "NG" ? "ng" : "ok"}">${v}</span>` : "";
  const lk = { "01": "와이어로프", "02": "라운드(웹)슬링", "03": "수동입력" }[L.lineKind] || "";
  return `<h2 class="pb">양중 작업계획서</h2><table>
  <tr><th>평면도</th><th>입면도</th></tr><tr><td class="imgcell">${img("lift_plan")}</td><td class="imgcell">${img("lift_elev")}</td></tr></table>
  <table style="margin-top:6px"><colgroup><col style="width:17%"><col style="width:33%"><col style="width:17%"><col></colgroup>
  <tr><th>건설기계(장비) Model</th><td class="c">${t(p.model_name)}</td><th>줄걸이 종류</th><td class="c">${lk}</td></tr>
  <tr><th>양중기 종류</th><td class="c">${t(l.crane_kind)}</td><th>권상용 와이어로프 수</th><td class="c">${l.line_qty ? t(l.line_qty) + " EA" : ""}</td></tr>
  <tr><th>Boom 길이</th><td class="c">${l.boom ? t(l.boom) + " m" : ""}</td><th>Luffing(보조) 붐</th><td class="c">${l.luffing_len != null ? `${t(l.luffing_len)} m / ${t(l.luffing_angle)} °` : ""}</td></tr>
  <tr><th>작업반경</th><td class="c">${l.radius ? t(l.radius) + " m" : ""}</td><th>양중높이</th><td class="c">${l.height ? t(l.height) + " m" : ""}</td></tr>
  <tr><th>Counter weight</th><td class="c">${l.counter_weight ? t(l.counter_weight) + " Ton" : ""}</td><th>아우트리거 길이(전/후)</th><td class="c">${l.outrigger_front ? `${t(l.outrigger_front)} m / ${t(l.outrigger_back)} m` : ""}<div class="fn">아우트리거는 최대 확장 기준</div></td></tr>
  <tr><th>중량물</th><td class="c">${t(L.kind)}${L.size ? `<div class="fn">${t(L.size)}</div>` : ""}</td><th>중량물 무게</th><td class="c">${L.weight ? t(L.weight) + " Ton" : ""}</td></tr>
  <tr><th>줄걸이, 훅 중량</th><td class="c">${l.hook_weight ? t(l.hook_weight) + " Ton" : ""}</td><th>최대 양중능력</th><td class="c">${l.max_capacity ? t(l.max_capacity) + " Ton" : ""}</td></tr>
  ${l.crane_kind === "H/C, 카고" ? `<tr><th>건설기계(장비) 중량</th><td class="c">${t(l.equ_weight)} Ton</td><th>받침 철판(가로×세로)</th><td class="c">${t(l.iron_w)} m × ${t(l.iron_h)} m</td></tr>` : ""}
  </table>
  <table style="margin-top:6px"><colgroup><col style="width:25%"><col style="width:25%"><col style="width:25%"><col></colgroup>
  <tr><th>검토 항목</th><th>값</th><th>사용율 / 기준</th><th>검토 결과</th></tr>
  <tr><th>정격 총하중</th><td class="c">${L.total ? t(L.total) + " Ton" : ""}</td><td class="c">${t(L.totalRate)}</td><td class="c">${r(L.totalRslt)}</td></tr>
  <tr><th>줄걸이 안전하중</th><td class="c">${L.ropeSafe ? t(L.ropeSafe) + " Ton" : ""}</td><td class="c">${t(L.ropeRate)}</td><td class="c">${r(L.ropeRslt)}</td></tr>
  ${l.crane_kind === "H/C, 카고" ? `<tr><th>현장 지내력 검토(H/C, 카고)</th><td class="c">접지하중 ${t(L.groundLoad)} Ton</td>
    <td class="c">현장 ${t(l.site_rate)} &gt; 필요 ${t(L.needBearing)}</td><td class="c">${r(L.siteRslt)}</td></tr>` : ""}
  </table>${L.ropeHtml ? `<h4>■ 줄걸이 검토</h4>${L.ropeHtml}` : ""}`;
}

function secHeavy(heavy, url) {
  return `<h2 class="pb">중량물 취급계획서</h2><table>
  <colgroup><col style="width:22%"><col><col style="width:14%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:9%"><col style="width:9%"></colgroup>
  <tr><th>중량물 형상, 무게중심 표기</th><th>자재운반시 결박방법</th><th>종류</th><th>길이(m)</th><th>높이(m)</th><th>넓이(m)</th><th>중량(Ton)</th><th>줄걸이검토</th></tr>
  ${heavy.length ? heavy.map((h, i) => `<tr><td class="c thumb">${url["shape" + i] ? `<img src="${url["shape" + i]}">` : ""}</td><td>${t(h.tie_method)}</td><td class="c">${t(h.kind)}</td>
    <td class="c">${t(h.length_m)}</td><td class="c">${t(h.height_m)}</td><td class="c">${t(h.width_m)}</td><td class="c">${t(h.weight_ton)}</td><td class="c">${h.rope_review ? "해당" : "-"}</td></tr>`).join("") : NODATA(8)}</table>`;
}

export function buildPrintHtml({ plan, personnel, work, heavy, urls, lift, showLift, showHeavy }) {
  const title = `건설장비 작업계획서${plan.work_name ? " - " + plan.work_name : ""}`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${t(title)}</title><style>${CSS}</style></head><body>
${header(plan)}${sec1(plan)}${sec2(plan)}${sec3(plan, personnel)}${sec4(plan)}${sec5(plan, urls)}${sec6(work)}${sec7(plan)}
${showLift ? secLift(plan, lift, urls) : ""}${showHeavy ? secHeavy(heavy, urls) : ""}
<script>
  // 사진이 다 뜬 뒤 인쇄
  const imgs=[...document.images];
  Promise.all(imgs.map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r;}))).then(()=>{window.focus();window.print();});
<\/script></body></html>`;
}
