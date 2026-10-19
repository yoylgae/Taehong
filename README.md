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

## 직영실행 (jy/)
- 공사관리 › 직영실행. 달마다 한 묶음: 실행내역서 · 식대 · 인건비 · 노무비명세서 · 신분증·이수증·통장사본 · 자재구입 · 자재 사진대지 · 증빙서류
- 테이블: `jy_months`(달), `jy_rows`(sheet별 행, data jsonb), `jy_workers`(사람 인적사항, 달과 무관), `jy_files`(사진·서류), 저장소 `jy-files`(비공개)
- 주민번호 등 민감 자료라 **접속 비밀번호를 통과한 사람만** 읽고 쓸 수 있음:
  미들웨어가 `/__dbtoken` 으로 Vercel 환경변수 `DB_TOKEN` 을 내려 주고, 화면은 이를 `x-pms-token` 헤더로 보냄.
  DB 쪽은 `public.pms_ok()` 가 `private.gate.token` 과 비교(RLS·저장소 정책 모두).
  토큰을 바꾸려면 `DB_TOKEN` 과 `private.gate` 값을 같이 바꾸고 재배포.
- **엑셀 양식으로 저장** (`jy/export-xlsx.js`): 사용자가 고른 양식 .xlsx(지난달 파일)에서 값 칸만 바꿔 내려받기.
  서식·병합·인쇄설정·그림·수식은 그대로, 수식 안 단가 숫자만 교체(=SUM(AI5*160000)→…), 시트 간 행 연결(노무비명세서 8행=인건비 5행)에 맞춰 같은 순서로 채움.
  수식 결과를 다시 계산해 넣고 workbook에 fullCalcOnLoad 표시. 양식 파일은 서버에 올리지 않고 브라우저 IndexedDB에만 기억.
  '신분증,이수증,통장사본' 시트: '성명' 칸으로 사람 묶음(3줄)을 찾아 성명·주민번호·현장명·주소·전화번호를 채우고, 가장 높은 줄의 병합 칸 3개(신분증·이수증·통장사본)에
  사람마다 칸별 첫 사진(PDF는 1쪽)을 JPEG로 바꿔 비율 유지·가운데 맞춤으로 넣음. 예전 사진은 빼고, 모자란 묶음은 복사해 늘리고 남는 묶음은 지움.
- **근로계약서** 탭 (`jy/contract.js`): 계약서 양식 .xlsx(여러 회사 양식 시트 가능)를 저장소(templates/contract, jy_files.sheet='tpl-contract')에 올려 두고,
  소속마다 양식 시트를 골라 한 사람에 한 시트씩 복사·채운 엑셀을 만든다. 성명·주민번호·주소·전화·일당(H23)·계약기간·지급일·통장(견본에 계좌가 있을 때만),
  견본 근로자 이름이 들어간 서명란 글자도 새 사람으로 바꾼다. 인쇄 영역·주석·인쇄설정은 시트마다 복사.

## 홈 · 현장 지적도 (`map/`)
- 홈 화면 가운데에 지적도(iframe `map/`)를 크게 띄움. 메뉴 공사관리 › 현장 지적도에서도 열림.
- 도면 원본: AutoCAD에서 뽑은 PDF → `pdftocairo -svg` + `pdftotext -bbox` → `map/tools/extract.py` → `map/base.json`
  (선 = 폴리선, 채움 = 삼각형 묶음, 지번 = 글리프 모양 + 글자 내용). 1pt = 10 도면단위.
  새 도면으로 바꿀 때: `pdftocairo -svg a.pdf a.svg; pdftotext -bbox a.pdf a.html; python3 map/tools/extract.py a.svg a.html map/base.json`
- **장비·작업 배치**: 아이콘(`map/icons.js`, 직접 그린 SVG)을 끌어다 놓으면 site_map_marks 에 저장. 말풍선은 겹치지 않게 자리를 골라 지시선으로 연결.
  날짜별(작업 시작~끝)로 보이고, 작업계획서(ewp_plans) 중 지도에 없는 장비는 오른쪽 목록에서 '위치 지정'.
- **도면 편집** (`map/cad.js`): 캔버스 캐드 — 선/폴리선/사각형/원/영역(면적)/글자/치수/거리, 이동·복사·회전·삭제, 그립 편집,
  창/걸치기 선택, 끝점·중간점 스냅(F3), 직교(F8), 실행취소, 명령줄(L, PL, REC …), 레이어(보이기·잠금·색), 축척 맞추기(CAL).
  수정분만 site_map_doc(id=1).edits 에 {add, mod, del, layers, settings} 로 저장 (원본 base.json 은 그대로).
- 두 테이블 모두 RLS `pms_ok()` (접속 비밀번호 쿠키 → /__dbtoken).
