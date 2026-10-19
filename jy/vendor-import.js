// 업체(인력사무소·협력사)에서 받은 인건비 정산 엑셀(.xlsx)을 읽어 사람별 출역일·공수·단가·금액을 뽑는다.
// 업체마다 양식이 달라도 동작하도록 칸 위치를 고정하지 않고
//  ① 1,2,3… 으로 이어지는 '날짜 머리글' 줄을 찾고 (한 줄 1~31 / 두 줄 1~15 + 16~31 모두 지원)
//  ② 그 위쪽의 제목 글자(성명·공수·단가·금액·소득세…)로 칸을 정하고
//  ③ 주민번호·전화번호·주소는 글자 모양으로 알아본다.
// 외부 라이브러리 없이 브라우저 기본 기능(압축 해제, XML 읽기)만 사용.

/* ---------- xlsx(zip) 풀기 ---------- */
async function unzip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("엑셀(.xlsx) 파일이 아닙니다. 예전 형식(.xls)이면 엑셀에서 '다른 이름으로 저장 → .xlsx'로 저장해 주세요.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    files[dec.decode(u8.subarray(p + 46, p + 46 + nlen))] = { method, csize, off };
    p += 46 + nlen + xlen + clen;
  }
  const read = async name => {
    const f = files[name]; if (!f) return null;
    const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
    const data = u8.slice(start, start + f.csize);
    if (f.method === 0) return data.buffer;
    if (f.method !== 8) throw new Error("지원하지 않는 압축 형식입니다.");
    return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
  };
  return { text: async n => { const b = await read(n); return b ? dec.decode(b) : null; } };
}
const xml = s => new DOMParser().parseFromString(s, "application/xml");
const tags = (node, local) => [...node.getElementsByTagName("*")].filter(e => e.localName === local);
const colNum = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const clean = v => String(v ?? "").replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\r/g, "").trim();
const rel = (base, target) => { const parts = base.split("/").slice(0, -1); for (const t of target.split("/")) t === ".." ? parts.pop() : t !== "." && parts.push(t); return parts.join("/"); };

async function readSheets(buf) {
  const zip = await unzip(buf);
  const ss = await zip.text("xl/sharedStrings.xml");
  const shared = ss ? tags(xml(ss), "si").map(si => tags(si, "t").map(t => t.textContent).join("")) : [];
  const wbRels = xml(await zip.text("xl/_rels/workbook.xml.rels"));
  const wb = xml(await zip.text("xl/workbook.xml"));
  const out = [];
  for (const sh of tags(wb, "sheet")) {
    if (sh.getAttribute("state") === "hidden") continue;
    const rid = [...sh.attributes].find(a => a.localName === "id")?.value;
    const target = tags(wbRels, "Relationship").find(r => r.getAttribute("Id") === rid)?.getAttribute("Target");
    if (!target) continue;
    const path = target.startsWith("/") ? target.slice(1) : rel("xl/workbook.xml", target);
    const s = await zip.text(path); if (!s) continue;
    const rows = [];
    for (const c of tags(xml(s), "c")) {
      const ref = c.getAttribute("r"), t = c.getAttribute("t");
      const r = parseInt(ref.replace(/[A-Z]+/g, ""), 10) - 1, col = colNum(ref);
      const v = tags(c, "v")[0]?.textContent ?? "";
      const val = t === "s" ? shared[+v] : t === "inlineStr" ? tags(c, "t").map(x => x.textContent).join("") : v;
      if (val !== "") (rows[r] ||= [])[col] = clean(val);
    }
    out.push({ name: sh.getAttribute("name").trim(), rows });
  }
  return out;
}

/* ---------- 시트 하나에서 출역표 찾기 ---------- */
const N = v => { if (v == null || v === "") return null; const n = Number(String(v).replace(/,/g, "")); return isFinite(n) ? n : null; };
const K = s => String(s ?? "").replace(/\s+/g, "");
const RRN = /^\d{6}-?\d{7}$/, PHONE = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;
const STOP = /^(인원|소계|합계|계|총계|합)$/;

// 1,2,3… 으로 이어지는 줄 찾기 → { r, cols: {col: day}, two }
function findDayHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const row = rows[r]; if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      if (N(row[c]) !== 1) continue;
      let k = 0; while (N(row[c + k]) === k + 1) k++;
      if (k < 10) continue;
      const cols = {}; for (let i = 0; i < k; i++) cols[c + i] = i + 1;
      const next = rows[r + 1] || [];
      let two = false;
      if (k <= 16 && N(next[c]) === 16) {
        two = true; const cols2 = {};
        for (let i = 0; i <= 16; i++) { const d = N(next[c + i]); if (d >= 16 && d <= 31) cols2[c + i] = d; }
        return { r, cols, cols2, two, c0: c, c1: c + 16 };
      }
      return { r, cols, two, c0: c, c1: c + k - 1 };
    }
  }
  return null;
}

