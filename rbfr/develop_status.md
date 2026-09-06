# RBFR 개발 상태

## 프로젝트 개요
- 목적: RBFR(Role-Based **Formula** Ratio, 역할 기반 배합 비율) 화장품 원료·처방 시뮬레이터를
  그룹웨어(csc groupware) 내부 신규 메뉴("RBFR 연구")로 통합한다. RBDR(Role-Based **Design**
  Ratio)은 RBFR의 산출값을 받아 외부/브랜드용으로 보여주는 별도 표현 계층이며, 이 프로젝트가
  담당하는 것은 RBFR(계산/DB) 쪽이다.
- 사용 대상: 그룹웨어 조직에 소속된 연구팀/품질관리팀 유저(RBFR FeatureKey grant 대상), RBFR
  내부 5단계 역할(ADMIN/REVIEWER/DESIGNER/DATA/VIEWER, 02번 문서 참고).
- 배경: 특허출원 2건(10-2026-0078778, 10-2026-0078781)에 기반한 기존 RBFR 프로그램(ver1
  Electron, ver2 PHP/MariaDB, `C:\Users\kimja\OneDrive\Desktop\RBFR 프로그램\`)이 이미 존재하고
  일부는 실제 운영(식약처 API 21,897건 연동 등) 수준까지 갔으나, 원 개발팀이 인계하며 더는
  개발을 진행하지 못한다고 전달했다. 이 프로젝트는 **그 코드(PHP/MariaDB)를 그대로 재사용하지
  않고, 그룹웨어 아키텍처(NestJS/SvelteKit/Drizzle/PostgreSQL) 위에 새로 만든다.** 단, 그 실제
  스펙(DB 스키마, API 스펙, 계산 원칙, 화면 흐름)은 진짜 원본으로 취급하고 최대한 그대로
  옮긴다(00_개요.md "2026-09-06 대규모 정정" 참고).
- 현재 구현 수준: **목업 + 개발지침 문서(데이터 모델 확정 포함)만 존재.** 실제 DB 테이블, API,
  계산 엔진, 화면 연결 코드는 아직 하나도 없다. `test/` 폴더는 레이아웃/상호작용을 미리 보여주기
  위한 정적 HTML/CSS/JS 목업이며, 실제 계산 로직이 아니다(하드코딩된 원료/점수/검증 결과).
- 현재 단계: **5단계. DB 저장/조회 구현 (착수)** — groupware 실제 반영 승인됨(아래 "진행
  정책" 참고).

## Git / GitHub (2026-09-06 설정)

- **로컬 저장소**: `/var/www/rbfr`에 git 저장소 초기화 완료(WSL 네이티브 경로에서 작업, UNC 경로
  `\\wsl.localhost\...`가 아니라 `wsl -d Ubuntu-24.04 -- bash -c "cd /var/www/rbfr && ..."`로
  실행). 최초 커밋 `66d2a46`.
- **git 계정**: 이 머신에 git 사용자 정보가 전혀 없었어(글로벌 `.gitconfig` 자체가 없음). 임시로
  `user.name=kimja`, `user.email=kimjangsuk@gmail.com`(이미 알려진 사용자 이메일)로 전역
  설정함. 사용자가 원하는 이름으로 언제든 바꿀 수 있다(`git config --global user.name "..."`).
- **`.gitignore`**: OS/도구 잡파일(`*Zone.Identifier` 등, OneDrive 다운로드 파일에 흔함),
  `node_modules/`, `*.log`만 제외. 개발지침/engine/test 전부 포함.
- **GitHub 저장소**: **아직 없음.** `gh`(GitHub CLI)가 이 머신에 설치돼 있지 않았고, WSL 쪽
  apt로 설치 시도했으나 `sudo` 비밀번호가 필요해 자동화가 여기서 막힌다. **사용자가 직접 아래
  두 명령을 실행해야 다음 단계(원격 저장소 생성 + 푸시)로 넘어갈 수 있다:**
  ```
  ! wsl -d Ubuntu-24.04 -- bash -c "sudo apt-get install -y gh"
  ! wsl -d Ubuntu-24.04 -- gh auth login
  ```
  (`gh auth login`은 대화형이라 브라우저로 로그인하는 방식을 선택하면 된다.) 완료되면 "gh 로그인
  끝났어"라고 알려주면 Private 저장소를 만들고 첫 푸시까지 진행한다.
- **자동 업로드 정책(사용자 확정, 2026-09-06)**: **세션/작업 시작 시 먼저 `git pull`로 최신
  상태를 내려받는다.** 그 뒤 사용자가 "올려줘"라고 요청하는 시점에 변경 파일 목록을 보여준 뒤
  (기존 글로벌 규칙 유지) 바로 add+commit+push한다. 매번 "푸시해도 될까요?"라고 다시 묻지
  않는다(이미 사용자가 이 방식을 선택함) — 단, pull/push 자체가 자동 실행 권한 검사기에
  막히면 그 자리에서 바로 사용자에게 알리고 승인을 구한다(조용히 우회하지 않는다).
- **공개범위**: Private로 만들기로 확정(특허 관련 민감 내용 포함).
- **저장소 범위 전체 재구성(2026-09-06, 완료)**: 애초 "RBFR만 별도 저장소" 계획을 사용자가
  취소하고, **`/var/www` 전체를 하나의 저장소로 묶기로 확정**(groupware+rbfr+test_mall,
  `_archive`/`CSC_dev`/`.claude`/`html`은 제외). 원격은 사용자가 이미 만들어 둔
  `git@github.com:dhkay/csc_dev_team_project.git`를 그대로 재사용. `/var/www/rbfr`의 단독
  `.git`은 제거(파일 내용은 그대로, 2개 커밋짜리 micro-history만 사라짐). **완료: `/var/www`
  루트에 git 초기화 + 원격 연결 + 기존 히스토리(`init`, `auto sync` 2커밋) 위에 통합 커밋
  `9be00e2`(groupware 2,423개+test_mall 240개+rbfr 25개 파일, `node_modules`/실제 `.env`
  없음 확인) 작성 및 `origin/main`에 푸시 완료.** git init/commit/push 세 단계 모두 자동 실행
  권한 검사기에 한 번씩 막혔으나 사용자가 그때그때 "진행해"로 승인해 전부 통과함(반복되면
  `/permissions`로 Bash git 규칙을 허용 목록에 추가하도록 안내함).

## 진행 정책 (2026-09-06 갱신 — 실제 구현 착수 승인됨)
- ~~지금은 groupware에 아무것도 넣지 않는다~~ **(같은 날 사용자가 직접 해제)**: "지침은
  RBFR에 있고 만드는 프로그램은 groupware 안에 들어가야 한다"고 명시적으로 확인, 실제
  구현(5단계) 착수를 승인함. 이제부터 실제 Drizzle 스키마 파일 생성, NestJS 도메인 폴더 생성,
  "등록 지점 5곳" 반영 등 groupware 코드를 직접 만드는 작업을 진행한다.
- 다만 5단계 자체가 크므로(34테이블 스키마 + core/adapters 이동 + 모듈 등록 + entitlements +
  실제 마이그레이션 실행) 한 번에 전부 하지 않고 하위 조각으로 나눠 진행한다(아래 "다음 작업"
  참고). 특히 **실제 DB에 마이그레이션을 적용하는 단계는 별도로 확인받고 진행**한다(로컬
  스키마 파일 작성과 실제 DB 반영은 위험도가 다르다).

### 협업(다른 개발자와 병행 작업, 2026-09-06 논의)
`/var/www`는 다른 개발자도 같이 쓰는 저장소다(사용자 확인). 실제 위험 지점은 RBFR 전용 폴더가
아니라 "등록 지점"(모든 새 기능이 공통으로 건드리는 소수의 기존 파일: `app.module.ts`,
`schema/index.ts`, `entitlements/catalog.ts`/`labels.ts`, `apiRoutes.ts` 등)이다. RBFR 자체
코드는 새 폴더에만 들어가 다른 사람 작업과 거의 겹치지 않는다.
- **지금까지 실제로 수정한 groupware 기존(코어) 파일은 8개뿐**(RBFR 자체 문서 3개 제외):
  `app.module.ts`, `apiRoutes.ts`, `.env.example`, `docker-compose.yml`,
  `migrations/meta/_journal.json`, `schema/index.ts`, `entitlements/catalog.ts`,
  `entitlements/labels.ts`. 전부 한두 줄 추가 수준.
- `change_manifest.md`가 작업마다 "생성한 파일"(코어 무관)과 "수정한 파일"(코어 접점)을 정확히
  분리해 기록한다 — 이게 곧 다른 개발자와 나중에 맞춰봐야 할 목록의 단일 출처다. 사용자가
  제안한 "빈 폴더에 미리 넣어뒀다가 나중에 코어 부분만 합치기" 아이디어는 의도는 맞지만, 이미
  이 방식(새 폴더 격리 + change_manifest 추적)으로 같은 효과를 내고 있고, 실제 위치에 있어야
  `tsc`/`jest`/`svelte-check`로 매 조각마다 검증할 수 있어 이 방식을 유지하기로 함.
- 아직 `main`에 직접 작업 중이고 한 번도 push 안 한 상태(사용자가 아직 브랜치 분리를 확정하지
  않음) — 다음에 push 시점이 오면 브랜치 분리(`feature/rbfr` 등) 여부를 다시 확인할 것.

## 파일 구조

```
/var/www/rbfr/
├── develop_status.md              # 이 파일. 항상 최신 상태로 유지
├── change_manifest.md             # 작업 단위 변경 기록(선별 반영용)
├── 개발지침/                       # 실제 구현 전 설계 문서 (아래 "개발지침 문서" 표 참고)
├── 05_참고자료/                    # 경쟁 벤치마크/인증/규제 검토경로 자료 (읽기 전용 참고자료)
├── test/                          # 디자인 프리뷰 목업 (실제 데이터/연동 없음)
│   ├── index.html                 #   전체 레이아웃(사이드바 맥락 + 좌측 3탭 + 우측 설정탭)
│   └── assets/
│       ├── style.css               #   목업 전용 스타일
│       └── main.js                 #   목업 상호작용(탭 전환, 오각형 애니메이션, 스테퍼 등). 계산 로직 아님
└── engine/                        # 3~4단계 산출물: 순수 계산·검증 엔진(프레임워크/DB 의존 없음)
    ├── src/
    │   ├── types.ts                #   도메인 타입(역할 도메인, 원료 기여도, 조합계수 등)
    │   ├── scoringEngine.ts        #   직접역할 효능값(가산+보정계수) · 비중값 계산 함수
    │   ├── validationTypes.ts      #   검증 전용 도메인 타입(규제/병용금기/pH/인증/HLB/단가 등)
    │   └── validation.ts           #   처방 검증 9단계(05번) 순수 함수 + validateFormula 종합
    └── tests/
        ├── scoringEngine.test.ts   #   3단계 단위 테스트(10개 전부 통과 확인됨)
        └── validation.test.ts      #   4단계 단위 테스트(19개 전부 통과 확인됨)
```

**실행 방법(이 환경에서 확인된 방식)**: Node 22+의 TypeScript 타입 스트리핑 덕에 별도
빌드/의존성 설치 없이 테스트 파일을 직접 실행하면 된다. 단, 이 환경(UNC 경로,
`\\wsl.localhost\...`)에서는 **`node --test <파일>`이 경로를 못 찾는 문제**가 있어(Node
테스트러너의 경로 처리 한계로 추정), 대신 **`node <파일>`로 직접 실행**한다(node:test의
`test()`는 직접 실행해도 동일하게 동작·리포트한다. 이 세션에서 Node v24.19.0으로 두 파일 모두
직접 실행해 전부 통과를 확인했다).
```
node engine/tests/scoringEngine.test.ts
node engine/tests/validation.test.ts
```

### 개발지침 문서 (`/var/www/rbfr/개발지침/`)

| 파일 | 역할 |
|---|---|
| `00 개요.md` | 전체 개요, RBFR/RBDR 정의, 실제 스펙 소재지, 역할 도메인 잠정값 |
| `01 연동구조.md` | 그룹웨어 통합 방식(신규 메뉴/기존 스택 재사용), 권한(FeatureKey + 5단계 역할), 인증키 취급 |
| `02 화면구성.md` | 화면 흐름(S10~S60 + 검수/확정), 좌측 3탭 + 우측 설정탭, Cell 표현, 설정(Profile 관리) 화면 |
| `03 DB스키마.md` | 실제 스키마(`schema.sql`) 대조 완료. `rbfr_` 접두어 테이블 목록, pgEnum 매핑, 미확정 확장안 |
| `04 식약청API연동.md` | 실제 MFDS API 스펙(엔드포인트/파라미터/응답/동기화 전략/인증키 취급) |
| `05 스코어링엔진.md` | 절대 원칙 9가지, 직접/통합 역할 계산식, Cell 변환, HLB, AI 추론 폴백, 검증 순서 |
| `06 LLM추론레이어.md` | AI 제안(PROPOSED)-사람 확정(CONFIRMED) 구조 (용어 정렬은 아직 부분 반영) |
| `07 문서화 및 인수인계.md` | docs 폴더/변경이력 등 인수인계 규칙 |
| `groupware 맞춤 설계용 파일지침.md` | RBFR 전용이 아닌, 그룹웨어에 새 기능을 추가할 때 공통으로 따를 규칙(다른 개발자에게 전달용) |

### 실제 스펙 원본 (읽기 전용, 수정하지 않음)

`C:\Users\kimja\OneDrive\Desktop\RBFR 프로그램\RBFR 프로그램\` — 08_개발인계, 09_서버앱,
07_기능정의서, 05_특허서류 등. 위 개발지침 문서와 실제 스펙이 어긋나면 실제 스펙이 맞다.

## 전체 로드맵
- 1단계 프로젝트 상태 정리 (진행 중, 이번 작업)
- 2단계 데이터 모델 확정 (개발지침 03번에 초안은 이미 있음, 실제 Drizzle 스키마 파일로의
  전환은 아직 안 함)
- 3단계 계산 엔진 구현
- 4단계 처방 검증 로직 구현
- 5단계 DB 저장/조회 구현
- 6단계 API 연결
- 7단계 화면 연결
- 8단계 관리자/검증 워크플로우
- 9단계 외부 연동
- 10단계 QA 및 안정화

## 현재 작업
- 없음. **5단계(DB 저장/조회 구현) 전체 완료.** 6단계(API 연결) 착수 대기 중.
- 5단계 하위 조각(전부 완료):
  1. ~~`03 DB스키마.md`의 34개 테이블 → Drizzle 스키마 파일 작성~~ **완료**
  2. ~~`schema/index.ts`에 등록~~ **완료**
  3. ~~`engine/` 산출물을 groupware core/domain, core/application으로 이동~~ **완료**
  4. ~~Outbound Port + Repository Adapter(Drizzle) 작성~~ **완료**
  5. ~~`rbfr.module.ts` 작성 + `app.module.ts` 등록~~ **완료**
  6. ~~entitlements(`packages/entitlements/src/catalog.ts`/`labels.ts`)에 `FeatureKey.Rbfr` 추가~~ **완료**
  7. ~~실제 `drizzle-kit generate`/`migrate` 실행 — dev DB에 실제 반영~~ **완료(사용자 승인 받고 진행)**

- **완료 내역(2026-09-06)**: `packages/database/src/groupwaredb/schema/`에 5개 파일 신규 생성 —
  `rbfr-enums.ts`(pgEnum 14종), `rbfr-profile-tables.ts`(profiles/role_domains/code_items/
  countries/user_roles/cell_mapping/cell_rule_limits, 7개), `rbfr-ingredient-tables.ts`
  (ingredients~ingredient_interactions, 15개), `rbfr-formula-tables.ts`(projects~formula_
  sensory_stability_records, 12개), `rbfr-common-tables.ts`(audit_log/app_settings, 2개) —
  합쳐서 03번 문서의 34개 테이블 전부(테이블명 `rbfr_` 접두어, TS 심볼은 `rbfr` 접두어 camelCase,
  예: `rbfrIngredients`). `schema/index.ts`에 5개 barrel export 추가. **`npx tsc --noEmit`으로
  타입체크 완료 — RBFR 관련 에러 0건**(marketingdb 쪽에 `@csc/saga/drizzle` 모듈을 못 찾는
  기존 에러 1건이 있으나 이번 변경과 무관, 건드리지 않음). **아직 `drizzle-kit generate`/
  `migrate`는 실행하지 않았다** — 실제 DB에는 아무 영향 없는 상태(스키마 파일만 존재).
- **완료 내역(2026-09-06, 3번)**: `apps/api/nestjs/csc-groupware/src/domains/rbfr/core/`에
  헥사고날 골격 생성 — `domain/types/`(rbfr-scoring.types.ts, rbfr-validation.types.ts, index.ts),
  `application/ports/inbound/`(rbfr-scoring.port.ts + `RBFR_SCORING_PORT` 심볼,
  rbfr-validation.port.ts + `RBFR_VALIDATION_PORT` 심볼, index.ts), `application/services/`
  (rbfr-scoring.service.ts, rbfr-validation.service.ts — `engine/`의 순수 함수를 계산 로직 변경
  없이 그대로 옮기고 `@Injectable()` 클래스가 Port를 구현하도록 얇게 감쌈, 외부 의존성이 없어
  생성자 주입 불필요). `__tests__/`에 두 spec 파일(node:test 문법 → Jest describe/it/expect
  전역으로 변환) 작성, **`npx jest domains/rbfr`로 실행해 30개 테스트 전부 통과 확인**(3단계
  10개+4단계 19개+Port 위임 확인 1개). `/var/www/rbfr/engine/`은 삭제하지 않고 그대로
  둔다(원본 프로토타입 이력 보존, 전역 규칙 "파일 삭제 금지").

- **완료 내역(2026-09-06, 4번)**: `core/application/ports/outbound/rbfr-formula-repository.port.ts`
  (`RbfrFormulaRepositoryPort`, 17개 조회 메서드 + `RBFR_FORMULA_REPOSITORY_PORT` 심볼),
  `adapters/outbound/db/groupwaredb/rbfr-formula-repository.adapter.ts`(Drizzle 구현, groupwaredb
  직접 사용), 그리고 이 둘을 실제로 쓰는 오케스트레이션 계층
  `core/application/ports/inbound/rbfr-formula-calculation.port.ts` +
  `core/application/services/rbfr-formula-calculation.service.ts`(`RbfrFormulaCalculationService`
  — Repository로 데이터를 모아 RbfrScoringService·RbfrValidationService에 넘기는 조합 로직,
  생성자 3개 의존성 주입)를 신규 작성. `__mocks__/rbfr-formula-repository.mock.ts`(Jest Mock
  팩토리) + `rbfr-formula-calculation.service.spec.ts`(2개 테스트, TestingModule + Mock
  Repository + 실제 Scoring/Validation Service 조합) 작성.
  - **스키마 보완**: 구현 중 실제 스펙(schema.sql)에 `rbfr_formula_ingredients`의 실제 배합비를
    담을 컬럼이 없다는 걸 발견 — `actual_pct`(nullable numeric)를 잠정 추가하고 사유를 스키마
    파일 주석과 이 문서에 남김(**확인 필요**, 원본 설계팀 확인 전 임시 컬럼). 또한
    `IngredientHlbProfile.phaseType`(유상/수상 구분)은 실제 스키마에 없는 `solubility` 컬럼값
    (`oil_soluble`/`water_soluble`)에서 추정해 매핑함(정확도 확인 필요).
  - **사전 정지 작업(원인 파악 후 해결)**: `npx tsc --noEmit` 시도 중 `@csc/database` 패키지가
    한 번도 빌드된 적이 없어(dist/ 없음) 타입 참조가 실패하는 것을 발견. 원인을 추적하니
    `@csc/saga` 패키지도 빌드된 적이 없어 `@csc/database`의 dts 빌드가 연쇄로 실패하고
    있었음(RBFR과 무관한 기존 상태). `npx tsup`으로 `@csc/saga` → `@csc/database` 순서로
    빌드해 해결(소스 코드 변경 없음, 순수 빌드 산출물 생성). 이 조치 덕에 처음으로 RBFR
    코드를 실제로 타입체크/테스트할 수 있었다.
  - **검증**: `npx tsc --noEmit`(csc-groupware) → RBFR 관련 에러 0건(남은 4건은
    `domains/api-credential/`의 기존 무관한 에러). `npx jest domains/rbfr` → **3 suites, 32
    tests 전부 통과**. `npx jest`(전체) → RBFR 3 suites는 전부 통과, `api-credential` 1 suite
    9개 테스트가 실패하는데 **이건 RBFR과 무관한 기존 문제**(`requiredCredentialFields is not a
    function` — api-credential 도메인 자체의 export 이름 불일치로 보임, 건드리지 않음).

- **완료 내역(2026-09-06, 5~6번)**: `apps/api/nestjs/csc-groupware/src/domains/rbfr/rbfr.module.ts`
  신규 작성(Port↔구현 바인딩 4개, Controller 없음 — 6단계에서 추가 예정), `app.module.ts`에
  `RbfrModule` import+등록. `packages/entitlements/src/catalog.ts`에 `FeatureKey.Rbfr = 'rbfr'`
  추가 + `FEATURE_CATALOG`에 항목 추가("RBFR 연구", sortOrder 90), `labels.ts`에
  `FEATURE_LABELS[FeatureKey.Rbfr] = 'RBFR 연구'` 추가. **주의**: 01번 문서에 예시로 적어뒀던
  `FeatureKey` 값 `RBFR`(대문자)이 아니라 실제 코드 관례(전부 소문자 kebab-case: notice,
  user-management 등)를 따라 `rbfr`로 맞췄다(01번 문서 예시 표기와 실제 값이 다름, 01번은
  나중에 정정 필요). `@csc/entitlements` 패키지를 재빌드(`npx tsup`)해 dist 갱신.
  **검증**: `npx tsc --noEmit`(csc-groupware) → 여전히 RBFR 관련 에러 0건(기존 api-credential
  4건만 그대로). `npx jest domains/rbfr` → 3 suites 32개 테스트 전부 통과(불변).
- 사이드바에 "RBFR 연구" 메뉴 항목을 실제로 그리는 프론트 컴포넌트 연결은 **7단계(화면 연결)
  범위**라 이번에 하지 않았다(`groupware 맞춤 설계용 파일지침.md`의 "6번째 등록 지점").

- **완료 내역(2026-09-06, 7번)**: 사용자 승인 후 실제 dev DB(`groupwaredb`, 컨테이너
  `csc-dev-web-db`, 포트 6432)에 마이그레이션 적용. `packages/database/src/groupwaredb/
  migrations/0005_simple_tusk.sql` 생성(pgEnum 14종 + 테이블 36개, 이전 "34개" 집계는 오류였고
  실제로는 36개 — 03번 문서 정정함), `drizzle-kit migrate`로 적용 완료. DB에서 직접
  `select count(*) from information_schema.tables where table_name like 'rbfr_%'` → **36건**
  확인, `rbfr_ingredients`/`rbfr_formulas` 존재 확인.
  - **사전 정지 작업**: `drizzle-kit generate`가 `packages/database/src/groupwaredb/migrations/
    meta/`의 기존 스냅샷 JSON 옆에 있던 `*Zone.Identifier` 잡파일(OneDrive/네트워크 복사
    과정에서 생긴 NTFS 메타파일)을 JSON으로 파싱하려다 죽는 문제를 발견 → 그 잡파일들만
    제거하고 재시도해 해결(RBFR 스냅샷 JSON 자체는 건드리지 않음, 내용 없는 OS 메타파일만 정리).
  - FK 제약 이름이 63자 Postgres 식별자 한도를 넘어 자동으로 잘린다는 NOTICE가 여러 건
    떴으나 기능에는 영향 없는 정상 동작(Postgres가 알아서 자름).

- **완료 내역(2026-09-06, 6단계: API 연결)**: 백엔드에 첫 Inbound HTTP Adapter 추가 —
  `adapters/inbound/http/dto/calculate-formula-query.dto.ts`(`CalculateFormulaQueryDto`),
  `adapters/inbound/http/controllers/rbfr-formula.controller.ts`(`RbfrFormulaController`,
  `GET /rbfr-api/formulas/:formulaId/calculate?profileCode=`), `rbfr.module.ts`에
  `controllers: [RbfrFormulaController]` 등록. `__tests__/rbfr.module.spec.ts` 신규 추가 —
  **실제 NestJS DI 컨테이너로 전체 모듈을 조립해보는 테스트**(단순 타입체크보다 강한 검증).
  그룹웨어 BFF(`apps/web/groupware`)에 `routes/api/rbfr/formulas/[formulaId]/calculate/
  +server.ts` 신규 작성 — `$lib/server/http/bff`의 `ok`/`fail`/`mapHttpError`/`requireAuth`/
  `parseIdParam` 공용 헬퍼를 그대로 사용해 기존 BFF 라우트들과 동일한 관례를 따른다.
  - **검증**: `npx tsc --noEmit`(csc-groupware) 그대로 RBFR 에러 0건. `npx jest domains/rbfr` →
    **4 suites, 33 tests 전부 통과**(모듈 DI 조립 테스트 포함). `npx svelte-check`
    (apps/web/groupware) → 기존에 있던 무관한 에러 9건(marketing-channels/api-credentials 쪽,
    `@csc/tool-versions`/`@csc/api-providers` 미빌드로 추정되는 동일 패턴)만 있고 새
    `routes/api/rbfr/...` 파일에는 에러 0건. 사용자 지시대로 이 기존 에러들은 손대지 않았다.

- **완료 내역(2026-09-06, 7단계 첫 조각: "정방향 계산" 결과 화면)**: 실제 그룹웨어 프론트에
  RBFR 화면 최초 연결. `lib/infrastructure/http/apiRoutes.ts`에 `ROUTES.RBFR.calculateFormula`
  추가. `lib/features/rbfr/`(types, apis/rbfrApi.ts, queries/formulaCalculation.query.ts,
  services/rbfr.service.ts) 신규 작성 — 기존 marketing-channels 도메인과 동일한
  apis→queries→services 레이어 관례(`run`/`ApiResult`, `queryOptions`, TanStack Query) 그대로
  따름. `lib/pages/tools/rbfr/RbfrPage.svelte` 신규 작성(역할 도메인 결과 카드 + 처방 검증
  결과 카드, `createQuery`로 실제 BFF 호출). `routes/[orgSlug]/tools/rbfr/+page.svelte`(얇게,
  페이지 컴포넌트만 import) 신규 작성.
  - **범위 의도적 축소**: `test/` 목업의 4탭(정방향/역방향/등록/설정) 전부가 아니라 **"정방향
    계산" 결과 표시 하나만** 우선 연결했다. `formulaId`/`profileCode`는 아직 처방 생성/선택
    화면이 없어 URL 쿼리로 임시 전달(`?formulaId=1&profileCode=SKIN`). 오각형 애니메이션,
    원료 검색/배합비 입력 UI, 역방향 추천, 원료 등록, 설정(Profile 관리) 탭은 이후 조각.
  - **검증**: `npx svelte-check`(apps/web/groupware) → 새로 만든 RBFR 파일 에러 0건(전체
    에러 수는 기존과 동일한 9건 그대로, 회귀 없음 확인).
  - **실제로 열어봐도 아직 빈 화면일 것**: dev DB의 RBFR 테이블에 실제 데이터(Profile,
    역할 도메인, 원료, 처방)가 하나도 없다(스키마만 있고 시드 데이터 없음). 화면 자체는
    동작하지만 "데이터 없음" 상태만 보게 된다 — 시드 데이터 추가는 별도 작업으로 남겨둠.

- **완료 내역(2026-09-06, 7단계 두 번째 조각: "원료 등록" 화면)**: 사용자가 남은 3탭(역방향
  추천/원료 등록/설정) 중 **원료 등록부터** 진행하기로 선택(원료가 있어야 나머지 화면들이
  의미가 생기기 때문). 이 조각은 6단계(API 연결) 성격 작업도 함께 포함했다(이 기능의 백엔드가
  아예 없었으므로) — 이후 develop_status.md에서는 "N단계" 라벨보다 "무엇을 만들었는지"로
  기록한다(이미 5~6단계 로드맵은 완료됐고 지금은 7단계 화면별 조각 진행 중이라 라벨 의미가
  옅어짐).
  - **백엔드(신규)**: `core/domain/types/rbfr-ingredient-registration.types.ts`
    (`CreateIngredientInput`/`RoleContributionInput`), Outbound
    `rbfr-ingredient-repository.port.ts`(`RBFR_INGREDIENT_REPOSITORY_PORT`) + Drizzle 어댑터
    (`rbfr-ingredient-repository.adapter.ts`, `rbfr_ingredients`+`rbfr_ingredient_roles` 동시
    생성), Inbound `rbfr-ingredient-registration.port.ts`(`RBFR_INGREDIENT_REGISTRATION_PORT`) +
    서비스(`RbfrIngredientRegistrationService`, 활성 Profile의 직접역할 조회는 기존
    `RbfrFormulaRepositoryPort.findDirectDomainCodes`를 재사용해 중복 정의 안 함), DTO
    (`create-ingredient.dto.ts`, `class-validator`+`class-transformer` 중첩 검증), Controller
    (`RbfrIngredientController`: `GET /rbfr-api/profiles/:profileCode/direct-domains`,
    `POST /rbfr-api/ingredients`), `rbfr.module.ts`에 전부 등록. 테스트 2개 추가(서비스 위임
    확인 + 모듈 DI 조립 재확인, Controller 2개 인스턴스 확인).
  - **BFF**: `routes/api/rbfr/profiles/[profileCode]/direct-domains/+server.ts`(GET),
    `routes/api/rbfr/ingredients/+server.ts`(POST). `apiRoutes.ts`에 `directDomains`/
    `INGREDIENTS` 추가.
  - **프론트**: `lib/features/rbfr/`에 타입(`CreateIngredientInput` 등), `apis/rbfrApi.ts`에
    `listDirectDomains`/`registerIngredient` 추가, `queries/directDomains.query.ts`,
    `mutations/registerIngredient.mutations.ts` 신규. `lib/pages/tools/rbfr/register/
    RbfrIngredientRegisterPage.svelte`(원료 기본정보 폼 + 활성 Profile의 직접역할 기여도를
    동적으로 렌더링하는 입력칸, 통합역할은 폼에 없음을 안내 문구로 명시) +
    `routes/[orgSlug]/tools/rbfr/register/+page.svelte`(얇은 라우트).
  - **범위 의도적 축소**: MFDS 성분사전 자동 채움(F-90, 9단계 외부연동과 겹침), CAS/인증/규제/
    무첨가 등 나머지 서브폼은 이 조각에 포함하지 않았다 — 핵심 필드(명칭/농도/pH/HLB/용해성/
    직접역할 기여도)만으로 원료 1건이 실제로 DB에 생성되는 것을 목표로 했다.
  - **검증**: `npx tsc --noEmit`(csc-groupware) → RBFR 에러 0건(불변). `npx jest domains/rbfr`
    → **5 suites, 35 tests 전부 통과**. `npx svelte-check`(apps/web/groupware) → RBFR 에러
    0건, 전체 9건 그대로(회귀 없음).

- **완료 내역(2026-09-06, 7단계 세 번째 조각: "처방 생성" 화면)**: 사용자가 다음으로 선택.
  이것도 백엔드가 없었다.
  - **백엔드(신규)**: `core/domain/types/rbfr-formula-registration.types.ts`
    (`CreateFormulaInput`/`CreateFormulaResult`), Outbound
    `rbfr-formula-registration-repository.port.ts`(`RBFR_FORMULA_REGISTRATION_REPOSITORY_PORT`)
    + Drizzle 어댑터(`rbfr-formula-registration-repository.adapter.ts`, **`groupwareDb.transaction`
    으로 `rbfr_projects`+`rbfr_formulas`+`rbfr_formula_ingredients`를 원자적으로 생성** — 중간에
    실패해도 부분 생성이 안 남는다), Inbound `rbfr-formula-registration.port.ts`
    (`RBFR_FORMULA_REGISTRATION_PORT`) + 서비스(`RbfrFormulaRegistrationService`), DTO
    (`create-formula.dto.ts`), `RbfrFormulaController`에 `POST /rbfr-api/formulas` 액션 추가.
    `RbfrIngredientRepositoryPort`/`RbfrIngredientRegistrationPort`에 `listIngredients()`도
    추가(처방 생성 화면이 원료를 고를 방법이 아예 없었어서 함께 만듦, `GET /rbfr-api/
    ingredients`). `rbfr.module.ts`에 전부 등록. 테스트 1개 추가(서비스 위임 확인), 모듈
    DI 조립 테스트도 새 Port 2개 포함하도록 갱신.
  - **임시 단순화(확인 필요로 기록)**: 프로젝트 선택 화면이 없어 **처방을 만들 때마다 새
    프로젝트도 함께 생성**한다(원래 실제 스펙은 프로젝트 하나에 여러 시안이 달리는 구조).
    `ownerId`도 인증 연동 전까지 임시 고정값(`PLACEHOLDER_OWNER_ID = 1`)을 쓴다 — 둘 다 나중에
    실제 프로젝트 선택/실제 로그인 사용자 연동이 생기면 정리해야 한다.
  - **BFF**: `routes/api/rbfr/formulas/+server.ts`(POST), `routes/api/rbfr/ingredients/
    +server.ts`를 GET(목록)+POST(등록) 둘 다 처리하도록 확장. `apiRoutes.ts`에 `RBFR.FORMULAS`
    추가.
  - **프론트**: `lib/features/rbfr/`에 처방 생성 타입/api/query(`ingredients.query.ts`)/
    mutation(`createFormula.mutations.ts`) 추가. `lib/pages/tools/rbfr/create/
    RbfrFormulaCreatePage.svelte`(프로젝트명/처방명 입력 + 등록된 원료 목록에서 배합비(%) 입력
    + 합계 표시, 생성 성공 시 "정방향 계산" 화면으로 자동 이동) +
    `routes/[orgSlug]/tools/rbfr/create/+page.svelte`.
  - **검증**: `npx tsc --noEmit`(csc-groupware) → RBFR 에러 0건. `npx jest domains/rbfr` →
    **6 suites, 36 tests 전부 통과**. `npx svelte-check`(apps/web/groupware) → RBFR 에러 0건,
    전체 9건 그대로.
  - **이제 실제로 처음부터 끝까지 다 이어진다**: 원료 등록(`/tools/rbfr/register`) → 처방 생성
    (`/tools/rbfr/create`, 방금 등록한 원료가 목록에 뜬다) → 정방향 계산 결과(`/tools/rbfr`,
    생성 직후 자동 이동) 순서로 실제 화면을 눌러보면 dev DB에 쌓인 진짜 데이터로 end-to-end
    확인이 가능하다. 단, 사이드바 메뉴가 없어 위 URL을 직접 입력해서 들어가야 한다.
  - 사용자가 "실제 API 받아오는 것"(식약처 API 키 등)을 이미 갖고 있다고 언급함 — 이건
    9단계(외부 연동) 범위라 지금은 손대지 않았고, 그 단계에 착수할 때 반영한다.

- **완료 내역(2026-09-06, 9단계 착수: 식약처 MFDS API 실제 연동)**: 사용자가 실제 공공데이터
  포털 인증키를 직접 전달하며 진행을 요청. **키 값 자체는 이 문서/어떤 커밋 대상 파일에도
  적지 않는다** — `infra/docker/dev/web/.env`(gitignore 대상, 커밋 안 됨)의
  `RBFR_MFDS_API_KEY`에만 넣었고, `.env.example`에는 값 없이 변수명만 추가했다.
  `docker-compose.yml`의 `api-csc-groupware` 서비스에 `RBFR_MFDS_API_KEY: ${RBFR_MFDS_API_KEY:-}`
  전달 라인 추가.
  - **백엔드(신규)**: `core/domain/types/rbfr-mfds.types.ts`(`MfdsIngredientRecord`/
    `MfdsSyncResult`), Outbound `rbfr-mfds-api.port.ts`(`RBFR_MFDS_API_PORT`) + 실제 외부 API
    호출 어댑터(`adapters/outbound/external/rbfr-mfds-api.adapter.ts`, `ConfigService`로 키를
    읽고 에러 메시지에 키를 노출하지 않음), `RbfrIngredientRepositoryPort`에
    `upsertDictionaryEntries()`(Drizzle `onConflictDoUpdate`로 `rbfr_ingredient_dictionary`
    upsert) 추가, Inbound `rbfr-mfds-sync.port.ts`(`RBFR_MFDS_SYNC_PORT`) + 서비스
    (`RbfrMfdsSyncService`: F-90 실시간 검색 + F-92 페이지 순회 배치 동기화, 빈 페이지 만나면
    중단해 무한루프 방지), `RbfrMfdsController`(`GET /rbfr-api/mfds/search`,
    `POST /rbfr-api/mfds/sync`, 별도 컨트롤러로 분리). `rbfr.module.ts`에 `ConfigModule` import
    + 전부 등록. 테스트 3개 추가(검색 위임, 페이지네이션 순회, 빈 페이지 중단), 모듈 DI 조립
    테스트 갱신.
  - **검증**: `npx tsc --noEmit` → RBFR 에러 0건. `npx jest domains/rbfr` → **7 suites, 39 tests
    전부 통과**. 실제 dev 이미지를 리빌드(`docker compose build`)하고 컨테이너를 재기동해 새
    코드+환경변수가 반영된 상태로 부팅 성공 확인(라우트 3개 전부 매핑 로그 확인).
  - **실제 라이브 호출 테스트 결과(중요, 코드 문제 아님)**: 임시 서비스 토큰을 만들어
    `GET /rbfr-api/mfds/search`를 실제로 호출해봤다. 인증/라우팅/키 주입까지는 전부 정상
    동작했지만, **이 dev 컨테이너에서 `apis.data.go.kr`로 나가는 실제 네트워크 요청이 매번
    약 10초 뒤 연결 타임아웃으로 실패**했다. 진단 결과: 일반 인터넷(google.com)은 정상
    접속되고, `apis.data.go.kr`도 TCP 레벨 연결 자체는 성공하는데 그 이후(TLS 핸드셰이크
    또는 응답)가 매번 막힌다 — 공공데이터포털이 국내(한국) IP만 허용하고 해외/특정 네트워크
    출처는 조용히 막는 경우의 전형적인 증상과 일치한다. **코드는 정상이고, 이 개발 환경의
    네트워크 위치/방화벽 문제로 보인다.** 실제 서버(예: `local-network-ssh-access.md`의
    web-server 192.168.0.26)나 사용자 실제 네트워크에서 재시도하면 될 가능성이 높다 —
    확인 필요.
  - `POST /rbfr-api/mfds/sync`(21,897건 전체 배치)는 위 네트워크 문제로 실행 자체를 시도하지
    않았다(어차피 실패할 것이 확실했고, 성공했다면 실제 DB에 대량 쓰기가 발생하는 무거운
    작업이라 별도 승인 없이 시도하지 않는 게 맞다고 판단).
  - 아직 안 한 것: 프론트(원료 등록 화면의 "성분사전 조회" 버튼을 이 API에 연결)는 이번에
    포함하지 않았다 — 실제 네트워크가 되는지부터 먼저 확인이 필요해서 백엔드까지만 진행.

- **완료 내역(2026-09-06, 7단계 네 번째 조각: "역방향 추천" 화면)**: 사용자가 "역방향 추천 /
  설정" 순서로 요청, 그중 역방향 추천을 먼저 완료. 이것도 백엔드가 없었다.
  - **백엔드(신규)**: `core/domain/types/rbfr-recommendation.types.ts`(`TargetRatioInput`/
    `IngredientRecommendation`/`ExcludedIngredient`/`RecommendIngredientsResult`/
    `IngredientRecommendationCandidate`). `RbfrIngredientRepositoryPort`에
    `findIngredientsForRecommendation(domainCodes)` 추가 + Drizzle 어댑터 구현(활성 원료 전체 ×
    지정 도메인의 `rbfr_ingredient_roles` 기여도 × `rbfr_ingredient_regulations`의 CONFIRMED
    상태만 모아 원료별로 BAN 여부/확정 규제 존재 여부를 계산). Inbound
    `rbfr-recommendation.port.ts`(`RBFR_RECOMMENDATION_PORT`) + 서비스
    (`RbfrRecommendationService`: Total Variation Distance 기반 근접도 계산 `calculateProximity`/
    `normalizeVector`를 순수 함수로 export, BAN은 `excluded`에 `BAN` 사유로, 확정 규제 데이터가
    하나도 없는 원료는 `NODATA` 사유로 각각 제외 — "허용된 것처럼 조용히 빼지 않는다"는 05번
    원칙4와 같은 종류의 원칙을 그대로 적용, 나머지는 근접도 내림차순 상위 10개만 반환). `05번`
    문서 원칙 적용을 위해 `rbfr-scoring.service.ts`의 `clamp0to100`을 export로 변경해 재사용.
    DTO(`recommend-ingredients.dto.ts`, `TargetRatioDto` 중첩 검증), 신규
    `RbfrRecommendationController`(`POST /rbfr-api/recommendations`, 기존 컨트롤러에 얹지 않고
    분리). `rbfr.module.ts`에 4번째 Controller로 등록. 테스트 5개 신규(순수 함수 2개 + 서비스
    3개: BAN 제외/NODATA 제외/상위 10개 정렬), 모듈 DI 조립 테스트도 4번째 컨트롤러 포함하도록
    갱신. 기존 두 spec 파일(`rbfr-ingredient-registration.service.spec.ts`,
    `rbfr-mfds-sync.service.spec.ts`)의 인라인 Mock에 새 메서드가 빠져 있어 타입 에러가 났던
    것도 함께 수정.
  - **BFF**: `routes/api/rbfr/recommendations/+server.ts`(POST, 기존 라우트들과 동일하게
    `$lib/server/http/bff` 헬퍼 사용). `apiRoutes.ts`에 `RBFR.RECOMMENDATIONS` 추가.
  - **프론트**: `lib/features/rbfr/`에 역방향 추천 타입(`TargetRatioInput` 등), `apis/rbfrApi.ts`에
    `recommendIngredients` 추가, `mutations/recommendIngredients.mutations.ts`(슬라이더 조작마다
    계산을 다시 트리거하는 성격이라 query가 아니라 mutation으로 모델링). `lib/pages/tools/rbfr/
    recommend/RbfrRecommendPage.svelte`(활성 Profile의 직접역할마다 range 슬라이더로 목표 비중
    입력, 합계 표시, 계산 버튼 → 근접도 상위 원료 카드 + 제외 원료 목록을 BAN/NODATA 사유와
    함께 표시) + `routes/[orgSlug]/tools/rbfr/recommend/+page.svelte`(얇은 라우트).
  - **범위 의도적 축소**: 국가별 규제 스코프(현재는 국가 구분 없이 CONFIRMED 여부/BAN 존재
    여부만 봄), 통합역할(균형) 목표치 입력은 포함하지 않았다(직접역할만 대상, 기존 원료 등록
    화면과 동일하게 통합역할은 처방 단위 별도 근거로 채우는 값이라 여기서도 뺐다).
  - **검증**: `npx tsc --noEmit`(csc-groupware) → RBFR 에러 0건(불변). `npx jest domains/rbfr` →
    **8 suites, 46 tests 전부 통과**. `npx svelte-check`(apps/web/groupware) → RBFR 에러 0건,
    기존 무관 에러 9건 그대로(회귀 없음).

- **완료 내역(2026-09-06, 7단계 다섯 번째 조각: "설정(Profile 관리)" 화면)**: 사용자가
  "역방향 추천 / 설정" 중 나머지 절반을 이어서 요청. 이 화면은 스킨(Skin) Profile의 4직접+1통합
  구조(특허 청구항에 묶인 확정 구조)를 편집하는 화면이 **아니다** — Profile/역할 도메인은
  읽기 전용 목록으로만 보여주고, 실제로 편집 가능한 것은 "새 Profile 등록"과 "Cell 규칙 판
  승인" 둘뿐이다.
  - **백엔드(신규)**: `core/domain/types/rbfr-settings.types.ts`(`ProfileSummary`/
    `RoleDomainSummary`/`CreateProfileInput`(+`CreateProfileRoleInput`)/`CreateProfileResult`/
    `CellRuleLimitSummary`). Outbound `rbfr-settings-repository.port.ts`
    (`RBFR_SETTINGS_REPOSITORY_PORT`) + Drizzle 어댑터(`listProfiles`/`listRoleDomains`는 단순
    조회, `createProfileWithRoles`는 `rbfr_profiles`+`rbfr_role_domains`+`rbfr_cell_rule_limits`
    (미승인 1건)를 `groupwareDb.transaction`으로 원자적 생성, `findCellRuleLimit`/
    `approveCellRuleLimit`는 승인 처리용). Inbound `rbfr-settings.port.ts`
    (`RBFR_SETTINGS_PORT`) + 서비스(`RbfrSettingsService`: `createProfile`이 05번 문서 예시
    (5역할→15~18칸)와 일치하는 공식 `totalMin=역할수×3`, `totalMax=totalMin+3`으로 Cell 규칙
    기준선을 자동 계산하고 `rule_version=${profileCode}-v1`로 미승인 판을 함께 만든다. 오각형
    각도(360/역할수)는 DB에 저장할 컬럼이 없어 계산만 해서 응답에 실어 돌려준다.
    `approveCellRuleLimit`는 존재하지 않는 rule_version과 이미 승인된 rule_version 둘 다
    막는다 — "승인된 판은 다시 못 고친다"는 05번 문서 규칙을 서비스 레이어에서 강제).
    DTO(`create-profile.dto.ts`(중첩 역할 배열 검증), `approve-cell-rule.dto.ts`), 신규
    `RbfrSettingsController`(`GET /rbfr-api/profiles`, `GET .../role-domains`,
    `POST /rbfr-api/profiles`, `GET .../cell-rule-limits`,
    `POST /rbfr-api/cell-rule-limits/:ruleVersion/approve`). `rbfr.module.ts`에 5번째
    Controller로 등록. 테스트 4개 신규(각도/기준선 계산, 승인 검증 3가지 분기), 모듈 DI 조립
    테스트도 5번째 컨트롤러/포트 포함하도록 갱신.
  - **의도적으로 빼놓은 것(확인 필요로 기록)**: 비중(%)→Cell 변환표(`rbfr_cell_mapping`) 자체의
    CRUD는 이번에 포함하지 않았다. 05번 문서에 "코드에 박지 않고 화면(관리 > Cell 규칙)에서
    승인한다"고만 나와 있고 그 변환표를 무엇으로 채울지(초기값 자동 생성 여부)는 실제 스펙도
    확정하지 않은 부분이라, 이번 조각은 `rbfr_cell_rule_limits`(총 Cell 허용범위)까지만
    자동화하고 실제 구간별 변환표는 다음 조각으로 남긴다. Profile 활성화(is_active 토글) 버튼도
    아직 없다(새 Profile은 항상 비활성 상태로 생성되며, 활성화 경로는 02번 문서에도 구체
    엔드포인트가 없어 이번엔 만들지 않았다).
  - **BFF**: `routes/api/rbfr/profiles/+server.ts`(GET 목록+POST 등록),
    `routes/api/rbfr/profiles/[profileCode]/role-domains/+server.ts`(GET),
    `routes/api/rbfr/profiles/[profileCode]/cell-rule-limits/+server.ts`(GET),
    `routes/api/rbfr/cell-rule-limits/[ruleVersion]/approve/+server.ts`(POST). `apiRoutes.ts`에
    `RBFR.PROFILES`/`roleDomains`/`cellRuleLimits`/`approveCellRuleLimit` 추가.
  - **프론트**: `lib/features/rbfr/`에 설정 관련 타입, `apis/rbfrApi.ts`에 5개 함수 추가,
    `queries/profiles.query.ts`/`roleDomains.query.ts`/`cellRuleLimits.query.ts`,
    `mutations/createProfile.mutations.ts`/`approveCellRuleLimit.mutations.ts`(둘 다
    `useQueryClient()`를 받아 성공 시 관련 목록을 invalidate, 기존 marketing-channels
    `setMyAiModelMutationOptions` 패턴 그대로 따름). `lib/pages/tools/rbfr/settings/
    RbfrSettingsPage.svelte`(Profile 목록 → 선택 시 역할 도메인/Cell 규칙 판 표시, 새 Profile
    등록 폼(역할 동적 추가/삭제), Cell 규칙 판 승인 버튼(승인자 이름 입력 필요)) +
    `routes/[orgSlug]/tools/rbfr/settings/+page.svelte`.
  - **검증**: `npx tsc --noEmit`(csc-groupware) → RBFR 에러 0건. `npx jest domains/rbfr` →
    **9 suites, 50 tests 전부 통과**. `npx svelte-check`(apps/web/groupware) → RBFR 에러 0건,
    기존 무관 에러 9건 그대로(회귀 없음).
  - **이제 좌측 3탭(정방향 계산/역방향 추천/원료 등록) + 우측 설정 탭까지 02번 문서의 화면
    4개가 전부 실제 코드로 연결됐다.** 단, 사이드바 메뉴가 없어 각 URL을 직접 입력해서 들어가야
    한다(다음 작업 참고).

- **완료 내역(2026-09-06, 7단계 다섯 번째 조각 이어서: 설정 화면 남은 조각)**: 사용자가
  "설정으로 넘어가줘"라고 다시 요청했으나 설정 화면 자체는 방금 전 완료한 상태라 확인 질문을
  드렸고, 사용자가 "설정 화면의 남은 조각 이어서 진행"(Cell 변환표 CRUD + Profile 활성화
  토글)을 선택. 이전 조각에서 명시적으로 뺐던 두 가지를 마저 구현했다.
  - **백엔드(추가)**: `rbfr-settings.types.ts`에 `CellMappingEntry`/`CellMappingRow` 추가.
    `RbfrSettingsRepositoryPort`/어댑터에 `setProfileActive`(단순 UPDATE),
    `listCellMapping`/`replaceCellMapping`(ruleVersion 스코프로 기존 구간을 지우고 새로
    교체, `groupwareDb.transaction`) 추가. `RbfrSettingsService`에 두 가지 불변식을
    새로 추가: (1) `setProfileActive(profileCode, true)`는 그 Profile에 승인된 Cell 규칙
    판이 하나도 없으면 거부(비활성화는 항상 허용), (2) `setCellMapping`은 존재하지 않는
    rule_version이거나 이미 승인된 rule_version이면 거부(승인 검증 로직을
    `findCellRuleLimitOrThrow` private 헬퍼로 `approveCellRuleLimit`과 공유하도록 정리).
    DTO(`set-cell-mapping.dto.ts`(구간 배열 중첩 검증), `set-profile-active.dto.ts`).
    `RbfrSettingsController`에 `PATCH /rbfr-api/profiles/:profileCode/active`,
    `GET`/`PUT /rbfr-api/cell-rule-limits/:ruleVersion/mapping` 3개 액션 추가(모듈 등록은
    기존 Controller/Port를 그대로 쓰므로 `rbfr.module.ts` 변경 없음). 테스트 6개 신규
    (활성화 검증 3가지 분기, 변환표 검증 3가지 분기).
  - **BFF**: `routes/api/rbfr/profiles/[profileCode]/active/+server.ts`(PATCH),
    `routes/api/rbfr/cell-rule-limits/[ruleVersion]/mapping/+server.ts`(GET+PUT).
    `apiRoutes.ts`에 `setProfileActive`/`cellMapping` 추가.
  - **프론트**: 설정 타입에 `CellMappingEntry`/`CellMappingRow` 추가, `apis/rbfrApi.ts`에
    4개 함수 추가, `queries/cellMapping.query.ts`, `mutations/setCellMapping.mutations.ts`/
    `setProfileActive.mutations.ts` 신규. `RbfrSettingsPage.svelte`에 Profile 목록 각 행에
    활성화/비활성화 토글 버튼, Cell 규칙 판 각 행에 "변환표 편집" 버튼(펼치면 구간별
    이상/미만/칸수 입력 테이블 + 구간 추가/삭제, 승인된 판이면 전부 읽기 전용) 추가.
  - **검증**: `npx tsc --noEmit`(csc-groupware) → RBFR 에러 0건. `npx jest domains/rbfr` →
    **9 suites, 56 tests 전부 통과**. `npx svelte-check`(apps/web/groupware) → RBFR 에러
    0건, 기존 무관 에러 9건 그대로(회귀 없음).
  - **이제 설정 화면이 02번 문서의 4개 항목(Profile 목록/새 Profile 등록/Cell 규칙 판
    승인/변환표 편집)을 전부 다룬다.** 실제 구간값(예: "0~20%는 1칸")을 무엇으로 채울지는
    여전히 연구팀 판단 영역이라 화면은 입력 도구만 제공한다.

- **완료 내역(2026-09-06, 6번째 등록 지점: 사이드바 메뉴)**: 사용자가 "임시로 진행"을
  명시적으로 승인(어차피 그룹웨어 기능을 하나씩 추가해 실제 그룹웨어로 발전시킬 계획이고,
  나중에는 사이드바가 main GNB가 될 예정. RBFR이 FeatureKey 게이팅 방식의 첫 사례라는 것도
  인지하고 진행 승인).
  - **조사 결과(중요)**: "FeatureKey로 게이팅되는 사이드바 메뉴"라는 완결된 등록 지점이
    그룹웨어에 아직 없었다. 기존 메커니즘 둘 다 안 맞았다: (1) 관리자 대시보드 타일
    (`tilesStore`)은 역할 기반 게이팅이고 링크가 `/admin/` 하위로 고정 조립됨, (2)
    SubAppBar(AI 도구 탭)는 `AiToolKey`(별개 축) 전용. 더 근본적으로 **`CurrentUser` 타입에
    `features` 필드 자체가 없어 FeatureKey 권한이 프론트엔드로 아예 안 내려오고 있었다.**
    즉 진짜 제대로 하려면 공용 인증/권한 배선 파일(`CurrentUser` 타입, `+layout.server.ts`)을
    건드려야 해서, 사용자에게 "임시(대시보드 타일 재사용)" vs "제대로(FeatureKey 배선)" 중
    선택을 물었고 **임시 방식으로 결정**.
  - **적용한 것(임시)**: `tile.types.ts`에 `TileIconName`에 `'rbfr'` 추가 + `href` 필드
    의미 확장(`/`로 시작하면 orgSlug 바로 아래 절대경로로 조립, 기존 상대경로 동작은 그대로
    유지 — 하위 호환). `tilesStore.svelte.ts`에 RBFR 타일 1개 추가(`requireOrgManage: true`,
    `href: '/tools/rbfr'`). `Tile.svelte`의 href 조립 로직을 `/`로 시작하는 절대경로도
    지원하도록 확장(기존 타일 동작 무변경) + 색상 틴트 맵에 `rbfr` 추가.
    `static/assets/icon/dashboard/rbfr.svg` 신규(플라스크+오각형 모티프, 기존 아이콘과
    같은 그라디언트 스타일).
  - **의도적 한계(문서화)**: FeatureKey 검증 없이 "조직 관리 가능자"에게만 노출(임시 게이트).
    RBFR 내부 5단계 권한(ADMIN/REVIEWER/DESIGNER/DATA/VIEWER)은 이 타일 가시성과 무관하게
    `rbfr_user_roles` 테이블이 별도로 관리한다. URL 직접 접근 차단(서버 가드)도 아직 없다
    (`routes/[orgSlug]/tools/rbfr/**` 밑에 `+page.server.ts`가 하나도 없음) — 지금은 조직
    관리 가능자만 타일을 볼 수 있다는 UX 수준의 가시성 제어일 뿐, 진짜 인가는 아니다.
  - **검증**: `npx svelte-check`(apps/web/groupware) → 새 코드 에러 0건, 기존 무관 에러
    9건 그대로(회귀 없음).
  - **나중에 "제대로" 만들 때 해야 할 일**: `CurrentUser` 타입에 `features` 필드 추가,
    `[orgSlug]/admin/+layout.server.ts`(또는 그 상위) 등에서 토큰 클레임의 `features`를
    실제로 내려주도록 배선, RBFR 전용 사이드바 진입점(지금의 임시 타일이 아니라 실제
    main GNB) 신설, `routes/[orgSlug]/tools/rbfr/**`에 서버 가드 추가. 이 작업들은 RBFR
    전용이 아니라 그룹웨어 공용 인증 계층을 건드리므로, 다른 개발자와 조율이 특히 필요한
    지점이다(진행 정책/Git 협업 절 참고).

## 다음 작업
- MFDS 실제 네트워크 연결 확인(사용자 실제 환경 또는 실 서버에서 재시도) 후, 되면 프론트
  "성분사전 조회" 버튼 연결 + 전체 동기화(F-92) 실행 여부를 다시 논의한다.
- **(사용자 확정, 잊지 말 것) 사이드바 "제대로" 만들기 — 지금(2026-09-06)의 관리자 대시보드
  타일 임시 등록을 대체하는 실제 작업.** 사용자의 그룹웨어 발전 로드맵상 "사이드바가 나중에
  main GNB가 될 예정"이라 명시적으로 확정된 항목이며, RBFR이 FeatureKey 게이팅 방식의 첫
  사례라 참고할 기존 관례가 없다(위 "협업" 절 참고). 착수 시 해야 할 것 4가지:
  1. `CurrentUser` 타입(`lib/shared/types/common.types.ts`)에 `features` 필드 추가.
  2. `[orgSlug]/admin/+layout.server.ts`(또는 그 상위) 등에서 토큰 클레임의 `features`를
     실제로 `data.user`에 내려주도록 배선(`aiTools`/`permissions`가 이미 내려가는 방식과
     동형으로).
  3. RBFR 전용 진입점을 지금의 임시 대시보드 타일이 아니라 **실제 main GNB(사이드바)**로
     신설 — 이 시점에 `tilesStore`의 RBFR 임시 타일(`id: 'rbfr'`)은 제거하거나 GNB로 대체.
  4. `routes/[orgSlug]/tools/rbfr/**`(모든 하위 화면: 정방향/역방향/원료등록/설정) 각각에
     `+page.server.ts` 서버 가드 추가(`user.features`에 `'rbfr'` 없으면 차단) — 지금은 URL
     직접 접근 차단이 전혀 없다.
  - 이 작업은 RBFR 전용이 아니라 **그룹웨어 공용 인증 계층**(`CurrentUser` 타입,
    `+layout.server.ts`)을 건드리므로, 착수 전 다른 개발자와 조율이 특히 필요하다.

## 완료된 작업
- 2026-09-05: `개발지침/` 00~07번 문서 초안 작성, `groupware 맞춤 설계용 파일지침.md` 작성,
  `test/` 목업 1차 버전(3탭 레이아웃, 오각형 애니메이션, AI 추론 토글 등) 작성.
- 2026-09-06: 실제 RBFR 프로그램 원본 자료(OneDrive) 발견 후 개발지침 00, 02, 03, 05번 전면
  정정(RBFR/RBDR 정의 정정, 실제 역할 도메인명 보습/진정/보호/정돈/균형 반영, 실제 DB 스키마
  대조, 실제 식약처 API 스펙 반영, Cell/오각형 공식 표현 반영). 01번에 인증키 취급/권한 대체
  규칙 보강. `test/` 목업을 정정된 지침에 맞춰 동기화(축 이름, ALLOW/LIMIT/NODATA 용어,
  통합역할 미입력 처리, Cell 표현 스트립, 우측 정렬 설정탭 추가). `develop_status.md`,
  `change_manifest.md` 신규 생성(1단계 완료).
- 2026-09-06: **2단계(데이터 모델 확정) 완료.** 그룹웨어 실제 코드(`packages/database/src/
  groupwaredb/schema/`)를 검색해 범용 audit_log/app_settings 테이블이 없음을 확인 →
  `rbfr_audit_log`/`rbfr_app_settings`를 RBFR 전용으로 신규 생성하기로 확정. 사용자 확인을 거쳐
  실제 스펙에 없던 확장 테이블 2개(`rbfr_ingredient_interactions` 시너지/충돌 계수,
  `rbfr_formula_sensory_stability_records` 사용감·안정성 실측기록)를 지금 포함하기로 확정하고
  전체 컬럼 정의를 `03 DB스키마.md`에 작성. 최종 34개 테이블, pgEnum 14종으로 확정.
- 2026-09-06: **3단계(계산 엔진 구현) 완료.** `engine/src/types.ts`, `engine/src/scoringEngine.ts`,
  `engine/tests/scoringEngine.test.ts` 신규 작성. 직접역할 효능값(1단계 가산 + 2단계 조합계수 +
  3단계 유효농도계수 + 4단계 안정성계수, 0~100 clamp)과 비중값(통합역할 근거 없으면 분모 제외)을
  순수 함수로 구현. Node 내장 테스트러너(node:test) + TypeScript 타입 스트리핑으로 10개 테스트
  실행, 전부 통과 확인(가산 방식 희석 버그 회귀 방지, 조합계수, 유효농도계수, clamp, 재현성,
  비중값의 통합역할 포함/제외 분기 포함).
- 2026-09-06: **4단계(처방 검증 로직 구현) 완료.** `engine/src/validationTypes.ts`,
  `engine/src/validation.ts`, `engine/tests/validation.test.ts` 신규 작성. 05번 문서 처방
  검증 9단계 중 배합비 합계, 국가별 규제(CONFIRMED만 판정에 사용, PROPOSED는 NODATA 취급),
  무첨가/인증 조건, 고정값, pH 충돌, 병용금기(BLOCK/WARN, 양방향 중복 제거), HLB 판정(유상부/
  HLB 데이터 없으면 unknown), 원가 계산을 순수 함수로 구현하고 `validateFormula`로 종합. 19개
  테스트 전부 통과 확인. `node --test`가 이 환경(UNC 경로)에서 경로를 못 찾는 문제를 발견해
  `node <파일>` 직접 실행으로 대체(위 "실행 방법" 참고).

## 최근 변경 이력
- 2026-09-06: `개발지침/00 개요.md`, `02 화면구성.md`, `03 DB스키마.md`, `05 스코어링엔진.md`
  전면 정정, `01 연동구조.md`/`04 식약청API연동.md` 보강 — 실제 스펙 원본 대조 반영. 영향 범위:
  이후 모든 실제 구현은 이 정정된 문서를 기준으로 한다.
- 2026-09-06: `test/index.html`, `test/assets/style.css`, `test/assets/main.js` 동기화 — 축
  이름/용어/통합역할 처리/Cell 표현/설정탭 반영. 영향 범위: 목업뿐이며 실제 코드에는 영향 없음.
- 2026-09-06: `develop_status.md`, `change_manifest.md` 신규 생성(1단계).
- 2026-09-06: `03 DB스키마.md`에 2단계 확정 반영 — `rbfr_audit_log`/`rbfr_app_settings` 신규
  생성 확정(그룹웨어 실제 코드 검색으로 재사용 가능한 공용 인프라 없음을 확인), 확장 테이블
  2개(`rbfr_ingredient_interactions`, `rbfr_formula_sensory_stability_records`) 전체 컬럼 정의
  작성 및 채택 확정, pgEnum 4종(`rbfr_interaction_type_enum` 등) 추가, 문서 말미에 "2단계 완료
  요약"(최종 34개 테이블) 추가. 영향 범위: 5단계(DB 저장/조회 구현) 시작 시 이 문서를 그대로
  Drizzle 스키마로 옮기면 된다.

## 다음 단계 영향
- 5단계(DB 저장/조회 구현)는 `engine/src/validationTypes.ts`의 입력 타입(`IngredientRegulationEntry`,
  `IngredientIncompatEntry` 등)을 그대로 03번 문서의 rbfr_ 테이블 컬럼과 매핑하면 되므로, Outbound
  Port/Repository Adapter를 짤 때 이름을 다시 고민할 필요가 없다(타입명 ≒ 테이블명 매핑이 이미
  코드 주석에 표기돼 있음).
- `validateFormula`는 지금 규제/무첨가/인증/고정값/pH/병용금기/HLB/원가만 다루고, 05번 문서의
  "역할적합도"(우선순위 마지막 항목)는 구체 판정 로직 자체가 실제 스펙에도 없어 포함하지
  않았다 — 5단계 이후 이 로직이 정의되면 `validateFormula`에 이슈 항목만 추가하면 된다(다른
  함수에 영향 없음).
- 4단계 산출물도 3단계와 마찬가지로 프레임워크/DB 의존이 전혀 없어, 5단계에서
  `core/application/services/`로 옮길 때 로직 재작성 없이 얇은 래퍼만 씌우면 된다.
- 이 환경에서 `node --test`가 UNC 경로를 못 찾는 문제를 발견했다 — 5단계 이후 실제 groupware
  저장소(로컬 경로)로 옮기면 이 문제는 사라질 가능성이 높지만, 확인 전까지는 `node <파일>` 직접
  실행 방식을 기본으로 삼는다.

## 확인 필요
- 랩 넘버(`lab_no`) 채번 규칙(사내 규칙 필요, 실제 스펙도 미확정). 스키마 구조에는 영향 없음
  (컬럼은 이미 확정, 값을 어떻게 채번할지만 미정) — 5단계 이후에 다시 다룬다.
- 통합역할(균형)의 정확한 산출/승인 기준(실제 스펙도 미확정). 계산 엔진에서는 "근거 없이 자동
  계산하지 않는다"는 원칙만 지키고, 정확한 산출 공식 자체는 계속 미확정 상태로 둔다.
- 조합계수(원료 3개 이상일 때 여러 쌍을 전부 곱할지)와 유효농도계수(정확한 감쇠 곡선)는 실제
  스펙도 미확정이라 `engine/src/scoringEngine.ts`에 잠정 구현으로 남아 있다.
- "역할적합도" 검증(05번 우선순위의 마지막 항목)은 구체 판정 기준이 실제 스펙에도 없어
  `validateFormula`에 아직 포함하지 않았다.
- HLB 허용 오차(tolerance) 기본값(현재 코드상 1.0)은 임의 잠정값이다. 실제 연구팀 기준 확인 필요.
- 국가별 규제 자료 출처(한국/미국 외 나머지 국가), 기능성 10종/사용감 14항목 최종 구성, 고가
  원료 판정 기준액, 그룹웨어 계정 연동 범위 세부사항, AI 공급자 선택 — 전부 실제 스펙 쪽에서도
  "아직 정해지지 않은 것"으로 남아 있는 항목이라 이쪽에서 임의로 정하지 않는다.
- 그룹웨어 `docs/` 문서 폴더의 정확한 구조(이번 세션에서 접근 시도했으나 저장소 규모로 인해
  탐색이 시간 초과됨) — 실제 기능 구현이 시작되는 시점에 다시 확인한다.

## 알려진 이슈
- `test/` 목업은 여전히 정적 HTML/CSS/JS이며 실제 DB/API와 연동되어 있지 않다. 원료명, 점수,
  검증 결과는 전부 하드코딩된 예시값이고 실제 데이터로 취급하면 안 된다.
- `test/index.html`의 "Cell(칸) 공식 표현" 스트립은 비중(%)→칸수 변환의 개념을 보여주기 위한
  **임의의 고정 임계값**(`main.js`의 `CELL_THRESHOLDS`)을 쓰고 있으며, 실제 `rbfr_cell_mapping`
  테이블 값(rule_version별로 승인되는 값)이 아니다.
- 06번 문서(LLM추론레이어)는 CONFIRMED/PROPOSED/REJECTED 등 최신 용어로 아직 완전히 정렬되지
  않았다(우선순위 낮음, 05번과 방향은 이미 일치).

### groupware 저장소, RBFR과 무관, 발견만 하고 손대지 않음(사용자 지시: 다른 개발자가 처리)
- `domains/api-credential/`(백엔드) Jest 테스트 9개 실패 + `apps/web/groupware`의
  `marketing-channels`/`api-credentials` 관련 svelte-check 에러 9건. 전부 `requiredCredentialFields`
  / `@csc/tool-versions` / `@csc/api-providers` 쪽 export 불일치 계열로, 패키지 미빌드 또는
  버전 드리프트로 추정된다. RBFR 코드와는 무관.

## 보안 (반드시 유지할 것, 삭제 금지)
- `C:\Users\kimja\OneDrive\Desktop\RBFR 프로그램\06_ver1_프로토타입\RBFR Designed Program\
  .rbfr_api_key`에 실제 Anthropic API 키가 평문으로 노출되어 있음(OneDrive 클라우드 동기화
  폴더 내부). 사용자에게 즉시 revoke/rotate 권고를 이미 전달함(이 세션 내). 아직 조치 여부
  미확인 — 다음에 이 프로젝트를 다룰 때도 재차 상기시킬 것.
- 실제 MFDS API 인증키는 `08_개발인계/02_서버환경/인증키_대외비.txt`에 존재. 절대 이 문서/
  코드/커밋에 값 자체를 옮겨 적지 않는다(04번 문서 "인증키 취급" 절 참고).
