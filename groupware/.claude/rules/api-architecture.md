# API 아키텍처 가이드 (csc-groupware, csc-control-tower, user, video-model, file-upload)

## 개요

`apps/api/nestjs/csc-groupware`, `apps/api/nestjs/csc-control-tower`, `apps/api/nestjs/user`는 NestJS 기반 Hexagonal Architecture (Ports & Adapters) 패턴으로 구현되어 있다(`user`는 인증/계정 게이트키퍼: 앱, 웹, 관리자 등 다중 유저 타입의 토큰 발급/갱신 담당). `apps/api/fastapi/video-model/`와 `apps/api/fastapi/file-upload/`는 FastAPI (Python) 기반 서버로, 동일한 Hexagonal Architecture 개념을 Python 관용적으로 적용한다.

- **video-model**: 마케팅 영상 제작 자동화. **모든 FFmpeg/트랜스코딩 영상 처리를 담당** (도메인 `video`).
- **file-upload**: 파일 업로드/오브젝트 스토리지(presigned URL). **FFmpeg 없음**; 영상 처리가 필요하면 video-model 를 HTTP 호출 (도메인 `upload`).

---

## 1. 디렉토리 구조

### NestJS (csc-groupware, csc-control-tower)

```
apps/api/nestjs/{csc-groupware|csc-control-tower}/src/domains/<domain>/
│
├── core/
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── index.ts
│   │   │   └── xxx.entity.ts           # 순수 TypeScript interface
│   │   ├── types/
│   │   │   ├── index.ts
│   │   │   └── xxx.types.ts            # Enum, Type 정의
│   │   └── index.ts                    # domain 전체 export
│   │
│   └── application/
│       ├── ports/
│       │   ├── inbound/
│       │   │   ├── xxx.port.ts
│       │   │   └── index.ts
│       │   └── outbound/
│       │       ├── xxx.port.ts         # DB, HTTP, Queue 등 외부 의존성 포트
│       │       └── index.ts
│       └── services/
│           └── xxx.service.ts
│
├── adapters/
│   ├── inbound/
│   │   └── http/
│   │       ├── controllers/
│   │       │   └── xxx.controller.ts
│   │       ├── dto/
│   │       │   └── xxx.dto.ts
│   │       ├── filters/
│   │       │   └── xxx.filter.ts
│   │       └── mappers/
│   │           └── index.ts
│   │
│   └── outbound/
│       ├── db/                         # 데이터베이스 접근
│       │   ├── index.ts
│       │   └── {groupwaredb|userdb|controltowerdb}/
│       │       ├── xxx.adapter.ts
│       │       ├── mappers/
│       │       │   └── index.ts
│       │       └── index.ts
│       │
│       ├── external/                   # 외부 서비스/다른 도메인 접근
│       │   ├── xxx.adapter.ts
│       │   └── index.ts
│       │
│       └── http/                       # 다른 백엔드 HTTP 호출(서버 간)
│           └── <target>-api/           # 예: user-api(control-tower→user)
│               ├── xxx-api.adapter.ts  # 타깃별 공유 클라이언트(NestServiceClient 상속)를 주입
│               └── index.ts
│
└── xxx.module.ts
```

#### 구조 요약

**Core (핵심 비즈니스 로직)**
- `core/domain/entities/`: 도메인 엔티티를 순수 TypeScript interface로 정의한다. ORM이나 프레임워크 의존성이 없다.
- `core/domain/types/`: Enum, Type 등 도메인에서 사용하는 타입을 정의한다.
- `core/application/ports/inbound/`: 외부에서 비즈니스 로직을 호출하기 위한 인터페이스(Port)다. Controller가 이 Port를 통해 Service를 호출한다.
- `core/application/ports/outbound/`: 비즈니스 로직이 외부 시스템(DB, HTTP, Queue 등)에 접근하기 위한 인터페이스다. Service가 이 Port를 통해 Adapter를 호출한다.
- `core/application/services/`: Inbound Port를 구현하는 서비스다. 비즈니스 로직을 담당하며, Outbound Port를 주입받아 외부 시스템과 통신한다.

**Adapters (외부 세계 연결)**
- `adapters/inbound/http/`: HTTP 요청을 받아 Core로 전달하는 Controller, DTO, Filter 등이 위치한다.
- `adapters/outbound/db/`: 데이터베이스에 접근하는 Repository Adapter다. `groupwaredb/`, `userdb/`, `controltowerdb/` 하위에 각 DB별 Drizzle ORM 구현체가 있다.
- `adapters/outbound/external/`: 같은 앱 내 다른 도메인의 데이터에 접근하거나, 외부 서비스를 호출하는 Adapter다.
- `adapters/outbound/http/<target>-api/`: 다른 백엔드 서버를 HTTP로 호출하는 Adapter다(서버 간 통신). 타깃별 공유 클라이언트(`@csc/net-utils/nest`의 `NestServiceClient` 상속, `X-Service-Token` 자동 주입)를 주입받아 사용한다. 예: control-tower→user(`user-api`). 상세는 §2.8.

### FastAPI (video-model)

```
apps/api/fastapi/video-model/app/domains/<domain>/
│
├── core/                               # FastAPI, SQLAlchemy import 금지
│   ├── entities.py                     # 순수 도메인 객체 (dataclass)
│   ├── types.py                        # Enum, Type 정의
│   ├── ports/
│   │   ├── inbound.py                  # Inbound Port (Protocol)
│   │   └── outbound.py                 # Outbound Port (Protocol/ABC)
│   └── services.py                     # Inbound Port 구현체
│
├── adapters/
│   ├── inbound/
│   │   └── http/
│   │       ├── router.py               # APIRouter (FastAPI)
│   │       ├── schemas.py              # Pydantic 요청/응답 스키마
│   │       └── mappers.py              # 스키마 ↔ 도메인 변환
│   │
│   └── outbound/
│       └── db/
│           ├── repository.py           # Outbound Port 구현체
│           ├── models.py               # SQLAlchemy ORM 모델
│           └── mappers.py              # ORM ↔ 도메인 변환
│
├── module.py                           # DI 와이어링 (FastAPI Depends / container)
└── tests/
```

- `core/`에는 FastAPI, SQLAlchemy import가 절대 들어가지 않는다. 순수 Python으로 도메인 로직만 담는다.
- ORM 모델(`models.py`)과 도메인 엔티티(`entities.py`)는 반드시 분리하며, 변환은 오직 `mappers.py`를 통해서만 수행한다.
- DI는 FastAPI `Depends`(`app/container.py`) 기반으로 와이어링한다. 부트스트랩은 `app/main.py`, 설정은 pydantic-settings(`app/config.py`)에서 관리한다.

### video-model 비동기 처리 Outbound 구조 (영상 제작 파이프라인)

video-model는 영상 제작 자동화 서버로, 무거운 영상 처리 작업을 비동기 워커/큐로 분리한다. 큐, 스토리지, 처리, 워커는 모두 Outbound Port(Protocol)와 어댑터로 추상화한다 (특정 큐 라이브러리에 종속되지 않는다).

