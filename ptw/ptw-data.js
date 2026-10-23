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
