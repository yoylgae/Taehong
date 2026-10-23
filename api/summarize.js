// 교육자료(PPT) 글 → 교육일지 '교육내용' 요약 (선택 기능)
// Vercel 환경변수 ANTHROPIC_API_KEY 가 있을 때만 동작. 없으면 501 → 화면은 내장 요약을 씀.
// 접속 비밀번호(middleware.js)를 통과한 요청만 여기까지 옴.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(501).json({ error: "no-key" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const text = String(body?.text || "").slice(0, 60000);
  const level = { short: "400자 안팎", mid: "800자 안팎", long: "1500자 안팎" }[body?.level] || "800자 안팎";
  const kind = String(body?.kind || "정기교육").slice(0, 40);
  if (!text.trim()) return res.status(400).json({ error: "empty" });
  const prompt = `아래는 건설현장 ${kind} 교육자료(PPT)의 쪽별 글자입니다. 안전ㆍ보건 교육 훈련 일지의 '교육내용' 칸에 그대로 붙여 넣을 요약을 ${level}로 써 주세요.
- 교육에서 다룬 주제를 순서대로 번호를 붙여 정리하고, 주제마다 핵심 내용(수치·사례·예방대책)을 짧게 덧붙입니다.
- 근로자에게 전달한 내용이 드러나게 '~ 교육', '~ 안내', '~ 공유' 같은 말투로 끝맺습니다.
- 자료에 없는 내용은 쓰지 않습니다. 쪽 번호, 출처, 머리말·꼬리말 같은 꾸밈 글자는 뺍니다.
- 머리말이나 설명 없이 요약 본문만 씁니다. 마크다운 기호(#, **)는 쓰지 않습니다.

<교육자료>
${text}
</교육자료>`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j?.error?.message || `AI ${r.status}` });
    return res.status(200).json({ text: (j.content || []).map(c => c.text || "").join("").trim() });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