```
apps/api/fastapi/video-model/app/domains/video/
│
├── core/
│   └── ports/outbound.py               # 아래 Protocol 포트 정의
│       # - VideoJobRepositoryPort       : 작업 영속화
│       # - JobQueuePort                 : 비동기 처리 워커/큐 (enqueue/상태조회)
│       # - StoragePort                  : 결과물 저장소(업로드/다운로드)
│       # - VideoProcessingPort          : 실제 영상 처리(트랜스코딩/렌더링)
│
└── adapters/outbound/
    ├── queue/repository.py             # JobQueuePort 구현 (비동기 처리 워커/큐 어댑터)
    ├── storage/repository.py           # StoragePort 구현 (오브젝트 스토리지 어댑터)
    ├── processing/repository.py        # VideoProcessingPort 구현 (FFmpeg 등 호출)
    └── worker/runner.py                # 큐에서 작업을 가져와 처리하는 워커 엔트리포인트
```

- `queue/`: 비동기 처리 워커/큐(Outbound Port)에 작업을 등록하고 상태를 추적한다. 구체 구현(큐 라이브러리)은 어댑터에 격리된다.
- `storage/`: 오브젝트 스토리지에 결과물(영상/썸네일 등)을 저장하고 조회한다.
- `processing/`: FFmpeg 등 외부 도구를 호출하여 트랜스코딩/렌더링을 수행한다.
- `worker/`: 워커가 큐에서 작업을 가져와 `VideoProcessingPort`/`StoragePort`를 사용해 실제 처리를 수행한다.

---

## 2. Port & Adapter 패턴

> 이 절의 NestJS 예제는 `csc-groupware`의 **notice (공지사항)** 도메인을, FastAPI 예제는 `video-model`의 **video** 도메인을 표준 예제로 사용한다.

### 2.1 Domain Entity

**위치 (NestJS)**: `core/domain/entities/xxx.entity.ts`

> **핵심:** 도메인 엔티티는 순수 TypeScript 인터페이스로 정의한다. ORM 의존성이 없다.

```typescript
// core/domain/entities/notice.entity.ts

/** 공지사항 엔티티 */
export interface NoticeEntity {
  id: number;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**위치 (FastAPI)**: `core/entities.py`

> **핵심:** 도메인 엔티티는 순수 Python `dataclass`로 정의한다. SQLAlchemy/FastAPI import가 없다.

```python
# core/entities.py

from dataclasses import dataclass
from datetime import datetime

from .types import VideoJobStatus


@dataclass
class VideoJob:
    """영상 작업 도메인 엔티티"""

    id: str
    title: str
    status: VideoJobStatus
    created_at: datetime
```

### 2.2 Domain Types

**위치 (NestJS)**: `core/domain/types/xxx.types.ts`

> **핵심:** 각 도메인에서 필요한 Enum, Type은 로컬에서 정의한다.

```typescript
// core/domain/types/order.type.ts

/** 정렬 방향 */
export enum OrderType {
  ASC = 'ASC',
  DESC = 'DESC',
}
```

```typescript
// core/domain/types/notice.types.ts

/** 공지사항 정렬 컬럼 */
export type NoticeOrderColumn = 'id' | 'title' | 'createdAt' | 'updatedAt';
```

**위치 (FastAPI)**: `core/types.py`

```python
# core/types.py

from enum import Enum


class VideoJobStatus(str, Enum):
    """영상 작업 상태"""

    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
```

### 2.3 Inbound Port (Service Interface)

**위치 (NestJS)**: `core/application/ports/inbound/xxx.port.ts`

```typescript
// core/application/ports/inbound/notice.port.ts

import { NoticeEntity, OrderType, NoticeOrderColumn } from '../../../domain';

/** 공지사항 목록 결과 */
export interface NoticeListResult {
  records: NoticeEntity[];
  count: number;
}

/** 공지사항 Inbound Port */
export interface NoticePort {
  findAllByPage(
    skip: number,
    take: number,
    title: string,
    order: OrderType,
    orderColumn: NoticeOrderColumn,
  ): Promise<[NoticeEntity[], number]>;

  createOne(dto: { title: string; content: string }): Promise<NoticeEntity>;
  findOneByTitle(title: string): Promise<NoticeEntity | null>;
  findOneById(id: number): Promise<NoticeEntity | null>;
  updateOneById(id: number, dto: { title?: string; content?: string }): Promise<NoticeEntity>;
  deleteManyByIds(ids: number[]): Promise<number>;
  findMany(skip: number, take: number, order: OrderType, orderColumn: NoticeOrderColumn): Promise<NoticeListResult>;
}

export const NOTICE_PORT = Symbol('NOTICE_PORT');
```

**위치 (FastAPI)**: `core/ports/inbound.py`

```python
# core/ports/inbound.py

from typing import Protocol

from ..entities import VideoJob


class VideoJobInboundPort(Protocol):
    """영상 작업 Inbound Port"""

    async def create_job(self, title: str) -> VideoJob: ...

    async def find_one_by_id(self, job_id: str) -> VideoJob | None: ...

    async def find_many(self, skip: int, take: int) -> tuple[list[VideoJob], int]: ...
```

### 2.4 Outbound Port (Repository Interface)

**위치 (NestJS)**: `core/application/ports/outbound/xxx.port.ts`

> **핵심:** Outbound Port의 메서드는 `Record` 접미사를 사용한다.

```typescript
// core/application/ports/outbound/notice.port.ts

import { NoticeEntity, OrderType, NoticeOrderColumn } from '../../../domain';
import { NoticeListResult } from '../inbound';

/** 공지사항 레포지토리 아웃바운드 포트 */
export interface NoticeRepositoryPort {
  findAllRecordsByPage(
    skip: number,
    take: number,
    title: string,
    order: OrderType,
    orderColumn: NoticeOrderColumn,
  ): Promise<[NoticeEntity[], number]>;

  createRecord(dto: { title: string; content: string }): Promise<NoticeEntity>;
  findOneRecordById(id: number): Promise<NoticeEntity | null>;
  findOneRecordByTitle(title: string): Promise<NoticeEntity | null>;
  updateOneRecordById(id: number, dto: { title?: string; content?: string }): Promise<NoticeEntity>;
  deleteManyRecordsByIds(ids: number[]): Promise<number>;
  findManyRecords(skip: number, take: number, order: OrderType, orderColumn: NoticeOrderColumn): Promise<NoticeListResult>;
}

export const NOTICE_REPOSITORY_PORT = Symbol('NOTICE_REPOSITORY_PORT');
```

**위치 (FastAPI)**: `core/ports/outbound.py`

> **핵심:** Outbound Port는 `Protocol`(또는 `ABC`)로 정의한다. 도메인 엔티티(`VideoJob`)만 다루며 ORM 모델을 노출하지 않는다.

```python
# core/ports/outbound.py

from typing import Protocol

from ..entities import VideoJob


class VideoJobRepositoryPort(Protocol):
    """영상 작업 레포지토리 아웃바운드 포트"""

    async def create_record(self, job: VideoJob) -> VideoJob: ...

    async def find_one_record_by_id(self, job_id: str) -> VideoJob | None: ...

    async def find_many_records(self, skip: int, take: int) -> tuple[list[VideoJob], int]: ...
```

### 2.5 Service (Inbound Port 구현체)

**위치 (NestJS)**: `core/application/services/xxx.service.ts`

> **핵심:** Service는 `core/domain`과 `ports`만 import한다. 외부 패키지를 직접 import 하지 않는다.

```typescript
// core/application/services/notice.service.ts

import { Inject, Injectable } from '@nestjs/common';
import { NoticeEntity, OrderType, NoticeOrderColumn } from '../../domain';
import { NoticePort, NoticeListResult } from '../ports/inbound';
import { NoticeRepositoryPort, NOTICE_REPOSITORY_PORT } from '../ports/outbound';

