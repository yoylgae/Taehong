// 작업허가서 공통 자료
export const TABS = [
  ["ptw", "작업허가서"],
  ["chem", "화학물질 사용계획서"],
  ["fire", "화기작업 계획서"],
  ["heavy", "중량물 취급계획서"],
  ["sfac", "안전시설물 임시 해체/복구 작업계획서"],
];
export const PPE = ["안전화", "안전모", "안전벨트", "안전장갑", "안전장화", "보안경/보안면", "반사조끼", "구명조끼", "용접자켓/앞치마", "방진마스크", "방독마스크", "귀마개/귀덮개", "분진/친유 방어용 보호", "각반", "기타"];
// {키} = 숫자 입력칸
export const FIRE_CHECKS = [
  { t: "작업 준비 및 작업 절차 수립 여부" },
  { t: "작업장 내 위험물의 사용·보관 현황 파악 (사용 ({use} 개), 보관 ({keep} 개))" },
  { t: "화기작업에 따른 가연성/인화성 물질에 대한 방호조치" },
  { t: "20kg 소화기 {ext20} 개, 3.3kg 소화기 {ext3} 개 이상 비치" },
  { t: "용접불티 비산방지덮개, 용접방화포 등 불꽃/불티 등 비산방지조치 ({cover} 개)" },
  { t: "인화성 액체의 증기, 인화성 가스가 남아 있지 않도록 환기 등의 조치" },
  { t: "작업근로자에 대한 화재예방 및 피난교육 등 비상조치" },
  { t: "개구부 하부, 작업장 감시인 배치" },
  { t: "방폭형 전기기계기구(환기구 포함), 방화수 or 살수시설 구비" },
  { t: "개구부 주변 밀폐조치" },
];
// 발생빈도 × 위험강도 → 평가등급 (현장 허가서 기준: 2×2=상(C), 1×2=중(E), 1×3=중(D), 2×3=상(B))
const G = { 1: "하(F)", 2: "중(E)", 3: "중(D)", 4: "상(C)", 6: "상(B)", 9: "상(A)" };
export const grade = (f, s) => (f && s) ? G[f * s] || "" : "";
export const gradeCls = g => /^상/.test(g) ? "hi" : /^중/.test(g) ? "mid" : g ? "lo" : "";
const rv3 = () => ({ team: [], health: [], safety: [] }), rv2 = () => ({ team: [], safety: [] });
export const blankDoc = () => ({
  company: "", gongu: "", place: "", created: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
  start: "", end: "", writer: "", ptwNo: "",
  sign: { sub: "", team: "", health: "", safety: "" },
  gongjong: [], perm: [], workers: { kr: null, fr: null }, ppe: ["안전화", "안전모", "안전장갑", "반사조끼"], risks: [],
  reviews: rv3(),
  use: { chem: false, fire: false, heavy: false, sfac: false },
  chem: { items: [], risks: [], measures: [], reviews: rv3() },
  fire: { fromD: "", fromT: "", toD: "", toT: "", rows: [], checks: {}, reviews: rv2() },
  heavy: { rows: [], reviews: rv2() },
  sfac: { fromD: "", fromT: "", toD: "", toT: "", place: "", facility: "", measure: "", work: "", company: "", companyBy: "", restoreBy: "", checkBy: "", reviews: rv2() },
});

/* ===== 위험성평가 공통 (ra/ 와 ptw/ 가 같이 씀) ===== */
// 현대건설 표준 위험성공종 (작업공종)
export const STD_WT1 = ["철거공사", "공통사항", "가설공사", "공통공사", "토목공사", "토공사", "골조공사", "철골공사", "마감공사", "전기통신공사", "기계공사", "배관공사", "설비공사", "항만공사", "해상공사", "하천공사", "준설 및 매립 공사", "보ㆍ댐공사", "수직구공사", "터널공사", "조경공사", "맨홀및관부설(우오수)공사", "도로 및 포장공사", "상하수도공사", "전력공사", "교량 하부공사", "교량 상부공사", "교량 부대공사", "(토목)건축공사", "(건축)토목공사", "부대공사", "가시설공사", "타워크레인 설치ㆍ인상ㆍ해체", "건설용 리프트 설치ㆍ인상ㆍ해체", "이동식 크레인 설치ㆍ해체", "항타기 설치ㆍ해체", "기타 공종", "철도공사", "갠트리크레인 설치 및 해체", "도로 및 포장공"];
export const DISASTER = ["추락", "낙하/비래", "협착", "충돌", "붕괴/도괴", "전도(주체: 사람)", "전도(주체: 장비, 가시설 등)", "감전", "화재/폭발", "절단/베임/찔림", "유해물질접촉", "업무상질병", "무리한동작", "교통사고", "기타"];
export const RA_SRC = ["최초", "월간", "수시", "PTW"];
// 같은 작업활동인지 (띄어쓰기 무시)
export const nk = s => String(s ?? "").replace(/\s+/g, "");
export const actKey = (wt2, wt3) => nk(wt2) + "|" + nk(wt3);
// 같은 위험요인인지 (세부공종·작업활동·위험요인 글자 비교)
export const riskKey = r => [r.wt2, r.wt3, r.factor].map(nk).join("|");
// 허가기간이 걸친 달들 ("2026-10", "2026-11")
export const monthsOf = (start, end) => { const out = []; if (!start) return out; let y = +start.slice(0, 4), m = +start.slice(5, 7); const ey = +(end || start).slice(0, 4), em = +(end || start).slice(5, 7); while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, "0")}`); if (++m > 12) { m = 1; y++; } } return out; };
// 위험성평가 공종 트리 [{wt1, items:[{wt2, acts:[]}]}] 에서 세부공종의 작업공종 찾기
export const wt1Of = (tree, wt2) => (tree || []).find(g => g.items.some(i => nk(i.wt2) === nk(wt2)))?.wt1 || "";
