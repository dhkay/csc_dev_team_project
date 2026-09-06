# Request Flow - 클라이언트부터 DB까지 요청 흐름

## 한 줄 요약

### 프론트엔드 (BFF 패턴, 공통)
```
UI 페이지(lib/pages) → service(lib/features/*/services) → query/mutation → api(frontClient) → web/routes/api/<domain>/+server.ts (BFF, 토큰 주입)
                     ↘ 클라이언트 상태(store)는 lib/shared/lib/stores
```
> 브라우저는 백엔드 API 를 직접 호출하지 않고 **자기 web 서버의 `routes/api/<domain>/+server.ts` 만** 호출한다(토큰 주입, 백엔드 중계는 BFF).
>
> **프론트 구조 컨벤션(로그인 페이지 기준):**
> - **UI 페이지**: `lib/pages/<area>/<page>/<Name>Page.svelte` + 하위 `components/`. 라우트(`routes/.../+page.svelte`)는 얇게 유지하고 `$lib/pages/...` 의 페이지 컴포넌트만 import, 렌더(가드/로드는 `+page.server.ts`).
> - **클라이언트 상태(store)**: `lib/shared/lib/stores/<name>/<name>.svelte.ts` 에 중앙화(Svelte 5 runes 싱글톤). 스토어 전용 타입/목업은 같은 폴더에 동거.
> - **데이터 레이어**: 컴포넌트는 fetch 를 직접 하지 않고 **service 를 호출**한다. `apis`(HTTP) → `queries`/`mutations`(조회/변경) → `services`(조합) 순으로 쌓고, 모두 `lib/features/<feature>/` 에 둔다. **서버 상태는 TanStack Query(`@tanstack/svelte-query` v6, Svelte 5 runes)를 표준으로 채택**한다: 루트 `routes/+layout.svelte` 에 `QueryClient`+`QueryClientProvider`(전역 1회, `enabled: browser` 로 SSR 페치 차단), `queries/` 는 `queryOptions({queryKey, queryFn})`(봉투 풀고 실패 시 throw), `mutations/` 는 `create*MutationOptions(queryClient)`(성공 시 `invalidateQueries`, 삭제는 `onMutate` 낙관적+`onError` 롤백), `services/` 는 이 옵션들을 노출하고 컴포넌트가 `createQuery(()=>opts)`/`createMutation(()=>opts)` 로 소비한다. 레퍼런스 구현: `lib/features/marketing-channels/`(무효화형 mutation 과 `onMutate` 낙관형이 둘 다 있다) + 소비 예시 `lib/pages/tools/marketing-video/settings/AiModelEditor.svelte`. (아직 미이관 기능은 `apis` 직접 호출 래퍼로 남아 있을 수 있음. 점진 이관.)
> - **HTTP 클라이언트**: 브라우저는 `frontClient`(`lib/infrastructure/http/clientInstances`, 같은 origin BFF 용 공통 axios 인스턴스 + 인터셉터)로 `/api/...` 호출.

### csc-groupware 백엔드 (NestJS, 헥사고날)
```
+server.ts → Controller(@Controller, Inbound Adapter) → Service(Inbound Port 구현) → Outbound Port → Repository Adapter(Drizzle ORM, groupwaredb) → PostgreSQL
```

### csc-control-tower 백엔드 (NestJS, 헥사고날)
```
+server.ts → Controller(@Controller, Inbound Adapter) → Service(Inbound Port 구현) → Outbound Port → Repository Adapter(Drizzle ORM, controltowerdb) → PostgreSQL
```
> 관리자 도메인 일부는 직접 DB 를 보지 않고 **csc-control-tower → csc-groupware 로 HTTP 호출(서비스 토큰)** 하여 사용자 데이터를 조회/조작한다.

### video-model 백엔드 (FastAPI, 헥사고날: 영상 제작 자동화)
```
+server.ts → APIRouter(router.py, Inbound Adapter) → Service(Inbound Port 구현) → Outbound Port(Protocol) → Repository(SQLAlchemy async) → PostgreSQL
```
> NestJS 와 동일한 헥사고날 골격을 파이썬으로 옮긴 것이다. DI 는 NestJS `@Inject` 대신 FastAPI `Depends` + `app/container.py` 조립으로 구현한다.

