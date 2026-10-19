// 직영실행 → 엑셀 양식에 그대로 채워 넣기
// 사용자가 고른 '양식 엑셀(.xlsx)'을 열어 값이 들어가는 칸만 바꾸고, 나머지(서식·병합·인쇄설정·그림·수식)는 손대지 않는다.
//  - 수식은 그대로 두고, 단가처럼 수식 안에 들어 있는 숫자만 바꾼다 (예: =SUM(AI5*160000) → =SUM(AI5*170000))
//  - 시트끼리 칸 위치로 연결돼 있으므로(노무비명세서 8행 = 인건비 5행 …) 사람 순서를 시트마다 똑같이 맞춘다
//  - 바뀐 값으로 수식 결과도 다시 계산해 넣고, 엑셀이 열 때 한 번 더 계산하도록 표시한다
// 외부 라이브러리 없이 브라우저 기본 기능만 사용.

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const XMLNS = "http://www.w3.org/XML/1998/namespace";

/* ================= zip 읽기 · 쓰기 ================= */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const stream = (u8, t) => new Response(new Blob([u8]).stream().pipeThrough(t)).arrayBuffer().then(b => new Uint8Array(b));

async function readZip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("엑셀(.xlsx) 파일이 아닙니다. 예전 형식(.xls)이면 엑셀에서 '다른 이름으로 저장 → Excel 통합 문서(.xlsx)'로 저장한 파일을 골라 주세요.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("손상된 엑셀 파일입니다.");
    const e = {
      flag: dv.getUint16(p + 8, true), method: dv.getUint16(p + 10, true), time: dv.getUint16(p + 12, true), date: dv.getUint16(p + 14, true),
      crc: dv.getUint32(p + 16, true), csize: dv.getUint32(p + 20, true), usize: dv.getUint32(p + 24, true),
    };
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    e.nameBytes = u8.slice(p + 46, p + 46 + nlen); e.name = dec.decode(e.nameBytes);
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    e.raw = u8.subarray(start, start + e.csize);
    entries.push(e);
    p += 46 + nlen + xlen + clen;
  }
  const byName = Object.fromEntries(entries.map(e => [e.name, e]));
  const bytes = async name => { const e = byName[name]; if (!e) return null; if (e.repl) return e.repl; return e.method === 0 ? e.raw : stream(e.raw, new DecompressionStream("deflate-raw")); };
  return {
    entries, has: n => !!byName[n],
    text: async n => { const b = await bytes(n); return b ? dec.decode(b) : null; },
    put: (n, str) => { const e = byName[n]; if (!e) throw new Error("없는 파일: " + n); e.repl = new TextEncoder().encode(str); },
    remove: n => { const i = entries.findIndex(e => e.name === n); if (i >= 0) { entries.splice(i, 1); delete byName[n]; } },
    bytes,
    // 새 파일 추가 (글자 또는 바이트)
    add: (n, data) => {
      const nb = new TextEncoder().encode(n), d = new Date();
      const e = { flag: 0, method: 8, time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
        crc: 0, csize: 0, usize: 0, nameBytes: nb, name: n, raw: new Uint8Array(0), repl: typeof data === "string" ? new TextEncoder().encode(data) : data };
      entries.push(e); byName[n] = e;
    },
  };
}

async function writeZip(zip) {
  const parts = [], central = []; let off = 0;
  for (const e of zip.entries) {
    let { raw, crc, csize, usize, method } = e;
    if (e.repl) { usize = e.repl.length; crc = crc32(e.repl); raw = await stream(e.repl, new CompressionStream("deflate-raw")); csize = raw.length; method = 8; }
    const flag = e.flag & ~0x0008;   // 데이터 설명자 없이 크기를 머리에 직접 기록
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, flag, true); lh.setUint16(8, method, true);
    lh.setUint16(10, e.time, true); lh.setUint16(12, e.date, true); lh.setUint32(14, crc, true); lh.setUint32(18, csize, true); lh.setUint32(22, usize, true);
    lh.setUint16(26, e.nameBytes.length, true); lh.setUint16(28, 0, true);
    parts.push(lh.buffer, e.nameBytes, raw);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, flag, true); ch.setUint16(10, method, true);
    ch.setUint16(12, e.time, true); ch.setUint16(14, e.date, true); ch.setUint32(16, crc, true); ch.setUint32(20, csize, true); ch.setUint32(24, usize, true);
    ch.setUint16(28, e.nameBytes.length, true); ch.setUint32(42, off, true);
    central.push(ch.buffer, e.nameBytes);
    off += 30 + e.nameBytes.length + raw.length;
  }
  const csz = central.reduce((a, b) => a + b.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, zip.entries.length, true); end.setUint16(10, zip.entries.length, true);
  end.setUint32(12, csz, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, end.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/* ================= 셀 주소 ================= */
const colNum = s => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; };          // A → 1
const colName = n => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };
const splitRef = ref => { const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref); return m ? { c: colNum(m[1]), r: +m[2] } : null; };
const A = (c, r) => colName(c) + r;

// 공유 수식을 다른 칸으로 옮길 때 상대 주소를 밀기
function shiftFormula(f, dr, dc) {
  return f.split(/("(?:[^"]|"")*")/).map((part, i) => i % 2 ? part : part.replace(
    /((?:'(?:[^']|'')+'|[^\s!(),:+\-*/^&=<>"';{}]+)!)?(?<![A-Za-z0-9_.$])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_])/g,
    (m, sh, d1, col, d2, row) => (sh || "") + d1 + (d1 ? col : colName(colNum(col) + dc)) + d2 + (d2 ? row : +row + dr))).join("");
}

