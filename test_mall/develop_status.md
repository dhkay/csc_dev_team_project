# test_mall — ESCOA 발표용 목업 사이트 개발 현황

## 1. 프로젝트 개요 및 목적
- Figma "플랫폼 디자인 가이드" (베이비 스킨케어 브랜드 ESCOA / 본(本) Bebe Natur 라인) 를 기반으로,
  **발표(프레젠테이션) 용도의 클릭 가능한 정적 목업 사이트**를 제작.
- 실제 기능(로그인, 결제, DB 연동 등)은 구현하지 않으며, 페이지 간 이동(링크)과 디자인 재현이 핵심.
- Figma 링크: https://www.figma.com/design/2pWwMIO81VrUhgqiDzxKJp/연습용?node-id=177-23
- 이미지 소스: `D:\내 드라이브\CSC\image sample` (사용자 보유 샘플 이미지)

## 2. 파일 구조 (파일맵)
```
test_mall/
├── index.html          # 홈 (히어로 배너, Bon 라인 소개, 본(本) 코어 시스템,
│                         Skin School RBDR 차트, 성분 스토리, 힙케어3종, 후기, 푸터)
├── shop.html            # SHOP 페이지 — 필터 pill, 정렬, 9개 상품 카드 그리드, 페이지네이션
├── cart.html             # 장바구니 페이지 — 상품 3종(품절 1종 포함), 결제 예상 금액 카드
├── checkout.html         # 결제정보 페이지 — 배송지/결제수단/약관동의 폼 + 우측 주문요약 카드
│                         (결제하기 클릭 시 "주문완료" 오버레이 표시 — 실제 결제 없음)
├── brand.html            # 브랜드 소개 — RBDR 케어 원칙 5종 + Skin School 라인(First100/Bon/Petit/Grand)
├── event.html            # 이벤트 — 진행중/종료 필터 칩 + 이벤트 카드 6개
├── community.html        # 커뮤니티 — 카테고리 필터 + 게시판 테이블(후기/Q&A/자유/공지)
├── cs.html               # 고객센터 — 연락처 카드 + 카테고리 필터 + FAQ 5문항
├── partnership.html      # 파트너십 — 입점 혜택 3종 + 입점 문의 폼(제출 시 안내 alert만 표시)
├── admin.html            # 관리자 - 메인 배너 관리 페이지 (가정 화면, 사이드바 + 배너 편집 폼)
├── develop_status.md     # (본 파일) 작업 상태 기록
├── assets/
│   ├── css/style.css     # 전체 디자인 토큰(컬러/라디우스/스페이싱) + 컴포넌트 스타일 + 반응형 미디어쿼리
│   ├── css/fonts.css     # Noto Sans KR / Inter 오프라인 내장 @font-face 정의 (전 페이지 <head>에서 로드)
│   ├── fonts/            # 위 fonts.css가 참조하는 woff2 폰트 파일 131개 (약 3.9MB, 인터넷 없이도 폰트 표시됨)
│   ├── js/main.js        # 모바일 메뉴 토글, 언어 드롭다운 토글, 결제→주문완료 오버레이,
│   │                       필터 pill 활성화, 관리자 토글 등 목업 인터랙션
│   └── img/              # Figma 디자인에 맞춰 이름을 정리해 복사한 이미지 + 로고
│       (logo-black.png, hero-1~5.png, bon-product.jpg, product-towel/mist/cream.png,
│        product-card-1~9.png, banner-admin.webp)
└── image/                # ⚠ 원본 샘플 이미지 전체가 그대로 들어있는 폴더 (자동 동기화로 추정,
                            본 작업에서 생성하지 않음 — 하단 "알려진 이슈" 참고)
```

## 3. 주요 기능 목록
1. **반응형 레이아웃**: PC(1440 기준) / 태블릿(~900px) / 모바일(~768px, ~480px) 브레이크포인트로
   헤더(GNB → 햄버거 메뉴), 히어로 배너(5장 캐러셀 → 센터 1장), 상품 그리드(4~3~2~1열),
   후기 카드, 결제 폼 등이 자동 재배치됨.
2. **홈페이지**: 공지바 → GNB → 히어로 배너 → Bon 라인 소개 → 본(本) 코어 시스템 3카드 →
   Skin School RBDR 오각형 차트(SVG) → 성분 스토리(다크 섹션) → 힙케어3종 카드 →
   소셜 프루프(신뢰지표+후기4종) → 푸터.
3. **SHOP 페이지**: 카테고리 필터 pill(클릭 시 활성 표시만, 실제 필터링 없음), 정렬 드롭다운(장식),
   9개 상품 카드(JS로 렌더링), 페이지네이션(장식).
4. **결제(Checkout) 페이지**: 배송지 정보 / 결제수단(라디오, 선택 시 하이라이트) / 약관동의 체크박스 +
   우측 고정 주문요약(쿠폰/마일리지/할인/총액). "결제하기" 클릭 시 주문완료 오버레이 표시 후 홈으로 복귀.
5. **관리자 페이지**: 좌측 사이드바(메인 배너 관리만 활성, 나머지는 placeholder) + 배너 이미지/URL/문구/
   버튼/노출여부 편집 폼 + 실시간 미리보기 카드.
