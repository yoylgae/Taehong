// 월간 위험성평가 인쇄 — 원청 '월간 위험성평가 조회' 화면 짜임 (작업공종·세부공종·작업활동·구분 칸 합치기), A4 가로
import { grade, nk, actKey } from "../ptw/ptw-data.js";

const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const br = v => esc(v).replace(/\n/g, "<br>");
const SIGN = [["sub", "협력사"], ["team", "수행담당"], ["health", "보건관리자"], ["safety", "안전관리자"], ["lead", "수행팀장<br>(공구장)"]];
const dot = s => s ? s.replace(/-/g, ".") : "";

// 공종 세팅 순서대로 줄 세우기 (세팅에 없는 것은 뒤에)
function ordered(d) {
  const order = new Map(); let n = 0;
  for (const g of d.tree) for (const i of g.items) for (const a of i.acts) order.set(actKey(i.wt2, a), { n: n++, wt1: g.wt1 });
  return d.rows.map((r, i) => ({ ...r, wt1: order.get(actKey(r.wt2, r.wt3))?.wt1 || r.wt1 || "", _o: order.get(actKey(r.wt2, r.wt3))?.n ?? 1e6, _i: i }))
    .sort((a, b) => a._o - b._o || nk(a.wt2).localeCompare(nk(b.wt2)) || nk(a.wt3).localeCompare(nk(b.wt3)) || a._i - b._i);
}
// 같은 값이 이어지는 칸 합치기 (앞 칸이 같을 때만)
function spans(rows, keys) {
  const out = rows.map(() => ({}));
  keys.forEach((k, ki) => {
    let i = 0;
    while (i < rows.length) {
      let j = i + 1;
      const same = (a, b) => keys.slice(0, ki + 1).every(kk => nk(rows[a][kk]) === nk(rows[b][kk]));
      while (j < rows.length && same(i, j)) j++;
      out[i][k] = j - i; for (let x = i + 1; x < j; x++) out[x][k] = 0;
      i = j;
    }
  });
  return out;
}
export function printRA(d, status) {
  const rows = ordered(d), sp = spans(rows, ["wt1", "wt2", "wt3", "src"]);
  const cell = (r, s, k, cls = "") => s[k] ? `<td class="c ${cls}" rowspan="${s[k]}">${esc(r[k])}</td>` : "";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(d.title || d.ym + " 위험성평가")}</title>
<style>
@page{size:A4 landscape;margin:9mm}
*{box-sizing:border-box}
body{margin:0;font:10px/1.35 "Malgun Gothic","맑은 고딕","Apple SD Gothic Neo",sans-serif;color:#111}
h1{font-size:18px;margin:0 0 8px;font-weight:800}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #9aa3ad;padding:3px 5px;vertical-align:middle}
th{background:#eceef1;font-weight:700;text-align:center}
td.c{text-align:center}
.top{display:flex;gap:12px;align-items:flex-start;margin-bottom:8px}
.top .co{width:34%}.top .ap{flex:1}
.ap td{text-align:center;height:22px}
.ap .nm{font-weight:700}
.list thead{display:table-header-group}

.ptw{background:#f6d4dc;font-weight:700}
.files{margin-top:8px}
@media screen{body{background:#e5e7eb}.sheet{background:#fff;width:297mm;margin:10px auto;padding:9mm;box-shadow:0 2px 12px rgba(0,0,0,.15)}}
</style></head><body><div class="sheet">
<h1>월간 위험성평가 — ${esc(d.title || "")}</h1>
<div class="top"><table class="co"><tr><th style="width:30%">협력업체</th><td>${esc(d.company)}</td></tr><tr><th>평가년월</th><td>${esc(d.ym)}</td></tr><tr><th>상태</th><td>${esc(status || "")}</td></tr></table>
<table class="ap"><tr><th rowspan="2" style="width:7%">결재</th>${SIGN.map(([, n]) => `<th>${n}</th>`).join("")}</tr>
<tr>${SIGN.map(([k]) => `<td><span class="nm">${esc(d.sign?.[k]?.name || "")}</span><br>${esc(dot(d.sign?.[k]?.date))}</td>`).join("")}</tr></table></div>
<table class="list"><thead><tr><th style="width:7%">작업공종</th><th style="width:7%">세부공종</th><th style="width:8%">작업활동</th><th style="width:4.5%">구분</th><th>위험요인</th><th style="width:7%">재해유형</th><th style="width:3%">빈도</th><th style="width:3%">강도</th><th style="width:4.5%">평가등급</th><th style="width:24%">개선대책</th><th style="width:4.5%">재평가<br>등급</th><th style="width:8%">검토의견</th></tr></thead><tbody>
${rows.map((r, i) => `<tr>${cell(r, sp[i], "wt1")}${cell(r, sp[i], "wt2")}${cell(r, sp[i], "wt3")}${cell(r, sp[i], "src", r.src === "PTW" ? "ptw" : "")}
<td>${br(r.factor)}</td><td class="c">${esc(r.type)}</td><td class="c">${esc(r.freq)}</td><td class="c">${esc(r.sev)}</td><td class="c">${grade(r.freq, r.sev)}</td><td>${br(r.measure)}</td><td class="c">${esc(r.re)}</td><td>${br(r.comment)}</td></tr>`).join("")}
</tbody></table>
<table class="files"><tr><th style="width:10%">회의록</th><td>${esc(d.files?.meeting || "")}</td><th style="width:10%">공정표</th><td>${esc(d.files?.schedule || "")}</td></tr></table>
</div><script>setTimeout(()=>{window.focus();window.print();},300)<\/script></body></html>`;
}
