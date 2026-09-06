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
- **저장소 범위 전체 재구성(2026-09-06)**: 애초 "RBFR만 별도 저장소" 계획을 사용자가 취소하고,
  **`/var/www` 전체를 하나의 저장소로 묶기로 확정**(groupware+rbfr+test_mall, `_archive`/
  `CSC_dev`는 제외). 원격은 사용자가 이미 만들어 둔 `git@github.com:dhkay/
  csc_dev_team_project.git`(현재는 README.md/test_sync.txt만 있는 사실상 빈 저장소)를 그대로
  재사용한다. `/var/www/rbfr`의 단독 `.git`은 제거했다(파일 내용은 그대로, 2개 커밋짜리
  micro-history만 사라짐). `/var/www/.gitignore`에 `/CSC_dev/`, `/_archive/` 제외 규칙 추가함.
  **`/var/www` 루트에서 `git init` + `remote add` + `fetch`를 실행하려다 자동 실행 권한
  검사기에 막혀 사용자 재승인 대기 중**(아직 실행 안 됨) — 다음 작업의 0순위.

## 진행 정책 (2026-09-06 갱신 — 실제 구현 착수 승인됨)
- ~~지금은 groupware에 아무것도 넣지 않는다~~ **(같은 날 사용자가 직접 해제)**: "지침은
  RBFR에 있고 만드는 프로그램은 groupware 안에 들어가야 한다"고 명시적으로 확인, 실제
  구현(5단계) 착수를 승인함. 이제부터 실제 Drizzle 스키마 파일 생성, NestJS 도메인 폴더 생성,
  "등록 지점 5곳" 반영 등 groupware 코드를 직접 만드는 작업을 진행한다.
- 다만 5단계 자체가 크므로(34테이블 스키마 + core/adapters 이동 + 모듈 등록 + entitlements +
  실제 마이그레이션 실행) 한 번에 전부 하지 않고 하위 조각으로 나눠 진행한다(아래 "다음 작업"
  참고). 특히 **실제 DB에 마이그레이션을 적용하는 단계는 별도로 확인받고 진행**한다(로컬
  스키마 파일 작성과 실제 DB 반영은 위험도가 다르다).

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
- 5단계(DB 저장/조회 구현) 진행 중. 5단계를 아래 하위 조각으로 나눠 순서대로 진행한다(한
  조각씩 확인받으며 진행, 한 번에 다 하지 않는다):
  1. `03 DB스키마.md`의 34개 테이블 → `packages/database/src/groupwaredb/schema/rbfr-*.ts`
     Drizzle 스키마 파일 작성 (진행 예정)
  2. `schema/index.ts`/`schema/enums.ts`에 등록
  3. `engine/` 산출물을 `apps/api/nestjs/csc-groupware/src/domains/rbfr/`의
     core/domain, core/application으로 이동(로직 재작성 없이 얇은 타입 정리만)
  4. Outbound Port + Repository Adapter(Drizzle) 작성
  5. `rbfr.module.ts` 작성 + `app.module.ts` 등록
  6. entitlements(`packages/entitlements/src/catalog.ts`/`labels.ts`)에 `RBFR` FeatureKey 추가
  7. (별도 승인 후) 실제 `drizzle-kit generate`/`migrate` 실행 — dev DB에 실제 반영

## 다음 작업
- 위 1번(Drizzle 스키마 파일 작성)부터 시작한다. 그 전에 `/var/www` 루트 git 초기화(위 "Git /
  GitHub" 참고)가 아직 승인 대기 중이라 병행해서 처리한다.

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

## 보안 (반드시 유지할 것, 삭제 금지)
- `C:\Users\kimja\OneDrive\Desktop\RBFR 프로그램\06_ver1_프로토타입\RBFR Designed Program\
  .rbfr_api_key`에 실제 Anthropic API 키가 평문으로 노출되어 있음(OneDrive 클라우드 동기화
  폴더 내부). 사용자에게 즉시 revoke/rotate 권고를 이미 전달함(이 세션 내). 아직 조치 여부
  미확인 — 다음에 이 프로젝트를 다룰 때도 재차 상기시킬 것.
- 실제 MFDS API 인증키는 `08_개발인계/02_서버환경/인증키_대외비.txt`에 존재. 절대 이 문서/
  코드/커밋에 값 자체를 옮겨 적지 않는다(04번 문서 "인증키 취급" 절 참고).