6. **페이지 간 링크**: 로고→홈, GNB의 SHOP→shop.html, 상품 카드 "장바구니 담기"→checkout.html,
   결제 완료→index.html, 푸터 하단 "관리자"→admin.html.
7. **GNB 로고**: 전체 페이지(헤더/푸터/관리자 상단바)에 `Logo Color Adjustment_black.png`(원형 엠블럼)를 적용.
8. **GNB 언어 선택**: 지구본 아이콘 클릭 시 언어 목록(한국어 ko-KR 대한민국 / English en-US 글로벌 /
   简体中文 zh-CN 중국 본토 / 繁體中文 zh-TW 대만 / 繁體中文 zh-HK 홍콩)이 드롭다운으로 표시됨
   (항목 자체는 클릭 동작 없음 — 목록 노출용).
9. **장바구니 페이지**: GNB 장바구니 아이콘 → cart.html, 상품 카드의 "장바구니 담기" → cart.html →
   "주문하기" → checkout.html 순서로 흐름 연결.
10. **서브 페이지 6종 신규 제작**: brand / event / community / cs / partnership / cart
    (Figma에 추가된 프레임을 그대로 반영), GNB에 PARTNERSHIP 메뉴 추가.

## 4. 현재 작업 진행 상태
- **완료**: 4개 페이지(홈/샵/결제/관리자) HTML, 공통 CSS, 공통 JS 작성 완료. 이미지 매핑 및 복사 완료.
- Figma의 실제 텍스트/카피/가격/구조를 그대로 반영 (design-to-code 결과 기반).
- 브라우저에서 직접 열어 확인 필요 (아래 "테스트 방법" 참고) — 이번 세션에서 실제 브라우저 렌더링 검증은
  수행하지 못했음 (헤드리스 브라우저 도구 없음).

## 5. 최근 변경 이력
- 2026-09-05: test_mall 폴더 생성(권한 문제로 sudo 필요 — 아래 이슈 참고) 후
  index.html / shop.html / checkout.html / admin.html / style.css / main.js / 이미지 자산 신규 작성.
- 2026-09-05 (2차): Figma에 추가된 화면 반영 — brand/event/community/cs/partnership/cart 6개 페이지 신규 제작,
  GNB에 PARTNERSHIP 메뉴 및 장바구니 아이콘 추가, 언어 선택 드롭다운(비클릭형 목록) 구현,
  전 페이지 로고를 `Logo Color Adjustment_black.png`로 교체, "발표용 목업" 배지 전체 페이지에서 제거.
- 2026-09-05 (3차): 메인 페이지 상품 카드 할인율 표시를 스크린샷 순서(평점 → 정가/할인율 배지/할인가 한 줄 → 재고)로 재구성.
  Google Fonts CDN 의존 제거 — Noto Sans KR/Inter 폰트 131개 woff2 파일을 다운로드해 `assets/fonts/`에 내장하고
  `assets/css/fonts.css`로 로컬 @font-face 정의, 전 페이지에서 인터넷 없이도 동일 폰트로 표시되도록 변경.

## 6. 미완료 작업 및 TODO
- [ ] 실제 브라우저(모바일 폭 포함)에서 시각 검증 및 미세 여백/폰트 조정
- [ ] EVENT / COMMUNITY / CUSTOMER CENTER / 관리자 사이드바의 다른 메뉴 등은 Figma에 디자인이
      없어 `#` placeholder 링크로만 되어 있음 — 필요 시 페이지 추가 제작
- [ ] 히어로 배너 좌우 화살표는 클릭 시 콘솔 로그만 출력 (실제 슬라이드 전환 미구현) — 필요 시 JS 캐러셀 로직 추가
- [ ] `image/` 폴더의 원본 샘플들을 실제로 활용할지, 삭제/정리할지 결정 필요 (사용자 확인 필요)

## 7. 알려진 이슈
- `/var/www` 디렉토리가 root 소유라 일반 사용자 권한으로 폴더 생성이 안 되어, WSL sudo로
  test_mall 폴더를 만들고 소유권을 ubuntu로 변경한 뒤 작업을 진행함 (sudo 비밀번호를 몰라 한 차례
  재설정 필요했음).
- 작업 도중 `test_mall/image/` 하위에 `D:\내 드라이브\CSC\image sample` 원본 파일 전체(케릭터 폴더 포함,
  다수의 `:Zone.Identifier` 스트림 포함)가 이미 존재하는 것을 확인함. 이번 세션에서 생성한 것이 아니며
  원인 미상 — 별도의 동기화 프로세스 또는 이전 작업으로 추정됨. 사이트 동작에는 영향 없음.

## 8. 로컬 확인(테스트) 방법
1. WSL 안에서 정적 서버 실행 (예: `cd /var/www/test_mall && python3 -m http.server 8080`)
2. Windows 브라우저에서 `http://localhost:8080/index.html` 접속
3. 브라우저 개발자도구로 반응형 폭(375px 등) 전환하며 확인
4. 또는 Windows 탐색기에서 `\\wsl.localhost\Ubuntu-24.04\var\www\test_mall\index.html` 더블클릭으로도 바로 열람 가능