function labelCols(rows, h) {
  const inDays = c => c >= h.c0 && c <= h.c1;
  const top = {}, bottom = {};
  const scan = (r, into) => (rows[r] || []).forEach((v, c) => { if (v && !inDays(c)) into[c] = (into[c] ? into[c] + " " : "") + K(v); });
  for (let r = Math.max(0, h.r - 3); r <= h.r; r++) scan(r, top);
  if (h.two) scan(h.r + 1, bottom);
  const pick = (map, test) => { const e = Object.entries(map).find(([, v]) => test(v)); return e ? +e[0] : null; };
  const L = {
    name: pick(top, v => /성명|이름/.test(v)),
    gong: pick(top, v => /공수/.test(v)) ?? pick(top, v => /일수/.test(v)),
    rate: pick(top, v => /단가/.test(v)),
    amt: pick(top, v => /총액|노무비총|금액/.test(v) && !/공제|차감|지급/.test(v)),
    ded: [],
  };
  const dedKey = v => /지방소득세|주민세/.test(v) ? "res" : /소득세|갑근세/.test(v) ? "tax" : /국민연금/.test(v) ? "pen" : /건강/.test(v) ? "hea" : /장기요양/.test(v) ? "ltc" : /고용/.test(v) ? "emp" : null;
  // 한 칸 제목에 '소득세 … 국민연금' 처럼 여러 단어가 섞이면 마지막(가장 아래) 줄 기준
  for (const [c, v] of Object.entries(top)) { const parts = v.split(" "); const k = dedKey(parts.at(-1)); if (k) L.ded.push({ c: +c, off: 0, k }); }
  for (const [c, v] of Object.entries(bottom)) { const k = dedKey(v); if (k) L.ded.push({ c: +c, off: 1, k }); }
  return L;
}

function parseSheet(rows) {
  const h = findDayHeader(rows); if (!h) return null;
  const L = labelCols(rows, h); if (L.name == null) return null;
  const people = [];
  const start = h.r + (h.two ? 2 : 1);
  for (let r = start; r < rows.length; r++) {
    const row = rows[r] || [];
    const raw = row[L.name]; if (!raw || STOP.test(K(raw))) continue;
    const row2 = h.two ? (rows[r + 1] || []) : [];
    const d = {};
    for (const [c, day] of Object.entries(h.cols)) { const v = N(row[c]); if (v > 0) d[day] = v; }
    if (h.two) for (const [c, day] of Object.entries(h.cols2)) { const v = N(row2[c]); if (v > 0) d[day] = v; }
    // 이름 정리: '하태계(반장)' → 하태계 / 메모 '반장', '김성일JIN CHENGRI' → 김성일
    const note = (raw.match(/\(([^)]*)\)/) || [])[1] || "";
    const name = raw.replace(/\([^)]*\)/g, "").replace(/[A-Za-z.\s]+/g, "").trim();
    if (!name || /^\d+$/.test(name)) { if (h.two) r++; continue; }
    // 주민번호·전화·주소는 모양으로 찾기 (날짜 칸 밖, 두 줄 모두)
    let rrn = "", phone = "", address = "";
    [row, row2].forEach(rw => rw.forEach((v, c) => {
      if (!v || (c >= h.c0 && c <= h.c1) || c === L.name) return; const s = String(v).trim();
      if (!rrn && RRN.test(s)) rrn = s.includes("-") ? s : s.slice(0, 6) + "-" + s.slice(6);
      else if (!phone && PHONE.test(s)) phone = s;
      else if (!address && s.length >= 8 && /[가-힣]/.test(s) && /(시|도|구|군|로|길|동)\s?/.test(s) && !/은행|농협|지급|주식회사|계좌/.test(s)) address = s;
    }));
    const ded = {}; L.ded.forEach(({ c, off, k }) => { const v = N((off ? row2 : row)[c]); if (v) ded[k] = v; });
    const p = { name, note, rrn, phone, address, d, gong: L.gong != null ? N(row[L.gong]) : null, rate: L.rate != null ? N(row[L.rate]) : null, amt: L.amt != null ? N(row[L.amt]) : null, ded };
    const days = Object.values(d).reduce((a, b) => a + b, 0);
    if (days || p.amt) people.push(p);
    if (h.two) r++;
  }
  return { people, two: h.two };
}

// 시트 이름·위쪽 글자에서 '2026년 09월', '26년 09월' 같은 연월 찾기
function sheetYm(name, rows) {
  const texts = [name, ...rows.slice(0, 5).flatMap(r => (r || []).filter(Boolean))].join(" ");
  const m = texts.match(/(\d{2,4})\s*년\s*(\d{1,2})\s*월/);
  if (m) { let y = +m[1]; if (y < 100) y += 2000; return `${y}-${String(+m[2]).padStart(2, "0")}`; }
  return null;
}

/* ---------- 공개 함수 ---------- */
// 반환: { sheets: [{ name, ym, people, two }], best: index }  (출역표가 있는 시트만)
export async function parseVendorFile(file, targetYm) {
  const sheets = (await readSheets(await file.arrayBuffer()))
    .map(s => { const r = parseSheet(s.rows); return r && r.people.length ? { name: s.name, ym: sheetYm(s.name, s.rows), ...r } : null; })
    .filter(Boolean);
  if (!sheets.length) throw new Error("출역표(1, 2, 3 … 날짜 머리글과 성명 칸)를 찾지 못했습니다.");
  let best = sheets.findIndex(s => s.ym === targetYm);
  const exactMonth = best >= 0;
  if (best < 0) best = sheets.length - 1;
  return { sheets, best, exactMonth };
}
