// 엑셀 통합 문서 다루기: 시트 지우기 · 이름 바꾸기 · 순서 바꾸기 · 다른 파일의 시트를 서식째 가져오기
import { NS } from "../jy/export-xlsx.js";

const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const RNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const CT_WS = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const parse = s => new DOMParser().parseFromString(s, "application/xml");
const ser = d => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + new XMLSerializer().serializeToString(d).replace(/^<\?xml[^>]*\?>\s*/, "");
const resolve = (base, t) => { if (t.startsWith("/")) return t.slice(1); const a = base.split("/").slice(0, -1); for (const s of t.split("/")) { if (s === "..") a.pop(); else if (s !== ".") a.push(s); } return a.join("/"); };
const relsOf = p => p.replace(/([^/]+)$/, "_rels/$1.rels");
const qName = n => /^[A-Za-z_][A-Za-z0-9_.]*$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`;

const sheetEls = book => [...book.wb.getElementsByTagNameNS(NS, "sheet")];
const ridOf = el => [...el.attributes].find(a => a.localName === "id" && a.namespaceURI === RNS)?.value;
async function ctDoc(book) { return book._ct || (book._ct = parse(await book.zip.text("[Content_Types].xml"))); }
function definedNames(book) { let dn = book.wb.getElementsByTagNameNS(NS, "definedNames")[0]; return dn ? [...dn.getElementsByTagNameNS(NS, "definedName")] : []; }
function dnRoot(book) {
  let dn = book.wb.getElementsByTagNameNS(NS, "definedNames")[0];
  if (!dn) { dn = book.wb.createElementNS(NS, "definedNames"); const s = book.wb.getElementsByTagNameNS(NS, "sheets")[0]; s.after(dn); }
  return dn;
}
// 시트 순서가 바뀌면 localSheetId 를 다시 맞춤
function reindexNames(book, oldOrder) {
  const now = sheetEls(book).map(e => e.getAttribute("name"));
  for (const d of definedNames(book)) {
    const id = d.getAttribute("localSheetId"); if (id == null) continue;
    const nm = oldOrder[+id], ni = now.indexOf(nm);
    if (ni < 0) d.remove(); else d.setAttribute("localSheetId", ni);
  }
}
function syncList(book) {
  const relMap = Object.fromEntries([...book.rels.getElementsByTagNameNS(PKG, "Relationship")].map(r => [r.getAttribute("Id"), r.getAttribute("Target")]));
  book.list.length = 0;
  for (const el of sheetEls(book)) { let t = relMap[ridOf(el)]; t = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, ""); book.list.push({ name: el.getAttribute("name"), path: t }); }
  book.names.length = 0; book.names.push(...book.list.map(s => s.name));
}

export async function removeSheet(book, name) {
  const old = sheetEls(book).map(e => e.getAttribute("name"));
  const el = sheetEls(book).find(e => e.getAttribute("name") === name); if (!el) return;
  const rid = ridOf(el), rel = [...book.rels.getElementsByTagNameNS(PKG, "Relationship")].find(r => r.getAttribute("Id") === rid);
  const path = book.list.find(s => s.name === name)?.path;
  el.remove(); rel?.remove();
  const ct = await ctDoc(book);
  if (path) {
    // 시트에 딸린 파일(인쇄 설정 등)도 지움
    const rp = relsOf(path);
    if (book.zip.has(rp)) { const rd = parse(await book.zip.text(rp)); for (const r of rd.getElementsByTagNameNS(PKG, "Relationship")) { if (r.getAttribute("TargetMode") === "External") continue; const t = resolve(path, r.getAttribute("Target")); book.zip.remove(t); for (const o of [...ct.getElementsByTagName("Override")]) if (o.getAttribute("PartName") === "/" + t) o.remove(); } book.zip.remove(rp); }
    book.zip.remove(path);
    for (const o of [...ct.getElementsByTagName("Override")]) if (o.getAttribute("PartName") === "/" + path) o.remove();
    book._skip = book._skip || new Set(); book._skip.add(path);
  }
  reindexNames(book, old); syncList(book);
}
export function renameSheet(book, from, to) {
  const el = sheetEls(book).find(e => e.getAttribute("name") === from); if (!el) return;
  el.setAttribute("name", to);
  for (const d of definedNames(book)) d.textContent = d.textContent.split(qName(from) + "!").join(qName(to) + "!");
  syncList(book);
}
export function orderSheets(book, names) {
  const old = sheetEls(book).map(e => e.getAttribute("name")), root = book.wb.getElementsByTagNameNS(NS, "sheets")[0];
  const els = sheetEls(book), want = [...names, ...old.filter(n => !names.includes(n))];
  for (const n of want) { const e = els.find(x => x.getAttribute("name") === n); if (e) root.append(e); }
  reindexNames(book, old); syncList(book);
  // 첫 시트가 열리게
  const bv = book.wb.getElementsByTagNameNS(NS, "workbookView")[0]; if (bv) { bv.setAttribute("activeTab", "0"); bv.removeAttribute("firstSheet"); }
}
export function setPrintArea(book, name, ref) {
  const idx = sheetEls(book).findIndex(e => e.getAttribute("name") === name); if (idx < 0) return;
  for (const d of definedNames(book)) if (d.getAttribute("name") === "_xlnm.Print_Area" && +d.getAttribute("localSheetId") === idx) d.remove();
  const d = book.wb.createElementNS(NS, "definedName"); d.setAttribute("name", "_xlnm.Print_Area"); d.setAttribute("localSheetId", idx); d.textContent = `${qName(name)}!${ref}`;
  dnRoot(book).append(d);
}

/* ---------- 다른 파일의 시트를 서식째 가져오기 ---------- */
export async function importSheet(dst, src, srcName, newName = srcName) {
  const sSh = await src.sheet(srcName); if (!sSh) throw new Error("없는 시트: " + srcName);
  // 바뀐 내용까지 담긴 시트 문서를 복사
  const doc = parse(new XMLSerializer().serializeToString(sSh.doc));
  // 스타일 옮기기
  const sSt = src._st || (src._st = parse(await src.zip.text("xl/styles.xml")));
  const dSt = dst._st || (dst._st = parse(await dst.zip.text("xl/styles.xml")));
  const g = (d, t) => d.getElementsByTagNameNS(NS, t)[0];
  const kids = (el, t) => el ? [...el.childNodes].filter(n => n.nodeType === 1 && n.localName === t) : [];
  const mapPool = (tag, item) => {   // fonts/fills/borders: 같은 모양이면 재사용
    const sp = kids(g(sSt, tag), item); let dp = g(dSt, tag);
    if (!dp) { dp = dSt.createElementNS(NS, tag); g(dSt, "styleSheet").append(dp); }
    const seen = new Map(kids(dp, item).map((n, i) => [new XMLSerializer().serializeToString(n), i]));
    const memo = new Map();
    return i => { if (memo.has(i)) return memo.get(i); const n = sp[i]; if (!n) return 0; const key = new XMLSerializer().serializeToString(n);
      let j = seen.get(key); if (j == null) { dp.append(dSt.importNode(n, true)); j = kids(dp, item).length - 1; seen.set(key, j); dp.setAttribute("count", j + 1); } memo.set(i, j); return j; };
  };
  const font = mapPool("fonts", "font"), fill = mapPool("fills", "fill"), border = mapPool("borders", "border");
  const sFmt = new Map(kids(g(sSt, "numFmts"), "numFmt").map(n => [n.getAttribute("numFmtId"), n.getAttribute("formatCode")]));
  let dFmts = g(dSt, "numFmts");
  const numFmt = id => {
    if (+id < 164) return id; const code = sFmt.get(String(id)); if (code == null) return 0;
    if (!dFmts) { dFmts = dSt.createElementNS(NS, "numFmts"); g(dSt, "styleSheet").insertBefore(dFmts, g(dSt, "styleSheet").firstChild); }
    const have = kids(dFmts, "numFmt").find(n => n.getAttribute("formatCode") === code); if (have) return have.getAttribute("numFmtId");
    const nid = Math.max(163, ...kids(dFmts, "numFmt").map(n => +n.getAttribute("numFmtId"))) + 1;
    const n = dSt.createElementNS(NS, "numFmt"); n.setAttribute("numFmtId", nid); n.setAttribute("formatCode", code); dFmts.append(n); dFmts.setAttribute("count", kids(dFmts, "numFmt").length); return nid;
  };
  const sXf = kids(g(sSt, "cellXfs"), "xf"), dXfs = g(dSt, "cellXfs");
  const xfSeen = new Map(kids(dXfs, "xf").map((n, i) => [new XMLSerializer().serializeToString(n), i])), xfMemo = new Map();
  const xf = i => {
    i = +i || 0; if (xfMemo.has(i)) return xfMemo.get(i);
    const n = dSt.importNode(sXf[i] || sXf[0], true);
    n.setAttribute("fontId", font(+n.getAttribute("fontId") || 0)); n.setAttribute("fillId", fill(+n.getAttribute("fillId") || 0));
    n.setAttribute("borderId", border(+n.getAttribute("borderId") || 0)); n.setAttribute("numFmtId", numFmt(n.getAttribute("numFmtId") || 0)); n.setAttribute("xfId", "0");
    const key = new XMLSerializer().serializeToString(n); let j = xfSeen.get(key);
    if (j == null) { dXfs.append(n); j = kids(dXfs, "xf").length - 1; xfSeen.set(key, j); dXfs.setAttribute("count", j + 1); }
    xfMemo.set(i, j); return j;
  };
  // 칸 · 줄 · 열 서식 번호 바꾸기, 공유 문자열 → 칸 안 문자열
  const sd = doc.getElementsByTagNameNS(NS, "sheetData")[0];
  for (const c of [...sd.getElementsByTagNameNS(NS, "c")]) {
    c.setAttribute("s", xf(c.getAttribute("s") || 0));
    if (c.getAttribute("t") === "s") {
      const v = c.getElementsByTagNameNS(NS, "v")[0], si = src.sharedSi[+v.textContent];
      c.removeChild(v); c.setAttribute("t", "inlineStr");
      const is = doc.createElementNS(NS, "is");
      if (si) for (const k of [...si.childNodes]) if (k.nodeType === 1 && (k.localName === "t" || k.localName === "r")) is.append(doc.importNode(k, true));
      c.append(is);
    }
  }
  for (const r of sd.getElementsByTagNameNS(NS, "row")) if (r.getAttribute("s")) r.setAttribute("s", xf(r.getAttribute("s")));
  for (const c of doc.getElementsByTagNameNS(NS, "col")) if (c.getAttribute("style")) c.setAttribute("style", xf(c.getAttribute("style")));
  // 기본 글꼴이 다르면 열 너비(글자 수 단위)가 달라 보이므로 비율로 맞춤
  const f0 = d => { const f = kids(g(d, "fonts"), "font")[0]; return { name: f?.getElementsByTagNameNS(NS, "name")[0]?.getAttribute("val") || "Calibri", sz: +(f?.getElementsByTagNameNS(NS, "sz")[0]?.getAttribute("val")) || 11 }; };
  const mdw = ({ name, sz }) => { try { const c = document.createElement("canvas").getContext("2d"); c.font = `${sz * 96 / 72}px "${name}"`; return Math.round(Math.max(...[..."0123456789"].map(ch => c.measureText(ch).width))); } catch { return 0; } };
  const ms = mdw(f0(sSt)), md = mdw(f0(dSt)), k2 = ms && md ? ms / md : 1;
  if (Math.abs(k2 - 1) > 0.01) {
    for (const c of doc.getElementsByTagNameNS(NS, "col")) if (c.getAttribute("width")) c.setAttribute("width", (+c.getAttribute("width") * k2).toFixed(4));
    const fp = doc.getElementsByTagNameNS(NS, "sheetFormatPr")[0]; if (fp?.getAttribute("defaultColWidth")) fp.setAttribute("defaultColWidth", (+fp.getAttribute("defaultColWidth") * k2).toFixed(4));
  }
  // 다른 파일과 이어진 것(인쇄 설정 파일, 조건부 서식 등)은 뺌
  for (const t of ["drawing", "legacyDrawing", "picture", "tableParts", "conditionalFormatting", "extLst", "oleObjects", "controls"]) for (const e of [...doc.getElementsByTagNameNS(NS, t)]) e.remove();
  for (const e of doc.getElementsByTagNameNS(NS, "pageSetup")) for (const a of [...e.attributes]) if (a.namespaceURI === RNS) e.removeAttributeNode(a);
  for (const e of doc.getElementsByTagNameNS(NS, "sheetView")) e.removeAttribute("tabSelected");
  // 새 시트 파일 · 관계 · 목록
  let n = 1; while (dst.zip.has(`xl/worksheets/sheet${n}.xml`) || dst._skip?.has(`xl/worksheets/sheet${n}.xml`)) n++;
  const path = `xl/worksheets/sheet${n}.xml`;
  dst.zip.add(path, ser(doc));
  const ids = [...dst.rels.getElementsByTagNameNS(PKG, "Relationship")].map(r => r.getAttribute("Id")); let k = 1; while (ids.includes("rId" + k)) k++;
  const rel = dst.rels.createElementNS(PKG, "Relationship"); rel.setAttribute("Id", "rId" + k); rel.setAttribute("Type", RNS + "/worksheet"); rel.setAttribute("Target", `worksheets/sheet${n}.xml`); dst.rels.documentElement.append(rel);
  const sheets = dst.wb.getElementsByTagNameNS(NS, "sheets")[0], maxId = Math.max(0, ...sheetEls(dst).map(e => +e.getAttribute("sheetId")));
  const se = dst.wb.createElementNS(NS, "sheet"); se.setAttribute("name", newName); se.setAttribute("sheetId", maxId + 1); se.setAttributeNS(RNS, "r:id", "rId" + k); sheets.append(se);
  const ct = await ctDoc(dst), o = ct.createElementNS(ct.documentElement.namespaceURI, "Override"); o.setAttribute("PartName", "/" + path); o.setAttribute("ContentType", CT_WS); ct.documentElement.append(o);
  syncList(dst);
  // 인쇄 영역
  const sIdx = sheetEls(src).findIndex(e => e.getAttribute("name") === srcName);
  for (const d of definedNames(src)) if (d.getAttribute("name") === "_xlnm.Print_Area" && +d.getAttribute("localSheetId") === sIdx) setPrintArea(dst, newName, d.textContent.split("!").pop());
}
// 저장 전에 통합 문서 수준 파일 반영
export async function finish(book) {
  if (book._st) book.zip.put("xl/styles.xml", ser(book._st));
  if (book._ct) book.zip.put("[Content_Types].xml", ser(book._ct));
  book.zip.put("xl/_rels/workbook.xml.rels", ser(book.rels));
}
