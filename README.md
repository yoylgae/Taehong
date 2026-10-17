# 현장관리시스템

- `index.html`, `shell.js`, `shell.css` : 메인 화면(사이드바·홈)
- `ewp/` : 건설장비 작업계획서 (목록·등록·출력·엑셀 불러오기·일일점검표)
- `ewp/chk/` : 일일점검표 점검 부위 그림, `ewp/checklist-data.js` : 장비별 점검 내용
- `config.js` : Supabase 연결 정보

`main` 브랜치에 푸시하면 Vercel(equip-work-plan)에 배포됩니다.

## 접속 비밀번호
- `middleware.js` 가 모든 요청 앞에서 비밀번호를 확인합니다.
- 비밀번호는 코드에 없고 Vercel 프로젝트 환경변수 `SITE_PASSWORD` 에만 있습니다. 바꾸려면 Vercel 설정에서 값을 고치고 다시 배포하세요.
- 맞게 입력하면 30일 동안 기억합니다. 사이드바 '로그아웃'으로 해제됩니다.