### 전체 흐름 (csc-groupware 예시)
```
UI 페이지(NoticePage, lib/pages) → noticeService → query/mutation → notice.api(frontClient) → routes/api/notice/+server.ts(토큰 주입) → NoticeController(@Controller) → NoticeService(NOTICE_PORT 구현) → NoticeRepositoryAdapter(Drizzle ORM, groupwaredb) → PostgreSQL
```

---

## 개요

csc_project 의 요청 흐름은 다음 레이어를 거칩니다:

```
1. UI 페이지 (Svelte): lib/pages/<area>/<page>/<Name>Page.svelte (+ components/)
  , 클라이언트 상태(store)는 lib/shared/lib/stores/<name>/
2. service → query/mutation → api 호출 함수 (lib/features/<feature>/, frontClient 로 BFF 호출)
3. SvelteKit web/routes/api/<domain>/+server.ts (BFF, 토큰 주입)
4. 백엔드 Inbound Adapter
   - NestJS: Controller (@Controller)
   - FastAPI: APIRouter (router.py)
5. Application Service (Inbound Port 구현)
6. Outbound Port (인터페이스/Protocol)
7. Repository Adapter (Outbound Port 구현)
   - NestJS: Drizzle ORM (groupwaredb/controltowerdb)
   - FastAPI: SQLAlchemy async (AsyncSession)
8. PostgreSQL
```

> **헥사고날 아키텍처**: 백엔드 3개(csc-groupware, csc-control-tower, video-model)는 모두 헥사고날 구조를 따릅니다. NestJS 두 앱은 packages/database 의 Service 를 거치지 않고 Adapter 에서 Drizzle ORM Client 를 직접 사용한다(groupwaredb: `groupwareDb`, controltowerdb: `controlTowerDb`). video-model 는 Adapter 에서 SQLAlchemy `AsyncSession` 을 직접 사용하며 Alembic 으로 마이그레이션을 관리한다.

---

## 전체 흐름도

```
┌─────────────────────────────────────────────────────────────────────┐
│                    1. 사용자 브라우저 (UI 페이지)                    │
│        apps/web/<app>/src/lib/pages/<area>/<page>/<Name>Page.svelte  │
│        (+ components/), 상태 store: src/lib/shared/lib/stores/      │
└────────────────────────┬────────────────────────────────────────────┘
                         │ 사용자 액션 (클릭, 입력 등) → service 호출
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│            2. service → query/mutation → api 호출 함수               │
│        apps/web/<app>/src/lib/features/<feature>/                    │
│          services/, queries/, mutations/, apis/                  │
│                                                                      │
│  - api 는 frontClient(공통 axios)로 GET/POST 호출                   │
│  - URL: /api/<domain>/... (자기 web 서버의 BFF 라우트)             │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTP 요청 (같은 origin)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│         3. SvelteKit routes/api/<domain>/+server.ts (BFF Layer)     │
│              apps/web/<app>/src/routes/api/                          │
│                                                                      │
│  - 파라미터 추출 및 검증                                             │
│  - event.locals 의 accessToken 주입 (Bearer)                        │
│  - 백엔드 API 로 중계 (csc-groupware / csc-control-tower / video-model)│
│  - 응답 가공 및 에러 처리                                           │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTP 요청 (Bearer Token 포함)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 4. 백엔드 Inbound Adapter                            │
│  NestJS:  apps/api/nestjs/csc-groupware/src/domains/*/adapters/inbound/http/│
│           apps/api/nestjs/csc-control-tower/src/domains/*/adapters/inbound/http/
│  FastAPI: apps/api/fastapi/video-model/app/domains/*/adapters/inbound/http/router.py
│                                                                      │
│  - 인증 (NestJS 데코레이터 / FastAPI Depends)                       │
│  - DTO 검증 (class-validator / Pydantic)                            │
│  - Inbound Port 호출                                                 │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 5. Application Service (Inbound Port 구현)           │
│  NestJS:  .../domains/*/core/application/services/                  │
│  FastAPI: app/domains/*/core/application/services.py                │
│                                                                      │
│  - 비즈니스 로직 처리                                                │
│  - 데이터 검증 및 변환                                               │
│  - Outbound Port 호출                                                │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│         6. Repository Adapter (Outbound Port 구현)                   │
│  NestJS:  .../domains/*/adapters/outbound/db/{groupwaredb|controltowerdb}/      │
│           → Drizzle ORM Client (groupwareDb / controlTowerDb)                   │
│  FastAPI: app/domains/*/adapters/outbound/db/repository.py          │
│           → SQLAlchemy AsyncSession                                  │
│                                                                      │
│  - Mapper 로 Domain Entity 변환                                      │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    7. PostgreSQL                                     │
│                                                                      │
│  - 데이터 조회/저장/수정/삭제                                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 레이어별 상세 설명

### 1. UI 페이지 (Svelte)

**위치**: `apps/web/<app>/src/lib/pages/<area>/<page>/<Name>Page.svelte` (+ 하위 `components/`)
예: `lib/pages/auth/login/LoginPage.svelte` + `components/LoginForm.svelte`, `lib/pages/admin/organization/OrganizationManagementPage.svelte` + `components/`.

라우트는 얇게: 페이지 컴포넌트만 import, 렌더(가드/로드는 `+page.server.ts`):

```svelte
<!-- routes/[orgSlug]/admin/users/+page.svelte -->
<script lang="ts">
  import UserManagementPage from '$lib/pages/admin/user-management/UserManagementPage.svelte';
