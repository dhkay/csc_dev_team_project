# 그룹웨어 맞춤 설계용 파일지침 (RBFR 전용 아님 — 신규기능 공통)

이 문서는 RBFR 하나만을 위한 게 아니다. 앞으로 그룹웨어에 추가할 모든 기능
(근태관리, 전자결재, 재고 입출고, 메신저, 캘린더 등 1~3차 로드맵 전부)이 처음 설계할 때부터
이 순서를 따르도록 만든 **공통 체크리스트**다. 다른 사람이 새 기능을 만들 때 이 파일 하나만
전달하면 되도록, RBFR 개발지침(00~07번)과는 별도 이름으로 둔다. 지금 RBFR 개발지침 폴더 안에
있는 이유는 RBFR을 만들면서 이 규칙이 정리됐기 때문일 뿐, 성격상 특정 기능 전용 문서가 아니다.

**상위 원칙**: 여기 적힌 모든 규칙은 그룹웨어 저장소 `.claude/rules/*.md`를 요약·안내하는 것이지,
새로 만드는 게 아니다. 이 문서와 그룹웨어 규칙이 어긋나면 그룹웨어 규칙이 항상 맞다. 아래에
각 항목마다 원본 규칙 파일을 같이 적어뒀으니, 헷갈리면 그 파일을 직접 확인한다.

---

## 1. 새 기능을 시작하기 전에 정할 것 3가지

1. **기능 이름(FeatureKey)**: 영문 소문자 kebab-case 하나 정한다(예: `attendance`, `approval`,
   `inventory`). 이 이름이 폴더명, 라우트 경로, 권한 키에 전부 그대로 쓰이므로 나중에 바꾸면
   여러 곳을 같이 고쳐야 한다. 처음에 확정한다.
2. **어느 서버에 백엔드를 둘 것인가**: 특별한 이유가 없으면 `apps/api/nestjs/csc-groupware`에
   도메인으로 추가한다(RBFR도 이 방식). 완전히 다른 인프라가 필요할 때만(GPU, 별도 스케일링 등)
   새 서버를 고려한다 — 이건 드문 경우이니 기본은 "csc-groupware에 도메인 추가"로 생각한다.
3. **어느 DB에 테이블을 둘 것인가**: 특별한 이유가 없으면 groupwaredb에 테이블만 추가한다(RBFR도
   이 방식). "서버마다 자기 DB만 소유" 원칙(`system-architecture.md`)은 지키되, 새 DB를 만드는 건
   새 서버를 만들 때만 필요한 일이라 여기선 대개 해당 없음.

## 2. 표준 파일 구조 (이 골격을 그대로 복사해서 시작한다)

**백엔드** (`apps/api/nestjs/csc-groupware/src/domains/<feature>/`)
```
core/
├── domain/{entities,types}/          # 순수 타입, ORM/프레임워크 모름
└── application/
    ├── ports/{inbound,outbound}/     # 인터페이스 + Symbol 토큰
    └── services/                    # Inbound Port 구현, 비즈니스 로직
adapters/
├── inbound/http/{controllers,dto}/  # @Controller
└── outbound/db/groupwaredb/{어댑터, mappers/}
<feature>.module.ts                  # Port ↔ 구현 바인딩
```
원본: `clean-architecture-structure.md`, `api-architecture.md`

**프론트엔드** (`apps/web/groupware/src/`)
```
lib/pages/<area>/<feature>/<Name>Page.svelte (+ components/)   # 화면
lib/features/<feature>/{apis,queries,mutations,services}/       # 데이터 레이어
routes/api/<feature>/<하위도메인>/+server.ts                     # BFF
routes/[orgSlug]/.../+page.svelte  (얇게, 페이지 컴포넌트만 import)
```
원본: `request-flow.md`, `structure-blueprint.md` §4

**DB**: `packages/database/src/groupwaredb/schema/`에 테이블 정의 파일 추가.
원본: `database-migration-workflow.md`

**외부 API 연동(정부기관/타사 API 등)**: 별도 서버 호출이 아니라 순수 외부 API면
`adapters/outbound/external/`에 어댑터를 둔다(같은 앱 내 다른 도메인 접근 또는 외부 서비스 호출
전용 위치). 원본: `api-architecture.md` §2.7.

## 3. 기존 파일 중 반드시 수정해야 하는 "등록 지점" 5곳

새 코드는 전부 새 폴더에 들어가지만, 그룹웨어가 그 코드를 "인식"하게 하려면 아래 5개 기존
파일을 매번 고쳐야 한다 (RBFR로 실제 확인한 목록).

