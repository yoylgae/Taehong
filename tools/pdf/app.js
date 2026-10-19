// PDF 편집·분할 — 모든 처리는 브라우저 안에서만 (서버로 올리지 않음)
//  · 미리보기: pdf.js   · 저장(합치기/나누기/회전): pdf-lib
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs";
import { PDFDocument, degrees } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.min.mjs";

const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toast = msg => { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 2800); };
const busy = (on, text = "처리 중…") => { $("#busy").hidden = !on; $("#busy-t").textContent = text; };
const COLORS = ["#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2", "#dc2626", "#65a30d"];

const S = { files: [], pages: [], last: null, seq: 0 };
// files: { id, name, bytes:Uint8Array, view(pdf.js 문서), lib(pdf-lib 문서, 저장할 때 읽음), color, n }
// pages: { key, fid, idx(0부터), rot(0/90/180/270), sel }

/* ---------- 올리기 ---------- */
async function addFiles(list) {
  const pdfs = [...list].filter(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  if (!pdfs.length) return toast("PDF 파일만 올릴 수 있습니다.");
  busy(true, "PDF 여는 중…");
  for (const f of pdfs) {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const view = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const file = { id: "f" + (++S.seq), name: f.name.replace(/\.pdf$/i, ""), bytes, view, color: COLORS[S.files.length % COLORS.length], n: view.numPages };
      S.files.push(file);
      for (let i = 0; i < view.numPages; i++) S.pages.push({ key: file.id + ":" + i + ":" + (++S.seq), fid: file.id, idx: i, rot: 0, sel: false });
    } catch (e) {
      console.error(e);
      toast(`「${f.name}」을(를) 열지 못했습니다${/password/i.test(e?.name || e?.message) ? " (암호가 걸린 PDF)" : ""}.`);
    }
  }
  if (!$("#outname").value && S.files[0]) $("#outname").value = S.files.length > 1 ? S.files[0].name + "_합본" : S.files[0].name;
  busy(false); render();
}
$("#pick").onchange = e => { addFiles(e.target.files); e.target.value = ""; };
for (const ev of ["dragover", "dragenter"]) document.addEventListener(ev, e => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); $("#drop").classList.add("on"); } });
document.addEventListener("dragleave", e => { if (!e.relatedTarget) $("#drop").classList.remove("on"); });
document.addEventListener("drop", e => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); $("#drop").classList.remove("on"); addFiles(e.dataTransfer.files); });

/* ---------- 그리기 ---------- */
const fileOf = id => S.files.find(f => f.id === id);
let io;
function render() {
  const has = S.pages.length > 0;
  $("#work").hidden = !has; $("#files").hidden = !S.files.length;
  $("#drop").querySelector("b").textContent = has ? "PDF를 더 끌어다 놓으면 뒤에 이어 붙습니다" : "PDF 파일을 여기에 끌어다 놓으세요";
  $("#drop").classList.toggle("mini", has);
  if (has) $("#work").before($("#drop")); else $("#work").after($("#drop"));
  $("#files").innerHTML = S.files.map(f => `<span class="fchip"><i style="background:${f.color}"></i>${esc(f.name)} <small>${S.pages.filter(p => p.fid === f.id).length}/${f.n}쪽</small><button data-rmf="${f.id}" title="이 파일의 페이지를 모두 빼기">✕</button></span>`).join("");
  $("#grid").innerHTML = S.pages.map((p, i) => { const f = fileOf(p.fid);
    return `<div class="pg ${p.sel ? "sel" : ""}" draggable="true" data-k="${p.key}">
      <div class="chk">${p.sel ? "✓" : ""}</div>
      <div class="tools"><button data-rot="${p.key}" title="오른쪽으로 90°">⟳</button><button data-rm="${p.key}" title="이 페이지 빼기">✕</button></div>
      <div class="thumb" data-thumb="${p.key}"></div>
      <div class="meta"><b>${i + 1}</b><i style="background:${f.color}"></i><span title="${esc(f.name)} ${p.idx + 1}쪽">${esc(f.name)} · ${p.idx + 1}쪽</span></div></div>`; }).join("");
  const nsel = S.pages.filter(p => p.sel).length;
  $("#sel-n").textContent = nsel;
  $("#info").textContent = `${S.files.length}개 파일 · ${S.pages.length}페이지${nsel ? ` · ${nsel}장 선택` : ""}`;
  for (const id of ["rot-l", "rot-r", "del", "do-sel"]) $("#" + id).disabled = !nsel;
  // 미리보기는 화면에 보일 때 그림
  io?.disconnect();
  io = new IntersectionObserver(ents => ents.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); drawThumb(en.target); } }), { rootMargin: "300px" });
  document.querySelectorAll("[data-thumb]").forEach(el => io.observe(el));
}
const thumbCache = new Map();   // "fid:idx" → dataURL
async function drawThumb(el) {
  const p = S.pages.find(x => x.key === el.dataset.thumb); if (!p) return;
  const ck = p.fid + ":" + p.idx;
  let url = thumbCache.get(ck);
  if (!url) {
    try {
      const page = await fileOf(p.fid).view.getPage(p.idx + 1);
      const v0 = page.getViewport({ scale: 1 }), scale = Math.min(300 / v0.width, 380 / v0.height), vp = page.getViewport({ scale });
      const c = document.createElement("canvas"); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      await page.render({ canvasContext: c.getContext("2d"), canvas: c, viewport: vp }).promise;
      url = c.toDataURL("image/jpeg", 0.8); thumbCache.set(ck, url);
    } catch (e) { console.error(e); el.textContent = "미리보기 실패"; return; }
  }
  el.innerHTML = `<img src="${url}" alt="" style="transform:rotate(${p.rot}deg)${p.rot % 180 ? ";max-width:180px;max-height:140px" : ""}">`;
}
const refreshThumb = key => { const el = document.querySelector(`[data-thumb="${CSS.escape(key)}"]`); if (el) drawThumb(el); };