</script>
<UserManagementPage />
```

페이지 컴포넌트는 데이터는 **service** 로, 상태는 **store** 로:

```svelte
<!-- lib/pages/.../NoticePage.svelte -->
<script lang="ts">
  import { noticeStore } from '$lib/shared/lib/stores/noticeStore/noticeStore.svelte';
  import { noticeService } from '$lib/features/notice/services/notice.service';

  async function loadNotices() {
    const data = await noticeService.load({ skip: 0, take: 20 });
    noticeStore.initializeWithServerData(data.records);
  }
</script>
```

**클라이언트 상태(store)**: `apps/web/<app>/src/lib/shared/lib/stores/<name>/<name>.svelte.ts`
- Svelte 5 runes 싱글톤(`class … { private _x = $state() } export const xStore = new …`). 스토어 전용 타입/목업은 같은 폴더에 동거.
- props 는 인라인 타입 대신 `interface Props { … }` + `$props()`.

---

### 2. 데이터 레이어 (service → query/mutation → api)

**위치**: `apps/web/<app>/src/lib/features/<feature>/`: `services/`, `queries/`, `mutations/`, `apis/`, `types/`.
컴포넌트는 **service 만** 호출하고, service 가 query/mutation 을, 그게 api 를 호출한다.

```typescript
// services/notice.service.ts: query/mutation 조합 (컴포넌트가 호출)
import { noticeQuery } from '../queries/notice.query';
import { createNoticeMutation } from '../mutations/notice.mutation';
export const noticeService = { load: noticeQuery, create: createNoticeMutation };

// queries/notice.query.ts: 조회 로직(향후 TanStack createQuery 자리), apis 호출
import { getNoticeList } from '../apis/notice.api';
export function noticeQuery(params: NoticeListParams) { return getNoticeList(params); }

// apis/notice.api.ts: frontClient 로 같은 origin BFF 만 호출(백엔드 직접 호출 금지)
import { frontClient } from '$lib/infrastructure/http/clientInstances';
export async function getNoticeList(params: NoticeListParams) {
  const res = await frontClient().GET<{ data: unknown }>(`/api/notice/list?${new URLSearchParams(params as any)}`);
  return res.data.data;
}
```

> **BFF 원칙**: 브라우저 코드는 `csc-groupware`/`csc-control-tower`/`video-model` 의 주소를 알지 못한다. 항상 같은 origin 의 `/api/<domain>/...` (즉 `routes/api/<domain>/+server.ts`) 만 호출하며, 토큰 주입과 백엔드 주소 해석은 BFF 서버 코드가 담당한다.

---

### 3. SvelteKit routes/api/<domain>/+server.ts (BFF Layer)

**위치**: `apps/web/<app>/src/routes/api/<domain>/`

> BFF 서버코드는 **raw fetch 로 백엔드를 호출하지 않는다.** `serverClientInstances` 의 공유 클라이언트를 씁니다. `auth*Client(event)`(요청의 access token 주입) / `server*Client()`(비인증 호출). 두 경우 모두 인터셉터가 **X-Service-Token 을 자동 주입**하고, baseURL 은 내부망 `PRIVATE_*_API_URL` 다.

```typescript
// apps/web/groupware/src/routes/api/notice/list/+server.ts
// BFF: 브라우저 ↔ 백엔드 중계. 공유 서버 클라이언트가 access token + X-Service-Token 자동 주입.
import { json, type RequestHandler } from '@sveltejs/kit';
import { authMainClient } from '$lib/infrastructure/http/serverClientInstances';