/* ================= 시트 ================= */
class Sheet {
  constructor(name, path, doc, shared, sharedSi = []) {
    this.name = name; this.path = path; this.doc = doc; this.shared = shared; this.sharedSi = sharedSi; this.dirty = false;
    this.sd = doc.getElementsByTagNameNS(NS, "sheetData")[0];
    this.rows = new Map();
    for (const row of this.sd.getElementsByTagNameNS(NS, "row")) {
      const cells = new Map();
      for (const c of row.getElementsByTagNameNS(NS, "c")) { const p = splitRef(c.getAttribute("r")); if (p) cells.set(p.c, c); }
      this.rows.set(+row.getAttribute("r"), { el: row, cells });
    }
    this.expandShared();
  }
  expandShared() {
    const masters = {};
    for (const { cells } of this.rows.values()) for (const c of cells.values()) {
      const f = c.getElementsByTagNameNS(NS, "f")[0];
      if (f?.getAttribute("t") === "shared" && f.getAttribute("ref") && f.textContent) masters[f.getAttribute("si")] = { f: f.textContent, ...splitRef(c.getAttribute("r")) };
    }
    for (const { cells } of this.rows.values()) for (const c of cells.values()) {
      const f = c.getElementsByTagNameNS(NS, "f")[0];
      if (f?.getAttribute("t") !== "shared") continue;
      const m = masters[f.getAttribute("si")], p = splitRef(c.getAttribute("r"));
      if (m && !f.textContent) f.textContent = shiftFormula(m.f, p.r - m.r, p.c - m.c);
      f.removeAttribute("t"); f.removeAttribute("si"); f.removeAttribute("ref");
      this.dirty = true;
    }
  }
  cell(c, r) { return this.rows.get(r)?.cells.get(c) || null; }
  formula(c, r) { const el = this.cell(c, r); return el?.getElementsByTagNameNS(NS, "f")[0]?.textContent ?? null; }
  raw(c, r) {   // 칸의 값 (수식이면 저장돼 있던 결과)
    const el = this.cell(c, r); if (!el) return null;
    const t = el.getAttribute("t"), v = el.getElementsByTagNameNS(NS, "v")[0]?.textContent;
    if (t === "s") return this.shared[+v] ?? "";
    if (t === "inlineStr") return [...el.getElementsByTagNameNS(NS, "t")].map(x => x.textContent).join("");
    if (t === "str" || t === "e") return v ?? "";
    if (t === "b") return v === "1";
    return v == null || v === "" ? null : Number(v);
  }
  text(c, r) { const v = this.raw(c, r); return v == null ? "" : String(v).trim(); }
  ensure(c, r, styleFrom) {
    let row = this.rows.get(r);
    if (!row) {
      const el = this.doc.createElementNS(NS, "row"); el.setAttribute("r", r);
      const after = [...this.rows.keys()].filter(k => k > r).sort((a, b) => a - b)[0];
      this.sd.insertBefore(el, after ? this.rows.get(after).el : null);
      row = { el, cells: new Map() }; this.rows.set(r, row);
    }
    let cel = row.cells.get(c);
    if (!cel) {
      cel = this.doc.createElementNS(NS, "c"); cel.setAttribute("r", A(c, r));
      const s = styleFrom?.getAttribute("s"); if (s) cel.setAttribute("s", s);
      const after = [...row.cells.keys()].filter(k => k > c).sort((a, b) => a - b)[0];
      row.el.insertBefore(cel, after ? row.cells.get(after) : null);
      row.cells.set(c, cel); row.el.removeAttribute("spans");
    }
    return cel;
  }
  empty(cel) { while (cel.firstChild) cel.removeChild(cel.firstChild); cel.removeAttribute("t"); }
  set(c, r, val, styleFrom) {   // 숫자 · 글자 · null(지우기)
    if (val === "" || val == null) { const el = this.cell(c, r); if (el && (el.firstChild || el.getAttribute("t"))) { this.empty(el); this.dirty = true; } return; }
    const el = this.ensure(c, r, styleFrom); this.empty(el);
    if (typeof val === "number") { const v = this.doc.createElementNS(NS, "v"); v.textContent = String(val); el.append(v); }
    else { el.setAttribute("t", "inlineStr"); const is = this.doc.createElementNS(NS, "is"), t = this.doc.createElementNS(NS, "t"); t.setAttributeNS(XMLNS, "xml:space", "preserve"); t.textContent = String(val); is.append(t); el.append(is); }
    this.dirty = true;
  }
  setFormula(c, r, f, styleFrom) {
    const el = this.ensure(c, r, styleFrom); this.empty(el);
    const fe = this.doc.createElementNS(NS, "f"); fe.textContent = f.replace(/^=/, ""); el.append(fe);
    this.dirty = true;
  }
  // 서식 있는 글자(한 칸 안에서 일부만 굵게·빨강 등)를 조각 단위로 읽고 쓰기
  runs(c, r) {
    const el = this.cell(c, r); if (!el) return [];
    const t = el.getAttribute("t");
    let box = null;
    if (t === "s") box = this.sharedSi[+(el.getElementsByTagNameNS(NS, "v")[0]?.textContent)];
    else if (t === "inlineStr") box = el.getElementsByTagNameNS(NS, "is")[0];
    if (!box) { const v = this.raw(c, r); return v == null ? [] : [{ rPr: null, t: String(v) }]; }
    const rs = [...box.childNodes].filter(n => n.localName === "r");
    if (!rs.length) { const tt = [...box.childNodes].find(n => n.localName === "t"); return [{ rPr: null, t: tt ? tt.textContent : "" }]; }
    return rs.map(rn => ({ rPr: [...rn.childNodes].find(n => n.localName === "rPr") || null, t: [...rn.childNodes].filter(n => n.localName === "t").map(x => x.textContent).join("") }));
  }
  setRuns(c, r, runs) {
    runs = runs.filter(x => x.t !== "");
    if (!runs.some(x => x.rPr)) return this.set(c, r, runs.map(x => x.t).join("") || null);
    const el = this.ensure(c, r); this.empty(el);
    el.setAttribute("t", "inlineStr");
    const is = this.doc.createElementNS(NS, "is");
    for (const x of runs) {
      const rn = this.doc.createElementNS(NS, "r");
      if (x.rPr) rn.append(this.doc.importNode(x.rPr, true));
      const te = this.doc.createElementNS(NS, "t"); te.setAttributeNS(XMLNS, "xml:space", "preserve"); te.textContent = x.t; rn.append(te);
      is.append(rn);
    }
    el.append(is); this.dirty = true;
  }
  // 글자 바꾸기: 바뀐 부분이 시작하는 조각의 서식을 그대로 이어받음 (나머지 조각 서식은 그대로)
  editText(c, r, fn) {
    const runs = this.runs(c, r).map(x => ({ ...x })); if (!runs.length) return false;
    const before = runs.map(x => x.t).join("");
    const ops = []; fn({ replace: (re, rep) => ops.push([re, rep]), append: s => ops.push([null, s]) });
    for (const [re, repl] of ops) {
      if (!re) { runs[runs.length - 1].t += repl; continue; }
      const full = runs.map(x => x.t).join("");
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      const ms = [...full.matchAll(g)].reverse();
      for (const m of ms) {
        const a = m.index, b = a + m[0].length, rep = typeof repl === "function" ? repl(...m) : m[0].replace(new RegExp(re.source, re.flags.replace("g", "")), repl);
        // a~b 를 지우고 a 자리에 rep 를 넣음
        let pos = 0, put = false;
        for (let i = 0; i < runs.length; i++) {
          const x = runs[i], s0 = pos, e0 = pos + x.t.length; pos = e0;
          const ds = Math.max(a, s0), de = Math.min(b, e0);
          let txt = x.t;
          if (!put && a >= s0 && (a < e0 || (a === e0 && i === runs.length - 1) || (a === e0 && b === a && false))) { txt = txt.slice(0, a - s0) + rep + txt.slice(Math.max(a, Math.min(b, e0)) - s0); put = true; x.t = txt; continue; }
          if (de > ds) x.t = txt.slice(0, ds - s0) + txt.slice(de - s0);
        }
        if (!put) runs[runs.length - 1].t += rep;
      }
    }
    const after = runs.map(x => x.t).join("");
    if (after === before) return false;
    this.setRuns(c, r, runs); return true;
  }
  each(fn) { for (const [r, { cells }] of this.rows) for (const c of cells.keys()) fn(c, r); }
  find(test, maxRow = 1e9) { let hit = null; this.each((c, r) => { if (!hit && r <= maxRow && test(this.text(c, r), c, r)) hit = { c, r }; }); return hit; }
  mergeRefs() { const m = this.doc.getElementsByTagNameNS(NS, "mergeCells")[0]; return m ? [...m.getElementsByTagNameNS(NS, "mergeCell")] : []; }
  setMerges(removeTest, add) {
    let mc = this.doc.getElementsByTagNameNS(NS, "mergeCells")[0];
    if (!mc && add.length) { mc = this.doc.createElementNS(NS, "mergeCells"); this.sd.after(mc); }
    if (!mc) return;
    for (const m of [...mc.getElementsByTagNameNS(NS, "mergeCell")]) if (removeTest(m.getAttribute("ref"))) mc.removeChild(m);
    for (const ref of add) { const m = this.doc.createElementNS(NS, "mergeCell"); m.setAttribute("ref", ref); mc.append(m); }
    mc.setAttribute("count", mc.getElementsByTagNameNS(NS, "mergeCell").length);
    this.dirty = true;
  }
}

