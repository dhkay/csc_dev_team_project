# 테스트 전략 가이드

## 개요

csc 프로젝트의 테스트는 헥사고날 아키텍처의 계층 분리를 활용하여, Port 인터페이스를 Mock 경계로 삼는 전략을 따릅니다.

---

## 테스트 프레임워크

| 앱 | 프레임워크 | 버전 | 파일 패턴 |
|----|-----------|------|----------|
| **web/groupware** | Vitest | ^3.2.3 | `*.test.ts` |
| **web/control-tower** | (단위 테스트 없음) | vitest 미설치 | 타입 게이트만: `svelte-check` |
| **api/nestjs/csc-groupware** | Jest | NestJS 기본 | `*.spec.ts` |
| **api/nestjs/csc-control-tower** | Jest | NestJS 기본 | `*.spec.ts` |
| **api/nestjs/user** | Jest | NestJS 기본 | `*.spec.ts` |
| **api/fastapi/video-model** | pytest | pytest, pytest-asyncio | `test_*.py` |
| **api/fastapi/file-upload** | pytest | pytest, pytest-asyncio | `test_*.py` |

> NestJS 백엔드(`csc-groupware`, `csc-control-tower`, `user`)는 Jest를 사용한다. `@swc/jest`(SWC)로 데코레이터 + `decoratorMetadata`를 변환하고(빌드도 `nest build` + SWC 빌더), `describe/it/expect/jest` 는 Jest 글로벌로 import 없이 사용한다. FastAPI 백엔드(`video-model`, `file-upload`)는 pytest + pytest-asyncio 로 비동기 서비스를 테스트한다.

---

## 테스트 실행 명령어

```bash
# 전체 테스트 (TurboRepo)
pnpm run test

# 프론트엔드 (web/groupware)
cd apps/web/groupware && pnpm run test           # 전체 실행
cd apps/web/groupware && pnpm run test:unit       # watch 모드

# NestJS 백엔드 (csc-groupware, csc-control-tower)
cd apps/api/nestjs/csc-groupware && pnpm run test           # 전체 실행
cd apps/api/nestjs/csc-groupware && pnpm run test:watch     # watch 모드
cd apps/api/nestjs/csc-groupware && pnpm run test:cov       # 커버리지

# FastAPI 백엔드 (video-model, file-upload: 동일 방식)
cd apps/api/fastapi/video-model && uv run pytest                # 전체 실행
cd apps/api/fastapi/file-upload && uv run pytest                    # (업로드 서버도 동일)
cd apps/api/fastapi/video-model && uv run pytest -q             # 간결 출력
cd apps/api/fastapi/video-model && uv run pytest --cov          # 커버리지
```

---

## 1. NestJS 백엔드 테스트 (csc-groupware, csc-control-tower)

### 디렉토리 구조

```
apps/api/nestjs/{csc-groupware|csc-control-tower}/src/domains/<domain>/
├── core/application/services/
│   └── __tests__/
│       └── xxx.service.spec.ts           ← Service 단위 테스트 (1순위)
├── adapters/inbound/http/controllers/
│   └── __tests__/
│       └── xxx.controller.spec.ts        ← Controller 테스트 (선택)
├── adapters/outbound/db/{db}/
│   └── __tests__/
│       └── xxx.adapter.spec.ts           ← Repository 통합 테스트 (선택)
└── __mocks__/
    ├── xxx-repository.mock.ts            ← Mock 팩토리
    └── index.ts                          ← barrel export
```

> 예제 도메인: `csc-groupware` 의 **notice(공지사항)**: `NoticeService`, `NoticeRepositoryPort`, `__mocks__/notice.repository.mock.ts`, `__tests__/notice.service.spec.ts`.

### 1순위: Service 단위 테스트

> 헥사고날 아키텍처의 핵심 장점: Service는 Outbound Port(인터페이스)만 의존하므로 Mock 주입이 자연스럽다.

#### Mock 팩토리 패턴

```typescript
// domains/notice/__mocks__/notice.repository.mock.ts

import type { NoticeRepositoryPort } from '../core/application/ports/outbound';

/** Notice 레포지토리 Mock 팩토리 */
export const createNoticeRepositoryMock = (): jest.Mocked<NoticeRepositoryPort> => ({
  createRecord: jest.fn(),
  findOneRecordById: jest.fn(),
  findOneRecordByTitle: jest.fn(),
  findManyRecords: jest.fn(),
  updateOneRecordById: jest.fn(),
  deleteManyRecordsByIds: jest.fn(),
});
```

