// 일용 근로계약서 — 고른 계약서 양식 시트를 근로자 수만큼 복사해 한 사람에 한 시트씩 채운 엑셀을 만든다.
// 양식(서식·병합·인쇄 영역·수식)은 그대로 두고, 성명·주민번호·주소·전화·일당·계약기간 등 값만 바꾼다.
import { openBook, Calc, Sheet, colNum, colName, splitRef, NS } from "./export-xlsx.js";

const K = s => String(s ?? "").replace(/\s+/g, "");
const RELNS = "http://schemas.openxmlformats.org/package/2006/relationships";
const ODR = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const parse = s => new DOMParser().parseFromString(s, "application/xml");
const ser = d => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + new XMLSerializer().serializeToString(d).replace(/^<\?xml[^>]*\?>\s*/, "");
const spaced = n => [...String(n)].join(" ");
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const dir = p => p.split("/").slice(0, -1).join("/");
const relsOf = p => `${dir(p)}/_rels/${p.split("/").pop()}.rels`;
const resolve = (base, t) => { if (t.startsWith("/")) return t.slice(1); const parts = dir(base).split("/"); for (const x of t.split("/")) x === ".." ? parts.pop() : x !== "." && parts.push(x); return parts.join("/"); };

/* ---------- 양식 파일에서 계약서 시트 목록과 견본 값 읽기 ---------- */
export async function inspectTemplate(blob) {
  const book = await openBook(await blob.arrayBuffer());
  const out = [];
  for (const name of book.names) {
    const sh = await book.sheet(name);
    const f = locate(sh);
    if (!f.name) continue;
    const v = c => c ? sh.text(c.c, c.r) : "";
    out.push({ sheet: name, company: v(f.company), place: v(f.place), work: v(f.work), leader: v(f.leader), job: v(f.job), sample: v(f.name) });
  }
  return out;
}

/* ---------- 칸 찾기 (제목 글자 기준) ---------- */
function mergeMap(sh) {
  const m = new Map();
  for (const el of sh.mergeRefs()) {
    const [a, b] = el.getAttribute("ref").split(":").map(splitRef); if (!a || !b) continue;
    m.set(a.c + "," + a.r, b.c);
  }
  return m;
}
function locate(sh) {
  const mm = mergeMap(sh);
  const right = p => p && { c: (mm.get(p.c + "," + p.r) ?? p.c) + 1, r: p.r };
  const find = (re, test = () => true) => { let hit = null; sh.each((c, r) => { if (!hit && sh.formula(c, r) == null && re.test(K(sh.text(c, r))) && test(c, r)) hit = { c, r }; }); return hit; };
  const emp = find(/^\(을\)/); const er = emp?.r ?? 0;
  const near = (c, r) => r >= er && r <= er + 2;
  const nameL = find(/^성명$/, near), rrnL = find(/^주민등록번호$/, near), addrL = find(/^주소$/, (c, r) => r > er && r <= er + 2), telL = find(/^(전화번호|핸드폰번호|휴대폰번호?)$/, near);
  const compL = find(/^상호$/), periodL = find(/^계약기간$/);
  const tilde = periodL && find(/^~$/, (c, r) => r === periodL.r);
  const months = periodL && find(/개월\)?$/, (c, r) => r === periodL.r);
  const wageL = find(/법정수당이포함된일당/);
  const payDay = find(/매월\d*일에/);
  const bankSep = find(/통장구좌\($/);
  const bankInline = find(/통장구좌\(.*은행\)/);
  return {
    mm, right, emp,
    name: right(nameL), rrn: right(rrnL), addr: right(addrL), tel: right(telL), company: right(compL),
    place: right(find(/^근로장소$/)), work: right(find(/^공종\/?수행업무$/)), leader: right(find(/^소속팀장$/)), job: right(find(/^직종$/)),
    start: right(periodL), end: right(tilde), months, wage: right(wageL), payDay, bankSep, bankInline,
  };
}