/* ================= 수식 다시 계산 (이 양식에 쓰이는 정도: + − × ÷, SUM 등) ================= */
class Calc {
  constructor(book) { this.book = book; this.memo = new Map(); this.busy = new Set(); }
  async value(sheet, c, r) {
    const key = sheet.name + "!" + c + "," + r;
    if (this.memo.has(key)) return this.memo.get(key);
    const f = sheet.formula(c, r);
    if (f == null) { const v = sheet.raw(c, r); return v; }
    if (this.busy.has(key)) throw new Error("순환 참조");
    this.busy.add(key);
    try { const v = await this.evalFormula(f, sheet); this.memo.set(key, v); return v; }
    finally { this.busy.delete(key); }
  }
  async evalFormula(f, sheet) {
    const toks = []; const re = /\s+|("(?:[^"]|"")*")|((?:(?:'(?:[^']|'')+'|[^\s!(),:+\-*/^&=<>"';{}]+)!)?\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)(?![\d(A-Za-z_])|(\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?)|([A-Z][A-Z0-9.]*)\(|(<>|<=|>=|[-+*/^&(),=<>%])/y;
    let m; re.lastIndex = 0;
    while (re.lastIndex < f.length) {
      const at = re.lastIndex; m = re.exec(f);
      if (!m || m.index !== at) throw new Error("모르는 수식: " + f);
      if (m[1]) toks.push({ k: "s", v: m[1].slice(1, -1).replace(/""/g, '"') });
      else if (m[2]) toks.push({ k: "ref", v: m[2] });
      else if (m[3]) toks.push({ k: "n", v: +m[3] });
      else if (m[4]) toks.push({ k: "fn", v: m[4] });
      else if (m[5]) toks.push({ k: "op", v: m[5] });
    }
    let i = 0; const peek = () => toks[i], next = () => toks[i++];
    const self = this;
    const resolve = async ref => {
      let sh = sheet, a = ref; const bang = ref.lastIndexOf("!");
      if (bang >= 0) { const nm = ref.slice(0, bang).replace(/^'|'$/g, "").replace(/''/g, "'"); sh = await self.book.sheet(nm); a = ref.slice(bang + 1); if (!sh) throw new Error("없는 시트: " + nm); }
      const [p, q] = a.split(":").map(x => splitRef(x));
      if (!q) return { sh, one: p };
      return { sh, range: [Math.min(p.c, q.c), Math.min(p.r, q.r), Math.max(p.c, q.c), Math.max(p.r, q.r)] };
    };
    const vals = async t => { const R = await resolve(t.v); if (R.one) return [await self.value(R.sh, R.one.c, R.one.r)]; const out = []; const [c1, r1, c2, r2] = R.range; for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(await self.value(R.sh, c, r)); return out; };
    const num = v => { if (v == null || v === "") return 0; if (typeof v === "number") return v; if (typeof v === "boolean") return +v; const n = Number(String(v).replace(/,/g, "")); if (isFinite(n)) return n; throw new Error("#VALUE!"); };
    const FN = {
      SUM: a => a.flat().filter(v => typeof v === "number").reduce((x, y) => x + y, 0),
      MAX: a => Math.max(...a.flat().filter(v => typeof v === "number"), 0), MIN: a => { const n = a.flat().filter(v => typeof v === "number"); return n.length ? Math.min(...n) : 0; },
      ROUND: a => { const k = 10 ** num(a[1]?.[0] ?? 0); return Math.round(num(a[0][0]) * k) / k; },
      ROUNDDOWN: a => { const k = 10 ** num(a[1]?.[0] ?? 0); return Math.trunc(num(a[0][0]) * k) / k; },
      ROUNDUP: a => { const k = 10 ** num(a[1]?.[0] ?? 0); const x = num(a[0][0]) * k; return (x < 0 ? Math.floor(x) : Math.ceil(x)) / k; },
      INT: a => Math.floor(num(a[0][0])), TRUNC: a => Math.trunc(num(a[0][0])), ABS: a => Math.abs(num(a[0][0])),
      COUNT: a => a.flat().filter(v => typeof v === "number").length, COUNTA: a => a.flat().filter(v => v != null && v !== "").length,
    };
    async function primary() {
      const t = next(); if (!t) throw new Error("수식 끝");
      if (t.k === "n") return t.v;
      if (t.k === "s") return t.v;
      if (t.k === "ref") { const v = await vals(t); return v.length === 1 ? v[0] : v; }
      if (t.k === "fn") {
        const fn = FN[t.v]; if (!fn) throw new Error("지원하지 않는 함수 " + t.v);
        const args = [];
        if (!(peek()?.k === "op" && peek().v === ")")) {
          do { if (peek()?.k === "ref" && (toks[i + 1]?.v === "," || toks[i + 1]?.v === ")")) args.push(await vals(next())); else args.push([await expr()]); }
          while (peek()?.v === "," && next());
        }
        if (next()?.v !== ")") throw new Error("괄호");
        return fn(args);
      }
      if (t.v === "(") { const v = await expr(); if (next()?.v !== ")") throw new Error("괄호"); return v; }
      if (t.v === "-") return -num(await primary());
      if (t.v === "+") return num(await primary());
      throw new Error("모르는 기호 " + t.v);
    }
    async function power() { let a = await primary(); while (peek()?.v === "%") { next(); a = num(a) / 100; } while (peek()?.v === "^") { next(); a = num(a) ** num(await primary()); } return a; }
    async function term() { let a = await power(); while (peek()?.v === "*" || peek()?.v === "/") { const o = next().v, b = await power(); a = o === "*" ? num(a) * num(b) : num(a) / num(b); } return a; }
    async function sum() { let a = await term(); while (peek()?.v === "+" || peek()?.v === "-") { const o = next().v, b = await term(); a = o === "+" ? num(a) + num(b) : num(a) - num(b); } return a; }
    async function expr() { let a = await sum(); while (peek()?.v === "&") { next(); a = String(a ?? "") + String(await sum() ?? ""); } return a; }
    const v = await expr();
    if (i < toks.length) throw new Error("모르는 수식: " + f);
    return Array.isArray(v) ? v[0] : v;
  }
  // 수식 칸에 계산 결과 저장 (계산 못 한 칸은 결과를 비워 두고 엑셀이 열 때 계산)
  async writeBack(sheet) {
    const cells = []; sheet.each((c, r) => { if (sheet.formula(c, r) != null) cells.push([c, r]); });
    let fail = 0;
    for (const [c, r] of cells) {
      const el = sheet.cell(c, r), f = el.getElementsByTagNameNS(NS, "f")[0];
      let v; try { v = await this.value(sheet, c, r); } catch { v = undefined; fail++; }
      for (const x of [...el.getElementsByTagNameNS(NS, "v")]) el.removeChild(x);
      el.removeAttribute("t");
      if (v === undefined) continue;
      const ve = sheet.doc.createElementNS(NS, "v");
      if (typeof v === "string") { el.setAttribute("t", "str"); ve.textContent = v; }
      else if (typeof v === "boolean") { el.setAttribute("t", "b"); ve.textContent = v ? "1" : "0"; }
      else ve.textContent = String(v == null ? 0 : Math.round(v * 1e9) / 1e9);
      f.after(ve);
    }
    sheet.dirty = true;
    return fail;
  }
}

/* ================= 통합 문서 ================= */
async function openBook(buf) {
  const zip = await readZip(buf);
  const parse = s => new DOMParser().parseFromString(s, "application/xml");
  const wb = parse(await zip.text("xl/workbook.xml"));
  const rels = parse(await zip.text("xl/_rels/workbook.xml.rels"));
  const relMap = Object.fromEntries([...rels.getElementsByTagName("Relationship")].map(r => [r.getAttribute("Id"), r.getAttribute("Target")]));
  const ssText = await zip.text("xl/sharedStrings.xml");
  const sharedSi = ssText ? [...parse(ssText).getElementsByTagNameNS(NS, "si")] : [];
  const shared = ssText ? sharedSi.map(si => [...si.getElementsByTagNameNS(NS, "t")].filter(t => t.parentNode.localName !== "rPh").map(t => t.textContent).join("")) : [];
  const list = [...wb.getElementsByTagNameNS(NS, "sheet")].map(s => {
    const rid = [...s.attributes].find(a => a.localName === "id").value; let t = relMap[rid];
    t = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, "");
    return { name: s.getAttribute("name"), path: t };
  });
  const cache = {};
  const book = {
    zip, wb, rels, list, shared, sharedSi,
    names: list.map(s => s.name),
    async sheet(name) {
      if (cache[name]) return cache[name];
      const it = list.find(s => s.name === name); if (!it) return null;
      return (cache[name] = new Sheet(name, it.path, parse(await zip.text(it.path)), shared, sharedSi));
    },
    find(test) { return list.find(s => test(s.name.replace(/\s+/g, "")))?.name || null; },
    loaded: () => Object.values(cache),
    async save() {
      const ser = new XMLSerializer(), head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
      const out = d => head + ser.serializeToString(d).replace(/^<\?xml[^>]*\?>\s*/, "");
      for (const s of Object.values(cache)) if (s.dirty) zip.put(s.path, out(s.doc));
      // 엑셀이 열 때 모든 수식을 다시 계산하도록
      let calcPr = wb.getElementsByTagNameNS(NS, "calcPr")[0];
      if (!calcPr) { calcPr = wb.createElementNS(NS, "calcPr"); const after = wb.getElementsByTagNameNS(NS, "definedNames")[0] || wb.getElementsByTagNameNS(NS, "sheets")[0]; after.after(calcPr); }
      calcPr.setAttribute("fullCalcOnLoad", "1");
      // 계산 순서 기록(calcChain)은 수식 칸이 바뀌면 오류가 나므로 지우고 엑셀이 새로 만들게 함
      if (zip.has("xl/calcChain.xml")) {
        zip.remove("xl/calcChain.xml");
        for (const r of [...rels.getElementsByTagName("Relationship")]) if (/calcChain$/.test(r.getAttribute("Type"))) r.parentNode.removeChild(r);
        zip.put("xl/_rels/workbook.xml.rels", out(rels));
        const ct = parse(await zip.text("[Content_Types].xml"));
        for (const o of [...ct.getElementsByTagName("Override")]) if (o.getAttribute("PartName") === "/xl/calcChain.xml") o.parentNode.removeChild(o);
        zip.put("[Content_Types].xml", out(ct));
      }
      zip.put("xl/workbook.xml", out(wb));
      return writeZip(zip);
    },
  };
  return book;
}