/* ---------- 선택 · 회전 · 빼기 · 순서 ---------- */
$("#grid").addEventListener("click", e => {
  const rot = e.target.closest("[data-rot]"), rm = e.target.closest("[data-rm]");
  if (rot) { const p = S.pages.find(x => x.key === rot.dataset.rot); p.rot = (p.rot + 90) % 360; refreshThumb(p.key); return; }
  if (rm) { S.pages = S.pages.filter(x => x.key !== rm.dataset.rm); render(); return; }
  const card = e.target.closest(".pg"); if (!card) return;
  const i = S.pages.findIndex(x => x.key === card.dataset.k);
  if (e.shiftKey && S.last != null) { const [a, b] = [Math.min(S.last, i), Math.max(S.last, i)]; for (let k = a; k <= b; k++) S.pages[k].sel = true; }
  else S.pages[i].sel = !S.pages[i].sel;
  S.last = i; render();
});
$("#files").addEventListener("click", e => {
  const b = e.target.closest("[data-rmf]"); if (!b) return;
  S.pages = S.pages.filter(p => p.fid !== b.dataset.rmf); S.files = S.files.filter(f => f.id !== b.dataset.rmf); render();
});
$("#sel-all").onclick = () => { S.pages.forEach(p => p.sel = true); render(); };
$("#sel-none").onclick = () => { S.pages.forEach(p => p.sel = false); render(); };
const rotSel = d => { S.pages.filter(p => p.sel).forEach(p => { p.rot = (p.rot + d + 360) % 360; refreshThumb(p.key); }); };
$("#rot-l").onclick = () => rotSel(-90); $("#rot-r").onclick = () => rotSel(90);
$("#del").onclick = () => { const n = S.pages.filter(p => p.sel).length; S.pages = S.pages.filter(p => !p.sel); render(); toast(`${n}장을 뺐습니다.`); };
$("#clear").onclick = () => { if (!confirm("올린 PDF를 모두 비울까요?")) return; S.files = []; S.pages = []; thumbCache.clear(); $("#outname").value = ""; render(); };
// 끌어서 순서 바꾸기
let dragKey = null;
$("#grid").addEventListener("dragstart", e => { const c = e.target.closest(".pg"); if (!c) return; dragKey = c.dataset.k; c.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragKey); });
$("#grid").addEventListener("dragend", e => { e.target.closest(".pg")?.classList.remove("drag"); document.querySelectorAll(".over-l,.over-r").forEach(x => x.classList.remove("over-l", "over-r")); dragKey = null; });
$("#grid").addEventListener("dragover", e => {
  if (!dragKey) return; const c = e.target.closest(".pg"); if (!c) return; e.preventDefault();
  const r = c.getBoundingClientRect(), right = e.clientX > r.left + r.width / 2;
  document.querySelectorAll(".over-l,.over-r").forEach(x => x !== c && x.classList.remove("over-l", "over-r"));
  c.classList.toggle("over-r", right); c.classList.toggle("over-l", !right);
});
$("#grid").addEventListener("drop", e => {
  if (!dragKey) return; e.preventDefault(); e.stopPropagation();
  const c = e.target.closest(".pg"); if (!c || c.dataset.k === dragKey) return;
  const right = c.classList.contains("over-r");
  const moving = S.pages.find(p => p.key === dragKey);
  // 선택된 페이지를 끌면 선택된 것 전부 함께 옮김
  const group = moving.sel ? S.pages.filter(p => p.sel) : [moving];
  if (group.some(p => p.key === c.dataset.k)) return;
  S.pages = S.pages.filter(p => !group.includes(p));
  let at = S.pages.findIndex(p => p.key === c.dataset.k) + (right ? 1 : 0);
  S.pages.splice(at, 0, ...group); dragKey = null; render();
});