@Injectable()
export class NoticeService implements NoticePort {
  constructor(
    @Inject(NOTICE_REPOSITORY_PORT)
    private readonly noticeRepository: NoticeRepositoryPort,
  ) {}

  async findAllByPage(
    skip: number,
    take: number,
    title: string,
    order: OrderType = OrderType.DESC,
    orderColumn: NoticeOrderColumn = 'id',
  ): Promise<[NoticeEntity[], number]> {
    const searchTitle = title === '-' ? '' : title;
    return await this.noticeRepository.findAllRecordsByPage(
      skip, take, searchTitle, order, orderColumn,
    );
  }

  async createOne(dto: { title: string; content: string }): Promise<NoticeEntity> {
    const existTitle = await this.findOneByTitle(dto.title);
    if (existTitle) {
      throw new Error('이미 존재하는 title입니다.');
    }
    return await this.noticeRepository.createRecord(dto);
  }

  async findOneById(id: number): Promise<NoticeEntity | null> {
    return await this.noticeRepository.findOneRecordById(id);
  }
}
```

**위치 (FastAPI)**: `core/services.py`

> **핵심:** Service는 `core/`(entities, types, ports)만 import한다. FastAPI/SQLAlchemy 를 import 하지 않는다.

```python
# core/services.py

import uuid
from datetime import datetime, timezone

from .entities import VideoJob
from .ports.outbound import VideoJobRepositoryPort
from .types import VideoJobStatus


class VideoJobService:
    """VideoJobInboundPort 구현체"""

    def __init__(self, repository: VideoJobRepositoryPort) -> None:
        self._repository = repository

    async def create_job(self, title: str) -> VideoJob:
        job = VideoJob(
            id=str(uuid.uuid4()),
            title=title,
            status=VideoJobStatus.PENDING,
            created_at=datetime.now(timezone.utc),
        )
        return await self._repository.create_record(job)

    async def find_one_by_id(self, job_id: str) -> VideoJob | None:
        return await self._repository.find_one_record_by_id(job_id)
```

### 2.6 Repository Adapter (Outbound Port 구현체)

**위치 (NestJS)**: `adapters/outbound/db/{groupwaredb|userdb|controltowerdb}/xxx.adapter.ts`

> **핵심:** Adapter는 Drizzle ORM Client를 직접 사용한다 (groupwaredb: `groupwareDb`, userdb: `userDb`, controltowerdb: `controlTowerDb`). Mapper를 통해 ORM ↔ Domain 변환을 수행한다.

```typescript
// adapters/outbound/db/groupwaredb/notice.adapter.ts

import { Injectable } from '@nestjs/common';
import { eq, inArray, count, desc, asc, like } from 'drizzle-orm';
import { groupwareDb, notice } from '@csc/database/groupwaredb';
import { NoticeRepositoryPort } from '../../../../core/application/ports/outbound';
import { NoticeListResult } from '../../../../core/application/ports/inbound';
import { NoticeEntity, OrderType, NoticeOrderColumn } from '../../../../core/domain';
import { toNoticeEntity, getNoticeOrderColumn } from './mappers';

@Injectable()
export class NoticeRepositoryAdapter implements NoticeRepositoryPort {
  async findAllRecordsByPage(
    skip: number,
    take: number,
    title: string,
    order: OrderType,
    orderColumn: NoticeOrderColumn,
  ): Promise<[NoticeEntity[], number]> {
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

    return [records.map(toNoticeEntity), total];
  }

  async createRecord(dto: { title: string; content: string }): Promise<NoticeEntity> {
    const [result] = await groupwareDb.insert(notice).values(dto).returning();
    return toNoticeEntity(result);
  }

  async findOneRecordById(id: number): Promise<NoticeEntity | null> {
    const result = await groupwareDb.query.notice.findFirst({
      where: eq(notice.id, id),
    });
    return result ? toNoticeEntity(result) : null;
  }

  async deleteManyRecordsByIds(ids: number[]): Promise<number> {
    const result = await groupwareDb.delete(notice).where(inArray(notice.id, ids));
    return result.count;
  }
}
```

**위치 (FastAPI)**: `adapters/outbound/db/repository.py`

> **핵심:** Adapter는 SQLAlchemy 2.0 (`AsyncSession`)을 직접 사용한다. ORM 모델(`VideoJobModel`)과 도메인(`VideoJob`) 변환은 오직 `mappers.py`로만 수행한다.

```python
# adapters/outbound/db/repository.py

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.entities import VideoJob
from ....core.ports.outbound import VideoJobRepositoryPort
from .mappers import to_entity, to_model
from .models import VideoJobModel


class VideoJobRepository(VideoJobRepositoryPort):
    """VideoJobRepositoryPort 구현체"""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_record(self, job: VideoJob) -> VideoJob:
        model = to_model(job)
        self._session.add(model)
        await self._session.flush()
        return to_entity(model)

    async def find_one_record_by_id(self, job_id: str) -> VideoJob | None:
        model = await self._session.get(VideoJobModel, job_id)
        return to_entity(model) if model else None

    async def find_many_records(self, skip: int, take: int) -> tuple[list[VideoJob], int]:
        result = await self._session.scalars(
            select(VideoJobModel).offset(skip).limit(take),
        )
        models = result.all()
        return [to_entity(m) for m in models], len(models)
```

ORM 모델(`adapters/outbound/db/models.py`)은 SQLAlchemy 2.0 `DeclarativeBase` + `Mapped[...]`/`mapped_column`으로 정의한다.

```python
# adapters/outbound/db/models.py

from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base  # DeclarativeBase


class VideoJobModel(Base):
    __tablename__ = "video_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column()
```

### 2.7 External Adapter (외부 서비스/도메인 접근)

**위치 (NestJS)**: `adapters/outbound/external/xxx.adapter.ts`

> **핵심:** 다른 도메인의 서비스나 외부 서비스에 접근할 때 사용한다. 같은 앱 내 다른 도메인의 DB 접근도 포함된다.

```typescript
// adapters/outbound/external/notice-tag-service.adapter.ts

import { Injectable } from '@nestjs/common';
import { groupwareDb, noticeTag } from '@csc/database/groupwaredb';
import { UpdateResult } from '../../../../../shared/types/common.types';
import { NoticeTagServicePort } from '../../../core/application/ports/outbound';