export const GET: RequestHandler = async (event) => {
  const { searchParams } = event.url;
  const skip = Number(searchParams.get('skip')) || 0;
  const take = Number(searchParams.get('take')) || 20;
  const order = searchParams.get('order') || 'DESC';

  // csc-groupware 로 중계: authMainClient(event) 가 토큰 자동 주입. 응답은 axios 라 .data.
  const res = await authMainClient(event).GET<{ records: unknown[]; count: number }>(
    `/notice/list?skip=${skip}&take=${take}&order=${order}`,
  );
  return json({ success: true, data: res.data });
};
```

**타깃별 클라이언트 (serverClientInstances)**:

```typescript
// csc-groupware(NestJS):      authMainClient(event) / serverMainClient()      (PRIVATE_API_URL)
const a = await authMainClient(event).GET('/notice');
// csc-control-tower(NestJS):  authControlClient(event)                        (PRIVATE_ADMIN_API_URL)
const b = await authControlClient(event).GET('/platform/organizations');
// user(NestJS):               authUserClient(event) / serverUserClient()      (PRIVATE_USER_API_URL)
const c = await serverUserClient().POST('/user-api/refresh', { refreshToken });
// file-upload(FastAPI):       authFileUploadClient(event)                     (PRIVATE_STORAGE_API_URL)
```

> **새 도메인/서버 추가 규칙**: 새 백엔드를 호출하려면 ① `serverClientInstances.ts` 에 그 타깃의 server*/auth* 클라이언트(공유 `createApiClient` + `PRIVATE_*_API_URL`)를 추가하고 ② BFF 라우트(`routes/api/<domain>/+server.ts`)에서 그 클라이언트로 중계한다. 브라우저는 여전히 `/api/<domain>` 만 호출하므로 클라이언트 코드 변경은 없다. raw fetch + 수동 Authorization 헤더는 쓰지 않는다(서비스토큰, 인터셉터 우회).

---

### 4. 백엔드 Inbound Adapter

#### 4-A. NestJS Controller (csc-groupware / csc-control-tower)

**위치**: `apps/api/nestjs/csc-groupware/src/domains/*/adapters/inbound/http/`

```typescript
// notice.controller.ts
@ApiTags('[그룹웨어] 공지사항(notice) API')
@Controller('notice')
export class NoticeController {
  constructor(
    @Inject(NOTICE_PORT)
    private readonly noticeService: NoticePort,
  ) {}

  @Get('list')
  @ApiBearerAuth()
  async findMany(
    @GetTokenUserId() user: TOKEN_VALUE_TYPE,
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 10,
    @Query('order') order: OrderType = 'DESC',
  ) {
    return await this.noticeService.findMany(skip, take, order, 'id');
  }
}
```

**주요 데코레이터**:
- `@GetTokenUserId()` - JWT 토큰에서 userId 추출
- `@ApiBearerAuth()` - Swagger Bearer 인증 표시
- `@ApiTags()` - Swagger 그룹핑
- DTO 검증은 class-validator 기반 DTO 클래스로 수행

#### 4-B. FastAPI APIRouter (video-model)

**위치**: `apps/api/fastapi/video-model/app/domains/*/adapters/inbound/http/router.py`

```python
# router.py: Inbound Adapter. ORM 을 직접 import 하지 않는다.
from fastapi import APIRouter, Depends, HTTPException

from ....core.application.ports.inbound import VideoJobInboundPort
from .schemas import CreateVideoJobRequest, VideoJobResponse
from . import mappers


def get_video_job_service() -> VideoJobInboundPort:
    # 실제 provider 는 app/container.py 에서 오버라이드된다.
    raise NotImplementedError


router = APIRouter(prefix="/video-jobs", tags=["video-automation"])


@router.post("", response_model=VideoJobResponse)
async def create(
    body: CreateVideoJobRequest,
    service: VideoJobInboundPort = Depends(get_video_job_service),
) -> VideoJobResponse:
    job = await service.create(body.title)
    return mappers.to_response(job)
```

**요청 DTO (Pydantic)**: `schemas.py`:

```python
class CreateVideoJobRequest(BaseModel):
    title: str = Field(min_length=1)


class VideoJobResponse(BaseModel):
    id: str
    title: str
    status: VideoJobStatus
    created_at: datetime