/* ---------- 저장 ---------- */
async function libOf(f) { return (f.lib ||= await PDFDocument.load(f.bytes, { ignoreEncryption: true })); }
async function build(pages) {
  const out = await PDFDocument.create();
  for (const p of pages) {
    const f = fileOf(p.fid), src = await libOf(f);
    const [cp] = await out.copyPages(src, [p.idx]);
    if (p.rot) cp.setRotation(degrees((cp.getRotation().angle + p.rot) % 360));
    out.addPage(cp);
  }
  return out.save();
}
const baseName = () => ($("#outname").value.trim() || "PDF").replace(/[\\/:*?"<>|]/g, "_");
function download(bytes, name, type = "application/pdf") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([bytes], { type })); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
}
async function run(label, fn) { busy(true, label); try { await fn(); } catch (e) { console.error(e); toast("저장하지 못했습니다: " + (e.message || e)); } finally { busy(false); } }

$("#do-merge").onclick = () => run("합치는 중…", async () => {
  download(await build(S.pages), baseName() + ".pdf"); toast(`${S.pages.length}페이지를 PDF 하나로 저장했습니다.`);
});
$("#do-sel").onclick = () => run("저장 중…", async () => {
  const sel = S.pages.filter(p => p.sel); if (!sel.length) return toast("페이지를 먼저 골라 주세요.");
  download(await build(sel), `${baseName()}_선택${sel.length}쪽.pdf`); toast(`${sel.length}페이지를 저장했습니다.`);
});
$("#do-each").onclick = () => run("나누는 중…", async () => {
  const list = S.pages.filter(p => p.sel).length ? S.pages.filter(p => p.sel) : S.pages;
  if (list.length === 1) { download(await build(list), `${baseName()}_p${S.pages.indexOf(list[0]) + 1}.pdf`); return; }
  const files = [];
  for (const p of list) files.push({ name: `${baseName()}_p${String(S.pages.indexOf(p) + 1).padStart(2, "0")}.pdf`, data: await build([p]) });
  download(zip(files), baseName() + "_나눔.zip", "application/zip");
  toast(`${files.length}개 PDF로 나눠 ZIP으로 저장했습니다.`);
});
$("#do-range").onclick = () => run("나누는 중…", async () => {
  const txt = $("#ranges").value.trim(); if (!txt) return toast("예: 1-3, 4, 5-8 처럼 범위를 적어 주세요.");
  const groups = [];
  for (const part of txt.split(/[,，\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:[-~](\d+))?$/); if (!m) return toast(`「${part}」은(는) 알 수 없는 범위입니다.`);
    let a = +m[1], b = m[2] ? +m[2] : a; if (a > b) [a, b] = [b, a];
    if (a < 1 || b > S.pages.length) return toast(`「${part}」: 페이지는 1~${S.pages.length} 사이로 적어 주세요.`);
    groups.push({ label: a === b ? `p${a}` : `p${a}-${b}`, pages: S.pages.slice(a - 1, b) });
  }
  if (groups.length === 1) { download(await build(groups[0].pages), `${baseName()}_${groups[0].label}.pdf`); return; }
  const files = []; for (const [i, g] of groups.entries()) files.push({ name: `${baseName()}_${i + 1}_${g.label}.pdf`, data: await build(g.pages) });
  download(zip(files), baseName() + "_나눔.zip", "application/zip");
  toast(`${files.length}개 PDF로 나눠 ZIP으로 저장했습니다.`);
});

/* ---------- ZIP (압축 없이 묶기) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(lh.buffer, name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    central.push(ch.buffer, name);
    off += 30 + name.length + data.length;
  }
  const csz = central.reduce((a, b) => a + (b.byteLength ?? b.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csz, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, end.buffer]);
}
render();