```typescript
// domains/notice/__mocks__/index.ts
export * from './notice.repository.mock';
```

#### Service 테스트 패턴

```typescript
// domains/notice/core/application/services/__tests__/notice.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { NoticeService } from '../notice.service';
import { NOTICE_REPOSITORY_PORT, NoticeRepositoryPort } from '../../ports/outbound';
import { createNoticeRepositoryMock } from '../../../../__mocks__';

describe('NoticeService', () => {
  let service: NoticeService;
  let repository: jest.Mocked<NoticeRepositoryPort>;

  /** 테스트용 엔티티 팩토리 */
  const makeNotice = (overrides: Partial<NoticeEntity> = {}): NoticeEntity => ({
    id: 1,
    title: '기본 공지',
    content: '내용',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    repository = createNoticeRepositoryMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NoticeService,
        { provide: NOTICE_REPOSITORY_PORT, useValue: repository },
      ],
    }).compile();

    service = module.get<NoticeService>(NoticeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createOne', () => {
    it('새 공지를 생성해야 한다', async () => {
      // Arrange
      const mockNotice = makeNotice();
      repository.findOneRecordByTitle.mockResolvedValueOnce(null);
      repository.createRecord.mockResolvedValueOnce(mockNotice);

      // Act
      const result = await service.createOne({ title: '점검 안내', content: '내용' });

      // Assert
      expect(result).toEqual(mockNotice);
      expect(repository.createRecord).toHaveBeenCalledWith({ title: '점검 안내', content: '내용' });
    });

    it('제목 중복 시 에러를 던져야 한다', async () => {
      repository.findOneRecordByTitle.mockResolvedValueOnce(makeNotice());
      await expect(service.createOne({ title: '점검 안내', content: '내용' })).rejects.toThrow();
    });
  });

  describe('findOneById', () => {
    it('공지가 없으면 에러를 던져야 한다', async () => {
      repository.findOneRecordById.mockResolvedValueOnce(null);
      await expect(service.findOneById(1)).rejects.toThrow();
    });
  });
});
```

### 2순위: Controller E2E 테스트

```typescript
// test/notice.e2e-spec.ts (또는 domains/notice/adapters/inbound/http/controllers/__tests__/)

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { NOTICE_PORT } from '../core/application/ports/inbound';

describe('NoticeController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NoticeController],
      providers: [
        { provide: NOTICE_PORT, useValue: { /* mock methods */ } },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /notice/create/one: 성공', () => {
    return request(app.getHttpServer())
      .post('/notice/create/one')
      .send({ title: 'test', content: '내용' })
      .expect(201);
  });
});
```

### NestJS 테스트 우선순위

| 순위 | 대상 | 가치 |
|------|------|------|
| **1** | Service 단위 테스트 | 비즈니스 로직 보호, Mock 주입 용이 |
| **2** | Controller E2E 테스트 | API 계약 검증 (DTO 유효성, 상태코드) |
| **3** | Repository Adapter 통합 테스트 | 실제 DB 쿼리 검증 (선택적) |

---

## 2. FastAPI 백엔드 테스트 (video-model)

### 디렉토리 구조

FastAPI 도메인은 도메인 폴더 내부의 `tests/` 디렉토리에 테스트 파일을 배치하며, Outbound Port(Protocol)를 Fake 클래스로 주입한다.

```
apps/api/fastapi/video-model/app/domains/video/
├── core/application/services/
│   └── video_job_service.py
├── core/application/ports/outbound/
│   └── video_job_repository_port.py        ← Protocol 정의
├── adapters/
│   ├── inbound/http/
│   │   └── video_job_router.py
│   └── outbound/db/
│       └── video_job_repository.py
└── tests/
    ├── conftest.py                          ← Fake/픽스처 정의
    └── test_video_job_service.py            ← Service 단위 테스트 (1순위)
```

> 예제 도메인: **video**: `VideoJobService`, `VideoJobRepositoryPort`(Protocol), `tests/test_video_job_service.py` (`FakeVideoJobRepository` 주입), `VideoJobStatus{PENDING, ...}`.

### Fake Port 패턴

NestJS의 `jest.fn()` Mock 팩토리에 대응하는 FastAPI 관용은 **Outbound Port(Protocol)를 구현한 Fake 클래스**다. 인메모리 상태를 가지므로 결과 검증이 직관적이다.