/* ---------- 한 사람 채우기 ---------- */
function fillOne(sh, P, O) {
  const f = locate(sh);
  const get = p => { if (!p) return ""; const v = sh.raw(p.c, p.r); return v == null ? "" : String(v); };   // 앞뒤 공백까지 그대로
  const rich = p => sh.runs(p.c, p.r).some(x => x.rPr);
  // 칸 전체 바꾸기: 서식 있는 글자 칸이면 첫 조각의 서식을 이어받음
  const replaceAll = (p, v) => {
    if (!p || sh.formula(p.c, p.r) != null) return;
    if (v == null || v === "") { sh.set(p.c, p.r, null); return; }
    if (rich(p)) sh.editText(p.c, p.r, e => e.replace(/^[\s\S]*$/, () => String(v)));
    else sh.set(p.c, p.r, typeof v === "number" ? v : String(v), sh.cell(p.c, p.r));
  };
  const put = (p, v) => { if (p && v != null && v !== "") replaceAll(p, v); };
  const sample = { name: get(f.name).trim(), rrn: get(f.rrn).trim(), addr: get(f.addr).trim(), tel: get(f.tel).trim() };
  const done = new Set();
  const mark = p => p && done.add(p.c + "," + p.r);

  // 사람 정보는 비어 있어도 덮어씀 (견본 근로자 정보가 남지 않도록)
  replaceAll(f.name, P.name); replaceAll(f.rrn, P.rrn); replaceAll(f.addr, P.address); replaceAll(f.tel, P.phone);
  [f.name, f.rrn, f.addr, f.tel].forEach(mark);
  for (const k of ["place", "work", "leader", "job"]) if (O[k]) { put(f[k], O[k]); mark(f[k]); }
  if (f.wage && P.rate) { if (sh.formula(f.wage.c, f.wage.r) == null) sh.set(f.wage.c, f.wage.r, Number(P.rate), sh.cell(f.wage.c, f.wage.r)); mark(f.wage); }
  // 계약기간: 양식의 날짜 모양(2026 . 09 . 01 . / 2026.09.01)을 그대로 따름
  const setDate = (p, d) => {
    if (!p || !d) return; const t = get(p); const [y, m, dd] = d.split("-");
    if (/\d{4}\s*\.\s*\d{1,2}\s*\.\s*\d{1,2}/.test(t)) sh.editText(p.c, p.r, e => e.replace(/(\d{4})(\s*\.\s*)(\d{1,2})(\s*\.\s*)(\d{1,2})/, (_, a, s1, b, s2) => `${y}${s1}${m}${s2}${dd}`));
    else if (/20\s*\.\s*\.\s*\./.test(t)) sh.editText(p.c, p.r, e => e.replace(/20\s*\.\s*\.\s*\./, () => `${y} . ${m} . ${dd} .`));
    else replaceAll(p, `  ${y} . ${m} . ${dd} . `);
    mark(p);
  };
  setDate(f.start, O.start); setDate(f.end, O.end);
  if (f.months && O.months) { sh.editText(f.months.c, f.months.r, e => e.replace(/\(\s*\d*\s*개월\)/, () => `(  ${O.months} 개월)`)); mark(f.months); }
  if (f.payDay && O.payday) sh.editText(f.payDay.c, f.payDay.r, e => e.replace(/매월\s*\d*\s*일에/, () => `매월  ${O.payday}  일에`));
  // 통장: 양식에 견본 계좌가 적혀 있을 때만 채움
  const bk = String(P.bank || "").trim(), bm = bk.match(/^(\S+?)(?:은행)?\s+([\d-]+.*)$/), bankName = bm ? bm[1] : "", acct = bm ? bm[2].trim() : bk;
  if (f.bankSep) {
    const a = f.right(f.bankSep), b = a && f.right(a);
    if (a && get(a)) { replaceAll(a, acct); mark(a); if (b && get(b)) { replaceAll(b, bankName); mark(b); } }
  }
  // 나머지 글자 칸: 견본 근로자 이름·주민번호·주소·전화를 새 사람 것으로, 빈 서명란에는 이름을 넣음
  // (한 칸 안에서 일부만 굵게·빨강인 서식은 조각별로 그대로 유지)
  const nameRe = sample.name ? new RegExp([...sample.name.replace(/\s+/g, "")].map(reEsc).join("\\s*"), "g") : null;
  const lit = s => new RegExp(reEsc(s), "g");
  sh.each((c, r) => {
    if (done.has(c + "," + r) || sh.formula(c, r) != null) return;
    const el = sh.cell(c, r), tt = el?.getAttribute("t");
    if (!el || !(tt === "s" || tt === "inlineStr" || tt === "str")) return;
    const t = sh.raw(c, r); if (typeof t !== "string" || !t) return;
    const nx = f.right({ c, r }); let nxEmpty = true;
    for (let cc = nx.c; cc <= nx.c + 6; cc++) if (sh.text(cc, r) || sh.formula(cc, r) != null) { nxEmpty = false; break; }
    sh.editText(c, r, e => {
      if (nameRe && P.name) e.replace(nameRe, m => /\s/.test(m) ? spaced(P.name) : P.name);
      if (sample.rrn) e.replace(lit(sample.rrn), () => P.rrn || "");
      if (sample.addr) e.replace(lit(sample.addr), () => P.address || "");
      if (sample.tel) e.replace(lit(sample.tel), () => P.phone || "");
      // 빈 서명란: '성명 :          (인)' → 이름은 빈칸(공백) 자리에 넣어 '(인)' 서식은 그대로
      if (!sample.name && P.name) e.replace(/((?:성\s*명|동의|확인자|수령자\s*성명)\s*:?)(\s{3,})(?=\(인\))/g, (m, a) => `${a}     ${spaced(P.name)}     `);
      if (f.bankInline && bk && /통장구좌\(\s*[^\s,][^,]*,/.test(t)) e.replace(/통장구좌\([^,]*,[^)]*은행\)/, () => `통장구좌(  ${acct}  ,  ${bankName}  은행)`);
      // '주  소 : ' 처럼 값이 비어 있는 칸 (오른쪽 칸이 비어 있을 때만)
      if (nxEmpty && /:\s*$/.test(t)) {
        const L = K(t.replace(/:\s*$/, ""));
        const v = /^주소$/.test(L) ? P.address : /^주민등록번호$/.test(L) ? P.rrn : /^(핸드폰번호|전화번호|휴대폰번호?)$/.test(L) ? P.phone : /^성명$/.test(L) ? P.name : null;
        if (v) { if (!/ $/.test(t)) e.append(" "); e.append(v); }
      }
    });
  });
}

