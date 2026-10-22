// 반입전(사용전) 점검표 · 운전원 서약서: 가이드 원본 페이지 그림 위에 작업계획서 값을 얹어 A4로 출력
import { FORMS } from "./forms-data.js";
import { EQUIP_CHECKLIST, CHECKLISTS } from "./checklist-data.js";
export { FORMS };

const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// 장비명 → 고를 수 있는 양식 [{key, name, pre:{page,pos,label}}]
export function formChoices(equipType) {
  const keys = EQUIP_CHECKLIST[equipType] || [];
  return keys.filter(k => FORMS[k]).flatMap(k => FORMS[k].pre.map((p, i) => ({ id: `${k}:${i}`, key: k, idx: i, name: CHECKLISTS[k]?.name + (p.label ? ` (${p.label})` : "") })));
}
// p: 작업계획서 값, drivers: 운전원 이름들, what: {pre, pledge}
export function buildFormsHtml({ id, plan: p, drivers = [], what = { pre: true, pledge: true }, imgBase }) {
  const [key, idx] = id.split(":"), f = FORMS[key]; if (!f) throw new Error("양식이 없는 장비입니다.");
  const pre = f.pre[+idx || 0], val = {
    site_name: p.site_name, work_name: p.work_name, company_name: p.company_name, reg_no: p.reg_no, manufacturer: p.manufacturer,
    model_name: p.model_name, spec: p.spec, make_year: p.make_year, in_date: p.in_date, check_date: p.check_date || p.in_date,
  };
  const page = (pg, pos, v) => `<div class="page"><div class="sheet"><img src="${imgBase}p${pg}.jpg" alt="">${Object.entries(pos).map(([k, [x, y, w, h]]) => v[k]
    ? `<span class="v${k === "driver" ? " c" : ""}" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%">${esc(v[k])}</span>` : "").join("")}</div></div>`;
  const ds = drivers.filter(Boolean); const names = ds.length ? ds : [""];
  let body = "";
  if (what.pre) body += page(pre.page, pre.pos, { ...val, driver: names[0] });
  if (what.pledge) for (const n of names) body += page(f.pledge.page, f.pledge.pos, { driver: n });
  const title = `${what.pre ? "반입전 점검표" : ""}${what.pre && what.pledge ? " · " : ""}${what.pledge ? "운전원 서약서" : ""} - ${CHECKLISTS[key]?.name || key}${p.reg_no ? ` (${p.reg_no})` : ""}`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:#fff}
.page{position:relative;width:210mm;height:296mm;display:flex;align-items:center;justify-content:center;overflow:hidden;page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
.sheet{position:relative;height:296mm;aspect-ratio:540/780}
.sheet img{position:absolute;inset:0;width:100%;height:100%}
.v{position:absolute;display:flex;align-items:center;padding-left:1.2%;font:600 11.5px/1 "Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#000;white-space:nowrap;overflow:hidden}
.v.c{justify-content:center;padding-left:0;font-size:12.5px}
@media screen{body{background:#e5e7eb}.page{margin:10px auto;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.15)}}
</style></head><body>${body}
<script>
  const imgs=[...document.images];
  Promise.all(imgs.map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r;}))).then(()=>{window.focus();window.print();});
<\/script></body></html>`;
}
export const pledgeNote = key => FORMS[key]?.pledge?.sub ? `가이드에 ${CHECKLISTS[key]?.name} 서약서가 없어 ${CHECKLISTS[FORMS[key].pledge.sub]?.name} 서약서를 씁니다` : "";
