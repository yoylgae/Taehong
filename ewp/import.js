// 기존 시스템에서 저장한 건설장비 작업계획서 엑셀(.xlsx)을 읽어 입력값으로 바꾼다.
// 외부 라이브러리 없이 브라우저 기본 기능(압축 해제, XML 읽기)만 사용.
// 셀 위치가 아니라 '제목 글자'(현장명, ■ 유도자 등)를 찾아 읽으므로 인원 수가 달라 행이 밀려도 동작함.

/* ---------- xlsx(zip) 풀기 ---------- */
async function unzip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("엑셀(.xlsx) 파일이 아닙니다.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    files[name] = { method, csize, off };
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
  return { names: Object.keys(files), read, text: async n => { const b = await read(n); return b ? dec.decode(b) : null; } };
}

const xml = s => new DOMParser().parseFromString(s, "application/xml");
const tags = (node, local) => [...node.getElementsByTagName("*")].filter(e => e.localName === local);
const colNum = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const clean = v => String(v ?? "").replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\r/g, "").trim();
const key = s => clean(s).replace(/[\s·_]/g, "");
const dates = s => String(s).match(/\d{4}-\d{2}-\d{2}/g) || [];
const rel = (base, target) => { const parts = base.split("/").slice(0, -1); for (const t of target.split("/")) t === ".." ? parts.pop() : t !== "." && parts.push(t); return parts.join("/"); };

/* ---------- 시트 → 2차원 배열 ---------- */
async function readSheet(zip) {
  const ss = await zip.text("xl/sharedStrings.xml");
  const shared = ss ? tags(xml(ss), "si").map(si => tags(si, "t").map(t => t.textContent).join("")) : [];
  const wbRels = xml(await zip.text("xl/_rels/workbook.xml.rels"));
  const wb = xml(await zip.text("xl/workbook.xml"));
  const firstSheet = tags(wb, "sheet")[0];
  const rid = firstSheet.getAttribute("r:id") || [...firstSheet.attributes].find(a => a.localName === "id")?.value;
  const target = tags(wbRels, "Relationship").find(r => r.getAttribute("Id") === rid).getAttribute("Target");
  const sheetPath = target.startsWith("/") ? target.slice(1) : rel("xl/workbook.xml", target);
  const doc = xml(await zip.text(sheetPath));
  const rows = [];
  for (const c of tags(doc, "c")) {
    const ref = c.getAttribute("r"), t = c.getAttribute("t");
    const r = parseInt(ref.replace(/[A-Z]+/g, ""), 10) - 1, col = colNum(ref);
    const v = tags(c, "v")[0]?.textContent ?? "";
    let val = t === "s" ? shared[+v] : t === "inlineStr" ? tags(c, "t").map(x => x.textContent).join("") : v;
    (rows[r] ||= [])[col] = clean(val);
  }
  return { rows, sheetPath };
}

/* ---------- 그림 (운행경로 사진) ---------- */
async function readImages(zip, sheetPath) {
  const sRels = await zip.text(rel(sheetPath, "_rels/" + sheetPath.split("/").pop() + ".rels"));
  if (!sRels) return [];
  const dr = tags(xml(sRels), "Relationship").find(r => /drawing$/.test(r.getAttribute("Type")));
  if (!dr) return [];
  const drawPath = rel(sheetPath, dr.getAttribute("Target"));
  const dRels = xml(await zip.text(rel(drawPath, "_rels/" + drawPath.split("/").pop() + ".rels")) || "<x/>");
  const media = Object.fromEntries(tags(dRels, "Relationship").map(r => [r.getAttribute("Id"), rel(drawPath, r.getAttribute("Target"))]));
  const draw = xml(await zip.text(drawPath));
  const out = [];
  for (const a of [...tags(draw, "twoCellAnchor"), ...tags(draw, "oneCellAnchor")]) {
    const from = tags(a, "from")[0]; if (!from) continue;
    const blip = tags(a, "blip")[0]; if (!blip) continue;
    const id = [...blip.attributes].find(x => x.localName === "embed")?.value;
    if (!media[id]) continue;
    out.push({ row: +tags(from, "row")[0].textContent, col: +tags(from, "col")[0].textContent, path: media[id] });
  }
  return out;
}