/* ---------- 양식 시트를 사람 수만큼 복사한 통합 문서 만들기 ---------- */
// people: [{ name, rrn, address, phone, bank, rate }], O: { start, end, months, payday, place, work, leader, job }
export async function buildContracts(blob, sheetName, people, O) {
  const book = await openBook(await blob.arrayBuffer());
  const { zip, wb, rels } = book;
  const src = await book.sheet(sheetName); if (!src) throw new Error(`양식에 '${sheetName}' 시트가 없습니다.`);
  const srcIdx = book.names.indexOf(sheetName);
  const ct = parse(await zip.text("[Content_Types].xml"));
  const srcRelsText = await zip.text(relsOf(src.path));
  const srcRels = srcRelsText ? parse(srcRelsText) : null;
  // 원본 시트들이 쓰던 부속 파일(인쇄 설정 등) 내용을 먼저 확보
  const partBytes = {};
  if (srcRels) for (const r of srcRels.getElementsByTagName("Relationship")) {
    if (r.getAttribute("TargetMode") === "External") continue;
    const p = resolve(src.path, r.getAttribute("Target")); partBytes[p] = await zip.bytes(p);
    const sub = await zip.text(relsOf(p)); if (sub) partBytes[relsOf(p)] = new TextEncoder().encode(sub);
  }
  const ctOf = p => [...ct.getElementsByTagName("Override")].find(o => o.getAttribute("PartName") === "/" + p)?.getAttribute("ContentType");
  const partCT = Object.fromEntries(Object.keys(partBytes).map(p => [p, ctOf(p)]));
  const sheetCT = ctOf(src.path) || "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";

  // 원래 시트 전부 제거 (파일·관계·형식·이름)
  const sheetsEl = wb.getElementsByTagNameNS(NS, "sheets")[0];
  for (const it of book.list) {
    zip.remove(it.path); zip.remove(relsOf(it.path));
    for (const o of [...ct.getElementsByTagName("Override")]) if (o.getAttribute("PartName") === "/" + it.path) o.parentNode.removeChild(o);
  }
  for (const r of [...rels.getElementsByTagName("Relationship")]) if (/\/worksheet$|\/chartsheet$/.test(r.getAttribute("Type"))) r.parentNode.removeChild(r);
  while (sheetsEl.firstChild) sheetsEl.removeChild(sheetsEl.firstChild);
  const dn = wb.getElementsByTagNameNS(NS, "definedNames")[0];
  const localNames = [];
  if (dn) { for (const d of [...dn.getElementsByTagNameNS(NS, "definedName")]) { if (d.getAttribute("localSheetId") === String(srcIdx)) localNames.push({ name: d.getAttribute("name"), text: d.textContent }); dn.removeChild(d); } }
  const quoted = n => `'${n.replace(/'/g, "''")}'`;
  const srcRefRe = new RegExp(`^(?:${reEsc(quoted(sheetName))}|${reEsc(sheetName)})!`, "");

  // 사람마다 시트 하나
  const used = new Set(), names = [];
  const calc = new Calc(book);
  let n = 0;
  for (const P of people) {
    n++;
    let nm = String(P.name || `근로자${n}`).replace(/[\[\]:*?\/\\']/g, "").slice(0, 28) || `근로자${n}`; let k = 2; const base = nm;
    while (used.has(nm)) nm = `${base}(${k++})`; used.add(nm); names.push(nm);
    const doc = src.doc.cloneNode(true);
    const path = `xl/worksheets/sheet${n}.xml`;
    const sh = new Sheet(nm, path, doc, book.shared, book.sharedSi);
    fillOne(sh, P, { ...O, ...(P.o || {}) });   // 사람마다 다른 조건(소속별 근로장소·직종 등)이 있으면 그것을 우선
    // 맨 앞 시트만 선택 상태로
    for (const v of doc.getElementsByTagNameNS(NS, "sheetView")) { if (n === 1) v.setAttribute("tabSelected", "1"); else v.removeAttribute("tabSelected"); }
    await calc.writeBack(sh);
    // 부속 파일 복사
    if (srcRels) {
      const rd = srcRels.cloneNode(true);
      for (const r of rd.getElementsByTagName("Relationship")) {
        if (r.getAttribute("TargetMode") === "External") continue;
        const p = resolve(src.path, r.getAttribute("Target"));
        const ext = p.split(".").pop(), np = p.replace(/(\d*)\.(\w+)$/, `_c${n}.$2`);
        zip.add(np, partBytes[p]);
        if (partBytes[relsOf(p)]) zip.add(relsOf(np), partBytes[relsOf(p)]);
        if (partCT[p]) { const o = ct.createElementNS(ct.documentElement.namespaceURI, "Override"); o.setAttribute("PartName", "/" + np); o.setAttribute("ContentType", partCT[p]); ct.documentElement.append(o); }
        r.setAttribute("Target", "../" + np.split("/").slice(1).join("/"));
        void ext;
      }
      zip.add(relsOf(path), ser(rd));
    }
    zip.add(path, ser(doc));
    const o = ct.createElementNS(ct.documentElement.namespaceURI, "Override"); o.setAttribute("PartName", "/" + path); o.setAttribute("ContentType", sheetCT); ct.documentElement.append(o);
    const rid = `rIdC${n}`;
    const rel = rels.createElementNS(RELNS, "Relationship"); rel.setAttribute("Id", rid);
    rel.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"); rel.setAttribute("Target", `worksheets/sheet${n}.xml`);
    rels.documentElement.append(rel);
    const s = wb.createElementNS(NS, "sheet"); s.setAttribute("name", nm); s.setAttribute("sheetId", String(n)); s.setAttributeNS(ODR, "r:id", rid); sheetsEl.append(s);
    if (dn) for (const ln of localNames) { const d = wb.createElementNS(NS, "definedName"); d.setAttribute("name", ln.name); d.setAttribute("localSheetId", String(n - 1)); d.textContent = ln.text.split(",").map(x => x.replace(srcRefRe, quoted(nm) + "!")).join(","); dn.append(d); }
  }
  if (dn && !dn.getElementsByTagNameNS(NS, "definedName").length) dn.parentNode.removeChild(dn);
  for (const v of wb.getElementsByTagNameNS(NS, "workbookView")) { v.setAttribute("activeTab", "0"); v.removeAttribute("firstSheet"); }
  let calcPr = wb.getElementsByTagNameNS(NS, "calcPr")[0];
  if (!calcPr) { calcPr = wb.createElementNS(NS, "calcPr"); (wb.getElementsByTagNameNS(NS, "definedNames")[0] || sheetsEl).after(calcPr); }
  calcPr.setAttribute("fullCalcOnLoad", "1");
  if (zip.has("xl/calcChain.xml")) {
    zip.remove("xl/calcChain.xml");
    for (const r of [...rels.getElementsByTagName("Relationship")]) if (/calcChain$/.test(r.getAttribute("Type"))) r.parentNode.removeChild(r);
    for (const o of [...ct.getElementsByTagName("Override")]) if (o.getAttribute("PartName") === "/xl/calcChain.xml") o.parentNode.removeChild(o);
  }
  // 문서 속성의 시트 이름 목록은 더 이상 맞지 않으므로 지움 (엑셀이 저장할 때 다시 만듦)
  if (zip.has("docProps/app.xml")) {
    const app = parse(await zip.text("docProps/app.xml"));
    for (const tag of ["HeadingPairs", "TitlesOfParts"]) for (const e of [...app.getElementsByTagName("*")].filter(e => e.localName === tag)) e.parentNode.removeChild(e);
    zip.put("docProps/app.xml", ser(app));
  }
  zip.put("xl/workbook.xml", ser(wb));
  zip.put("xl/_rels/workbook.xml.rels", ser(rels));
  zip.put("[Content_Types].xml", ser(ct));
  const { writeZip } = await import("./export-xlsx.js");
  return { blob: await writeZip(zip), names };
}