/** NoticeTag 서비스 Adapter - 다른 도메인 데이터 접근 */
@Injectable()
export class NoticeTagServiceAdapter implements NoticeTagServicePort {
  async createMany(tags: string[]): Promise<UpdateResult> {
    const result = await groupwareDb
      .insert(noticeTag)
      .values(tags.map((t) => ({ tag: t })))
      .onConflictDoNothing();
    return { affected: result.rowCount ?? 0 };
  }
}
```

### 2.8 서버 간 HTTP 클라이언트 (NestJS: 다른 백엔드 호출)

**위치**: 공유 클라이언트 `src/shared/adapters/outbound/<target>-api/`, 도메인 어댑터 `src/domains/*/adapters/outbound/http/<target>-api/xxx.adapter.ts`

> **핵심:** 한 NestJS 서버가 다른 백엔드를 HTTP로 호출할 때는 **공유 베이스 `NestServiceClient`(`@csc/net-utils/nest`)** 를 상속한 **타깃별 클라이언트 1개**(DI 싱글톤)를 통한다. 베이스가 `X-Service-Token` 자동 주입, 타임아웃, 지수백오프 재시도, 정규화 에러(`HttpError`)→`HttpException` 변환을 처리하고, 어댑터는 이 클라이언트를 **주입만 받아** 호출한다. 계약 SSOT: `docs/specs/service-http-contract.md`.
>
> **현재 토폴로지:** control-tower → user(조직 쓰기 위임, `UserApiClientService`). (`@csc/net-utils` 는 **fetch 기반**: `@nestjs/axios`/`HttpService` 를 쓰지 않는다.)

#### 공유 클라이언트 베이스 (`@csc/net-utils/nest`)

`NestServiceClient` 는 코어 `createHttpClient`(프레임워크 비종속, fetch 기반, 서비스토큰/재시도 내장)를 감싸고 에러를 NestJS `HttpException` 으로 변환한다. `get/post/patch/delete` 제공. 도메인별 클라이언트는 이를 상속해 **baseUrl, serviceToken 만** 주입한다.

```typescript
// packages/net-utils/src/nest/index.ts (발췌)
export class NestServiceClient {
  protected readonly http: HttpClient;
  constructor(options: HttpClientOptions) {   // { baseUrl, serviceToken?, timeout?, retries? }
    this.http = createHttpClient(options);     // X-Service-Token 자동 주입 + 재시도
  }
  get<T>(path: string): Promise<T> { /* HttpError→HttpException */ }
  post<T>(path: string, body?: unknown): Promise<T> { /* … */ }
  patch<T>(path: string, body?: unknown): Promise<T> { /* … */ }
  delete<T>(path: string, body?: unknown): Promise<T> { /* … */ }
}
```

#### 타깃별 클라이언트 + 토큰 서비스

```typescript
// shared/adapters/outbound/user-api/user-api-client.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestServiceClient } from '@csc/net-utils/nest';
import { UserApiTokenService } from './user-api-token.service';

@Injectable()
export class UserApiClientService extends NestServiceClient {
  constructor(config: ConfigService, tokenService: UserApiTokenService) {
    super({
      baseUrl: config.get<string>('USER_API_URL') ?? 'http://localhost:3002',
      serviceToken: () => tokenService.createServiceToken(), // 헤더 자동 주입
    });
  }
}

// shared/adapters/outbound/user-api/user-api-token.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServiceToken, resolveServiceSecret } from '@csc/net-utils';

@Injectable()
export class UserApiTokenService {
  private readonly secret: string;
  constructor(config: ConfigService) {
    // prod 에서 SERVICE_TOKEN_SECRET 미설정이면 fail-closed (resolveServiceSecret)
    this.secret = resolveServiceSecret(config.get('SERVICE_TOKEN_SECRET'), {
      isProduction: process.env.NODE_ENV === 'production',
    });
  }
  // service 클레임 = 호출 주체명(수신 서버 ALLOWED_SERVICES 와 일치): security-architecture.md 참고.
  createServiceToken(): string {
    return createServiceToken(this.secret, 'csc-control-tower');
  }
}
```

#### 도메인 어댑터 (클라이언트 주입)

Outbound Port 구현 어댑터는 타깃별 클라이언트를 **주입만** 받아 호출한다(직접 axios/fetch 금지).

```typescript
// domains/platform/adapters/outbound/http/user-api/user-api.adapter.ts
import { Injectable } from '@nestjs/common';
import { UserApiClientService } from '../../../../../../shared/adapters/outbound/user-api';

/** UserApiPort 구현: user 서버 /internal/organizations 호출(서비스토큰). */
@Injectable()
export class UserApiAdapter implements UserApiPort {
  constructor(private readonly client: UserApiClientService) {}

  listOrganizations(): Promise<OrganizationSummary[]> {
    return this.client.get<OrganizationSummary[]>('/internal/organizations');
  }
  createOrganization(input: CreateOrganizationViaUserInput): Promise<CreatedCompany> {
    return this.client.post<CreatedCompany>('/internal/organizations', { ...input });
  }
  updateOrganization(id: number, patch: UpdateOrganizationViaUserInput): Promise<OrganizationSummary> {
    return this.client.patch<OrganizationSummary>(`/internal/organizations/${id}`, patch);
  }
  async withdrawOrganization(id: number): Promise<void> {
    await this.client.delete<{ success: boolean }>(`/internal/organizations/${id}`);
  }
}
```

#### 모듈 등록 (DI 싱글톤)

```typescript
// platform.module.ts
@Module({
  providers: [
    { provide: USER_API_PORT, useClass: UserApiAdapter },
    UserApiClientService, // ← 타깃별 클라이언트 1개(싱글톤): 모든 어댑터가 주입 재사용
    UserApiTokenService,
  ],
})
export class PlatformModule {}
```

> **금지:** 어댑터에서 `axios.create`/전역 `axios`/`fetch` 직접 사용하거나 호출마다 새 클라이언트를 생성하는 것. 반드시 타깃별 공유 클라이언트(`NestServiceClient` 상속)를 주입해 재사용한다.

### 2.9 Queue Adapter (비동기 처리 워커/큐: video-model, FastAPI)

**위치**: `apps/api/fastapi/video-model/app/domains/video/adapters/outbound/queue/arq_queue.py`

> **핵심:** video-model 은 무거운 영상 처리 작업을 비동기 워커/큐로 분리한다. 큐는 Outbound Port(Protocol)로 추상화하며, 구체적인 큐 라이브러리에 종속되지 않도록 어댑터에 격리한다. Service는 `JobQueuePort`만 알고, 실제 enqueue/상태조회 구현은 어댑터가 담당한다.

먼저 Outbound Port를 정의한다 (`core/ports/outbound.py`):

```python
# core/ports/outbound.py (발췌)

from typing import Protocol

from ..entities import VideoJob
from ..types import VideoJobStatus


class JobQueuePort(Protocol):
    """비동기 처리 워커/큐 아웃바운드 포트"""

    async def enqueue_processing_job(self, job: VideoJob) -> str: ...

    async def get_job_status(self, job_id: str) -> VideoJobStatus: ...
```

어댑터는 구체 큐 구현을 캡슐화한다 (`adapters/outbound/queue/repository.py`):

```python
# adapters/outbound/queue/repository.py

from ....core.entities import VideoJob
from ....core.ports.outbound import JobQueuePort
from ....core.types import VideoJobStatus


class JobQueueAdapter(JobQueuePort):
    """JobQueuePort 구현체: 비동기 처리 워커/큐에 작업 등록 및 상태 추적"""

    def __init__(self, queue_client, status_store) -> None:
        self._queue = queue_client
        self._status_store = status_store

    async def enqueue_processing_job(self, job: VideoJob) -> str:
        # 구체 큐 라이브러리 호출은 이 어댑터 안에만 존재한다.
        await self._queue.enqueue("video:process", {"job_id": job.id})
        return job.id

    async def get_job_status(self, job_id: str) -> VideoJobStatus:
        raw = await self._status_store.get(job_id)
        return VideoJobStatus(raw) if raw else VideoJobStatus.PENDING
```

워커(`adapters/outbound/worker/runner.py`)는 큐에서 작업을 꺼내 `VideoProcessingPort`/`StoragePort`를 사용해 실제 트랜스코딩, 렌더링과 결과물 저장을 수행한다.

### 2.10 Mapper (ORM ↔ Domain 변환)

**위치 (NestJS)**: `adapters/outbound/db/{groupwaredb|userdb|controltowerdb}/mappers/index.ts`

> **핵심:** ORM 레코드와 도메인 엔티티 간의 변환 로직을 분리한다. 모든 DB에서 Drizzle 레코드를 Domain 엔티티로 변환한다.

```typescript
// adapters/outbound/db/groupwaredb/mappers/index.ts