| 파일 | 무엇을 추가하나 |
|---|---|
| `apps/api/nestjs/csc-groupware/src/app.module.ts` | 새 `<Feature>Module` import + 등록 |
| `packages/database/src/groupwaredb/schema/index.ts` | 새 테이블 스키마 파일 export |
| `packages/database/src/groupwaredb/schema/enums.ts` | 새 pgEnum 값(필요시) |
| `packages/entitlements/src/catalog.ts` | 새 `FeatureKey` 등록 |
| `packages/entitlements/src/labels.ts` | 그 FeatureKey의 한글 라벨(사이드바 표시명) |

사이드바에 실제 메뉴 항목(클릭 가능한 링크)을 그리는 화면 컴포넌트는 기능마다 위치가 다를 수
있으니, 구현 시점에 "이 FeatureKey를 읽어서 메뉴를 그리는 곳"을 한 번 찾아 그 지점도 5번째가
아니라 6번째 지점으로 추가 확인한다.

## 4. 문서화

기능마다 별도 README를 만들지 않는다. 완성되면 `groupware/docs/specs/<feature>-*.md` 형태로
중앙 문서 폴더에 넣는다(마케팅 영상 도구의 `docs/specs/marketing-tool-versions.md`와 같은 성격).

## 5. 테스트

Service 레이어부터 단위 테스트를 작성한다(Outbound Port를 Mock으로 주입). 원본:
`testing-strategy.md`.

## 6. 글쓰기 스타일

코드 주석, 커밋 메시지, 문서 전부 대시(—)/가운뎃점(·)/이모지 금지, 문서는 `~한다`체로 통일.
원본: `writing-style.md`.

---

## 7. "일단 따로 만들어서 쓰다가 나중에 이 구조로 옮기기" — 프로토타입 우선 개발 시 지켜야 할 것

다른 사람이 새 기능을 급하게 먼저 별도로(그룹웨어 규칙 밖에서, 예를 들면 독립 스크립트나 별도
폴더에서) 만들어 우선 쓰다가, 나중에 이 구조로 옮겨서 계속 쓰고 싶어할 수 있다. 이 경우도
지원 가능하지만, **프로토타입을 만드는 시점부터 아래 한 가지만 지키면** 나중에 옮기는 비용이
"거의 다시 쓰기"가 아니라 "파일만 옮기기" 수준으로 줄어든다.

**지켜야 할 한 가지: 계산/판단 로직과 "어떻게 저장하고 어떻게 화면에 보여줄지"를 처음부터
분리해서 짠다.** 즉 프로토타입이라도:
- 핵심 로직(입력을 받아 결과를 계산/판단하는 순수 함수들)을 한 파일/모듈에 몰아 두고,
- DB 읽기/쓰기 코드와, 화면에 그리는 코드는 별도 파일에 두고 그 핵심 로직 함수를 "호출"만 하게 짠다.

이 한 가지만 지키면 나중에 옮길 때:
1. 핵심 로직 파일 → 거의 그대로 `core/application/services/<feature>.service.ts`로 이동(약간의
   타입 정리만 필요)
2. DB 코드 → `adapters/outbound/db/groupwaredb/<feature>.adapter.ts`로 옮기고, Outbound Port
   인터페이스만 새로 정의해서 그 어댑터가 구현하도록 감싼다
3. 화면/엔드포인트 코드 → `adapters/inbound/http/controllers/`(백엔드), `lib/pages`+`lib/features`
   (프론트)로 옮기고 Inbound Port를 통해 Service를 부르도록 감싼다
4. 프로토타입 때 쓰던 임시 DB 테이블/파일이 있었다면, 그 데이터를 `database-migration-workflow.md`의
   "data-transforming 마이그레이션"으로 옮긴다(임의 값으로 새로 만들지 않고, 실사용 데이터가 있으면
   보존)
5. 위 3절의 "등록 지점 5곳"에 반영, 4절 문서화, 5절 테스트 순으로 마무리

반대로 **핵심 로직과 화면/DB 코드가 뒤섞여 있으면(한 파일에서 계산도 하고 DB도 찌르고 화면도
그리면)**, 옮길 때 그 파일을 통째로 세 조각으로 다시 쪼개 써야 해서 사실상 재작성과 비용이 같다.
그러니 프로토타입 단계에서 유일하게 강제하고 싶은 규칙은 "빨리 만들어도 되지만, 계산 로직만큼은
처음부터 별도 파일로 빼둘 것"이다.