/* ================= 시트별 채우기 ================= */
const K = s => String(s ?? "").replace(/\s+/g, "");
const isNum = v => typeof v === "number" || /^\d+$/.test(String(v ?? "").trim());
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const sumD = o => Object.values(o || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const N = v => v == null || v === "" ? null : Number(v);
const rng = rows => { const out = []; let a = rows[0], b = rows[0]; for (const r of rows.slice(1)) { if (r === b + 1 || r === b + 2) b = r; else { out.push(a === b ? a : `${a}~${b}`); a = b = r; } } out.push(a === b ? a : `${a}~${b}`); return out.join(", "); };

// 1,2,3,… 이 이어지는 머리글 줄
function dayHeader(sh, minLen = 28) {
  let hit = null;
  sh.each((c, r) => {
    if (hit || sh.raw(c, r) !== 1 && sh.text(c, r) !== "1") return;
    let k = 0; while (Number(sh.text(c + k, r)) === k + 1) k++;
    if (k >= minLen) hit = { r, c, len: k };
  });
  return hit;
}
const label = (sh, re, maxRow) => sh.find(t => re.test(K(t)), maxRow);
function writeDays(sh, ym, numRow, wdRow, c0) {
  const [y, m] = ym.split("-").map(Number), last = new Date(y, m, 0).getDate();
  const style = sh.cell(c0, numRow), wst = wdRow ? sh.cell(c0, wdRow) : null;
  for (let d = 1; d <= 31; d++) {
    sh.set(c0 + d - 1, numRow, d <= last ? d : null, style);
    if (wdRow) sh.set(c0 + d - 1, wdRow, d <= last ? WD[new Date(y, m - 1, d).getDay()] : null, wst);
  }
}
function replaceMonthLabels(sh, ym, maxRow) {
  const [y, m] = ym.split("-").map(Number);
  sh.each((c, r) => {
    if (r > maxRow || sh.formula(c, r) != null) return;
    const t = sh.text(c, r); if (!t) return;
    if (/^\d{1,2}\s*월$/.test(t)) sh.editText(c, r, e => e.replace(/\d{1,2}\s*월/, () => `${m}월`));
    else if (/\(\s*\d{4}\s*년\s*\d{1,2}\s*월\s*\)/.test(t)) sh.editText(c, r, e => e.replace(/\(\s*\d{4}\s*년\s*\d{1,2}\s*월\s*\)/, () => `( ${y}년 ${m}월 )`));
  });
}
const setMult = (f, n) => /\*\s*[\d.]+/.test(f) ? f.replace(/\*\s*[\d.]+/, "*" + n) : f;

async function fillLabor(book, D, notes) {
  const name = book.find(n => n === "인건비") || book.find(n => n.includes("인건비"));
  if (!name) { notes.push("⚠ '인건비' 시트가 없어 건너뜀"); return null; }
  const sh = await book.sheet(name);
  const h = dayHeader(sh); if (!h) { notes.push("⚠ 인건비: 날짜 머리글(1,2,3…)을 찾지 못해 건너뜀"); return null; }
  const cName = label(sh, /^성명$/, h.r)?.c, cTeam = label(sh, /^소속$/, h.r)?.c, cDays = label(sh, /일수/, h.r)?.c, cAmt = label(sh, /^금액$/, h.r)?.c, cMemo = label(sh, /^비고$/, h.r)?.c;
  const wdRow = WD.includes(sh.text(h.c, h.r + 1)) ? h.r + 1 : null;
  const slots = []; for (let r = (wdRow || h.r) + 1; ; r++) { if (!isNum(sh.raw(1, r))) { if (slots.length) break; if (r > h.r + 10) break; continue; } slots.push(r); }
  const people = D.labor;
  if (people.length > slots.length) throw new Error(`인건비: 사람이 ${people.length}명인데 양식 칸은 ${slots.length}줄입니다. 양식 칸을 늘린 엑셀을 골라 주세요.`);
  replaceMonthLabels(sh, D.ym, h.r);
  writeDays(sh, D.ym, h.r, wdRow, h.c);
  const ref = slots[0], st = c => sh.cell(c, ref), added = [];
  slots.forEach((r, i) => {
    const p = people[i];
    sh.set(cTeam, r, p?.team || null, st(cTeam)); sh.set(cName, r, p?.name || null, st(cName));
    for (let d = 1; d <= 31; d++) sh.set(h.c + d - 1, r, p ? N(p.d?.[d]) : null, st(h.c + d - 1));
    if (cMemo) sh.set(cMemo, r, p?.memo || null, st(cMemo));
    if (!p) return;
    if (cDays && sh.formula(cDays, r) == null) { sh.setFormula(cDays, r, `SUM(${A(h.c, r)}:${A(h.c + 30, r)})`, st(cDays)); added.push(r); }
    if (cAmt && p.rate) {
      const f = sh.formula(cAmt, r);
      if (f == null) sh.setFormula(cAmt, r, `SUM(${A(cDays, r)}*${p.rate})`, st(cAmt));
      else if (f !== setMult(f, p.rate)) sh.setFormula(cAmt, r, setMult(f, p.rate), sh.cell(cAmt, r));
    }
  });
  if (added.length) notes.push(`인건비 ${rng(added)}행: 출역일수 수식(=SUM(${colName(h.c)}:${colName(h.c + 30)}))이 비어 있던 칸이라 위 칸과 같은 수식을 넣음`);
  // 합계 줄이 사람 수만큼 더하는지 확인
  const tot = slots.at(-1) + 1, tf = sh.formula(h.c, tot);
  const m = tf && /SUM\(\$?[A-Z]+\$?(\d+):\$?[A-Z]+\$?(\d+)\)/.exec(tf);
  if (m && people.length && slots[people.length - 1] > +m[2]) notes.push(`⚠ 인건비 합계 수식이 ${m[1]}~${m[2]}행만 더합니다. ${people.length}명이라 ${slots[people.length - 1]}행까지 사람이 있어 합계에서 빠지는 사람이 있습니다 (수식은 양식 그대로 둠).`);
  notes.push(`인건비: ${people.length}명 채움 (${slots.length}줄 중)`);
  return { sheet: name, slots, cName, cAmt };
}

async function fillPay(book, D, notes, L) {
  const name = book.find(n => n.includes("노무비명세서")); if (!name) return;
  const sh = await book.sheet(name);
  const hName = label(sh, /^성명$/, 10); if (!hName) { notes.push("⚠ 노무비명세서: 머리글을 찾지 못해 건너뜀"); return; }
  const col = re => label(sh, re, hName.r + 3)?.c;
  const cRrn = col(/주민/), cAddr = col(/^주소$/), cDay0 = col(/출역일자/), cCnt = col(/^출력일수$|일수/), cRate = col(/단가/), cTax = col(/갑근세|소득세/), cPen = col(/국민연금/), cEmp = col(/고용보험/), cSign = col(/영수인|연락처/);
  const slots = [];
  for (let r = hName.r + 3; r < hName.r + 3 + 400; r += 2) { const f = sh.formula(cCnt, r); if (f && /^SUM\([A-Z]+\d+:[A-Z]+\d+\)$/.test(f.replace(/\$/g, "")) && new RegExp(`${r + 1}\\)$`).test(f.replace(/\$/g, ""))) slots.push(r); else if (slots.length) break; }
  if (!slots.length) { notes.push("⚠ 노무비명세서: 사람 칸을 찾지 못해 건너뜀"); return; }
  const people = D.labor;
  if (people.length > slots.length) throw new Error(`노무비명세서: 사람이 ${people.length}명인데 양식 칸은 ${slots.length}명분입니다.`);
  replaceMonthLabels(sh, D.ym, hName.r);
  // 날짜 칸이 인건비 몇 행을 가리키는지: 첫 칸의 수식 '=인건비!D5' 에서 알아냄
  const f0 = sh.formula(cDay0, slots[0]) || "";
  const fm = /^(.*)!\$?([A-Z]+)\$?(\d+)$/.exec(f0);
  const lab = fm ? { sheet: fm[1], c: colNum(fm[2]), r: +fm[3] } : L ? { sheet: L.sheet, c: null, r: L.slots[0] } : null;
  const ref = slots[0], st = (c, k = 0) => sh.cell(c, ref + k), linkAdded = [];
  slots.forEach((r, i) => {
    const p = people[i], w = p ? D.workerOf(p) : null;
    sh.set(1, r, p?.name || null, st(1));
    const rrn = String(w?.rrn || "").split("-");
    sh.set(cRrn, r, p ? rrn[0] || null : null, st(cRrn)); sh.set(cRrn, r + 1, p ? rrn[1] || null : null, st(cRrn, 1));
    sh.set(cAddr, r, p ? w?.address || null : null, st(cAddr));
    sh.set(cRate, r, p ? N(p.rate) : null, st(cRate));
    if (cSign) sh.set(cSign, r, p ? w?.phone || null : null, st(cSign));
    const ded = p?.ded || {}, dv = k => p && Number(ded[k]) ? Number(ded[k]) : null;
    if (cTax) { sh.set(cTax, r, dv("tax"), st(cTax)); sh.set(cTax, r + 1, dv("res"), st(cTax, 1)); }
    if (cPen) { sh.set(cPen, r, dv("pen"), st(cPen)); sh.set(cPen, r + 1, dv("hea"), st(cPen, 1)); }
    if (cEmp) { sh.set(cEmp, r, dv("emp"), st(cEmp)); sh.set(cEmp, r + 1, dv("ltc"), st(cEmp, 1)); }
    // 날짜 연결 수식이 없는 칸(양식 끝부분)은 앞 칸과 같은 모양으로 넣어 줌
    if (p && lab?.c && sh.formula(cDay0, r) == null) {
      const lr = lab.r + i;
      for (let k = 0; k < 15; k++) sh.setFormula(cDay0 + k, r, `${lab.sheet}!${A(lab.c + k, lr)}`, st(cDay0 + k));
      for (let k = 0; k < 16; k++) sh.setFormula(cDay0 + k, r + 1, `${lab.sheet}!${A(lab.c + 15 + k, lr)}`, st(cDay0 + k, 1));
      linkAdded.push(r);
    }
  });
  if (linkAdded.length) notes.push(`노무비명세서 ${rng(linkAdded)}행: 인건비 출역일 연결 수식이 없던 칸이라 앞 칸과 같은 모양으로 넣음`);
  const noW = people.filter(p => !D.workerOf(p)?.rrn).map(p => p.name);
  if (noW.length) notes.push(`⚠ 노무비명세서: 주민번호가 없는 사람 ${noW.length}명 (${noW.slice(0, 8).join(", ")}${noW.length > 8 ? " …" : ""}) — 신분증·이수증·통장사본 탭에서 입력하세요.`);
  notes.push(`노무비명세서: ${people.length}명 채움 (${slots.length}명분 중)`);
}

async function fillMeal(book, D, notes) {
  const name = book.find(n => n === "식대" || n.includes("식대")); if (!name) return;
  const sh = await book.sheet(name);
  const h = dayHeader(sh); if (!h) { notes.push("⚠ 식대: 날짜 머리글을 찾지 못해 건너뜀"); return; }
  const cName = label(sh, /^이름$|^성명$/, h.r)?.c, cTeam = label(sh, /^소속$/, h.r)?.c, cSum = label(sh, /^합계$/, h.r)?.c, cAmt = label(sh, /^금액$/, h.r)?.c, cMemo = label(sh, /^비고$/, h.r)?.c;
  const kindCol = h.c - 1;
  const wdRow = WD.includes(sh.text(h.c, h.r + 1)) ? h.r + 1 : null;
  const slots = []; sh.each((c, r) => { if (c === kindCol && r > h.r && sh.text(c, r) === "조") slots.push(r); });
  slots.sort((a, b) => a - b);
  const people = D.meal;
  if (people.length > slots.length) throw new Error(`식대: 사람이 ${people.length}명인데 양식 칸은 ${slots.length}명분입니다.`);
  replaceMonthLabels(sh, D.ym, h.r);
  writeDays(sh, D.ym, h.r, wdRow, h.c);
  const ref = slots[0], st = (c, k = 0) => sh.cell(c, ref + k);
  slots.forEach((r, i) => {
    const p = people[i];
    sh.set(cName, r, p?.name || null, st(cName)); if (cTeam) sh.set(cTeam, r, p?.team || null, st(cTeam));
    for (let d = 1; d <= 31; d++) { sh.set(h.c + d - 1, r, p?.jo?.[d] ? 1 : null, st(h.c + d - 1)); sh.set(h.c + d - 1, r + 1, p?.jung?.[d] ? 1 : null, st(h.c + d - 1, 1)); }
    if (cMemo) sh.set(cMemo, r, p?.memo || null, st(cMemo));
    if (p && D.mealPrice && cAmt) { const f = sh.formula(cAmt, r); if (f && f !== setMult(f, D.mealPrice)) sh.setFormula(cAmt, r, setMult(f, D.mealPrice), sh.cell(cAmt, r)); }
    if (p && cSum && sh.formula(cSum, r) == null) sh.setFormula(cSum, r, `SUM(${A(h.c, r)}:${A(h.c + 30, r + 1)})`, st(cSum));
  });
  const tf = sh.formula(h.c, slots.at(-1) + 2), m = tf && /SUM\(\$?[A-Z]+\$?(\d+):/.exec(tf);
  if (m && +m[1] > slots[0] && people.length) notes.push(`⚠ 식대 소계 수식이 ${m[1]}행부터 더해서 맨 위 사람(${slots[0]}행)이 소계에서 빠집니다 (수식은 양식 그대로 둠).`);
  notes.push(`식대: ${people.length}명 채움 (${slots.length}명분 중)`);
}

async function fillExec(book, D, notes, L) {
  const name = book.find(n => n.includes("실행내역서")); if (!name) return;
  const sh = await book.sheet(name);
  const hdr = label(sh, /^연번$/, 15); if (!hdr) { notes.push("⚠ 실행내역서: 머리글을 찾지 못해 건너뜀"); return; }
  const col = re => label(sh, re, hdr.r)?.c;
  const cCat = col(/^품목$/), cVen = col(/^업체/), cSup = col(/^공급가/), cVat = col(/^부가세/), cNote = col(/^비고/);
  const slots = []; for (let r = hdr.r + 1; r < hdr.r + 500; r++) { if (isNum(sh.raw(hdr.c, r))) slots.push(r); else if (slots.length) break; }
  const rows = D.exec;
  if (rows.length > slots.length) throw new Error(`실행내역서: 행이 ${rows.length}개인데 양식 칸은 ${slots.length}줄입니다.`);
  // 제목·현장명
  sh.each((c, r) => {
    if (r >= hdr.r) return; const t = sh.text(c, r);
    if (/직영\s*실행/.test(t) && D.title) sh.editText(c, r, e => e.replace(/^[\s\S]*$/, () => D.title));
    else if (/^현장명\s*:/.test(t) && D.site) sh.editText(c, r, e => e.replace(/:[\s\S]*$/, () => `:  ${D.site}`));
  });
  // 인건비와 연결: 이름이 한 번만 나오는 사람은 금액을 '=인건비!AJ행' 수식으로
  const linkRow = {};
  if (L?.cAmt) { const cnt = {}; D.labor.forEach(p => cnt[p.name] = (cnt[p.name] || 0) + 1); D.labor.forEach((p, i) => { if (cnt[p.name] === 1) linkRow[p.name] = L.slots[i]; }); }
  const qs = s => /^[A-Za-z0-9_가-힣]+$/.test(s) ? s : `'${s.replace(/'/g, "''")}'`;
  const ref = slots[0], st = c => sh.cell(c, ref);
  // 품목 칸 병합: 같은 품목이 이어지면 하나로
  const groups = []; rows.forEach((x, i) => { const cat = x.cat || ""; if (i && cat && cat === (rows[i - 1].cat || "")) groups.at(-1).n++; else groups.push({ i, n: 1, cat }); });
  const top = new Set(groups.map(g => g.i));
  let linked = 0;
  slots.forEach((r, i) => {
    const x = rows[i];
    sh.set(cCat, r, x && top.has(i) ? x.cat || null : null, st(cCat));
    sh.set(cVen, r, x?.vendor || null, st(cVen));
    const lr = x && linkRow[(x.vendor || "").trim()];
    const lp = lr ? D.labor.find(p => p.name === (x.vendor || "").trim()) : null;
    const amt = lp ? sumD(lp.d) * (Number(lp.rate) || 0) : null;
    if (lr && (x.supply == null || Number(x.supply) === amt)) { sh.setFormula(cSup, r, `${qs(L.sheet)}!${A(L.cAmt, lr)}`, st(cSup)); linked++; }
    else sh.set(cSup, r, x ? N(x.supply) : null, st(cSup));
    sh.set(cVat, r, x ? N(x.vat) : null, st(cVat));
    sh.set(cNote, r, x?.note || null, st(cNote));
  });
  const inSlots = ref => { const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref); return m && colNum(m[1]) === cCat && colNum(m[3]) === cCat && +m[2] >= slots[0] && +m[4] <= slots.at(-1); };
  sh.setMerges(inSlots, groups.filter(g => g.n > 1).map(g => `${A(cCat, slots[g.i])}:${A(cCat, slots[g.i + g.n - 1])}`));
  notes.push(`실행내역서: ${rows.length}행 채움 (${slots.length}줄 중), 인건비와 수식 연결 ${linked}행`);
}

async function fillMat(book, D, notes) {
  const name = book.find(n => n === "자재구입"); if (!name) return;
  const sh = await book.sheet(name);
  const hdr = label(sh, /^연번$/, 10); if (!hdr) return;
  const col = re => label(sh, re, hdr.r)?.c;
  const cM = col(/^월$/), cD = col(/^일$/), cItem = col(/^내역$/), cAmt = col(/^금액$/), cNote = col(/^비고$/);
  const slots = []; for (let r = hdr.r + 1; r < hdr.r + 300; r++) { if (isNum(sh.raw(hdr.c, r))) slots.push(r); else if (slots.length) break; }
  if (D.mat.length > slots.length) throw new Error(`자재구입: ${D.mat.length}건인데 양식 칸은 ${slots.length}줄입니다.`);
  const st = c => sh.cell(c, slots[0]);
  slots.forEach((r, i) => {
    const x = D.mat[i];
    sh.set(cM, r, x ? N(x.mm) : null, st(cM)); sh.set(cD, r, x ? N(x.dd) : null, st(cD));
    sh.set(cItem, r, x?.item || null, st(cItem)); sh.set(cAmt, r, x ? N(x.amount) : null, st(cAmt)); if (cNote) sh.set(cNote, r, x?.note || null, st(cNote));
  });
  notes.push(`자재구입: ${D.mat.length}건 채움`);
}

/* ================= 신분증·이수증·통장사본 (인적사항 + 사진) ================= */
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const XDR_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const T_DRAWING = R_NS + "/drawing", T_IMAGE = R_NS + "/image";
const xmlEsc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const parseX = s => new DOMParser().parseFromString(s, "application/xml");
const serX = d => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + new XMLSerializer().serializeToString(d).replace(/^<\?xml[^>]*\?>\s*/, "");
const relsPath = p => p.replace(/([^/]+)$/, "_rels/$1.rels");
const resolve = (base, t) => { if (t.startsWith("/")) return t.slice(1); const a = base.split("/").slice(0, -1); for (const s of t.split("/")) { if (s === "..") a.pop(); else if (s !== ".") a.push(s); } return a.join("/"); };
const relTo = (from, to) => { const f = from.split("/").slice(0, -1), t = to.split("/"); let i = 0; while (i < f.length && f[i] === t[i]) i++; return [...f.slice(i).map(() => ".."), ...t.slice(i)].join("/"); };

// 열 너비(글자 수) → 픽셀. 기본 글꼴의 숫자 폭(맑은 고딕 11pt ≈ 8px, Calibri 11pt ≈ 7px)
async function sheetGeom(book, sh) {
  let mdw = 8;
  try {
    const st = parseX(await book.zip.text("xl/styles.xml"));
    const f = st.getElementsByTagNameNS(NS, "font")[0];
    const sz = Number(f?.getElementsByTagNameNS(NS, "sz")[0]?.getAttribute("val")) || 11;
    const nm = f?.getElementsByTagNameNS(NS, "name")[0]?.getAttribute("val") || "";
    mdw = Math.max(5, Math.round(sz * (/[가-힣]|malgun|gulim|dotum|batang/i.test(nm) ? 0.73 : 0.64)));
  } catch {}
  const fmt = sh.doc.getElementsByTagNameNS(NS, "sheetFormatPr")[0];
  const defW = Number(fmt?.getAttribute("defaultColWidth")) || (Number(fmt?.getAttribute("baseColWidth")) || 8) + 0.71;
  const defH = Number(fmt?.getAttribute("defaultRowHeight")) || 15;
  const cols = [...sh.doc.getElementsByTagNameNS(NS, "col")].map(c => ({ a: +c.getAttribute("min"), b: +c.getAttribute("max"), w: Number(c.getAttribute("width")), hid: ["1", "true"].includes(c.getAttribute("hidden")) }));
  const px = w => Math.trunc(((256 * w + Math.trunc(128 / mdw)) / 256) * mdw);
  const colEmu = c => { const k = cols.find(x => c >= x.a && c <= x.b); return k?.hid ? 0 : px(k && k.w ? k.w : defW) * 9525; };
  const rowEmu = r => { const el = sh.rows.get(r)?.el; if (el && ["1", "true"].includes(el.getAttribute("hidden"))) return 0; return Math.round((Number(el?.getAttribute("ht")) || defH) * 12700); };
  // 시작 칸(c0,r0) 왼쪽 위에서 dx,dy EMU 떨어진 곳 → (칸, 칸 안 위치)
  const walk = (start, d, size) => { let i = start; while (d > 0 && size(i) > 0 && d >= size(i)) { d -= size(i); i++; } return { i, off: Math.max(0, Math.round(d)) }; };
  return { colEmu, rowEmu, walk };
}

async function fillIds(book, D, notes) {
  const name = book.find(n => /신분증/.test(n));
  if (!name || !D.ids) return;
  if (!D.ids.length) { notes.push("신분증·이수증·통장사본: 이번 달 명단에 사람이 없어 양식 그대로 둡니다."); return; }
  const sh = await book.sheet(name);
  const merges = () => sh.mergeRefs().map(m => { const [a, b = a] = m.getAttribute("ref").split(":"); const p = splitRef(a), q = splitRef(b); return { c1: p.c, r1: p.r, c2: q.c, r2: q.r }; });
  const mergeAt = (c, r) => merges().find(m => c >= m.c1 && c <= m.c2 && r >= m.r1 && r <= m.r2);

  // 사람 한 명 칸 묶음: '성명' 글자가 있는 줄부터 다음 '성명' 줄 전까지
  const starts = []; sh.each((c, r) => { if (K(sh.text(c, r)) === "성명" && !starts.some(s => s.r === r)) starts.push({ r, c }); });
  starts.sort((a, b) => a.r - b.r);
  if (!starts.length) { notes.push("⚠ 신분증·이수증·통장사본: '성명' 칸을 찾지 못해 양식 그대로 둡니다."); return; }
  const span = starts.length > 1 ? starts[1].r - starts[0].r : 3;
  let maxRow = Math.max(...sh.rows.keys());
  const tailFree = maxRow <= starts.at(-1).r + span - 1;   // 묶음 아래에 다른 내용이 없으면 늘리거나 줄일 수 있음

  // 사람이 양식 묶음보다 많으면 마지막 묶음을 복사해 늘림
  let added = 0;
  if (D.ids.length > starts.length && tailFree) {
    const last = starts.at(-1).r, ms = merges().filter(m => m.r1 >= last && m.r2 < last + span);
    while (starts.length < D.ids.length) {
      const base = starts.at(-1).r + span;
      for (let k = 0; k < span; k++) {
        const src = sh.rows.get(last + k); if (!src) continue;
        const el = src.el.cloneNode(true); el.setAttribute("r", base + k);
        const cells = new Map();
        for (const c of el.getElementsByTagNameNS(NS, "c")) { const p = splitRef(c.getAttribute("r")); c.setAttribute("r", A(p.c, base + k)); cells.set(p.c, c); }
        sh.sd.append(el); sh.rows.set(base + k, { el, cells });
      }
      sh.setMerges(() => false, ms.map(m => `${A(m.c1, m.r1 - last + base)}:${A(m.c2, m.r2 - last + base)}`));
      starts.push({ r: base, c: starts.at(-1).c }); added++;
    }
    sh.dirty = true;
  }

  // 칸 찾기: 이름표 오른쪽(병합이면 병합 끝 다음) 칸이 값 칸
  const valueCell = (r0, re) => {
    for (let r = r0; r < r0 + span; r++) {
      const row = sh.rows.get(r); if (!row) continue;
      for (const c of [...row.cells.keys()].sort((a, b) => a - b)) if (re.test(K(sh.text(c, r)))) { const m = mergeAt(c, r); return { c: (m ? m.c2 : c) + 1, r }; }
    }
    return null;
  };
  const FIELDS = [["name", /^(성명|이름)$/], ["rrn", /^주민(등록)?번호$/], ["site", /^현장명?$/], ["address", /^주소$/], ["phone", /^(전화|연락처|휴대폰|핸드폰)(번호)?$/]];
  const b0 = Object.fromEntries(FIELDS.map(([k, re]) => [k, valueCell(starts[0].r, re)]));
  const siteText = b0.site ? sh.text(b0.site.c, b0.site.r) : "";
  const site = siteText || D.site || "";

  // 사진 칸: 묶음 안에서 가장 높은 줄, 그 줄의 병합 칸들(왼쪽부터 신분증 · 이수증 · 통장사본)
  const geo = await sheetGeom(book, sh);
  const areasOf = r0 => {
    let pr = r0, best = -1;
    for (let r = r0; r < r0 + span; r++) { const h = geo.rowEmu(r); if (h > best) { best = h; pr = r; } }
    let list = merges().filter(m => m.r1 <= pr && m.r2 >= pr && m.r1 >= r0 && m.r2 < r0 + span).sort((a, b) => a.c1 - b.c1);
    if (list.length < 3) {   // 병합이 없으면 이름표 줄 기준으로 나눔
      const nm = valueCell(r0, /^(성명|이름)$/), ph = valueCell(r0, /^(전화|연락처|휴대폰|핸드폰)(번호)?$/), rr = valueCell(r0, /^주민(등록)?번호$/), st = valueCell(r0, /^현장명?$/);
      const c0 = (nm?.c || 3) - 1, cR = (rr?.c || 6), cS = (st?.c || 10) - 1, cE = Math.max(ph?.c || 10, st?.c || 10);
      list = [{ c1: c0, c2: cR - 1, r1: pr, r2: pr }, { c1: cR, c2: cS - 1, r1: pr, r2: pr }, { c1: cS, c2: cE, r1: pr, r2: pr }];
    }
    return list.slice(0, 3);
  };

  // 글자 채우기
  starts.forEach((s, i) => {
    const p = D.ids[i];
    for (const [k, re] of FIELDS) {
      const at = valueCell(s.r, re); if (!at) continue;
      const v = !p ? null : k === "site" ? site : (p[k] || null);
      sh.set(at.c, at.r, v, sh.cell(at.c, at.r));
    }
  });

  // 남는 묶음은 지움 (아래에 다른 내용이 없을 때만)
  let removed = 0;
  if (starts.length > D.ids.length && tailFree) {
    const cut = starts[D.ids.length].r;
    for (const r of [...sh.rows.keys()].filter(r => r >= cut)) { sh.rows.get(r).el.remove(); sh.rows.delete(r); }
    sh.setMerges(ref => { const q = ref.split(":"); return q.some(x => splitRef(x).r >= cut); }, []);
    removed = starts.length - D.ids.length;
    starts.length = D.ids.length;
    // 인쇄 영역도 맞춤
    const sheetIdx = book.list.findIndex(s => s.name === name);
    for (const dn of book.wb.getElementsByTagNameNS(NS, "definedName")) {
      if (dn.getAttribute("name") === "_xlnm.Print_Area" && +dn.getAttribute("localSheetId") === sheetIdx)
        dn.textContent = dn.textContent.replace(/(\$?[A-Z]+\$?)(\d+)$/, (m, c, r) => +r >= cut ? c + (cut - 1) : m);
    }
    sh.dirty = true;
  }
  maxRow = Math.max(...sh.rows.keys());
  const dim = sh.doc.getElementsByTagNameNS(NS, "dimension")[0];
  if (dim) dim.setAttribute("ref", dim.getAttribute("ref").replace(/(\d+)$/, maxRow));

  /* ---- 그림 ---- */
  const zip = book.zip;
  const sRelP = relsPath(sh.path);
  let sRels = zip.has(sRelP) ? parseX(await zip.text(sRelP)) : null;
  let dEl = sh.doc.getElementsByTagNameNS(NS, "drawing")[0], drawPath = null;
  if (dEl && sRels) {
    const id = dEl.getAttributeNS(R_NS, "id");
    const rel = [...sRels.getElementsByTagNameNS(PKG_NS, "Relationship")].find(x => x.getAttribute("Id") === id);
    if (rel) drawPath = resolve(sh.path, rel.getAttribute("Target"));
  }
  const ct = parseX(await zip.text("[Content_Types].xml"));
  const CT_NS = ct.documentElement.namespaceURI;
  if (!drawPath) {   // 그림판이 없는 양식이면 새로 만듦
    let n = 1; while (zip.has(`xl/drawings/drawing${n}.xml`)) n++;
    drawPath = `xl/drawings/drawing${n}.xml`;
    zip.add(drawPath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<xdr:wsDr xmlns:xdr="${XDR_NS}" xmlns:a="${A_NS}"></xdr:wsDr>`);
    const o = ct.createElementNS(CT_NS, "Override"); o.setAttribute("PartName", "/" + drawPath); o.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.drawing+xml"); ct.documentElement.append(o);
    if (!sRels) { sRels = parseX(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_NS}"></Relationships>`); zip.add(sRelP, ""); }
    const ids = [...sRels.getElementsByTagNameNS(PKG_NS, "Relationship")].map(x => x.getAttribute("Id"));
    let k = 1; while (ids.includes("rId" + k)) k++;
    const rel = sRels.createElementNS(PKG_NS, "Relationship"); rel.setAttribute("Id", "rId" + k); rel.setAttribute("Type", T_DRAWING); rel.setAttribute("Target", relTo(sh.path, drawPath)); sRels.documentElement.append(rel);
    zip.put(sRelP, serX(sRels));
    dEl = sh.doc.createElementNS(NS, "drawing"); dEl.setAttributeNS(R_NS, "r:id", "rId" + k);
    const after = ["legacyDrawing", "legacyDrawingHF", "drawingHF", "picture", "oleObjects", "controls", "webPublishItems", "tableParts", "extLst"].map(t => sh.doc.getElementsByTagNameNS(NS, t)[0]).find(Boolean);
    sh.doc.documentElement.insertBefore(dEl, after || null); sh.dirty = true;
  }
  const dRelP = relsPath(drawPath);
  const dDoc = parseX(await zip.text(drawPath));
  const dRels = zip.has(dRelP) ? parseX(await zip.text(dRelP)) : parseX(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_NS}"></Relationships>`);
  if (!zip.has(dRelP)) zip.add(dRelP, "");

  // 예전 사람 사진(그림 개체)은 모두 빼고, 다른 곳에서 안 쓰는 그림 파일은 지움
  const root = dDoc.documentElement;
  const anchors = [...root.childNodes].filter(n => n.nodeType === 1 && /Anchor$/.test(n.localName));
  let oldPics = 0;
  for (const an of anchors) if (an.getElementsByTagNameNS(XDR_NS, "pic").length) { an.remove(); oldPics++; }
  const usedIds = new Set([...dDoc.getElementsByTagNameNS("*", "*")].flatMap(e => [...e.attributes].filter(a => a.namespaceURI === R_NS).map(a => a.value)));
  const gone = [];
  for (const rel of [...dRels.getElementsByTagNameNS(PKG_NS, "Relationship")]) if (rel.getAttribute("Type") === T_IMAGE && !usedIds.has(rel.getAttribute("Id"))) { gone.push(resolve(drawPath, rel.getAttribute("Target"))); rel.remove(); }
  if (gone.length) {
    const still = new Set();
    for (const e of zip.entries) if (/\.rels$/.test(e.name) && e.name !== dRelP) {
      const d = parseX(await zip.text(e.name)); const owner = e.name.replace(/_rels\/([^/]+)\.rels$/, "$1");
      for (const r of d.getElementsByTagNameNS(PKG_NS, "Relationship")) if (r.getAttribute("TargetMode") !== "External") still.add(resolve(owner, r.getAttribute("Target")));
    }
    for (const g of new Set(gone)) if (!still.has(g)) zip.remove(g);
  }

  // 새 사진 넣기: 칸 안에 비율 그대로, 가운데 맞춤
  if (![...ct.getElementsByTagNameNS(CT_NS, "Default")].some(d => d.getAttribute("Extension").toLowerCase() === "jpeg")) {
    const d = ct.createElementNS(CT_NS, "Default"); d.setAttribute("Extension", "jpeg"); d.setAttribute("ContentType", "image/jpeg"); ct.documentElement.insertBefore(d, ct.documentElement.firstChild);
  }
  const relIds = new Set([...dRels.getElementsByTagNameNS(PKG_NS, "Relationship")].map(x => x.getAttribute("Id")));
  let rk = 1, mk = 1, pid = 1 + Math.max(0, ...[...dDoc.getElementsByTagNameNS(XDR_NS, "cNvPr")].map(e => +e.getAttribute("id") || 0));
  const SLOT = ["신분증", "이수증", "통장사본"];
  let pics = 0; const noPhoto = [];
  const frag = [];
  starts.forEach((s, i) => {
    const p = D.ids[i]; if (!p) return;
    const areas = areasOf(s.r);
    const miss = [];
    SLOT.forEach((slot, j) => {
      const img = p.images?.[slot], ar = areas[j];
      if (!img || !ar) { miss.push(slot); return; }
      while (zip.has(`xl/media/jyid${mk}.jpeg`)) mk++;
      const media = `xl/media/jyid${mk++}.jpeg`;
      zip.add(media, img.bytes);
      while (relIds.has("rId" + rk)) rk++;
      const rid = "rId" + rk; relIds.add(rid);
      const rel = dRels.createElementNS(PKG_NS, "Relationship"); rel.setAttribute("Id", rid); rel.setAttribute("Type", T_IMAGE); rel.setAttribute("Target", relTo(drawPath, media)); dRels.documentElement.append(rel);
      // 칸 크기
      let aw = 0, ah = 0; for (let c = ar.c1; c <= ar.c2; c++) aw += geo.colEmu(c); for (let r = ar.r1; r <= ar.r2; r++) ah += geo.rowEmu(r);
      const pad = 6 * 9525, bw = Math.max(1, aw - 2 * pad), bh = Math.max(1, ah - 2 * pad);
      const k = Math.min(bw / img.w, bh / img.h), cx = Math.round(img.w * k), cy = Math.round(img.h * k);
      const x0 = Math.round((aw - cx) / 2), y0 = Math.round((ah - cy) / 2);
      const f = { c: geo.walk(ar.c1, x0, geo.colEmu), r: geo.walk(ar.r1, y0, geo.rowEmu) };
      const t = { c: geo.walk(ar.c1, x0 + cx, geo.colEmu), r: geo.walk(ar.r1, y0 + cy, geo.rowEmu) };
      const nm = xmlEsc(`${slot} ${p.name || ""}`.trim());
      frag.push(`<xdr:twoCellAnchor xmlns:xdr="${XDR_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}" editAs="oneCell">` +
        `<xdr:from><xdr:col>${f.c.i - 1}</xdr:col><xdr:colOff>${f.c.off}</xdr:colOff><xdr:row>${f.r.i - 1}</xdr:row><xdr:rowOff>${f.r.off}</xdr:rowOff></xdr:from>` +
        `<xdr:to><xdr:col>${t.c.i - 1}</xdr:col><xdr:colOff>${t.c.off}</xdr:colOff><xdr:row>${t.r.i - 1}</xdr:row><xdr:rowOff>${t.r.off}</xdr:rowOff></xdr:to>` +
        `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${pid++}" name="${nm}" descr="${nm}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
        `<xdr:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
        `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`);
      pics++;
    });
    if (miss.length) noPhoto.push(`${p.name}(${miss.join("·")})`);
  });
  for (const s of frag) root.append(dDoc.importNode(parseX(s).documentElement, true));
  zip.put(drawPath, serX(dDoc));
  zip.put(dRelP, serX(dRels));
  zip.put("[Content_Types].xml", serX(ct));

  notes.push(`신분증·이수증·통장사본: ${D.ids.length}명 인적사항 + 사진 ${pics}장 넣음` + (added ? ` (양식 칸이 모자라 ${added}명분 늘림)` : "") + (removed ? ` (남는 ${removed}칸 지움)` : "") + (oldPics ? `, 양식에 있던 예전 사진 ${oldPics}장 뺌` : ""));
  if (D.ids.length > starts.length) notes.push(`⚠ 신분증·이수증·통장사본: 양식 칸이 ${starts.length}명분이라 ${D.ids.length - starts.length}명은 넣지 못했습니다.`);
  if (noPhoto.length) notes.push(`사진이 없어 빈칸으로 둔 사람 ${noPhoto.length}명: ${noPhoto.slice(0, 12).join(", ")}${noPhoto.length > 12 ? ` 외 ${noPhoto.length - 12}명` : ""}`);
  if (D.idSkipped?.length) notes.push(`⚠ 사진으로 넣지 못한 파일: ${D.idSkipped.join(", ")}`);
}