```

> NestJS 의 `@Inject(PORT)` 와 동일한 역할을 FastAPI 에서는 `Depends(get_video_job_service)` 가 한다. provider 의 실제 구현은 `app/container.py` 와 `app/main.py` 에서 오버라이드로 주입된다.

---

### 5. Application Service (Inbound Port 구현)

#### 5-A. NestJS Service (csc-groupware)

**위치**: `apps/api/nestjs/csc-groupware/src/domains/*/core/application/services/`

```typescript
// notice.service.ts
@Injectable()
export class NoticeService implements NoticePort {
  constructor(
    @Inject(NOTICE_REPOSITORY_PORT)
    private readonly noticeRepository: NoticeRepositoryPort,
  ) {}

  async findMany(
    skip: number = 0,
    take: number = 10,
    order: OrderType = 'DESC',
    orderColumn: NoticeOrderColumn = 'id',
  ): Promise<NoticeListResult> {
    return await this.noticeRepository.findManyRecords(skip, take, order, orderColumn);
  }

  async createOne(dto: { title: string }): Promise<NoticeEntity> {
    const exist = await this.findOneByTitle(dto.title);
    if (exist) {
      throw new Error('이미 존재하는 title 입니다.');
    }
    return await this.noticeRepository.createRecord(dto);
  }
}
```

#### 5-B. FastAPI Service (video-model)

**위치**: `apps/api/fastapi/video-model/app/domains/*/core/application/services.py`

```python
# services.py: Inbound Port 구현 = 비즈니스 로직.
# 외부(FastAPI/SQLAlchemy)를 모르고 Outbound Port(Protocol)만 생성자로 주입받는다.
class VideoJobService:
    def __init__(self, repository: VideoJobRepositoryPort) -> None:
        self._repository = repository

    async def find_by_id(self, job_id: str) -> VideoJob | None:
        return await self._repository.find_by_id(job_id)

    async def create(self, title: str) -> VideoJob:
        job = VideoJob(
            id=str(uuid.uuid4()),
            title=title,
            status=VideoJobStatus.PENDING,
            created_at=datetime.now(timezone.utc),
        )
        return await self._repository.save(job)
```

> 두 언어 모두 Service 는 **Inbound Port 를 구현**하고 **Outbound Port(인터페이스/Protocol)만 의존**한다. 구체 ORM 이나 프레임워크는 절대 import 하지 않는다.

---

### 6. Repository Adapter (Outbound Port 구현)

#### 6-A. NestJS Repository Adapter (Drizzle ORM)

**위치**: `apps/api/nestjs/csc-groupware/src/domains/*/adapters/outbound/db/groupwaredb/`

```typescript
// notice.adapter.ts
import { Injectable } from '@nestjs/common';
import { eq, count, desc, asc } from 'drizzle-orm';
import { groupwareDb, notice } from '@csc/database/groupwaredb';
import { NoticeRepositoryPort } from '../../../../core/application/ports/outbound';
import { NoticeEntity, OrderType, NoticeOrderColumn } from '../../../../core/domain';
import { toNoticeEntity, getNoticeOrderColumn } from './mappers';

@Injectable()
export class NoticeRepositoryAdapter implements NoticeRepositoryPort {
  async findManyRecords(
    skip: number,
    take: number,
    order: OrderType,
    orderColumn: NoticeOrderColumn,
  ): Promise<{ records: NoticeEntity[]; count: number }> {
    const orderFn = order === OrderType.DESC ? desc : asc;
    const col = getNoticeOrderColumn(orderColumn);

    const [records, [{ total }]] = await Promise.all([
      groupwareDb.query.notice.findMany({
        offset: skip,
        limit: take,
        orderBy: orderFn(col),
      }),
      groupwareDb.select({ total: count() }).from(notice),
    ]);

    return { records: records.map(toNoticeEntity), count: total };
  }

  async createRecord(dto: { title: string }): Promise<NoticeEntity> {
    const [result] = await groupwareDb.insert(notice).values(dto).returning();
    return toNoticeEntity(result);
  }
}
```

**Mapper 파일**: `apps/api/nestjs/csc-groupware/src/domains/*/adapters/outbound/db/groupwaredb/mappers/`

```typescript
// mappers/index.ts
import { InferSelectModel } from 'drizzle-orm';
import { notice } from '@csc/database/groupwaredb';
import { NoticeEntity } from '../../../../../core/domain';

