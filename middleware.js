// 사이트 접속 비밀번호 (Vercel Routing Middleware)
// - 비밀번호는 코드가 아니라 Vercel 환경변수 SITE_PASSWORD 에만 저장
// - 맞게 입력하면 30일 동안 기억(쿠키), 사이드바의 '로그아웃'으로 해제

const COOKIE = "pms_gate";
const DAYS = 30;

const next = () => new Response(null, { headers: { "x-middleware-next": "1" } });

async function token(pw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw + "|pms-gate-v1"));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : "";
}

export default async function middleware(request) {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return next();                       // 비밀번호를 설정하지 않았으면 그냥 통과
  const url = new URL(request.url);
  const good = await token(pw);

  if (url.pathname === "/__logout") {
    return new Response(null, { status: 303, headers: {
      location: "/", "set-cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
  }

  if (url.pathname === "/__login" && request.method === "POST") {
    const form = await request.formData();
    const back = String(form.get("back") || "/");
    const to = back.startsWith("/") && !back.startsWith("//") ? back : "/";
    if (String(form.get("password") || "") === pw) {
      return new Response(null, { status: 303, headers: {
        location: to, "set-cookie": `${COOKIE}=${good}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax` } });
    }
    return loginPage(to, true);
  }

  if (readCookie(request, COOKIE) === good) {
    // 직영실행 등 민감 자료용 DB 토큰: 비밀번호를 통과한 사람에게만 내려줌
    if (url.pathname === "/__dbtoken") {
      return new Response(JSON.stringify({ t: process.env.DB_TOKEN || "" }), {
        headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    return next();
  }

  // 페이지가 아닌 파일(스크립트·그림 등) 요청은 401 만 돌려줌
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");
  if (!wantsHtml) return new Response("Unauthorized", { status: 401 });
  return loginPage(url.pathname + url.search, false);
}

function loginPage(back, wrong) {
  const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>현장관리시스템 - 접속</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;display:flex;align-items:center;justify-content:center;padding:24px;
  font:14px/1.5 "Pretendard Variable",Pretendard,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#1a1d26;
  background:radial-gradient(1200px 600px at 50% -10%,#e6eeff 0%,#f5f6fa 55%) fixed;-webkit-font-smoothing:antialiased}
.card{width:100%;max-width:380px;background:#fff;border:1px solid #e6e8ee;border-radius:20px;padding:36px 32px 30px;
  box-shadow:0 1px 2px rgba(16,24,40,.04),0 18px 48px rgba(16,24,40,.08);text-align:center}
.mark{width:52px;height:52px;margin:0 auto 18px;border-radius:15px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);
  color:#fff;font-weight:800;font-size:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(37,99,235,.3)}
h1{margin:0;font-size:21px;font-weight:700;letter-spacing:-.3px}
p.sub{margin:6px 0 26px;color:#6b7280;font-size:13.5px}
.field{position:relative;text-align:left}
input{width:100%;height:48px;padding:0 46px 0 16px;font:inherit;font-size:15px;border:1px solid #dde1e8;border-radius:12px;background:#fafbfc;transition:.15s;outline:none}
input:focus{border-color:#2563eb;background:#fff;box-shadow:0 0 0 4px #dbe7ff}
.err input{border-color:#ef4444;background:#fff}
.err input:focus{box-shadow:0 0 0 4px #fde2e2}
.eye{position:absolute;right:8px;top:8px;width:32px;height:32px;border:0;background:none;border-radius:8px;color:#9aa1ad;cursor:pointer;font-size:15px}
.eye:hover{background:#f1f3f6;color:#374151}
.msg{min-height:20px;margin:8px 2px 0;font-size:12.5px;color:#dc2626;text-align:left}
button.go{width:100%;height:48px;margin-top:10px;border:0;border-radius:12px;background:#2563eb;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 6px 16px rgba(37,99,235,.28);transition:.15s}
button.go:hover{background:#1d4ed8}
.foot{margin-top:22px;font-size:12px;color:#9aa1ad}
@keyframes shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
.err{animation:shake .35s}
</style></head><body>
<form class="card" method="post" action="/__login" autocomplete="off">
  <div class="mark">P</div>
  <h1>현장관리시스템</h1>
  <p class="sub">접속 비밀번호를 입력해주세요</p>
  <div class="field${wrong ? " err" : ""}">
    <input type="password" name="password" id="pw" placeholder="비밀번호" required autofocus aria-label="비밀번호">
    <button type="button" class="eye" id="eye" title="비밀번호 보기" aria-label="비밀번호 보기">👁</button>
  </div>
  <div class="msg">${wrong ? "비밀번호가 맞지 않습니다." : ""}</div>
  <input type="hidden" name="back" value="${esc(back)}">
  <button class="go" type="submit">들어가기</button>
  <div class="foot">한 번 들어가면 이 기기에서 30일 동안 다시 묻지 않습니다</div>
</form>
<script>
  const pw=document.getElementById('pw');
  document.getElementById('eye').onclick=()=>{pw.type=pw.type==='password'?'text':'password';pw.focus();};
</script>
</body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
