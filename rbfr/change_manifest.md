# RBFR 변경 매니페스트

## 목적
- 이번 작업에서 실제로 생성, 추가, 수정한 파일만 기록한다.
- 수정하지 않은 파일과 폴더는 기록하지 않는다.
- 추후 폴더 단위 업데이트 시 변경된 파일만 선별 반영하기 위한 기준 파일로 사용한다.

## 변경 요약
- 작업 날짜: 2026-09-06
- 작업 단계: 6번째 등록 지점 — 사이드바(관리자 대시보드 타일) 메뉴 등록
- 작업 목적: RBFR 화면 4개가 전부 완성됐으니 URL 직접 입력 없이 클릭으로 들어갈 수 있게 한다.
  조사 결과 "FeatureKey 게이팅 사이드바"라는 완결된 등록 지점이 그룹웨어에 없어(RBFR이 그
  방식의 첫 사례), 사용자 승인을 받아 기존 관리자 대시보드 타일을 임시로 재사용했다.

## 생성한 파일 (groupware 저장소, 프론트)
- `static/assets/icon/dashboard/rbfr.svg`

## 수정한 파일 (groupware 저장소, 프론트)
- `lib/shared/lib/stores/tilesStore/tile.types.ts` — `TileIconName`에 `'rbfr'` 추가,
  `href` 필드 의미 확장(`/`로 시작하면 orgSlug 바로 아래 절대경로, 기존 상대경로 동작은
  하위 호환 유지).
- `lib/shared/lib/stores/tilesStore/tilesStore.svelte.ts` — RBFR 타일 1개 추가
  (`requireOrgManage: true`, `href: '/tools/rbfr'`).
- `lib/pages/admin/dashboard/components/Tile.svelte` — href 조립 로직을 절대경로(`/`로
  시작)도 지원하도록 확장(기존 타일 동작 무변경), `TILE_TINT`에 `rbfr` 색상 추가.

## 검증
- `npx svelte-check`(apps/web/groupware): 새 코드 에러 0건, 기존 무관 에러 9건 그대로
  (회귀 없음).

## 의도적 한계 (다음에 "제대로" 만들 때 참고)
- **FeatureKey 검증 없이 "조직 관리 가능자"에게만 노출하는 임시 게이트다.** 진짜 인가는
  아니고 UX 가시성 제어일 뿐이다.
- URL 직접 접근 차단(서버 가드)이 아직 없다 — `routes/[orgSlug]/tools/rbfr/**` 밑에
  `+page.server.ts`가 하나도 없다.
- `CurrentUser` 타입에 `features` 필드 자체가 없어 FeatureKey 클레임이 프론트엔드로 아예
  안 내려온다. 나중에 제대로 만들려면 이 배선(타입 추가 + `+layout.server.ts` 등 수정) +
  진짜 main GNB 신설이 필요하다 — 이건 RBFR 전용이 아니라 그룹웨어 공용 인증 계층을 건드리는
  작업이라 다른 개발자와 조율이 특히 필요하다.

## 변경하지 않은 주요 항목
- `domains/api-credential/*` 등 기존 무관 에러: 여전히 손대지 않음(사용자 지시).
- MFDS 실제 네트워크 연결/프론트 연동: 여전히 보류.

## 업데이트 대상 목록
- (해당 없음 — groupware 저장소 안에 직접 생성/수정.)

## 업데이트 제외 목록
- `/var/www/rbfr/engine/*`: 참고용 이력.
- `/var/www/rbfr/test/*`, `/var/www/test_mall/*`, `/var/www/_archive/*`: 이번 작업과 무관.
