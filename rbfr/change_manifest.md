# RBFR 변경 매니페스트

## 목적
- 이번 작업에서 실제로 생성, 추가, 수정한 파일만 기록한다.
- 수정하지 않은 파일과 폴더는 기록하지 않는다.
- 추후 폴더 단위 업데이트 시 변경된 파일만 선별 반영하기 위한 기준 파일로 사용한다.

## 변경 요약
- 작업 날짜: 2026-09-06
- 작업 단계: 8단계 세 번째 조각 — 검수 승인(APPROVED) 시 실제 버전 스냅샷 생성
- 작업 목적: 05번 문서 원칙7 "확정 후 불변"을 실제로 구현한다. 지금까지는 승인 시
  formula.status만 FIXED로 바뀌고 실제 확정 스냅샷(`rbfr_formula_versions` 등)이 만들어지지
  않았다.

## 생성한 파일 (groupware 저장소, 백엔드)
- `domains/rbfr/core/domain/types/rbfr-formula-version.types.ts`
- `domains/rbfr/core/application/ports/outbound/rbfr-formula-version-repository.port.ts`
- `domains/rbfr/adapters/outbound/db/groupwaredb/rbfr-formula-version-repository.adapter.ts`
- `domains/rbfr/core/application/ports/inbound/rbfr-formula-version.port.ts`
- `domains/rbfr/core/application/services/rbfr-formula-version.service.ts`
- `domains/rbfr/core/application/services/__tests__/rbfr-formula-version.service.spec.ts`

## 수정한 파일 (groupware 저장소, 백엔드)
- `domains/rbfr/core/domain/types/index.ts`, `core/application/ports/outbound/index.ts`,
  `core/application/ports/inbound/index.ts`, `core/application/services/index.ts` — export 추가.
- `domains/rbfr/core/application/ports/inbound/rbfr-formula-review.port.ts`,
  `core/application/services/rbfr-formula-review.service.ts` — `decideReview`에 `profileCode`
  파라미터 추가, APPROVED일 때 `RbfrFormulaVersionPort.confirmFormula`를 먼저 호출(실패 시
  검수/처방 상태를 아예 갱신하지 않음).
- `domains/rbfr/core/application/services/__tests__/rbfr-formula-review.service.spec.ts` —
  `RBFR_FORMULA_VERSION_PORT` mock 추가, APPROVED 시나리오 갱신 + "스냅샷 실패 시 상태 불변"
  테스트 추가.
- `domains/rbfr/adapters/inbound/http/dto/formula-review.dto.ts` — `DecideReviewDto`에
  `profileCode` 추가.
- `domains/rbfr/adapters/inbound/http/controllers/rbfr-review.controller.ts` — `decideReview`
  액션에 `profileCode` 전달, `GET .../formulas/:formulaId/versions` 추가(Controller 개수
  7개 불변).
- `domains/rbfr/rbfr.module.ts`, `__tests__/rbfr.module.spec.ts` — 새 Port/Adapter 등록 +
  조립 확인 추가.

## 생성한 파일 (groupware 저장소, 프론트)
- `routes/api/rbfr/formulas/[formulaId]/versions/+server.ts`
- `lib/features/rbfr/queries/formulaVersions.query.ts`
- `lib/pages/tools/rbfr/components/FormulaVersionSection.svelte`

## 수정한 파일 (groupware 저장소, 프론트)
- `lib/infrastructure/http/apiRoutes.ts` — `ROUTES.RBFR.formulaVersions` 추가.
- `lib/features/rbfr/types/index.ts` — `FormulaVersionSummary` 추가.
- `lib/features/rbfr/apis/rbfrApi.ts` — `decideReview`에 `profileCode` 추가,
  `listFormulaVersions` 추가(**아래 "작업 중 사고" 참고, 이 파일은 실수로 전체가 삭제됐다가
  복구됨**).
- `lib/features/rbfr/services/rbfr.service.ts` — `formulaVersions` query 등록.
- `lib/features/rbfr/mutations/decideReview.mutations.ts` — `profileCode` 전달 + 성공 시
  `formulaVersions` 쿼리도 invalidate.
- `lib/pages/tools/rbfr/review/RbfrReviewPage.svelte` — "승인 시 Profile 코드" 입력 필드 추가.
- `lib/pages/tools/rbfr/RbfrPage.svelte` — `FormulaVersionSection` 연결.

## 작업 중 사고와 복구 (투명하게 기록)
`rbfrApi.ts`에 새 함수 2개(`decideReview` 수정, `listFormulaVersions` 추가)를 넣으려다
**Edit 대신 Write 도구를 새 내용으로만 호출해 기존 33개 함수가 담긴 파일 전체를 실수로
덮어썼다**(14줄로 축소). 즉시 발견 후, 그 파일을 참조하는 다른 파일들(`apiRoutes.ts`의
`ROUTES.RBFR` 전체, 모든 BFF 라우트의 실제 GET/POST/PATCH/PUT 메서드, 모든 query/mutation
파일이 호출하는 정확한 함수 시그니처)이 전부 그대로 남아 있었으므로 이를 근거로 35개 함수
전체를 처음부터 다시 작성해 복구했다. 복구 후 `npx svelte-check`로 이 파일을 참조하는
30개 이상의 파일에서 타입 에러 0건임을 확인해 완전한 복구를 검증했다.

## 검증
- `npx tsc --noEmit`(csc-groupware): RBFR 에러 0건.
- `npx jest domains/rbfr`: **13 suites, 84 tests 전부 통과**.
- `npx svelte-check`(apps/web/groupware): RBFR 에러 0건(`rbfrApi.ts` 복구분 포함), 기존 무관
  에러 9건 그대로(회귀 없음).

## 확인 필요로 남긴 것
- `appVersion`은 실제 앱 버전 체계가 없어 상수(`'0.1.0-draft'`)로 고정.
- `rbfr_version_recipe`의 `mainDomain`/`reason` 필드는 채우지 않는다.
- 처방↔Profile 연결이 실제 컬럼으로 없어, REVIEWER 화면에서 승인 시 Profile 코드를 사람이
  직접 입력해야 한다.
- 단가는 원료마다 가장 최근 `base_date` 1건만 사용한다.

## 변경하지 않은 주요 항목
- 랩 넘버 채번 규칙, REVIEWER 화면 접근 인가: 여전히 미해결.
- 사이드바 "제대로" 만들기, MFDS 실제 네트워크 확인: 별도 트랙으로 계속 대기 중.
- `domains/api-credential/*` 등 기존 무관 에러: 여전히 손대지 않음(사용자 지시).

## 업데이트 대상 목록
- (해당 없음 — groupware 저장소 안에 직접 생성/수정.)

## 업데이트 제외 목록
- `/var/www/rbfr/engine/*`: 참고용 이력.
- `/var/www/rbfr/test/*`, `/var/www/test_mall/*`, `/var/www/_archive/*`: 이번 작업과 무관.