```python
# app/domains/video/tests/test_video_job_service.py

from app.domains.video.core.application.ports.outbound import (
    VideoJobRepositoryPort,
)
from app.domains.video.core.domain import VideoJob, VideoJobStatus


class FakeVideoJobRepository(VideoJobRepositoryPort):
    """VideoJobRepositoryPort(Protocol)를 구현한 인메모리 Fake."""

    def __init__(self) -> None:
        self._items: dict[int, VideoJob] = {}
        self._seq = 0

    async def create_record(self, job: VideoJob) -> VideoJob:
        self._seq += 1
        saved = job.model_copy(update={"id": self._seq})
        self._items[self._seq] = saved
        return saved

    async def find_one_record_by_id(self, job_id: int) -> VideoJob | None:
        return self._items.get(job_id)

    async def find_one_record_by_title(self, title: str) -> VideoJob | None:
        return next((j for j in self._items.values() if j.title == title), None)

    async def find_many_records(self) -> list[VideoJob]:
        return list(self._items.values())

    async def update_one_record_by_id(self, job_id: int, job: VideoJob) -> VideoJob:
        self._items[job_id] = job
        return job

    async def delete_many_records_by_ids(self, ids: list[int]) -> None:
        for i in ids:
            self._items.pop(i, None)
```

### Service 단위 테스트

```python
# app/domains/video/tests/test_video_job_service.py

import pytest

from app.domains.video.core.application.services import VideoJobService
from app.domains.video.core.domain import VideoJob, VideoJobStatus


def make_job(**overrides) -> VideoJob:
    """테스트용 엔티티 팩토리."""
    base = {
        "id": 1,
        "title": "기본 영상 작업",
        "status": VideoJobStatus.PENDING,
    }
    base.update(overrides)
    return VideoJob(**base)


@pytest.fixture
def repository() -> FakeVideoJobRepository:
    return FakeVideoJobRepository()


@pytest.fixture
def service(repository: FakeVideoJobRepository) -> VideoJobService:
    return VideoJobService(repository=repository)


class TestCreateOne:
    @pytest.mark.asyncio
    async def test_creates_a_new_job(
        self, service: VideoJobService, repository: FakeVideoJobRepository
    ) -> None:
        """새 작업을 생성해야 한다."""
        # Act
        result = await service.create_one(title="렌더링", )

        # Assert
        assert result.id is not None
        assert result.status == VideoJobStatus.PENDING
        assert await repository.find_one_record_by_id(result.id) == result

    @pytest.mark.asyncio
    async def test_duplicate_title_raises(
        self, service: VideoJobService, repository: FakeVideoJobRepository
    ) -> None:
        """제목이 중복되면 에러를 던져야 한다."""
        await repository.create_record(make_job(title="렌더링"))
        with pytest.raises(ValueError):
            await service.create_one(title="렌더링")


class TestFindOneById:
    @pytest.mark.asyncio
    async def test_missing_job_raises(
        self, service: VideoJobService
    ) -> None:
        """작업이 없으면 에러를 던져야 한다."""
        with pytest.raises(LookupError):
            await service.find_one_by_id(999)
```

### 라우터(Inbound) 테스트

```python
# app/domains/video/tests/test_video_job_router.py

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app


@pytest.mark.asyncio
async def test_post_video_jobs_생성_성공() -> None:
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/video-jobs", json={"title": "렌더링"})

    assert resp.status_code == 201
    assert resp.json()["status"] == "PENDING"
```

### FastAPI 테스트 우선순위

| 순위 | 대상 | 가치 |
|------|------|------|
| **1** | Service 단위 테스트 | Outbound Port(Protocol)를 Fake로 주입해 비즈니스 로직 검증 |
| **2** | 라우터(Inbound) 테스트 | `httpx.AsyncClient` + ASGI 로 요청/응답, 상태코드 검증 |
| **3** | Repository Adapter 통합 테스트 | 실제 DB 쿼리 검증 (선택적) |

### FastAPI 테스트 규칙

- 모든 Service/Repository 가 비동기이므로 테스트에 `@pytest.mark.asyncio` (pytest-asyncio) 사용
- Outbound Port 는 `typing.Protocol` 로 정의하고, 테스트에서는 이를 구현한 **Fake 클래스**를 주입 (jest mock 대신)
- 함수 이름은 영문 snake_case(`test_<대상>_<기대>`), 한국어 설명은 docstring 에 둔다
- 픽스처(`conftest.py`)로 Fake/Service 조립을 공유하여 보일러플레이트 최소화
- 외부 서비스(스토리지/큐) 연동 테스트는 마커(`@pytest.mark.integration`)로 분리하고 기본 실행에서 제외

---

## 3. SvelteKit 프론트엔드 테스트 (web/groupware)

