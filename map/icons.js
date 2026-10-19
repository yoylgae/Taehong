// 장비·작업 종류와 그림 (이모지는 기기마다 □ 로 깨져서 직접 그린 SVG 사용)
const S = (body, sw = 2.2) => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const track = `<rect x="3" y="23" width="19" height="5" rx="2.5" fill="currentColor" stroke="none"/><circle cx="6" cy="25.5" r="1" fill="#fff" stroke="none"/><circle cx="19" cy="25.5" r="1" fill="#fff" stroke="none"/>`;
const wheels = (xs, y = 25) => xs.map(x => `<circle cx="${x}" cy="${y}" r="2.8" fill="currentColor" stroke="none"/><circle cx="${x}" cy="${y}" r="1" fill="#fff" stroke="none"/>`).join("");

export const KINDS = [
  { id: "굴착기", color: "#f59e0b", svg: S(`${track}<path d="M6 22v-7h8l2 3v4z" fill="currentColor" stroke="none"/><path d="M15 16l7-9 6 7"/><path d="M26 14l3 4-4 2z" fill="currentColor"/>`) },
  { id: "소형굴착기", color: "#eab308", svg: S(`<rect x="6" y="23" width="14" height="4.5" rx="2.2" fill="currentColor" stroke="none"/><path d="M8 22v-6h7v6z" fill="currentColor" stroke="none"/><path d="M15 17l5-6 5 5"/><path d="M23.5 15l3 3.5-3.5 1.5z" fill="currentColor"/><path d="M4 22h4"/>`) },
  { id: "크레인", color: "#2563eb", svg: S(`<path d="M3 24h19v-5h-6l-2-3H8v8" fill="currentColor" stroke="none"/>${wheels([7, 18], 26)}<path d="M13 16L28 5"/><path d="M28 5v12"/><path d="M26.5 17h3l-1.5 3z" fill="currentColor"/>`) },
  { id: "타워크레인", color: "#1d4ed8", svg: S(`<path d="M12 29V8h4v21"/><path d="M12 12l4 4M16 12l-4 4M12 20l4 4M16 20l-4 4" stroke-width="1.4"/><path d="M4 8h26"/><path d="M14 8l-4-5 4 0 4 5"/><path d="M4 8v3h4V8" fill="currentColor"/><path d="M26 8v9"/><path d="M24.5 17h3v3h-3z" fill="currentColor"/><path d="M8 29h12"/>`) },
  { id: "덤프트럭", color: "#16a34a", svg: S(`<path d="M3 22V12l12-3 3 13z" fill="currentColor" stroke="none"/><path d="M19 22v-8h5l4 4v4z" fill="currentColor" stroke="none"/><path d="M2 23h27"/>${wheels([7, 13, 24], 25.5)}`) },
  { id: "펌프카", color: "#0891b2", svg: S(`<path d="M3 23h25v-5h-4l-2-3h-5v3H3z" fill="currentColor" stroke="none"/>${wheels([7, 13, 23], 25.5)}<path d="M9 17L16 7l8 2 5 5"/><path d="M29 14v4"/>`) },
  { id: "레미콘", color: "#0d9488", svg: S(`<path d="M20 23V14h4l4 4v5z" fill="currentColor" stroke="none"/><path d="M2 23h27"/><ellipse cx="11" cy="16" rx="8" ry="5.5" transform="rotate(-15 11 16)" fill="currentColor" stroke="none"/><path d="M6 13l9 6M9 11l8 6" stroke="#fff" stroke-width="1.3"/>${wheels([7, 13, 24], 25.5)}`) },
  { id: "롤러", color: "#7c3aed", svg: S(`<circle cx="9" cy="22" r="6" fill="currentColor" stroke="none"/><circle cx="9" cy="22" r="2" fill="#fff" stroke="none"/><path d="M14 20h12v-8h-7l-2 8" fill="currentColor" stroke="none"/><circle cx="24" cy="24" r="4" fill="currentColor" stroke="none"/><circle cx="24" cy="24" r="1.3" fill="#fff" stroke="none"/><path d="M19 12V7h6"/>`) },
  { id: "항타기", color: "#b45309", svg: S(`${track}<path d="M5 22v-6h11v6z" fill="currentColor" stroke="none"/><path d="M22 28V3"/><path d="M19 3h6M14 16l8-10"/><rect x="20" y="8" width="4" height="6" fill="currentColor"/><path d="M22 18v6" stroke-width="3.4"/>`) },
  { id: "로더", color: "#ca8a04", svg: S(`<path d="M8 22v-9h6l2 4h5v5z" fill="currentColor" stroke="none"/>${wheels([10, 19], 24.5)}<path d="M21 18l4-3"/><path d="M24 13h6l-2 7h-5z" fill="currentColor"/><path d="M9 13V9h4"/>`) },
  { id: "지게차", color: "#ea580c", svg: S(`<path d="M5 23v-8l3-5h6v13z" fill="currentColor" stroke="none"/>${wheels([8, 17], 25)}<path d="M20 5v20"/><path d="M20 25h9M20 20h9" stroke-width="2.4"/><path d="M14 12h6"/>`) },
  { id: "고소작업차", color: "#dc2626", svg: S(`<path d="M3 23h22v-5H3z" fill="currentColor" stroke="none"/>${wheels([7, 20], 25.5)}<path d="M9 18l5-6-5-5"/><path d="M14 12l5-5"/><path d="M17 3h11v6H17z" fill="currentColor"/><path d="M22 9v-2" stroke="#fff"/>`) },
  { id: "비계", color: "#64748b", svg: S(`<path d="M6 4v25M16 4v25M26 4v25M4 9h24M4 17h24M4 25h24"/><path d="M6 9l10 8M16 17l10 8M16 9l10 8" stroke-width="1.3"/>`) },
  { id: "작업구역", color: "#ca8a04", svg: S(`<rect x="3" y="9" width="26" height="9" rx="1.5" fill="currentColor" stroke="none"/><path d="M8 9l-5 9M15 9l-5 9M22 9l-5 9M29 9l-5 9" stroke="#fff" stroke-width="2.4"/><path d="M7 18v10M25 18v10M4 28h6M22 28h6"/><circle cx="7" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="25" cy="6" r="2" fill="currentColor" stroke="none"/>`) },
  { id: "용접/절단", color: "#ef4444", svg: S(`<path d="M16 3c1 5 7 7 7 14a7 7 0 0 1-14 0c0-4 2-6 3-8 1 3 2 4 3 4 0-4 1-7 1-10z" fill="currentColor" stroke="none"/><path d="M16 26c-2 0-3-1.5-3-3.5 0-2 2-3 3-5 1 2 3 3 3 5S18 26 16 26z" fill="#fff" stroke="none"/>`) },
  { id: "인원배치", color: "#10b981", svg: S(`<path d="M8 13a8 8 0 0 1 16 0" fill="currentColor" stroke="none"/><path d="M6 13.5h20"/><path d="M16 5v3" stroke="#fff"/><circle cx="16" cy="17.5" r="4.5" fill="currentColor" stroke="none"/><path d="M6 29c0-5 4.5-7 10-7s10 2 10 7z" fill="currentColor" stroke="none"/>`) },
  { id: "자재", color: "#a16207", svg: S(`<path d="M16 3l12 6v14l-12 6-12-6V9z" fill="currentColor" stroke="none"/><path d="M4 9l12 6 12-6M16 15v14" stroke="#fff" stroke-width="1.6"/><path d="M10 6l12 6" stroke="#fff" stroke-width="1.6"/>`) },
  { id: "사무실", color: "#6366f1", svg: S(`<path d="M3 13l13-8 13 8" stroke-width="2.4"/><rect x="5" y="13" width="22" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="8" y="16" width="5" height="4" fill="#fff" stroke="none"/><rect x="19" y="16" width="5" height="4" fill="#fff" stroke="none"/><rect x="13.5" y="21" width="5" height="7" fill="#fff" stroke="none"/><path d="M2 28h28"/>`) },
  { id: "세륜기", color: "#0ea5e9", svg: S(`<circle cx="16" cy="21" r="7.5" fill="currentColor" stroke="none"/><circle cx="16" cy="21" r="3" fill="#fff" stroke="none"/><path d="M16 21l0-3M16 21l2.6 1.5M16 21l-2.6 1.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 3.5c1.6 2.4 2.4 3.6 2.4 4.7a2.4 2.4 0 0 1-4.8 0c0-1.1.8-2.3 2.4-4.7zM16 2c1.6 2.4 2.4 3.6 2.4 4.7a2.4 2.4 0 0 1-4.8 0c0-1.1.8-2.3 2.4-4.7zM24 3.5c1.6 2.4 2.4 3.6 2.4 4.7a2.4 2.4 0 0 1-4.8 0c0-1.1.8-2.3 2.4-4.7z" fill="currentColor" stroke="none"/><path d="M3 29h26M4 25.5h3M25 25.5h3" stroke-width="2"/>`) },
];
export const KIND = Object.fromEntries(KINDS.map(k => [k.id, k]));
export const kindOf = id => KIND[id] || { id: id || "기타", color: "#475569", svg: S(`<circle cx="16" cy="16" r="9" fill="currentColor" stroke="none"/>`) };
// 작업계획서 장비 종류 → 지도 아이콘
export function guessKind(t = "") {
  t = String(t).replace(/\s+/g, "");
  const rules = [[/미니|소형|0\.[0-3]|02W|03W|035/i, "소형굴착기"], [/굴착|굴삭|백호|포크레인|excav/i, "굴착기"], [/타워/, "타워크레인"], [/카고|크레인|기중/, "크레인"], [/덤프/, "덤프트럭"], [/펌프/, "펌프카"],
    [/레미콘|믹서/, "레미콘"], [/롤러|다짐/, "롤러"], [/항타|천공|어스오거|파일/, "항타기"], [/로더|스키드|밥캣/, "로더"], [/지게|포크리프트/, "지게차"], [/고소|스카이|렌탈|리프트|사다리차/, "고소작업차"], [/세륜/, "세륜기"]];
  for (const [re, k] of rules) if (re.test(t)) return k;
  return "굴착기";
}
