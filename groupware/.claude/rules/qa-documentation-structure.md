# QA 문서 구조 가이드

## 개요

`docs/qa/` 는 **Playwright E2E 스펙으로 자동화된 회귀 시나리오를 도메인별로 모아둔 사람-읽기용 인덱스**다. 검증 자체는 spec 코드가 수행하고, 이 디렉토리는 "어떤 시나리오가 자동 검증되고 있는지" 를 한눈에 파악하기 위한 카탈로그.

> **단일 진입점 원칙**: UI/UX 회귀 검증은 Playwright 스펙. 콘솔/키보드/DevTools 한 줄 우회는 흔적이 남지 않아 회귀 자산이 되지 않으므로 "QA 방법" 으로 안내하지 않는다.

---

## 디렉토리 구조

```
docs/qa/
├── README.md            ← 도메인별 스펙 인덱스 + 빠른 실행 가이드
└── <domain>/            ← 도메인 단위 (예: video-jobs/, notice/)
    └── <feature>.md     ← spec 파일 1개당 1 문서 (예: submit.md, status.md)
```

도메인 = 화면 도메인(UI 페이지 `apps/web/groupware/src/lib/pages/<area>/<domain>/`)과 1:1 미러링.
스펙 = `apps/web/groupware/tests/e2e/features/<domain>/<feature>.spec.ts` 와 1:1 매칭.

### 예시

| 도메인 | feature | 문서 | spec |
|---|---|---|---|
| 영상 작업(video-jobs) | submit (작업 제출) | `docs/qa/video-jobs/submit.md` | `tests/e2e/features/video-jobs/submit.spec.ts` |
| 영상 작업(video-jobs) | status (상태 폴링) | `docs/qa/video-jobs/status.md` (예정) | `tests/e2e/features/video-jobs/status.spec.ts` (예정) |
| 공지사항(notice) | write (작성) | `docs/qa/notice/write.md` (예정) | `tests/e2e/features/notice/write.spec.ts` (예정) |

---

## 문서 작성 규칙

### 필수 항목 (도메인 feature 문서: `docs/qa/<domain>/<feature>.md`)

각 문서는 다음 절을 가짐:

1. **스펙 파일**: 절대 경로 링크 (한 줄)
2. **실행**: 헤드리스 / 헤드드 / UI 모드 / 특정 케이스 grep 명령
3. **검증 시나리오**: 각 `test('...')` 마다 한 절. 결함 주입 모드, 흐름, 검증 항목 명시
4. **인프라 의존**: 자격 증명, storageState, locale, MSW 등 spec 이 의존하는 외부 조건
5. **새 케이스 추가**: 추가 절차 (스펙 → POM → 문서 갱신)

### 시나리오 절 양식

```markdown
### <test 이름과 동일한 시나리오 제목>

한 줄 설명: 사용자가 보는 결과 중심.

- **결함 주입**: `mode off | A | B | C` (해당 시)
- **흐름**: 모달 진입 → 입력 → 저장 ...
- **검증**: 로딩 모달 → 에러 모달(메시지) → 모달 유지 ...
```

테스트 이름과 시나리오 제목은 1:1: Playwright `--list` 출력의 식별자와 일치해야 grep/IDE 네비게이션이 자연스러움.

### 인덱스 (`docs/qa/README.md`)

새 도메인/feature 추가 시 표에 한 줄만 추가:

```markdown
| 도메인 | 문서 | 스펙 위치 |
|---|---|---|
| 영상 작업 제출 | [video-jobs/submit.md](video-jobs/submit.md) | [features/video-jobs/submit.spec.ts](../../apps/web/groupware/tests/e2e/features/video-jobs/submit.spec.ts) |
```

---

## 무엇을 두고 무엇을 두지 않는가

### 두는 것
- Playwright spec 으로 자동화된 시나리오 카탈로그
- spec 별 인프라 의존 (자격증명, storageState, locale, MSW scope)
- spec 으로 커버 안 되는 잔여 수동 체크 (입력 보존, 운영 환경 비활성 등): spec 마다 명확히 분리해서 표기

### 두지 않는 것
- 특정 커밋/PR 전용 일회성 체크리스트 (예: "0010_video_jobs_status_cache 마이그레이션 적용됨"): PR 본문/커밋 메시지에
- 콘솔/키보드 우회로 동작 확인하는 절차: 회귀 자산이 안 되므로
- 스펙 없이 "수동으로 한번 확인해야 함" 항목: 정말 필요하면 먼저 spec 으로 만들고 본 문서에 기록
- 빌드/배포/마이그레이션 절차: `docs/workspace/` 또는 `infra/` 가 담당

---

## 새 도메인 / feature 추가 절차

1. spec 작성: `apps/web/groupware/tests/e2e/features/<domain>/<feature>.spec.ts`
2. POM (`tests/e2e/_pages/`) 에 selector 캡슐화: spec 본문에 selector 직접 노출 금지
3. 결함 주입은 `devFault` fixture (`devFault.setMode(...)`) 로만. `page.evaluate(...)` 직접 호출 금지
4. 문서 작성: `docs/qa/<domain>/<feature>.md`: 위 양식대로
5. 인덱스 갱신: `docs/qa/README.md` 표에 한 줄 추가

---

## 참고 문서

- Playwright 인프라 가이드: [apps/web/groupware/tests/e2e/README.md](../../apps/web/groupware/tests/e2e/README.md)
- 테스트 전략 (단위/통합/E2E 레이어 구분): [testing-strategy.md](./testing-strategy.md)
- E2E feedback memory: `~/.claude/projects/.../memory/feedback_qa_via_playwright.md` (어시스턴트 응답 톤)