지금 단위 테스트가 있는 web 앱은 groupware 하나다. control-tower 는 vitest 가 설치돼 있지 않고
테스트 파일도 없어 타입 게이트(`svelte-check`)만 돈다. 그쪽에 첫 테스트를 넣을 때는 아래 구조를
그대로 따르고, `vitest` 의존성과 `test` 스크립트를 함께 추가한다(스크립트가 없으면
`turbo run test` 가 그 패키지를 조용히 건너뛴다).

### 디렉토리 구조

소스 코드와 분리된 `tests/` 최상위 폴더를 사용하며, 앱 구조(`lib/pages/`, `lib/shared/lib/stores/`, `lib/features/<feature>/` 데이터 레이어)를 미러링한다.

```
apps/web/groupware/tests/
├── unit/
│   ├── features/
│   │   └── <feature>/                          ← 데이터 레이어
│   │       ├── apis/xxxApi.test.ts             ← api 함수(frontClient → BFF)
│   │       └── services/xxx.service.test.ts    ← service(조합) 로직
│   ├── shared/lib/
│   │   ├── stores/
│   │   │   └── <name>/xxxStore.test.ts         ← store 로직(중앙 stores)
│   │   └── utils/
│   │       └── xxxUtils.test.ts                ← 유틸리티
│   └── routes/api/
│       └── <route>/server.test.ts             ← BFF +server.ts
├── component/
│   └── <area>/<page>/XxxPage.svelte.test.ts   ← 페이지/컴포넌트 렌더(jsdom)
├── integration/
│   └── xxx-flow.test.ts                        ← 여러 레이어 연동
└── README.md
```

### Vitest 설정

```typescript
// vite.config.ts → test 블록

test: {
  expect: { requireAssertions: true },
  projects: [
    {
      extends: './vite.config.ts',
      test: {
        name: 'unit',
        environment: 'node',
        include: ['tests/unit/**/*.test.{js,ts}'],
        exclude: ['**/*.svelte.test.{js,ts}']
      }
    },
    {
      extends: './vite.config.ts',
      test: {
        name: 'integration',
        environment: 'node',
        include: ['tests/integration/**/*.test.{js,ts}']
      }
    }
  ]
}
```

### 파일 명명 규칙

```
소스 파일: authTokenUtils.ts
테스트 파일: authTokenUtils.test.ts
            authTokenUtils.spec.ts 는 쓰지 않는다(Vitest 는 .test.ts 사용)
```

### Import 경로

```typescript
// 절대 경로 사용 ($lib). 컴포넌트는 service, 데이터는 features 레이어, 상태는 shared/lib/stores
import { authService } from '$lib/features/account/services/auth.service';
import { login } from '$lib/features/account/apis/loginApi';

// 상대 경로 금지
import { login } from '../../../../../src/lib/features/...';
```

### 모킹 전략

```typescript
// HTTP 클라이언트(frontClient) 모킹: 같은 origin BFF 용 공통 axios 인스턴스
vi.mock('$lib/infrastructure/http/clientInstances', () => ({
  frontClient: vi.fn(() => ({
    POST: mockPost,
    GET: mockGet,
  })),
}));

// SvelteKit 환경 모킹
vi.mock('$app/environment', () => ({
  browser: false,
}));

// 시간 모킹
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});
```

### 테스트 작성 패턴 (AAA)

```typescript
describe('모듈명', () => {
  describe('함수명', () => {
    it('구체적인 동작 설명', async () => {
      // Arrange (준비)
      const userId = 123;
      mockPost.mockResolvedValue({ data: { success: true } });

      // Act (실행)
      const result = await requestFriend(userId);

      // Assert (검증)
      expect(result.success).toBe(true);
    });
  });
});
```

### 프론트엔드 테스트 우선순위

| 순위 | 대상 | 가치 |
|------|------|------|
| **1** | 유틸리티 함수 (`shared/lib/utils/`) | 순수 함수, 테스트 가장 쉬움 |
| **2** | api/service (`features/*/{apis,services}/`) | HTTP 요청/응답, 조합 로직 검증 |
| **3** | BFF +server.ts (`routes/api/`) | 인증/파라미터 처리 검증 |
| **4** | Store (`shared/lib/stores/`) | 상태 관리 로직 검증 |
| **5** | 페이지 컴포넌트 (`lib/pages/`) | 렌더/상호작용(component 테스트) |

---

## 전체 테스트 도입 우선순위