/* ================= 공개 함수 ================= */
// D = { ym, title, site, mealPrice, exec:[{cat,vendor,supply,vat,note}], labor:[{team,name,rate,d,ded,memo}], meal:[{name,team,jo,jung,memo}], mat:[…], workerOf(p) }
export async function fillTemplate(file, D) {
  const notes = [];
  const book = await openBook(await file.arrayBuffer());
  const L = await fillLabor(book, D, notes);
  await fillPay(book, D, notes, L);
  await fillMeal(book, D, notes);
  await fillExec(book, D, notes, L);
  await fillMat(book, D, notes);
  await fillIds(book, D, notes);
  // 수식 결과 다시 계산 (수식이 있는 모든 시트)
  const calc = new Calc(book); let fail = 0;
  for (const s of book.list) {
    const sh = await book.sheet(s.name); let has = false; sh.each((c, r) => { if (!has && sh.formula(c, r) != null) has = true; });
    if (has) fail += await calc.writeBack(sh);
  }
  if (fail) notes.push(`수식 ${fail}칸은 엑셀이 파일을 열 때 계산합니다.`);
  notes.push(D.ids ? "자재 사진대지, 거래명세표·장비·주유 등 나머지 시트는 고른 양식 파일 그대로입니다." : "그림이 들어가는 시트(신분증·이수증·통장사본, 자재 사진대지, 거래명세표·장비·주유 등)는 고른 양식 파일 그대로입니다.");
  return { blob: await book.save(), notes, sheets: book.names };
}
export { shiftFormula as _shiftFormula, openBook, Calc, Sheet, readZip, writeZip, colNum, colName, splitRef, NS };