const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", bmp: "image/bmp", webp: "image/webp" };

/* ---------- 본문 해석 ---------- */
export async function parseEwpExcel(file, { EQUIP, RISKS, ROLES }) {
  const zip = await unzip(await file.arrayBuffer());
  const { rows, sheetPath } = await readSheet(zip);
  const at = (r, c) => (rows[r] || [])[c] || "";
  const rowOf = (re, from = 0) => { for (let r = from; r < rows.length; r++) if (re.test(at(r, 0))) return r; return -1; };
  const sec = n => rowOf(new RegExp("^" + n + "\\."));
  const notes = [], attach = [];
  const plan = {};
  if (!rows.some(r => r && r.some(v => /건설장비 작업계획서/.test(v || "")))) throw new Error("건설장비 작업계획서 엑셀이 아닙니다.");

  // 1~2. 작업개요 · 장비정보 (제목칸 → 값칸)
  const s1 = sec(1), s3 = sec(3);
  const kv = {};
  for (let r = Math.max(0, s1); r < (s3 > 0 ? s3 : rows.length); r++) {
    const row = rows[r] || [];
    row.forEach((v, c) => {
      if (!v || c === undefined) return;
      // 오른쪽에서 처음 나오는 값칸을 값으로 봄
      let j = c + 1; while (j < row.length && !row[j]) j++;
      if (j < row.length && !(key(v) in kv)) kv[key(v)] = { v: row[j], c: j };
    });
  }
  const g = (...names) => { for (const n of names) if (kv[key(n)]) return kv[key(n)].v; return ""; };
  const fileName = s => s.split("\n").slice(1).join(" ").trim();

  plan.site_name = g("현장명") || null;
  plan.work_name = g("작업명") || null;
  plan.company_name = g("업체명") || null;
  plan.work_place = g("작업장소") || null;
  [plan.work_start, plan.work_end] = dates(g("작업기간"));
  plan.in_date = dates(g("반입일"))[0] || null;
  plan.out_date = dates(g("반출예정일"))[0] || null;

  const eq = g("장비명");
  const parts = eq.split(/\s*[-–]\s*/).filter(Boolean);
  plan.equip_type = parts.find(p => EQUIP.includes(p)) || EQUIP.find(e => e !== "기타" && eq.includes(e)) || (eq ? "기타" : null);
  if (eq && !EQUIP.includes(parts[0] || "")) notes.push(`장비명 '${eq}'을(를) '${plan.equip_type}'(으)로 넣었습니다. 확인해주세요.`);
  plan.reg_no = g("차량번호", "치량번호") || null;
  plan.manufacturer = g("제조사") || null;
  plan.model_name = g("모델명") || null;
  plan.make_year = (g("제작년도").match(/\d{4}/) || [null])[0];
  plan.spec = g("규격") || null;

  const yn = v => /^미해당|^N\/A|^해당없음/.test(v) ? "미해당" : /^해당/.test(v) ? "해당" : null;
  const insp = g("점검강화대상");
  plan.inspection_yn = yn(insp); plan.inspection_date = dates(insp)[0] || null;
  if (plan.inspection_yn === "해당" && fileName(insp)) attach.push(["점검강화대상", fileName(insp)]);
  const chg = g("구조변경사항");
  plan.change_issue_yn = yn(chg);
  if (plan.change_issue_yn === "해당" && fileName(chg)) attach.push(["구조변경사항", fileName(chg)]);

  const period = (v, label) => {
    const d = dates(v);
    if (d.length) { if (fileName(v)) attach.push([label, fileName(v)]); return ["해당", d[0], d[1] || null]; }
    return [v ? "미해당" : null, null, null];
  };
  [plan.insur_yn, plan.insur_start, plan.insur_end] = period(g("보험유효기간"), "보험유효기간");
  [plan.car_insp_yn, plan.car_insp_start, plan.car_insp_end] = period(g("차량", "건설기계등록증및검사증"), "검사유효기간(차량)");
  [plan.safe_insp_yn, plan.safe_insp_start, plan.safe_insp_end] = period(g("안전검사"), "안전검사");

  const hw = g("중량물작업");
  plan.heavy_work = ["미해당", "지게차", "굴착기", "크레인", "기타"].find(o => hw.startsWith(o)) || null;
  if (plan.heavy_work === "기타") { plan.heavy_etc_lift = /양중/.test(hw); plan.heavy_etc_heavy = /중량물/.test(hw.replace(/^중량물작업/, "")); }
  if (plan.heavy_work && plan.heavy_work !== "미해당") notes.push("중량물·양중 작업계획서 내용은 엑셀에서 불러오지 않습니다. 해당 탭을 직접 입력해주세요.");
  plan.excavation_yn = yn(g("굴착작업"));
  const pre = g("반입전점검표"); if (pre) attach.push(["반입전 점검표", pre]);

  // 결재란: 당사 현장소장 / 관리감독자 / 안전관리자 (이름 옆 날짜는 지움)
  const nameOnly = s => s.replace(/\(.*?\)/g, "").trim();
  const isLabel = s => /소장|관리감독자|안전관리자/.test(s);
  for (let r = 0; r < (s1 > 0 ? s1 : 20); r++) (rows[r] || []).forEach((v, c) => {
    if (!v || !isLabel(v)) return;
    let j = c + 1; while (j < (rows[r] || []).length && !rows[r][j]) j++;
    const right = j - c <= 6 ? at(r, j) : "";
    const name = nameOnly(right && !isLabel(right) ? right : at(r + 1, c));
    if (!name) return;
    if (/협력사/.test(v)) notes.push(`결재란 '${v}'(${name})는 입력칸이 없어 넣지 않았습니다.`);
    else if (/현장소장/.test(v)) plan.approver1 = name;
    else if (/관리감독자/.test(v)) plan.approver2 = name;
    else if (/안전관리자/.test(v)) plan.approver3 = name;
  });

  // 3. 작업인원
  const personnel = [];
  const stop = r => /^■/.test(at(r, 0)) || /^\d+\./.test(at(r, 0));
  for (let r = s3 + 1; r > 0 && r < rows.length && !/^4\./.test(at(r, 0)); r++) {
    const m = at(r, 0).match(/^■\s*(.+)$/); if (!m) continue;
    const role = m[1].trim(); if (!ROLES.includes(role)) continue;
    const head = rows[r + 1] || [], map = {};
    head.forEach((h, c) => {
      if (!h) return;
      if (h === "성명") map[c] = "name";
      else if (h === "신호방법") map[c] = "sign_method";
      else if (/교육이수/.test(h)) map[c] = "edu_date";
      else if (/특별교육/.test(h)) map[c] = "special_edu_date";
      else if (/자격검정/.test(h)) map[c] = "cert_date";
      else if (/연락처/.test(h)) map[c] = "phone";
      else if (/비고/.test(h)) map[c] = "remark";
    });
    for (let d = r + 2; d < rows.length && !stop(d); d++) {
      const row = rows[d] || []; if (!row.some(Boolean) || /데이터가 없습니다/.test(row[0] || "")) continue;
      const p = { role };
      for (const [c, k] of Object.entries(map)) {
        const v = row[c] || "";
        p[k] = /_date$/.test(k) ? dates(v)[0] || null : k === "sign_method" ? (["수신호", "무전기"].includes(v) ? v : null) : v || null;
      }
      if (p.name) personnel.push(p);
    }
  }
  const drivers = personnel.filter(p => p.role === "운전원");
  if (drivers.length) { plan.approver4 = drivers[0].name; attach.push(["운전원 교육·면허·서약서", "운전원 표의 첨부"]); }
  plan.commander_yn = personnel.some(p => p.role === "작업지휘자") ? "해당" : "미해당";

  // 4. 지형 · 지반
  const s4 = sec(4), s5 = sec(5);
  const find4 = label => {
    for (let r = s4; r > 0 && r < (s5 > 0 ? s5 : rows.length); r++) {
      const row = rows[r] || [], i = row.findIndex(v => v && key(v) === key(label));
      if (i >= 0) { for (let j = row.length - 1; j > i; j--) if (row[j]) return row[j]; return ""; }
    }
    return "";
  };
  const act = v => v.replace(/^(있음|불량|기타)\s*:?\s*(조치)?\s*:?\s*/, "").trim() || null;
  const ground = find4("작업장소 지형 및 지반 상태");
  const gt = (ground.match(/지반\s*종류\s*:\s*([^\n]+)/) || [])[1]?.trim();
  const gs = (ground.match(/지반\s*상태\s*:\s*([^\n]+)/) || [])[1]?.trim() || "";
  plan.ground_type = ["콘크리트", "아스콘", "모래", "일반 흙", "연암", "경암"].find(o => gt && key(gt) === key(o)) || null;
  if (gt && !plan.ground_type) notes.push(`지반 종류 '${gt}'은(는) 선택지에 없어 비워두었습니다.`);
  plan.ground_status = ["견고", "연약", "동결", "특이사항"].find(o => gs.startsWith(o)) || null;
  if (plan.ground_status === "특이사항") plan.ground_status_note = gs.replace(/^특이사항\s*[(:]?\s*/, "").replace(/\)$/, "").trim() || null;
  const water = find4("지하수위 등 함수 상태");
  plan.water_status = /^불량/.test(water) ? "불량" : water ? "양호" : null;
  if (plan.water_status === "불량") plan.water_action = act(water);
  const entry = find4("작업반경 내 출입금지 조치");
  plan.no_entry = /^기타/.test(entry) ? "기타" : ["유도자", "바리케이트", "라바콘"].find(o => entry.startsWith(o)) || null;
  if (plan.no_entry === "기타") plan.no_entry_etc = act(entry);
  const wire = find4("주변 가공전선 접촉가능 여부");
  plan.contact_wire = /^있음/.test(wire) ? "있음" : /^없음/.test(wire) ? "없음" : null;
  if (plan.contact_wire === "있음") plan.contact_wire_action = act(wire);
  const intf = find4("주변 지장물 간섭 여부");
  plan.interference = /^있음/.test(intf) ? "있음" : /^없음/.test(intf) ? "없음" : null;
  if (plan.interference === "있음") plan.interference_action = act(intf);

  // 6. 작업내용
  const work = [];
  const h6 = rowOf(/^순서$/, sec(6));
  if (h6 > 0) {
    const head = rows[h6];
    const ci = t => head.findIndex(v => v && v.includes(t));
    const cW = ci("작업내용"), cR = ci("위험요인"), cM = ci("안전대책");
    for (let r = h6 + 1; r < rows.length && !/^\d+\.\s/.test(at(r, 0)); r++) {
      const row = rows[r] || []; if (!row.some(Boolean)) continue;
      let remark = ""; for (let j = cR + 1; j < cM; j++) if (row[j]) { remark = row[j]; break; }
      let risk = row[cR] || "";
      if (risk && !RISKS.includes(risk)) { remark = [risk, remark].filter(Boolean).join(" "); risk = ""; }
      work.push({ work_name: row[cW] || null, risk: risk || null, risk_remark: remark || null, safety_measure: row[cM] || null });
    }
  }

  // 5. 운행경로 사진
  const images = {};
  const r5 = rowOf(/^현장외곽$/, s5 > 0 ? s5 : 0), r6 = sec(6);
  if (r5 > 0) {
    const split = (rows[r5] || []).findIndex((v, c) => c > 0 && /내부장소/.test(v || ""));
    for (const im of await readImages(zip, sheetPath)) {
      if (im.row < r5 || (r6 > 0 && im.row >= r6)) continue;
      const k = split > 0 && im.col >= split ? "route_in" : "route_out";
      if (images[k]) continue;
      const ext = im.path.split(".").pop().toLowerCase();
      images[k] = new Blob([await zip.read(im.path)], { type: MIME[ext] || "image/jpeg" });
    }
  }
  plan.route_in_yn = images.route_in ? "해당" : images.route_out ? "미해당" : null;

  if (attach.length) notes.push("첨부파일은 엑셀에 파일 이름만 있어 다시 올려야 합니다: " + attach.map(([a, b]) => `${a}(${b})`).join(", "));
  return { plan, personnel, work, images, notes };
}
