// 직영실행 인쇄 — 엑셀 원본 시트와 같은 모양의 A4 문서를 새 창에 만들어 인쇄
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const br = v => esc(v).replace(/\n/g, "<br>");
const f0 = v => Number(v || 0).toLocaleString("ko-KR");
const fz = v => Number(v) ? Number(v).toLocaleString("ko-KR") : "";
const sumObj = o => Object.values(o || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const ymP = ym => { const [y, m] = ym.split("-").map(Number); return { y, m, n: new Date(y, m, 0).getDate() }; };
const WD = ["일", "월", "화", "수", "목", "금", "토"];

const CSS = `
*{box-sizing:border-box}
body{margin:0;font:10px/1.35 "Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{border:1px solid #000;padding:2px 4px;vertical-align:middle;word-break:break-all}
th{background:#eaeaea;font-weight:700;text-align:center}
.c{text-align:center}.r{text-align:right;font-variant-numeric:tabular-nums}
.ttl{font-size:22px;font-weight:800;letter-spacing:6px;text-align:center;margin:4px 0 10px}
.sub{display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px}
tr{page-break-inside:avoid}
.tot td{font-weight:700;background:#f3f3f3}
.sat{color:#1d4ed8}.sun{color:#c00}
.pb{page-break-before:always}
.img{text-align:center}
.img img{max-width:100%;object-fit:contain}
`;
function open(title, body, { landscape = false, css = "" } = {}) {
  const w = window.open("", "_blank");
  if (!w) { alert("팝업이 막혀 인쇄 창을 열 수 없습니다. 브라우저에서 팝업을 허용해 주세요."); return; }
  w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:9mm}${CSS}${css}</style></head><body>${body}
<script>const im=[...document.images];Promise.all(im.map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r;}))).then(()=>{window.focus();window.print();});<\/script></body></html>`);
  w.document.close();
}
const dayHead = (ym, to) => { const { y, m, n } = ymP(ym); let h = ""; for (let d = 1; d <= to; d++) { if (d > n) { h += `<th>${d}<br>-</th>`; continue; } const w = new Date(y, m - 1, d).getDay(); h += `<th class="${w === 6 ? "sat" : w === 0 ? "sun" : ""}">${d}<br><span style="font-weight:400">${WD[w]}</span></th>`; } return h; };
const nDays = (ym, rows, keys) => { let n = ymP(ym).n; rows.forEach(r => keys.forEach(k => Object.keys(r.data[k] || {}).forEach(d => { if (+d > n && r.data[k][d]) n = Math.min(31, +d); }))); return n; };
const dv = v => v ? (v == 0.5 ? "0.5" : v) : "";

/* 실행내역서 */
export function printExec(m, rows) {
  const ap = m.settings.approvals || [];
  // 같은 품목이 이어지면 품목 칸 합치기
  const span = []; rows.forEach((r, i) => { const prev = rows[i - 1]; if (i && (r.data.cat || "") === (prev.data.cat || "") && r.data.cat) { span[i] = 0; let k = i - 1; while (span[k] === 0) k--; span[k]++; } else span[i] = 1; });
  let ts = 0, tv = 0;
  const body = rows.map((r, i) => { const s = Number(r.data.supply) || 0, v = Number(r.data.vat) || 0; ts += s; tv += v;
    return `<tr><td class="c">${i + 1}</td>${span[i] ? `<td class="c" rowspan="${span[i]}">${br(r.data.cat)}</td>` : ""}<td class="c">${br(r.data.vendor)}</td><td class="r">${fz(s)}</td><td class="r">${fz(v)}</td><td class="r">${fz(s + v)}</td><td style="font-size:9px">${br(r.data.note)}</td></tr>`; }).join("");
  open(m.title, `
    <div style="display:flex;align-items:stretch;gap:10px;margin-bottom:8px">
      <div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;letter-spacing:2px">${esc(m.title)}</div>
      ${ap.length ? `<table style="width:${30 + ap.length * 70}px;flex:none"><tr><th rowspan="2" style="width:30px">결<br>재</th>${ap.map(a => `<th>${esc(a)}</th>`).join("")}</tr><tr>${ap.map(() => `<td style="height:52px"></td>`).join("")}</tr></table>` : ""}
    </div>
    <div class="sub"><span>현장명 : ${esc(m.site)}</span></div>
    <table><colgroup><col style="width:5%"><col style="width:15%"><col style="width:15%"><col style="width:12%"><col style="width:10%"><col style="width:12%"><col></colgroup>
      <thead><tr><th>연 번</th><th>품 목</th><th>업 체</th><th>공급가</th><th>부가세</th><th>합 계</th><th>비 고<br>(사업자 및 통장번호)</th></tr></thead>
      <tbody>${body}<tr class="tot"><td colspan="3" class="c">합 계</td><td class="r">${f0(ts)}</td><td class="r">${f0(tv)}</td><td class="r">${f0(ts + tv)}</td><td></td></tr></tbody></table>`);
}

/* 인건비 — 인력 출력 현황 */
export function printLabor(m, rows) {
  const { m: mm } = ymP(m.ym), n = nDays(m.ym, rows, ["d"]); const per = {}; let td = 0, ta = 0;
  const body = rows.map((r, i) => { const d = sumObj(r.data.d), a = d * (Number(r.data.rate) || 0); td += d; ta += a;
    Object.entries(r.data.d || {}).forEach(([k, v]) => per[k] = (per[k] || 0) + (Number(v) || 0));
    return `<tr><td class="c">${i + 1}</td><td class="c">${esc(r.data.team)}</td><td class="c">${esc(r.data.name)}</td>${Array.from({ length: n }, (_, k) => `<td class="c">${dv(r.data.d?.[k + 1])}</td>`).join("")}<td class="c">${d || ""}</td><td class="r">${f0(a)}</td><td>${esc(r.data.memo)}</td></tr>`; }).join("");
  open("인력 출력 현황", `<div class="ttl">인력 출력 현황</div><div class="sub"><span>현장명 : ${esc(m.site)}</span><span>${mm}월</span></div>
    <table style="font-size:8.5px"><colgroup><col style="width:24px"><col style="width:42px"><col style="width:46px">${`<col>`.repeat(n)}<col style="width:30px"><col style="width:64px"><col style="width:60px"></colgroup>
    <thead><tr><th rowspan="2">번호</th><th rowspan="2">소속</th><th rowspan="2">성명</th><th colspan="${n}">${mm}월</th><th rowspan="2">출역<br>일수</th><th rowspan="2">금액</th><th rowspan="2">비고</th></tr><tr>${dayHead(m.ym, n)}</tr></thead>
    <tbody>${body}<tr class="tot"><td colspan="3" class="c">합 계</td>${Array.from({ length: n }, (_, k) => `<td class="c">${per[k + 1] || ""}</td>`).join("")}<td class="c">${td}</td><td class="r">${f0(ta)}</td><td></td></tr></tbody></table>`, { landscape: true });
}

/* 식대 */
export function printMeal(m, rows) {
  const { m: mm } = ymP(m.ym), n = nDays(m.ym, rows, ["jo", "jung"]); const price = Number(m.settings.meal_price) || 0; const per = {}; let tc = 0;
  const body = rows.map((r, i) => { const c = sumObj(r.data.jo) + sumObj(r.data.jung); tc += c;
    [r.data.jo, r.data.jung].forEach(o => Object.entries(o || {}).forEach(([k, v]) => per[k] = (per[k] || 0) + (Number(v) || 0)));
    const cells = key => Array.from({ length: n }, (_, k) => `<td class="c">${r.data[key]?.[k + 1] ? "1" : ""}</td>`).join("");
    return `<tr><td class="c" rowspan="2">${i + 1}</td><td class="c" rowspan="2">${esc(r.data.name)}</td><td class="c" rowspan="2">${esc(r.data.team)}</td><td class="c">조</td>${cells("jo")}<td class="c" rowspan="2">${c || ""}</td><td class="r" rowspan="2">${f0(c * price)}</td><td rowspan="2">${esc(r.data.memo)}</td></tr><tr><td class="c">중</td>${cells("jung")}</tr>`; }).join("");
  open("식비 현황", `<div class="ttl">식 비 현 황</div><div class="sub"><span>㈜지디건설 &nbsp; 현장명 : ${esc(m.site)}</span><span>1식 ${f0(price)}원</span></div>
    <table style="font-size:8.5px"><colgroup><col style="width:22px"><col style="width:46px"><col style="width:40px"><col style="width:18px">${`<col>`.repeat(n)}<col style="width:28px"><col style="width:60px"><col style="width:50px"></colgroup>
    <thead><tr><th rowspan="2">기호</th><th rowspan="2">이 름</th><th rowspan="2">소속</th><th>월</th><th colspan="${n}">${mm}월</th><th rowspan="2">합계</th><th rowspan="2">금 액</th><th rowspan="2">비 고</th></tr><tr><th>일</th>${dayHead(m.ym, n)}</tr></thead>
    <tbody>${body}<tr class="tot"><td colspan="4" class="c">소 계</td>${Array.from({ length: n }, (_, k) => `<td class="c">${per[k + 1] || ""}</td>`).join("")}<td class="c">${tc}</td><td class="r">${f0(tc * price)}</td><td></td></tr></tbody></table>`, { landscape: true });
}

/* 노무비명세서 */
export function printPay(m, rows, workerOf) {
  const { y, m: mm } = ymP(m.ym), n = 31; let T = { d: 0, a: 0, net: 0, ded: {} };
  const D = k => r => Number(r.data.ded?.[k]) || 0;
  const body = rows.map(r => { const w = workerOf(r) || {}; const d = sumObj(r.data.d), a = d * (Number(r.data.rate) || 0);
    const ded = ["tax", "res", "pen", "hea", "emp", "ltc"].reduce((s, k) => { const v = D(k)(r); T.ded[k] = (T.ded[k] || 0) + v; return s + v; }, 0);
    T.d += d; T.a += a; T.net += a - ded;
    const days = from => Array.from({ length: 16 }, (_, k) => { const dd = from + k; return `<td class="c">${(from === 1 && k === 15) || dd > n ? "" : dv(r.data.d?.[dd])}</td>`; }).join("");
    return `<tr><td class="c" rowspan="2">${esc(r.data.name)}</td><td class="c" rowspan="2">${esc(w.rrn || "")}</td><td rowspan="2" style="font-size:8px">${esc(w.address || "")}</td>${days(1)}<td class="c" rowspan="2">${d || ""}</td><td class="r" rowspan="2">${f0(r.data.rate)}</td><td class="r" rowspan="2">${f0(a)}</td><td class="r">${fz(D("tax")(r))}</td><td class="r">${fz(D("pen")(r))}</td><td class="r">${fz(D("emp")(r))}</td><td class="r" rowspan="2">${f0(a - ded)}</td><td class="c" rowspan="2" style="font-size:8px">${esc(w.phone || "")}</td></tr>
      <tr>${days(16)}<td class="r">${fz(D("res")(r))}</td><td class="r">${fz(D("hea")(r))}</td><td class="r">${fz(D("ltc")(r))}</td></tr>`; }).join("");
  const nums = (a, b) => Array.from({ length: 16 }, (_, k) => `<th>${a + k <= b ? a + k : "*"}</th>`).join("");
  open("노무비 명세서", `<div class="ttl" style="margin-bottom:2px">노무비 명세서</div><div class="sub"><span>현장명 : ${esc(m.site)}</span><span>( ${y}년 ${mm}월 )</span></div>
    <table style="font-size:8px"><colgroup><col style="width:42px"><col style="width:72px"><col style="width:110px">${`<col>`.repeat(16)}<col style="width:26px"><col style="width:48px"><col style="width:58px"><col style="width:44px"><col style="width:44px"><col style="width:44px"><col style="width:58px"><col style="width:62px"></colgroup>
    <thead><tr><th rowspan="2">성 명</th><th rowspan="2">주민등록번호</th><th rowspan="2">주 소</th>${nums(1, 15)}<th rowspan="2">출력<br>일수</th><th rowspan="2">노무비<br>단가</th><th rowspan="2">금 액</th><th>갑근세</th><th>국민연금</th><th>고용보험</th><th rowspan="2">차감<br>지급액</th><th rowspan="2">영수인</th></tr>
      <tr>${nums(16, 31)}<th>주민세</th><th>국민건강</th><th>장기요양</th></tr></thead>
    <tbody>${body}<tr class="tot"><td colspan="19" class="c">합 계</td><td class="c">${T.d}</td><td></td><td class="r">${f0(T.a)}</td><td class="r">${f0((T.ded.tax || 0) + (T.ded.res || 0))}</td><td class="r">${f0((T.ded.pen || 0) + (T.ded.hea || 0))}</td><td class="r">${f0((T.ded.emp || 0) + (T.ded.ltc || 0))}</td><td class="r">${f0(T.net)}</td><td></td></tr></tbody></table>`, { landscape: true });
}

/* 신분증·이수증·통장사본 */
export function printPeople(m, list, files, urls) {
  const body = list.map(w => {
    const fs = files.filter(f => f.sheet === "id" && f.worker_id === w.id && !/\.pdf$/i.test(f.path));
    return `<div class="person"><table><colgroup><col style="width:70px"><col><col style="width:70px"><col style="width:130px"><col style="width:70px"><col style="width:110px"></colgroup>
      <tr><th>성명</th><td>${esc(w.name)}</td><th>주민번호</th><td>${esc(w.rrn)}</td><th>현장명</th><td>${esc(m.site)}</td></tr>
      <tr><th>주소</th><td colspan="3">${esc(w.address)}</td><th>전화번호</th><td>${esc(w.phone)}</td></tr></table>
      <div class="ims">${fs.map(f => urls[f.path] ? `<figure><img src="${urls[f.path]}"><figcaption>${esc(f.grp)}</figcaption></figure>` : "").join("") || '<p style="color:#888;margin:8px 0">첨부된 사진이 없습니다.</p>'}</div></div>`;
  }).join("");
  open("신분증·이수증·통장사본", body, { css: `.person{page-break-inside:avoid;margin-bottom:14px}.ims{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.ims figure{margin:0;width:calc(33.3% - 4px);text-align:center}.ims img{width:100%;max-height:62mm;object-fit:contain;border:1px solid #ccc}.ims figcaption{font-size:9px;color:#444}` });
}

/* 자재구입 */
export function printMat(m, rows) {
  let t = 0;
  const body = rows.map((r, i) => { t += Number(r.data.amount) || 0; return `<tr><td class="c">${i + 1}</td><td class="c">${esc(r.data.mm ?? "")}</td><td class="c">${esc(r.data.dd ?? "")}</td><td>${br(r.data.item)}</td><td class="r">${fz(r.data.amount)}</td><td>${br(r.data.note)}</td></tr>`; }).join("");
  open("자재구입", `<div class="ttl">자 재 구 입</div><div class="sub"><span>현장명 : ${esc(m.site)}</span></div>
    <table style="font-size:11px"><colgroup><col style="width:7%"><col style="width:6%"><col style="width:6%"><col><col style="width:15%"><col style="width:20%"></colgroup>
    <thead><tr><th>연번</th><th>월</th><th>일</th><th>내역</th><th>금액</th><th>비고</th></tr></thead>
    <tbody>${body}<tr class="tot"><td colspan="4" class="c">합 계</td><td class="r">${f0(t)}</td><td></td></tr></tbody></table>`);
}

/* 자재 사진대지 — 한 장에 2열 × 3줄 */
export function printPhotos(m, list, urls) {
  const pages = []; for (let i = 0; i < list.length; i += 6) pages.push(list.slice(i, i + 6));
  const cell = f => f ? `<td class="pc"><div class="pi">${urls[f.path] ? `<img src="${urls[f.path]}">` : ""}</div>
      <table class="cap"><tr><th>용 도</th><td>${esc(f.caption?.usage)}</td></tr><tr><th>구 입 날 짜</th><td>${esc(f.caption?.date)}</td></tr></table></td>` : `<td class="pc"></td>`;
  const body = (pages.length ? pages : [[]]).map((pg, k) => `<div class="${k ? "pb" : ""}"><div class="ttl">자 재 사 진 대 지</div>
    <table class="hd"><tr><th style="width:90px">현장명</th><td>${esc(m.site)}</td></tr></table>
    <table class="grid">${[0, 2, 4].map(i => `<tr>${cell(pg[i])}${cell(pg[i + 1])}</tr>`).join("")}</table></div>`).join("");
  open("자재 사진대지", body, { css: `.hd{margin-bottom:6px}.grid>tbody>tr>td.pc{width:50%;padding:5px;vertical-align:top;height:84mm}.pi{height:66mm;display:flex;align-items:center;justify-content:center}.pi img{max-width:100%;max-height:66mm;object-fit:contain}.cap{margin-top:4px}.cap th{width:80px;font-weight:400}` });
}

/* 증빙서류 — 파일 한 장에 한 쪽 */
export function printDocs(m, groups, urls) {
  const pages = [];
  groups.forEach(([g, list]) => list.forEach(f => pages.push({ g, f })));
  if (!pages.length) { alert("인쇄할 파일이 없습니다."); return; }
  const body = pages.map(({ g, f }, i) => `<div class="${i ? "pb" : ""} dp"><div class="dh">${esc(g)}${f.caption?.memo ? ` · ${esc(f.caption.memo)}` : ""}</div>
    ${/\.pdf$/i.test(f.path) ? `<p style="margin-top:40mm;text-align:center;font-size:13px">PDF 파일 「${esc(f.name)}」 은 화면에서 열어 따로 인쇄해 주세요.</p>` : `<div class="img"><img src="${urls[f.path] || ""}"></div>`}</div>`).join("");
  open("증빙서류", body, { css: `.dh{font-size:10px;color:#555;margin-bottom:4px}.dp .img img{max-height:268mm}` });
}