type NoticeRow = InferSelectModel<typeof notice>;

/** Drizzle Notice → Domain NoticeEntity 변환 */
export function toNoticeEntity(row: NoticeRow): NoticeEntity {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

#### 6-B. FastAPI Repository (SQLAlchemy async)

**위치**: `apps/api/fastapi/video-model/app/domains/*/adapters/outbound/db/repository.py`

```python
# repository.py: Outbound Adapter (SQLAlchemy 2.0, AsyncSession).
# SQLAlchemy 는 이 계층에서만 import. Row ↔ Domain 변환은 mappers 로만.
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.domain.entities import VideoJob
from . import mappers
from .models import VideoJobModel


class VideoJobRepository:
    """VideoJobRepositoryPort(Protocol) 의 구현."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def find_by_id(self, job_id: str) -> VideoJob | None:
        result = await self._session.execute(
            select(VideoJobModel).where(VideoJobModel.id == job_id)
        )
        row = result.scalar_one_or_none()
        return mappers.to_domain(row) if row is not None else None

    async def save(self, job: VideoJob) -> VideoJob:
        self._session.add(mappers.to_model(job))
        await self._session.flush()
        return job
```

---

### 7. Domain Entity

#### 7-A. NestJS (csc-groupware)

**위치**: `apps/api/nestjs/csc-groupware/src/domains/*/core/domain/entities/`

```typescript
// notice.entity.ts
/** 공지사항 엔티티 */
export interface NoticeEntity {
  id: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}
```

#### 7-B. FastAPI (video-model)

**위치**: `apps/api/fastapi/video-model/app/domains/*/core/domain/entities.py`

```python
# entities.py
@dataclass
class VideoJob:
    id: str
    title: str
    status: VideoJobStatus
    created_at: datetime
```

---

## 실전 예시 A: 공지사항 조회 (csc-groupware, NestJS)

### 요청 흐름

```
사용자: 공지사항 목록 조회 (skip: 0, take: 20)
    │
    ▼
[1] UI: NoticePage.svelte
    │  getNoticeList({ skip: 0, take: 20 }) 호출
    │
    ▼
[2] API 호출: notice.api.ts
    │  fetch('/api/notice/list?skip=0&take=20&order=DESC')  ← 자기 web 서버
    │
    ▼
[3] BFF: routes/api/notice/list/+server.ts
    │  - query params 추출
    │  - authMainClient(event).GET('/notice/list?...') 로 중계
    │    (access token + X-Service-Token 자동 주입, baseURL=PRIVATE_API_URL)
    │
    ▼
[4] Controller: NoticeController (@Controller('notice'))
    │  findMany(user, 0, 20, 'DESC')
    │
    ▼
[5] Service: NoticeService (NOTICE_PORT 구현)
    │  findMany(0, 20, 'DESC', 'id')
    │
    ▼
[6] Repository Adapter: NoticeRepositoryAdapter
    │  Drizzle findMany + count (groupwareDb)
    │
    ▼
[7] PostgreSQL (groupwaredb)
    │  SELECT * FROM notice
    │  ORDER BY id DESC
    │  OFFSET 0 LIMIT 20
    │
    ▼
응답: { records: [...], count: 42 }
```

### 응답 흐름 (역순)

```
PostgreSQL → Repository Adapter(Mapper 변환) → Service → Controller
    │
    ▼
[3] BFF: +server.ts
    │  - JSON 변환
    │
    ▼
[2] API 함수: body.data 반환
    │
    ▼
[1] UI: noticeStore 업데이트 → 화면 재렌더링
```

---

## 실전 예시 B: 영상 작업 생성 (video-model, FastAPI)

```
사용자: 영상 제작 작업 생성 (title)
    │
    ▼
[1] UI: VideoJobForm.svelte → createVideoJob({ title }) 호출
    │
    ▼
[2] API 호출: fetch('/api/video-jobs', { method: 'POST', body })  ← 자기 web 서버
    │
    ▼
[3] BFF: routes/api/video-jobs/+server.ts
    │  - 공유 서버 클라이언트로 중계 (access token + X-Service-Token 자동 주입)
    │  - POST /video-jobs  body={ title }  (baseURL=PRIVATE_MARKETING_VIDEO_API_URL)
    │
    ▼
[4] APIRouter: router.py  @router.post("")  (prefix="/video-jobs")
    │  - Pydantic CreateVideoJobRequest 검증
    │  - Depends(get_video_job_service) 로 서비스 주입
    │
    ▼
[5] Service: VideoJobService.create(title)  (Inbound Port 구현)
    │  - VideoJob 엔티티 생성 (status=PENDING)
    │
    ▼
[6] Repository: VideoJobRepository.save(job)  (Outbound Port 구현)
    │  - SQLAlchemy AsyncSession add + flush
    │
    ▼
[7] PostgreSQL
    │  INSERT INTO video_jobs (...)
    │
    ▼
응답: VideoJobResponse { id, title, status, created_at }
```

---

## 파일 위치 요약

### 프론트엔드 (apps/web/groupware, apps/web/control-tower)

| 레이어 | 디렉토리 | 예시 파일 |
|--------|---------|----------|
| **UI 페이지** | `apps/web/<app>/src/lib/pages/<area>/<page>/` (+ `components/`) | `LoginPage.svelte`, `OrganizationManagementPage.svelte` |
| **클라이언트 상태(store)** | `apps/web/<app>/src/lib/shared/lib/stores/<name>/` | `organizationStore.svelte.ts` |
| **service / query / mutation / api** | `apps/web/<app>/src/lib/features/<feature>/{services,queries,mutations,apis}/` | `auth.service.ts`, `login.mutation.ts`, `loginApi.ts` |
| **라우트(얇게)** | `apps/web/<app>/src/routes/.../+page.svelte` (+ `+page.server.ts` 가드/로드) | `[orgSlug]/admin/users/+page.svelte` |
| **BFF 라우트** | `apps/web/<app>/src/routes/api/<domain>/` | `notice/list/+server.ts` |

### 백엔드 NestJS (csc-groupware, csc-control-tower)

| 레이어 | 디렉토리 | 예시 파일 |
|--------|---------|----------|
| **Controller (Inbound)** | `apps/api/nestjs/csc-groupware/src/domains/*/adapters/inbound/http/` | `notice.controller.ts` |
| **Domain Entity** | `.../core/domain/entities/` | `notice.entity.ts` |
| **Domain Types** | `.../core/domain/types/` | `notice.types.ts` |
| **Inbound Ports** | `.../core/application/ports/inbound/` | `notice.port.ts` (NOTICE_PORT) |
| **Outbound Ports** | `.../core/application/ports/outbound/` | `notice-repository.port.ts` |
| **Service** | `.../core/application/services/` | `notice.service.ts` |
| **Repository Adapter** | `.../adapters/outbound/db/{groupwaredb\|controltowerdb}/` | `notice.adapter.ts` |
| **Mappers** | `.../adapters/outbound/db/{groupwaredb\|controltowerdb}/mappers/` | `index.ts` |

### 백엔드 FastAPI (video-model)

| 레이어 | 파일 | 예시 |
|--------|------|------|
| **APIRouter (Inbound)** | `app/domains/*/adapters/inbound/http/router.py` | `router /video-jobs` |
| **요청/응답 DTO (Pydantic)** | `.../adapters/inbound/http/schemas.py` | `CreateVideoJobRequest` / `VideoJobResponse` |
| **Inbound DTO Mapper** | `.../adapters/inbound/http/mappers.py` | `to_response` |
| **Domain Entity** | `app/domains/*/core/domain/entities.py` | `VideoJob` |
| **Domain Types** | `.../core/domain/types.py` | `VideoJobStatus` |
| **Inbound Port** | `.../core/application/ports/inbound.py` | `VideoJobInboundPort` (Protocol) |
| **Outbound Port** | `.../core/application/ports/outbound.py` | `VideoJobRepositoryPort` (Protocol) |
| **Service** | `.../core/application/services.py` | `VideoJobService` |
| **Repository (Outbound)** | `.../adapters/outbound/db/repository.py` | `VideoJobRepository` |
| **DB Models / Mappers** | `.../adapters/outbound/db/models.py`, `mappers.py` | `VideoJobModel` |
| **DI 조립** | `app/domains/*/module.py`, `app/container.py` | `build_video_job_service` |

---

## 백엔드 구조 (헥사고날 아키텍처)

### NestJS (csc-groupware / csc-control-tower)

```
apps/api/nestjs/{csc-groupware,csc-control-tower}/src/domains/<domain>/
├── core/
│   ├── domain/
│   │   ├── entities/         # 도메인 엔티티 정의
│   │   │   └── xxx.entity.ts
│   │   ├── types/            # 도메인 타입 정의
│   │   │   ├── xxx.types.ts
│   │   │   └── enums.ts
│   │   └── index.ts          # 모든 domain export
│   │
│   └── application/
│       ├── ports/
│       │   ├── inbound/      # 인바운드 포트 (인터페이스, XXX_PORT 토큰)
│       │   │   └── xxx.port.ts
│       │   └── outbound/     # 아웃바운드 포트 (Repository)
│       │       └── xxx-repository.port.ts
│       └── services/         # 서비스 구현 (domain 타입만 import)
│           └── xxx.service.ts
│
└── adapters/
    ├── inbound/
    │   └── http/
    │       └── xxx.controller.ts  # @Controller (class-validator DTO)
    │
    └── outbound/
        └── db/
            └── {groupwaredb|controltowerdb}/
                ├── xxx.adapter.ts   # Repository Adapter (Drizzle ORM)
                └── mappers/
                    └── index.ts     # ORM ↔ Domain 변환
```

### FastAPI (video-model)

```
apps/api/fastapi/video-model/app/domains/<domain>/
├── core/
│   ├── domain/
│   │   ├── entities.py       # 도메인 엔티티
│   │   └── types.py          # 도메인 타입/Enum
│   └── application/
│       ├── ports/
│       │   ├── inbound.py    # 인바운드 포트 (Protocol)
│       │   └── outbound.py   # 아웃바운드 포트 (Protocol, Repository)
│       └── services.py       # 서비스 구현 (domain 타입 + Outbound Port 만 import)
│
├── adapters/
│   ├── inbound/
│   │   └── http/
│   │       ├── router.py     # APIRouter
│   │       ├── schemas.py    # Pydantic 요청/응답 DTO
│   │       └── mappers.py    # DTO ↔ Domain 변환
│   └── outbound/
│       └── db/
│           ├── repository.py # Outbound Port 구현 (SQLAlchemy AsyncSession)
│           ├── models.py     # SQLAlchemy ORM 모델
│           └── mappers.py    # Row ↔ Domain 변환
│
└── module.py                 # 도메인 DI wiring (Port → 구현 바인딩)
```

**핵심 원칙:**
- **Service/Port**: domain 타입/엔티티와 Outbound Port(인터페이스/Protocol)만 import, 외부 프레임워크, ORM 직접 import 금지
- **Inbound Adapter**: NestJS 는 Controller 에서 `@Inject(XXX_PORT)` 로, FastAPI 는 router 에서 `Depends(...)` 로 Inbound Port 주입
- **Outbound Adapter**: NestJS 는 Drizzle ORM Client 직접 사용(groupwaredb: `groupwareDb`, controltowerdb: `controlTowerDb`), FastAPI 는 SQLAlchemy `AsyncSession` 직접 사용. Mapper 로 Domain Entity 변환
- **DI 조립**: NestJS 는 Nest 모듈/프로바이더, FastAPI 는 `module.py` + `app/container.py` + `app/main.py`
- **서버 간 호출**: csc-control-tower 의 일부 관리자 기능은 직접 DB 가 아니라 **csc-groupware 로 HTTP 호출(서비스 토큰)** 로 사용자 데이터를 처리

자세한 내용은 [clean-architecture-structure.md](./clean-architecture-structure.md) 참고.

---

## 주요 기술 스택

| 영역 | 기술 |
|-----|------|
| 프론트엔드 | SvelteKit 5, Svelte 5 ($state, $derived) |
| BFF | SvelteKit `routes/api/<domain>/+server.ts` (토큰 주입 후 백엔드 중계) |
| 백엔드 (csc-groupware) | NestJS, class-validator DTO |
| 백엔드 (csc-control-tower) | NestJS, class-validator DTO |
| 백엔드 (video-model, 영상 제작 자동화) | FastAPI, Pydantic, Depends DI, uv |
| 데이터베이스 | PostgreSQL |
| ORM / 마이그레이션 (NestJS) | Drizzle ORM (groupwaredb / controltowerdb) |
| ORM / 마이그레이션 (FastAPI) | SQLAlchemy async (AsyncSession), Alembic |
| 공유 패키지 | `@csc/database`(Drizzle: groupwaredb/userdb/controltowerdb), `@csc/shared-ui`, `@csc/net-utils` |
| 빌드 | TurboRepo, npm workspace (`@csc` scope) |
</content>
</invoke>