| 순위 | 대상 | 테스트 종류 | 이유 |
|------|------|-----------|------|
| **1** | NestJS Service | 단위 테스트 | Port/Mock 구조 완비, ROI 최고 |
| **2** | 프론트 BFF +server.ts | 단위 테스트 | 인증/파라미터 처리 검증 |
| **3** | FastAPI Service | 단위 테스트 | Outbound Port(Protocol) Fake 주입 용이 |
| **4** | Svelte Store/Utils | 단위 테스트 | 상태 로직 검증 |
| **5** | NestJS Controller | E2E 테스트 | API 계약 보장 |
| **6** | FastAPI 라우터 | HTTP 테스트 | `httpx.AsyncClient` + ASGI 활용 |

---

## 핵심 원칙

### 1. 헥사고날 구조를 활용

Service는 Port(인터페이스)만 의존하므로 Mock 주입이 자연스럽다. Repository Adapter 통합 테스트보다 **Service 단위 테스트가 ROI가 훨씬 높다**.

```
Service ──depends on──▶ Outbound Port (interface)
                              ▲
                              │ implements
                    Repository Adapter (실제)
                    Mock/Fake Repository (테스트)   ← 여기를 교체
```

### 2. 테스트 위치 규칙

| 환경 | 테스트 위치 | 이유 |
|------|-----------|------|
| **NestJS** | `__tests__/` 폴더 (도메인 내부) | 기존 csc-groupware 패턴 유지 |
| **Python** | `tests/` 디렉토리에 `test_*.py` | pytest 관용 |
| **SvelteKit** | `tests/` 최상위 폴더 | 기존 web/groupware 패턴 유지 |

### 3. Mock 전략

| 환경 | Mock 위치 | 방식 |
|------|----------|------|
| **NestJS** | `__mocks__/` 폴더 | Port 인터페이스 기반 `jest.Mocked<T>` + `jest.fn()` 팩토리 |
| **FastAPI** | 도메인 `tests/` (또는 `conftest.py`) | Outbound Port(Protocol)를 구현한 Fake 클래스 주입 |
| **SvelteKit** | 테스트 파일 내 `vi.mock()` | HTTP 클라이언트/환경 모킹 |

### 4. 테스트 작성 규칙

- **AAA 패턴**: Arrange(준비) → Act(실행) → Assert(검증)
- **테스트 설명은 한국어**로 쓰되, 그것이 문자열인지 식별자인지에 따라 자리가 다르다.
  - **Jest/Vitest**: `describe`/`it` 이 문자열을 받으므로 거기에 한국어 문장을 넣는다
    (예: `it('제목 중복 시 에러를 던져야 한다')`).
  - **pytest**: 함수 이름은 식별자다. **영문 snake_case** 로 짓고 한국어 설명은 docstring 에 둔다
    (예: `def test_duplicate_title_raises(): """제목이 중복되면 에러를 던져야 한다."""`).
    pytest 의 보편적 관례이고, 이름이 실행 인자(`-k`, `pytest path::name`)와 로그에 그대로 쓰여
    터미널, CI, 편집기 어디서도 깨지지 않는다.
- **하나의 it에 하나의 검증**: 테스트 실패 시 원인 파악 용이
- **엔티티 팩토리 함수**: `makeNotice(overrides)` / `make_job(**overrides)` 패턴으로 테스트 데이터 생성

---

## 커버리지 목표

### NestJS 백엔드

| 레이어 | 목표 | 우선순위 |
|--------|------|---------|
| **Service** | 80%+ | 최고 |
| **Controller** (E2E) | 60%+ | 중간 |
| **Repository Adapter** | 선택적 | 낮음 |

### FastAPI 백엔드

| 레이어 | 목표 | 우선순위 |
|--------|------|---------|
| **Service** | 80%+ | 최고 |
| **라우터(Inbound)** | 60%+ | 중간 |
| **Repository Adapter** | 선택적 | 낮음 |

### SvelteKit 프론트엔드

| 레이어 | 목표 | 우선순위 |
|--------|------|---------|
| **Utils** | 90%+ | 최고 |
| **api/service** | 80%+ | 높음 |
| **BFF +server.ts** | 70%+ | 높음 |
| **Store** | 70%+ | 중간 |
| **페이지 컴포넌트** | 60%+ | 중간 |

---

## 참고 문서

- [api-architecture.md](./api-architecture.md): 헥사고날 아키텍처 상세
- [clean-architecture-structure.md](./clean-architecture-structure.md): Clean Architecture 폴더 구조
- [request-flow.md](./request-flow.md): 요청 흐름 (테스트 경계 파악에 유용)
- [Vitest 공식 문서](https://vitest.dev/)
- [pytest 공식 문서](https://docs.pytest.org/)