import { InferSelectModel } from 'drizzle-orm';
import { notice } from '@csc/database/groupwaredb';
import { NoticeEntity } from '../../../../../core/domain';

type NoticeRow = InferSelectModel<typeof notice>;

/** Drizzle Notice → Domain NoticeEntity 변환 */
export function toNoticeEntity(row: NoticeRow): NoticeEntity {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

**위치 (FastAPI)**: `adapters/outbound/db/mappers.py`

> **핵심:** ORM 모델(`VideoJobModel`)과 도메인 엔티티(`VideoJob`)는 분리되어 있으며, 변환은 오직 이 `mappers.py`로만 수행한다.

```python
# adapters/outbound/db/mappers.py

from ....core.entities import VideoJob
from ....core.types import VideoJobStatus
from .models import VideoJobModel


def to_entity(model: VideoJobModel) -> VideoJob:
    """ORM 모델 → 도메인 엔티티"""
    return VideoJob(
        id=model.id,
        title=model.title,
        status=VideoJobStatus(model.status),
        created_at=model.created_at,
    )


def to_model(job: VideoJob) -> VideoJobModel:
    """도메인 엔티티 → ORM 모델"""
    return VideoJobModel(
        id=job.id,
        title=job.title,
        status=job.status.value,
        created_at=job.created_at,
    )
```

### 2.11 Controller / Router (Inbound Adapter)

**위치 (NestJS)**: `adapters/inbound/http/controllers/xxx.controller.ts`

```typescript
// adapters/inbound/http/controllers/notice.controller.ts

import { Controller, Get, Post, Patch, Delete, Param, Body, Inject } from '@nestjs/common';
import { NoticePort, NOTICE_PORT } from '../../../../core/application/ports/inbound';
import { CreateOneNoticeDto, UpdateOneNoticeDto } from '../dto';

@Controller('notice-api')
export class NoticeController {
  constructor(
    @Inject(NOTICE_PORT)
    private readonly noticeService: NoticePort,
  ) {}

  @Post('create/one')
  async createOne(@Body() dto: CreateOneNoticeDto) {
    return await this.noticeService.createOne(dto);
  }

  @Get('find/one/:id')
  async findOneById(@Param('id') id: number) {
    return await this.noticeService.findOneById(id);
  }

  @Patch('update/one/:id')
  async updateOneById(@Param('id') id: number, @Body() dto: UpdateOneNoticeDto) {
    return await this.noticeService.updateOneById(id, dto);
  }

  @Delete('delete/many/:ids')
  async deleteManyByIds(@Param('ids') ids: string) {
    const idArray = ids.split(',').map(Number);
    return await this.noticeService.deleteManyByIds(idArray);
  }
}
```

**위치 (FastAPI)**: `adapters/inbound/http/router.py`

```python
# adapters/inbound/http/router.py

from fastapi import APIRouter, Depends

from app.container import get_video_job_service
from ....core.ports.inbound import VideoJobInboundPort
from .mappers import to_response
from .schemas import CreateVideoJobRequest, VideoJobResponse

router = APIRouter(prefix="/video-jobs", tags=["video-jobs"])


@router.post("", response_model=VideoJobResponse)
async def create_video_job(
    body: CreateVideoJobRequest,
    service: VideoJobInboundPort = Depends(get_video_job_service),
) -> VideoJobResponse:
    job = await service.create_job(body.title)
    return to_response(job)


@router.get("/{job_id}", response_model=VideoJobResponse)
async def get_video_job(
    job_id: str,
    service: VideoJobInboundPort = Depends(get_video_job_service),
) -> VideoJobResponse:
    job = await service.find_one_by_id(job_id)
    return to_response(job)
```

### 2.12 DTO / Schema

**위치 (NestJS)**: `adapters/inbound/http/dto/xxx.dto.ts`

```typescript
// adapters/inbound/http/dto/create-one-notice.dto.ts

import { IsString, IsNotEmpty } from 'class-validator';

export class CreateOneNoticeDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;
}
```

```typescript
// adapters/inbound/http/dto/update-one-notice.dto.ts

import { IsString, IsOptional } from 'class-validator';

export class UpdateOneNoticeDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  content?: string;
}
```

**위치 (FastAPI)**: `adapters/inbound/http/schemas.py`

```python
# adapters/inbound/http/schemas.py

from datetime import datetime

from pydantic import BaseModel

from ....core.types import VideoJobStatus


class CreateVideoJobRequest(BaseModel):
    title: str


class VideoJobResponse(BaseModel):
    id: str
    title: str
    status: VideoJobStatus
    created_at: datetime
```

---

## 3. Module / DI 등록

### NestJS (csc-groupware, csc-control-tower)

> **핵심:** ORM Client(Drizzle)는 Module에서 별도 import가 필요 없다. Adapter에서 직접 사용한다.

```typescript
// notice.module.ts

import { Module } from '@nestjs/common';
import { NoticeController } from './adapters/inbound/http/controllers';
import { NoticeService } from './core/application/services';
import { NoticeRepositoryAdapter } from './adapters/outbound/db/groupwaredb';
import { NOTICE_PORT } from './core/application/ports/inbound';
import { NOTICE_REPOSITORY_PORT } from './core/application/ports/outbound';

@Module({
  controllers: [NoticeController],
  providers: [
    // Inbound Port → Service
    { provide: NOTICE_PORT, useClass: NoticeService },
    // Outbound Port → Adapter
    { provide: NOTICE_REPOSITORY_PORT, useClass: NoticeRepositoryAdapter },
  ],
  exports: [NOTICE_PORT],
})
export class NoticeModule {}
```

### FastAPI (video-model)

> **핵심:** DI는 FastAPI `Depends`로 와이어링한다. Outbound Port 구현(Repository)을 Service에 주입하고, Service를 라우터에 주입한다. 세션은 `AsyncSession`(`async_sessionmaker`)으로 제공한다.

```python
# app/container.py

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.domains.video.adapters.outbound.db.repository import VideoJobRepository
from app.domains.video.core.services import VideoJobService


def get_video_job_service(
    session: AsyncSession = Depends(get_session),
) -> VideoJobService:
    repository = VideoJobRepository(session)
    return VideoJobService(repository)
```

라우터는 `app/main.py`에서 `app.include_router(...)`로 등록한다.

---

## 4. 네이밍 컨벤션

> **중요:** 이 규칙은 `apps/api/nestjs/csc-groupware`, `apps/api/nestjs/csc-control-tower` (NestJS)에 일관되게 적용된다. `apps/api/fastapi/video-model/` (FastAPI/Python)는 동일한 개념을 Python 관용적 네이밍(snake_case 파일/심볼)으로 따릅니다.

### NestJS 네이밍

| 구분 | 네이밍 패턴 | 예시 |
|------|------------|------|
| **Inbound Port Interface** | `{Name}Port` | `NoticePort` |
| **Inbound Port Token** | `{NAME}_PORT` | `NOTICE_PORT` |
| **Outbound Port Interface** | `{Name}RepositoryPort` | `NoticeRepositoryPort` |
| **Outbound Port Token** | `{NAME}_REPOSITORY_PORT` | `NOTICE_REPOSITORY_PORT` |
| **Service** | `{Name}Service` | `NoticeService` |
| **Repository Adapter** | `{Name}RepositoryAdapter` | `NoticeRepositoryAdapter` |
| **Domain Entity** | `{Name}Entity` (interface) | `NoticeEntity` |
| **Mapper 함수** | `to{DomainName}Entity` | `toNoticeEntity` |
| **Port 파일** | `xxx.port.ts` | `notice.port.ts` |
| **Adapter 파일** | `xxx.adapter.ts` | `notice.adapter.ts` |
| **Service 파일** | `xxx.service.ts` | `notice.service.ts` |
| **Entity 파일** | `xxx.entity.ts` | `notice.entity.ts` |
| **Types 파일** | `xxx.types.ts` | `notice.types.ts` |

### FastAPI 네이밍

| 구분 | 네이밍 패턴 | 예시 |
|------|------------|------|
| **Inbound Port** | `{Name}InboundPort` (Protocol) | `VideoJobInboundPort` |
| **Outbound Port** | `{Name}RepositoryPort` (Protocol) | `VideoJobRepositoryPort` |
| **Service** | `{Name}Service` | `VideoJobService` |
| **Repository Adapter** | `{Name}Repository` | `VideoJobRepository` |
| **ORM 모델** | `{Name}Model` | `VideoJobModel` |
| **도메인 엔티티** | `{Name}` (dataclass) | `VideoJob` |
| **Mapper 함수** | `to_entity`, `to_model` | `to_entity` |
| **요청/응답 스키마** | `Create{Name}Request`, `{Name}Response` | `CreateVideoJobRequest`, `VideoJobResponse` |
| **파일** | snake_case | `entities.py`, `ports/outbound.py`, `repository.py` |

### Outbound Port 메서드 네이밍 (NestJS)

| Port 메서드 | Drizzle ORM 구현 (groupwaredb/userdb/controltowerdb 공통) |
|-------------|--------------------------------------|
| `createRecord(dto)` | `db.insert(table).values(data).returning()` |
| `findOneRecordById(id)` | `db.query.table.findFirst({ where: eq(table.id, id) })` |
| `findManyRecords(...)` | `db.query.table.findMany({ where, limit, offset })` |
| `updateOneRecordById(id, dto)` | `db.update(table).set(data).where(eq(table.id, id))` |
| `deleteManyRecordsByIds(ids)` | `db.delete(table).where(inArray(table.id, ids))` |

> **`Record` 접미사 적용 범위 (언제 붙이고 언제 빼는가):**
> - **붙임. 엔티티 레코드 CRUD**: 도메인 엔티티(행)를 생성/조회/수정/삭제하는 메서드.
>   예: `createRecord`, `findOneRecordById`, `findManyRecords`, `updateOneRecordById`, `deleteManyRecordsByIds`.
> - **뺌: key 목록, resolve(파생 계산) 조회**: 엔티티 행이 아니라 key/식별자 목록이나 계산된 값을 돌려주는 메서드.
>   예: `findOrganizationAiToolKeys`(key 목록), `resolveAdminFeatures`(ROOT/grant 계산), `findOrganizationBySlug`(단건 by-slug 조회).
>
> 의도: 접미사는 인바운드 포트(Service)의 동명 메서드와 아웃바운드(Repository) 호출을 호출부에서 구분하기 위한 장치다.
> 따라서 "행 CRUD"에만 일관 적용하고, key/resolve 류는 의미가 이미 분명하므로 붙이지 않는다.
> (HTTP 위임 아웃바운드 포트: 예: `user-api`: 는 DB 레코드가 아니라 원격 호출이므로 `Record` 를 쓰지 않는다.)

---

## 5. 데이터베이스 구조

### packages/database (Drizzle: NestJS 서버 전용)

`packages/database`는 NestJS 서버(`csc-groupware`, `csc-control-tower`)에서만 사용하는 Drizzle ORM 패키지다. video-model(FastAPI)는 이 패키지를 사용하지 않는다.

```
packages/database/src/
├── groupwaredb/                    # 메인 DB: Drizzle ORM
│   ├── schema/
│   │   ├── enums.ts           # pgEnum 정의
│   │   ├── notice-tables.ts   # 공지사항 등 도메인 테이블
│   │   ├── other-tables.ts    # 기타 테이블
│   │   ├── relations.ts       # Drizzle relations
│   │   └── index.ts           # barrel export
│   ├── drizzle-client.ts      # Drizzle 싱글톤 (groupwareDb, groupwareSql)
│   ├── drizzle.config.ts      # Drizzle Kit 설정
│   └── index.ts               # groupwareDb, groupwareSql, 스키마 export
│
├── userdb/                    # 사용자 DB: Drizzle ORM
│   ├── schema/
│   │   ├── user-tables.ts     # 사용자 관련 테이블
│   │   ├── relations.ts       # Drizzle relations
│   │   └── index.ts           # barrel export
│   ├── drizzle-client.ts      # Drizzle 싱글톤 (userDb, userSql)
│   ├── drizzle.config.ts      # Drizzle Kit 설정
│   └── index.ts               # userDb, userSql, 스키마 export
│
└── controltowerdb/                   # 관리자 DB: Drizzle ORM
    ├── schema/
    │   ├── enums.ts           # pgEnum 정의
    │   ├── admin-tables.ts    # 관리자 테이블
    │   ├── relations.ts       # Drizzle relations
    │   └── index.ts           # barrel export
    ├── drizzle-client.ts      # Drizzle 싱글톤 (controlTowerDb, controlTowerSql)
    ├── drizzle.config.ts      # Drizzle Kit 설정
    └── index.ts               # controlTowerDb, controlTowerSql, 스키마 export
```

#### Import 방법

```typescript
// 메인 DB (Drizzle ORM) 클라이언트 및 스키마
import { groupwareDb, groupwareSql, notice } from '@csc/database/groupwaredb';
import { eq, and, count, inArray } from 'drizzle-orm';

// 사용자 DB (Drizzle ORM) 클라이언트 및 스키마
import { userDb, userSql } from '@csc/database/userdb';
import { eq, and, count, inArray } from 'drizzle-orm';

// 관리자 DB (Drizzle ORM) 클라이언트 및 스키마
import { controlTowerDb, controlTowerSql, admin } from '@csc/database/controltowerdb';
import { eq, and, count, inArray } from 'drizzle-orm';
```

### video-model 자체 DB (SQLAlchemy + Alembic: 서버 내부 관리)

video-model(FastAPI)는 자체 DB를 서버 내부에서 직접 관리한다. `packages/database`(Drizzle)를 사용하지 않는다.

- ORM 모델: `apps/api/fastapi/video-model/app/.../adapters/outbound/db/models.py`: SQLAlchemy 2.0 `DeclarativeBase` + `Mapped[...]`/`mapped_column`.
- 세션: `async_sessionmaker` + `AsyncSession`.
- 마이그레이션: Alembic: `apps/api/fastapi/video-model/alembic/`.
- 설정: pydantic-settings(`app/config.py`). 패키지 매니저: uv (`uv add`/`uv sync`/`uv run`, `uv.lock`).

---

## 6. 의존성 흐름

### NestJS (csc-groupware, csc-control-tower)

```
Controller (Inbound Adapter)
    ↓ uses                         dto/, core/domain
Inbound Port (Interface)
    ↑ implements                   core/domain
Service (Application)
    ↓ uses                         core/domain, ports/outbound
Outbound Port (Interface)
    ↑ implements                   core/domain
Repository Adapter ─────────────▶ ORM Client (직접 사용)
    │                              groupwaredb/userdb/controltowerdb: Drizzle ORM
    │                              mappers/ (ORM ↔ Domain 변환)
    ▼
PostgreSQL
```

#### 계층별 Import 허용 규칙 (NestJS)

| 계층 | Import 허용 | Import 금지 |
|------|------------|------------|
| **Domain (entities, types)** | 순수 TypeScript만 | 외부 패키지 |
| **Port** | `core/domain/` | 외부 패키지 |
| **Service** | `core/domain/`, `ports/` | ORM 직접 사용 |
| **Controller** | `dto/`, `core/domain/`, `ports/inbound` | ORM 직접 사용 |
| **Repository Adapter** | `@csc/database/{db}`, `core/domain/`, `mappers/` | - |
| **Mapper** | `@csc/database/{db}` (ORM 타입), `core/domain/` | - |

### FastAPI (video-model)

```
Router (Inbound Adapter)             schemas.py, core/ports/inbound
    ↓ uses
Inbound Port (Protocol)              core/entities, core/types
    ↑ implements
Service (core/services.py)           core/entities, core/types, core/ports
    ↓ uses
Outbound Port (Protocol)             core/entities
    ↑ implements
Repository / Queue / Storage Adapter ─▶ SQLAlchemy AsyncSession / 큐 / 스토리지 (직접 사용)
    │                                    mappers.py (ORM ↔ Domain 변환)
    ▼
PostgreSQL / 비동기 처리 워커, 큐 / 오브젝트 스토리지
```

#### 계층별 Import 허용 규칙 (FastAPI)

| 계층 | Import 허용 | Import 금지 |
|------|------------|------------|
| **core/entities.py, core/types.py** | 순수 Python (stdlib) | FastAPI, SQLAlchemy |
| **core/ports/** | `core/entities`, `core/types` | FastAPI, SQLAlchemy |
| **core/services.py** | `core/entities`, `core/types`, `core/ports` | FastAPI, SQLAlchemy |
| **router.py** | `schemas.py`, `mappers.py`, `core/ports/inbound`, FastAPI | SQLAlchemy 직접 사용 |
| **repository.py / models.py / mappers.py** | SQLAlchemy, `core/entities`, `core/types` | - |

핵심 비즈니스 로직(Service / core)은 외부 의존성(Database, HTTP, 프레임워크)으로부터 분리되어 있다.

---

## 7. 에러 처리 패턴

### NestJS (DomainException)

Service에서는 `DomainException`과 `DomainErrorCode` enum을 사용하여 도메인 에러를 처리한다.

#### 파일 위치

```
apps/api/nestjs/{csc-groupware|csc-control-tower}/src/shared/domain/errors/
├── domain-error-code.enum.ts    # DomainErrorCode enum + ERROR_METADATA
├── domain-exception.ts          # DomainException class
└── index.ts                     # barrel export
```

#### 사용 예시

```typescript
// core/application/services/notice.service.ts

import { DomainException, DomainErrorCode } from '../../../../../shared/domain/errors';

@Injectable()
export class NoticeService implements NoticePort {
  async createOne(dto: { title: string; content: string }): Promise<NoticeEntity> {
    const existTitle = await this.noticeRepository.findOneRecordByTitle(dto.title);
    if (existTitle) {
      throw new DomainException(DomainErrorCode.NAME_ALREADY_EXISTS);
    }
    return await this.noticeRepository.createRecord(dto);
  }

  async findOneById(id: number): Promise<NoticeEntity> {
    const record = await this.noticeRepository.findOneRecordById(id);
    if (!record) {
      throw new DomainException(DomainErrorCode.ENTITY_NOT_FOUND);
    }
    return record;
  }
}
```

### FastAPI (도메인 예외)

video-model는 `core/`에서 프레임워크 비종속 도메인 예외를 던지고, inbound 어댑터(라우터/exception handler)에서 HTTP 상태로 변환한다. core는 FastAPI에 의존하지 않는다.

```python
# core/errors.py

class DomainError(Exception):
    """도메인 기본 예외"""


class EntityNotFoundError(DomainError):
    """엔티티를 찾을 수 없음"""
```

```python
# core/services.py (발췌)

from .errors import EntityNotFoundError


async def find_one_by_id(self, job_id: str) -> VideoJob:
    job = await self._repository.find_one_record_by_id(job_id)
    if job is None:
        raise EntityNotFoundError(job_id)
    return job
```

라우터/`app/main.py` 레벨의 exception handler에서 `EntityNotFoundError → 404` 등으로 매핑한다.

### 주요 에러 코드 (공통 개념)

| 에러 코드 | HTTP 상태 | 설명 |
|-----------|-----------|------|
| `NAME_ALREADY_EXISTS` | 409 | 중복된 이름 |
| `ALREADY_REGISTERED` | 409 | 이미 등록됨 |
| `ENTITY_NOT_FOUND` | 404 | 엔티티 없음 |
| `PERMISSION_DENIED` | 403 | 권한 없음 |
| `INVALID_DATA` | 400 | 잘못된 데이터 |

### 에러 코드 추가 방법 (NestJS)

1. `domain-error-code.enum.ts`에 enum 값 추가
2. `ERROR_METADATA`에 메타데이터 추가 (statusCode, messageKo)

---

## 8. API 문서 (통합 Scalar 포털)

### 코드가 단일 진실원이다

API 문서를 따로 쓰지 않는다. 포털이 보여주는 것은 각 서버가 **코드에서 생성한** `/openapi.json` 이고,
scalar-gateway 는 그걸 모아 렌더할 뿐이다(포털 노출/보안은 [security-architecture.md](./security-architecture.md) 참고).

따라서 **엔드포인트를 고치는 일과 그 문서를 고치는 일은 하나의 작업이고 같은 커밋에 들어간다.**
코드와 별도로 관리되는 API 문서는 두지 않는다. 반드시 어긋나고, 어긋난 문서는 없느니만 못하다.

### 엔드포인트를 만들거나 고칠 때 함께 채우는 것

| 항목 | NestJS | FastAPI | 없으면 생기는 일 |
|------|--------|---------|-----------------|
| 안정 식별자 + 요약 | `@ApiOperation({ summary: '[PREFIX-NNN] ...' })` | `summary="[PREFIX-NNN] ..."` | 문서의 항목과 코드를 잇는 이름이 없어 `grep AUTH-001` 이 안 된다 |
| 본문 설명 | `@ApiOperation({ description })` | `description=` | 이 API 가 무엇이고 **누가 쓰는지** 모른다. 운영용인지 서비스가 부르는지 구분이 안 된다 |
| 파라미터 설명 | DTO 필드 `@ApiProperty({ description })`, 경로 `@ApiParam` | `Query/Path(..., description=)` | 필드명에서 자동 생성된 이름(`Cid`)만 뜬다. 아무것도 알려주지 않는다 |
| 값의 출처 | 위 설명 안에 | 위 설명 안에 | 값이 다른 엔드포인트에서 오면 **그 경로**를 적는다. 안 적으면 읽는 사람이 지어낸다 |
| 에러 응답 | `@ApiResponse({ status, description })` | `responses={400: {"description": ...}}` | 기본값은 200/422 뿐이라 400/404/409 가 문서에 아예 없다 |
| 응답 타입 | 응답 DTO 클래스 | `response_model=` | 원시 dict 는 `additionalProperties` 로만 나와 어떤 필드가 오는지 모른다 |

**설명에는 "무엇을 하는가"에 더해 "어떤 성격의 API 인가"를 적는다.** 하는 일의 절반은 경로와
스키마에 이미 있다. 읽는 사람이 스스로 알아낼 수 없는 것은 그 API 의 성격(정상 경로인가 운영
수단인가), 값의 출처, 실패했을 때 무엇이 다른가다.

**현재 소비자를 계약처럼 적지 않는다.** "마케팅 영상 도구가 호출하는 경로다" 같은 문장은 오늘의
사실일 뿐이고, 다른 서비스가 붙는 순간 문서가 거짓말이 된다. API 는 특정 소비자의 것이 아니라
그 데이터를 필요로 하는 누구의 것이기도 하다.

| 낡는 문장 | 낡지 않는 문장 |
|----------|--------------|
| 마케팅 영상 도구가 기획서를 생성할 때 쓰는 데이터다 | 특정 분야에서 최근 무엇이 많이 검색됐는지 파악할 때 사용한다 |
| csc-marketing 이 호출하는 유일한 조회 경로다 | (적지 않는다. 용도로 대신한다) |
| 서비스 화면은 이 엔드포인트를 호출하지 않는다 | 일반 조회 경로에서는 필요하지 않다 |

호출 토폴로지가 필요하면 [security-architecture.md](./security-architecture.md) 의 호출자 표가
단일 출처다. 그 표는 서비스가 늘 때 함께 갱신되지만, 엔드포인트 설명은 그렇지 않다.

### 독자: 백엔드 개발자만 보는 문서가 아니다

포털은 프론트 개발자와 기획자도 본다. 그들이 알고 싶은 것은 서로 다르다.

| 독자 | 알고 싶은 것 |
|------|-------------|
| 기획자 | 이게 무슨 데이터인가, 얼마나 쌓이고 얼마나 최신인가 |
| 프론트 개발자 | 언제 비어 오는가, 폴링해야 하는가, 실패는 어떻게 구분하는가 |
| 백엔드 개발자 | 정확한 계약, 제약, 오류 코드 |

**세 가지를 다 담되 순서를 지킨다.** 첫 문단은 무엇을 얻는지 구체적인 예로 말하고
(예: "화장품/미용 분야를 일간으로 조회하면 최근 12일치를 날짜마다 상위 10개 키워드로 받는다"),
그다음에 화면에서 다룰 때 필요한 것, 마지막에 필드 단위 제약을 적는다.

**내부 용어를 그대로 쓰지 않는다.** 아래는 우리끼리 쓰는 말이라 밖에서는 통하지 않는다.

| 내부 용어 | 문서에서 |
|----------|---------|
| TTL 초과 | 오래된 데이터면 |
| 워커가 수행, 큐에 enqueue | 뒤에서 따로 돌고 보통 몇 초 걸린다 |
| 버킷 | 날짜 하나분의 묶음(처음 나올 때 풀어 쓴다) |
| 캐시 무효화, 멱등 | 다시 눌러도 한 번만 돈다 |

### 문체: 레퍼런스 문서다

읽는 사람은 이 API 를 **쓰려는 사람**이지 우리 팀의 결정 과정을 궁금해하는 사람이 아니다.
설명에는 계약(무엇을 반환하는가, 무엇이 유효한가, 언제 실패하는가)만 담는다.

**쉽게 쓰는 것과 구어체로 쓰는 것은 다르다.** 어휘는 쉽게, 문형은 격식 있게 쓴다. 용어를 풀어
쓰다 보면 말투까지 풀어지기 쉬운데, 그러면 문서가 메모처럼 읽힌다.

| 구어로 흐른 문장 | 문서 문장 |
|-----------------|----------|
| 평소에는 쓸 일이 없다 | 서비스 화면은 이 엔드포인트를 호출하지 않는다 |
| 데이터가 이상해 보여서 바로 받고 싶을 때 쓴다 | 즉시 다시 수집해야 하는 운영 상황에서 사용한다 |
| 뒤에서 따로 돌고 몇 초 걸린다 | 별도 작업으로 처리되며 보통 몇 초 걸린다 |
| 여러 번 눌러도 한 번만 돈다 | 여러 번 요청해도 한 번만 실행된다 |
| 그대로 그리면 된다 | 그대로 사용한다 |
| 계속 기다리지 말고 오류로 표시한다 | 다시 조회해도 해결되지 않으므로 오류로 표시한다 |

**독자의 행동을 예단하지 않는다.** "쓸 일이 없다", "~하고 싶을 때" 는 읽는 사람이 무엇을 필요로
하는지 우리가 단정하는 말이다. 대신 사실을 적으면 독자가 스스로 판단한다.

| 넣지 않는다 | 대신 |
|------------|------|
| 프로젝트 사연, 과거 버그, 설계 회고 ("예전에는 프론트가 손으로 베껴 뒀고...") | 그 근거는 **코드 주석**에 남긴다. 유지보수자에게는 필요하고 API 사용자에게는 아니다 |
| 훈계조, 2인칭 ("~하면 안 된다") | 사실 진술 ("소비자는 이 응답을 사용한다", "그 외에는 400 을 반환한다") |
| 강조 남발 | `**` 는 오해하면 사고가 나는 지점 한두 곳에만 |
| 구어체 종결 ("~다는 뜻이다", "~해도 된다") | 서술체 `~한다` 로 통일 |

같은 내용이라도 이렇게 갈린다.

```
잡 등록만 하고 즉시 반환하므로 `{"enqueued": true}` 는 **접수증이지 수집 완료가 아니다.**   (X)
작업 등록 후 즉시 반환한다. 응답의 `enqueued` 는 큐 등록 성공을 의미하며 수집 완료를
의미하지 않는다.                                                                        (O)
```

문서 전반의 문체 규칙([writing-style.md](./writing-style.md): 대시, 가운뎃점, 이모지 금지)은 API
설명에도 그대로 적용된다.

### 함정

1. **대괄호 식별자로 남의 엔드포인트를 가리키지 않는다.** `[PREFIX-NNN]` 은 "이 엔드포인트의 id"
   선언 문법이고 `scripts/check-endpoint-ids.mjs` 가 그렇게 읽어 **중복 식별자로 CI 를 깨뜨린다.**
   설명 안에서 다른 엔드포인트를 가리킬 땐 경로로 쓴다(독자에게도 경로가 바로 쓸 수 있는 정보다).
2. **식별자는 안정적이다.** 이미 나간 번호를 재부여하지 않는다. 새 엔드포인트는 그 접두사의 다음 빈 번호.
3. **선택지 목록은 코드 상수에서 생성한다.** 분야 코드 같은 목록을 설명에 손으로 적으면 그 순간부터
   복제이고 곧 어긋난다. 상수에서 문자열을 만들어 넣으면 소유자가 자기 데이터를 공개하는 것이라 어긋날 수 없다.
4. **컨테이너를 다시 올려야 포털에 반영된다.** 포털은 실행 중인 서버의 스펙을 읽는다. 문서 문자열만
   고치고 재빌드를 빠뜨리면 옛 문서를 보며 디버깅하게 된다(실제로 겪는다).

### 확인

```bash
node scripts/check-endpoint-ids.mjs      # 식별자 유일성/형식
node scripts/check-scalar-registry.mjs   # 포털 배선(서버 등록, 환경별 URL)
# 실제로 나가는 스펙을 눈으로 본다(재빌드 후):
curl -s http://localhost:3300/specs/<server>/openapi.json
```
