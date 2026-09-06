# Clean Architecture - 헥사고날 아키텍처 기반 구조

---

## 개요

csc 프로젝트는 **헥사고날 아키텍처(Hexagonal Architecture)** 기반의 **Clean Architecture**를 따릅니다.

### 헥사고날 아키텍처를 택한 이유

```
전통적 레이어드 아키텍처의 문제점:
┌──────────────┐
│ Presentation │  ← HTTP에 강하게 결합
├──────────────┤
│   Business   │  ← DB에 강하게 결합
├──────────────┤
│ Persistence  │  ← 프레임워크에 종속
└──────────────┘

헥사고날 아키텍처의 해결:
         ┌──────────────┐
    ┌────│  HTTP Adapter│────┐
    │    └──────────────┘    │
    │                        │
    ▼                        ▼
┌────────┐  Port      ┌──────────┐
│  Core  │◄──────────►│ Adapters │
│Business│  (Interface)└──────────┘
└────────┘                   ▲
    ▲                        │
    │    ┌──────────────┐    │
    └────│   DB Adapter │────┘
         └──────────────┘

- 비즈니스 로직은 프레임워크/DB/HTTP에 무관
- 외부 기술은 언제든 교체 가능
- 테스트가 극도로 쉬워짐
```

### 핵심 원칙

1. **의존성 역전 원칙 (DIP)**: 외부 → 내부 의존, 내부는 외부를 모름
2. **포트와 어댑터**: 비즈니스 로직은 인터페이스(Port)로 소통, 구현체(Adapter)는 외부
3. **도메인 중심**: 비즈니스 규칙이 아키텍처의 중심
4. **테스트 용이성**: 비즈니스 로직은 프레임워크 없이 단위 테스트 가능

### 적용 대상 서버

| 서버 | 프레임워크 | DI 방식 | 비고 |
|------|-----------|---------|------|
| `apps/api/nestjs/csc-groupware` | NestJS | `@Module` provider | groupwaredb(Drizzle) |
| `apps/api/nestjs/csc-control-tower` | NestJS | `@Module` provider | controltowerdb(Drizzle) |
| `apps/api/fastapi/video-model` | FastAPI | `container.py` + `Depends` | 영상 제작 자동화, 자체 DB(SQLAlchemy + Alembic) |

> video-model 는 자체 DB 를 SQLAlchemy 2.0 async 모델과 Alembic 마이그레이션으로 서버 내부에서 직접 관리한다(Drizzle `packages/database` 와 무관).

---

## 핵심 개념

### 1. 포트 (Ports)

**인터페이스**로, 비즈니스 로직이 외부와 소통하는 "계약"이다.

```typescript
// Inbound Port (들어오는 요청을 처리): NestJS(csc-groupware)
// core/application/ports/inbound/notice.port.ts
export interface NoticePort {
  createOne(dto: { title: string; content: string }): Promise<NoticeEntity>;
  findOneById(id: number): Promise<NoticeEntity | null>;
}

// Outbound Port (외부 의존성 추상화)
// core/application/ports/outbound/notice-repository.port.ts
export interface NoticeRepositoryPort {
  createRecord(dto: { title: string; content: string }): Promise<NoticeEntity>;
  findOneRecordById(id: number): Promise<NoticeEntity | null>;
}
```

```python
# Inbound / Outbound Port (Protocol): FastAPI(video-model)
# core/application/ports/inbound.py
from typing import Protocol
from ..domain.entities import VideoJob


class VideoJobInboundPort(Protocol):
    async def create_one(self, title: str) -> VideoJob: ...
    async def find_one_by_id(self, job_id: str) -> VideoJob | None: ...


# core/application/ports/outbound.py
class VideoJobRepositoryPort(Protocol):
    async def create_record(self, title: str) -> VideoJob: ...
    async def find_one_record_by_id(self, job_id: str) -> VideoJob | None: ...
```

### 2. 어댑터 (Adapters)

**구현체**로, 포트를 실제로 구현하거나 외부 기술을 연결한다.

```typescript
// Inbound Adapter (HTTP 요청을 받아 Port 호출): NestJS(csc-groupware)
// adapters/inbound/http/controllers/notice.controller.ts
@Controller('notice-api')
export class NoticeController {
  constructor(
    @Inject(NOTICE_PORT) private readonly noticeService: NoticePort,
  ) {}

  @Post('create/one')
  async createOne(@Body() dto: CreateNoticeDto) {
    return await this.noticeService.createOne(dto);
  }
}
```

```python
# Inbound Adapter (FastAPI 라우터가 요청을 받아 Port 호출): video-model
# adapters/inbound/http/router.py
from fastapi import APIRouter, Depends
from .schemas import CreateVideoJobRequest, VideoJobResponse
from ....core.application.ports.inbound import VideoJobInboundPort

router = APIRouter(prefix="/video-jobs", tags=["video-automation"])


@router.post("", response_model=VideoJobResponse)
async def create_video_job(
    body: CreateVideoJobRequest,
    service: VideoJobInboundPort = Depends(get_video_job_service),
) -> VideoJobResponse:
    job = await service.create_one(body.title)
    return VideoJobResponse.from_entity(job)
```

### 3. 의존성 방향

```
┌─────────────────────────────────────────────────┐
│                   Adapters                      │
│  (HTTP, CLI, Message Queue, DB, External API)   │
└────────────┬────────────────────────┬───────────┘
             │                        │
             │ implements             │ implements
             ▼                        ▼
    ┌────────────────┐       ┌────────────────┐
    │ Inbound Ports  │       │ Outbound Ports │
    └────────┬───────┘       └───────▲────────┘
             │                       │
             │ used by               │ depends on
             ▼                       │
    ┌───────────────────────────────────┐
    │        Application Layer          │
    │      (Services)                   │
    └───────────────────────────────────┘
```

---

## 전체 디렉토리 구조

### 권장 구조 (NestJS - csc-groupware / csc-control-tower)

```
apps/api/nestjs/{csc-groupware|csc-control-tower}/src/domains/<domain-name>/
│
├── core/
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── index.ts
│   │   │   └── <domain>.entity.ts        # 순수 TypeScript interface
│   │   ├── types/
│   │   │   ├── index.ts
│   │   │   └── <domain>.types.ts         # Enum, Type 정의
│   │   └── index.ts
│   │
│   └── application/
│       ├── ports/
│       │   ├── inbound/
│       │   │   ├── <domain>.port.ts
│       │   │   └── index.ts
│       │   └── outbound/
│       │       ├── <domain>-repository.port.ts
│       │       └── index.ts
│       └── services/
│           └── <domain>.service.ts
│
├── adapters/
│   ├── inbound/
│   │   └── http/
│   │       ├── controllers/
│   │       │   └── <domain>.controller.ts
│   │       ├── dto/
│   │       │   └── <domain>.dto.ts
│   │       ├── filters/
│   │       │   └── <domain>.filter.ts
│   │       └── mappers/
│   │           └── index.ts
│   │
│   └── outbound/
│       └── db/
│           └── {groupwaredb|controltowerdb}/
│               ├── <domain>.adapter.ts
│               ├── mappers/
│               │   └── index.ts
│               └── index.ts
│
└── <domain>.module.ts
```

> csc-groupware 는 groupwaredb, csc-control-tower 는 controltowerdb(`@csc/database`)를 Outbound Adapter 에서 사용한다.

### 권장 구조 (FastAPI - video-model)

video-model 는 NestJS 와 동일한 헥사고날 레이어를 Python 파일 컨벤션으로 표현한다.
파일은 폴더 대신 모듈(`entities.py`, `ports/inbound.py` 등)로 묶고, DI 는 `app/container.py` + FastAPI `Depends` 로 조립한다.

```
apps/api/fastapi/video-model/
├── app/
│   ├── main.py                            # FastAPI 엔트리포인트 (라우터 등록, lifespan)
│   ├── config.py                          # pydantic-settings 환경변수 로딩
│   ├── container.py                       # DI 조립 (Service ↔ Repository 와이어링)
│   ├── shared/                            # 공통 도메인/어댑터/인프라
│   └── domains/
│       └── <domain-name>/                 # 예: video
│           ├── core/
│           │   ├── domain/
│           │   │   ├── entities.py        # 순수 도메인 dataclass/모델 (ORM import 금지)
│           │   │   └── types.py           # Enum, Type 정의
│           │   └── application/
│           │       ├── ports/
│           │       │   ├── inbound.py     # Inbound Port (Protocol)
│           │       │   └── outbound.py    # Outbound Port (Protocol)
│           │       └── services.py        # Service 구현
│           ├── adapters/
│           │   ├── inbound/
│           │   │   └── http/
│           │   │       ├── router.py      # APIRouter + 핸들러
│           │   │       ├── schemas.py     # 요청/응답 Pydantic 모델
│           │   │       └── mappers.py     # schema ↔ entity 변환
│           │   └── outbound/
│           │       ├── db/
│           │       │   ├── repository.py  # Repository 구현
│           │       │   ├── models.py      # SQLAlchemy ORM 모델
│           │       │   └── mappers.py     # ORM model ↔ domain entity 변환
│           │       └── external/          # 외부 API/스토리지 어댑터
│           ├── module.py                  # 도메인 라우터/의존성 묶음
│           └── tests/                      # 도메인 단위 테스트
├── alembic/                                # DB 마이그레이션
├── alembic.ini
└── pyproject.toml                          # uv 의존성 관리
```

> **핵심 규칙**: `core/` 하위는 FastAPI, SQLAlchemy 를 import 하지 않는다.
> 영속성용 `models.py`(ORM) 와 도메인용 `entities.py`(순수 도메인) 를 분리하고, `mappers.py` 가 둘 사이를 변환한다.

---

## 레이어별 상세 설명

### Core (순수 비즈니스 로직)

#### Domain Layer: NestJS(csc-groupware)

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

```typescript
// core/domain/types/order.type.ts

/** 정렬 방향 */
export enum OrderType {
  ASC = 'ASC',
  DESC = 'DESC',
}
```

#### Domain Layer: FastAPI(video-model)

```python
# core/domain/types.py

from enum import Enum


class VideoJobStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
```

```python
# core/domain/entities.py: 순수 도메인 (SQLAlchemy import 금지)

from dataclasses import dataclass
from datetime import datetime

from .types import VideoJobStatus


@dataclass
class VideoJob:
    id: str
    title: str
    status: VideoJobStatus
    created_at: datetime
```

#### Application Layer

| 구성 요소 | 설명 |
|---------|-----|
| **Inbound Port** | 외부에서 비즈니스 로직 호출 인터페이스 |
| **Outbound Port** | 비즈니스 로직이 외부 의존성 호출 인터페이스 |
| **Service** | Port를 구현하며 비즈니스 로직 실행 |

```typescript
// core/application/ports/inbound/notice.port.ts: NestJS(csc-groupware)

import { NoticeEntity } from '../../../domain';

export interface NoticePort {
  createOne(dto: { title: string; content: string }): Promise<NoticeEntity>;
  findOneById(id: number): Promise<NoticeEntity | null>;
  deleteManyByIds(ids: number[]): Promise<number>;
}

export const NOTICE_PORT = Symbol('NOTICE_PORT');
```

```typescript
// core/application/services/notice.service.ts

import { Inject, Injectable } from '@nestjs/common';
import { NoticeEntity } from '../../domain';
import { NoticePort } from '../ports/inbound';
import { NoticeRepositoryPort, NOTICE_REPOSITORY_PORT } from '../ports/outbound';

@Injectable()
export class NoticeService implements NoticePort {
  constructor(
    @Inject(NOTICE_REPOSITORY_PORT)
    private readonly noticeRepository: NoticeRepositoryPort,
  ) {}

  async createOne(dto: { title: string; content: string }): Promise<NoticeEntity> {
    return await this.noticeRepository.createRecord(dto);
  }

  async findOneById(id: number): Promise<NoticeEntity | null> {
    return await this.noticeRepository.findOneRecordById(id);
  }
}
```

```python
# core/application/services.py: FastAPI(video-model)

from ..domain.entities import VideoJob
from .ports.outbound import VideoJobRepositoryPort


class VideoJobService:
    def __init__(self, repository: VideoJobRepositoryPort) -> None:
        self._repository = repository

    async def create_one(self, title: str) -> VideoJob:
        return await self._repository.create_record(title)

    async def find_one_by_id(self, job_id: str) -> VideoJob | None:
        return await self._repository.find_one_record_by_id(job_id)
```

### Adapters (외부 세계 연결)

#### Inbound Adapters

HTTP, GraphQL, CLI 등 외부 요청을 받아 Core로 전달

```typescript
// adapters/inbound/http/controllers/notice.controller.ts: NestJS(csc-groupware)

import { Controller, Get, Post, Delete, Param, Body, Inject } from '@nestjs/common';
import { NoticePort, NOTICE_PORT } from '../../../../core/application/ports/inbound';
import { CreateNoticeDto } from '../dto';

@Controller('notice-api')
export class NoticeController {
  constructor(
    @Inject(NOTICE_PORT)
    private readonly noticeService: NoticePort,
  ) {}

  @Post('create/one')
  async createOne(@Body() dto: CreateNoticeDto) {
    return await this.noticeService.createOne(dto);
  }

  @Get('find/one/:id')
  async findOneById(@Param('id') id: number) {
    return await this.noticeService.findOneById(id);
  }
}
```

```python
# adapters/inbound/http/schemas.py: FastAPI(video-model)

from datetime import datetime

from pydantic import BaseModel

from ....core.domain.entities import VideoJob
from ....core.domain.types import VideoJobStatus


class CreateVideoJobRequest(BaseModel):
    title: str


class VideoJobResponse(BaseModel):
    id: str
    title: str
    status: VideoJobStatus
    created_at: datetime

    @classmethod
    def from_entity(cls, job: VideoJob) -> "VideoJobResponse":
        return cls(
            id=job.id,
            title=job.title,
            status=job.status,
            created_at=job.created_at,
        )
```

#### Outbound Adapters

DB, 외부 API, 메시지 큐 등 외부 시스템과 연결

##### Repository Adapter (NestJS - Drizzle ORM)

```typescript
// adapters/outbound/db/groupwaredb/notice.adapter.ts: NestJS(csc-groupware)

import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { groupwareDb, notice } from '@csc/database/groupwaredb';
import { NoticeRepositoryPort } from '../../../../core/application/ports/outbound';
import { NoticeEntity } from '../../../../core/domain';
import { toNoticeEntity } from './mappers';

@Injectable()
export class NoticeRepositoryAdapter implements NoticeRepositoryPort {
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

##### Mapper (Drizzle ↔ Domain 변환)

```typescript
// adapters/outbound/db/groupwaredb/mappers/index.ts: NestJS(csc-groupware)

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

##### Repository Adapter (FastAPI - SQLAlchemy 2.0 async)

video-model 는 자체 DB 를 SQLAlchemy ORM 모델로 정의하고, Alembic 으로 마이그레이션한다.
`models.py`(ORM) 와 `entities.py`(도메인) 는 분리되며 `mappers.py` 가 변환을 담당한다.

```python
# adapters/outbound/db/models.py: SQLAlchemy ORM 모델

from datetime import datetime

from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.infrastructure.database import Base


class VideoJobModel(Base):
    __tablename__ = "video_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime)
```

```python
# adapters/outbound/db/repository.py: Repository 구현

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.domain.entities import VideoJob
from .models import VideoJobModel
from .mappers import to_video_job_entity


class VideoJobRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_record(self, title: str) -> VideoJob:
        model = VideoJobModel(title=title, status="PENDING")
        self._session.add(model)
        await self._session.flush()
        return to_video_job_entity(model)

    async def find_one_record_by_id(self, job_id: str) -> VideoJob | None:
        result = await self._session.scalar(
            select(VideoJobModel).where(VideoJobModel.id == job_id)
        )
        return to_video_job_entity(result) if result else None
```

```python
# adapters/outbound/db/mappers.py: ORM model ↔ domain entity 변환

from ....core.domain.entities import VideoJob
from ....core.domain.types import VideoJobStatus
from .models import VideoJobModel


def to_video_job_entity(model: VideoJobModel) -> VideoJob:
    return VideoJob(
        id=model.id,
        title=model.title,
        status=VideoJobStatus(model.status),
        created_at=model.created_at,
    )
```

---

## 의존성 규칙

### 허용되는 의존성

```
Adapters (Inbound/Outbound)
    │
    │ implements
    ▼
Application Ports (Interfaces / Protocol)
    │
    │ uses
    ▼
Application Services
    │
    │ uses
    ▼
Domain (Entities, Types)
```

#### NestJS(csc-groupware / csc-control-tower)

| Layer | 의존 가능한 대상 | 금지 대상 |
|-------|--------------|----------|
| **Domain (entities, types)** | 순수 TypeScript만 | 외부 패키지 |
| **Port** | `core/domain/`만 | 외부 패키지 |
| **Service** | `core/domain/`, `ports/`만 | 외부 패키지 |
| **Inbound Adapter** | `dto/`, `core/domain/`, `ports/inbound` | `@csc/database` |
| **Outbound Adapter** | `@csc/database`, `core/domain/` | - |

#### FastAPI(video-model)

| Layer | 의존 가능한 대상 | 금지 대상 |
|-------|--------------|----------|
| **Domain (entities.py, types.py)** | 순수 Python(표준 라이브러리)만 | FastAPI, SQLAlchemy, Pydantic |
| **Port (ports/inbound.py, outbound.py)** | `core/domain/`만 | FastAPI, SQLAlchemy |
| **Service (services.py)** | `core/domain/`, `ports/`만 | FastAPI, SQLAlchemy |
| **Inbound Adapter (router/schemas)** | `schemas`, `core/domain/`, `ports/inbound` | `models.py`(ORM) 직접 접근 |
| **Outbound Adapter (repository/models)** | SQLAlchemy, `core/domain/`, `mappers` | - |

### 금지되는 의존성

```typescript
// Application(Service)이 Adapter 를 직접 의존하면 안 된다
import { NoticeRepositoryAdapter } from '@/adapters/outbound/db/groupwaredb/notice.adapter';

// Core 가 프레임워크를 의존하면 안 된다
import { Request } from 'express';  // Core에서 금지

// Service 가 외부 패키지(DB)를 직접 의존하면 안 된다
import { groupwareDb } from '@csc/database/groupwaredb';  // Service에서 금지

// 올바른 방법: Service 는 Port 를 통해 접근한다
constructor(
  @Inject(NOTICE_REPOSITORY_PORT)
  private readonly noticeRepository: NoticeRepositoryPort,
) {}
```

```python
# Core(entities/services)가 SQLAlchemy/FastAPI 를 의존하면 안 된다
from sqlalchemy.orm import Mapped          # core/ 에서 금지
from fastapi import Depends                # core/ 에서 금지

# Service 가 ORM 모델을 직접 의존하면 안 된다
from ...adapters.outbound.db.models import VideoJobModel  # Service에서 금지

# 올바른 방법: Service 는 Port(Protocol)를 통해 접근한다
class VideoJobService:
    def __init__(self, repository: VideoJobRepositoryPort) -> None:
        self._repository = repository
```

---

## DI 컨테이너 설정

### NestJS Module (csc-groupware / csc-control-tower)

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

### FastAPI Depends DI (video-model)

video-model 는 DI 프레임워크 대신 FastAPI 의 `Depends` 와 `app/container.py` 에서 의존성을 조립한다.
Service ↔ Repository 와이어링을 `container.py` 가 담당하고, 라우터는 `Depends` 로 주입받는다.

```python
# app/container.py: DI 조립

from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.shared.infrastructure.database import get_session
from app.domains.video.adapters.outbound.db.repository import VideoJobRepository
from app.domains.video.core.application.services import VideoJobService
from app.domains.video.core.application.ports.inbound import VideoJobInboundPort


def get_video_job_repository(
    session: AsyncSession = Depends(get_session),
) -> VideoJobRepository:
    return VideoJobRepository(session)


def get_video_job_service(
    repository: VideoJobRepository = Depends(get_video_job_repository),
) -> VideoJobInboundPort:
    # Outbound Adapter(Repository) → Service 조립
    # 반환 타입은 Inbound Port(Protocol) 로 노출
    return VideoJobService(repository)
```

```python
# app/main.py: 라우터 등록

from fastapi import FastAPI

from app.domains.video.module import router as video_router

app = FastAPI(title="video-model")
app.include_router(video_router)
```

---

## 테스트 전략

- **NestJS (csc-groupware / csc-control-tower)**: NestJS `Test.createTestingModule` 기반 테스트를 활용하고, Outbound Port 를 Mock provider 로 교체해 Service 를 단위 테스트한다.
- **FastAPI (video-model)**: Port 가 `Protocol` 이므로 가짜 Repository(Protocol 구현)를 Service 생성자에 직접 주입해 프레임워크 없이 단위 테스트한다. 도메인 테스트는 `app/domains/<domain>/tests/` 에 위치한다(예: `tests/test_video_job_service.py`).

```python
# app/domains/video/tests/test_video_job_service.py (예시)

from app.domains.video.core.application.services import VideoJobService


class FakeVideoJobRepository:
    async def create_record(self, title: str):
        ...  # 인메모리 가짜 구현

    async def find_one_record_by_id(self, job_id: str):
        ...


async def test_create_one():
    service = VideoJobService(FakeVideoJobRepository())
    job = await service.create_one("샘플 영상")
    assert job.title == "샘플 영상"
```

---

## 베스트 프랙티스

### 1. Port 토큰/계약 정의

- **NestJS**: Port 인터페이스와 함께 `Symbol` 토큰을 정의한다.
- **FastAPI**: Port 는 `Protocol` 로 정의해 구조적 타이핑으로 계약을 강제한다(별도 토큰 불필요).

```typescript
// core/application/ports/inbound/notice.port.ts: NestJS

export interface NoticePort {
  createOne(dto: { title: string; content: string }): Promise<NoticeEntity>;
}

export const NOTICE_PORT = Symbol('NOTICE_PORT');
```

```python
# core/application/ports/inbound.py: FastAPI

from typing import Protocol


class VideoJobInboundPort(Protocol):
    async def create_one(self, title: str) -> "VideoJob": ...
```

### 2. Import 단순화

```typescript
// 깊은 상대 경로는 쓰지 않는다(NestJS)
import { NoticePort } from '../../../../core/application/ports/inbound/notice.port';

// Barrel export(index.ts)를 활용한다
import { NoticePort, NOTICE_PORT } from '../../../../core/application/ports/inbound';
```

> FastAPI(video-model)에서는 각 패키지의 `__init__.py` 에서 공개 심볼을 재노출해 import 를 단순화한다.

### 3. 도메인 타입은 각 도메인에서 정의

```python
# core/domain/types.py: FastAPI(video-model)

from enum import Enum


class VideoJobStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
```

### 4. Mapper로 영속성 모델 ↔ Domain 변환

```typescript
// NestJS: Drizzle Row → Domain Entity
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

```python
# FastAPI: SQLAlchemy Model → Domain Entity
def to_video_job_entity(model: VideoJobModel) -> VideoJob:
    return VideoJob(
        id=model.id,
        title=model.title,
        status=VideoJobStatus(model.status),
        created_at=model.created_at,
    )
```

### 5. Outbound Port 메서드 네이밍

| Port 메서드 (NestJS) | Port 메서드 (FastAPI) | 설명 |
|----------------------|------------------------|-------------|
| `createRecord(dto)` | `create_record(...)` | 레코드 생성 |
| `findOneRecordById(id)` | `find_one_record_by_id(id)` | ID로 단일 조회 |
| `findManyRecords(...)` | `find_many_records(...)` | 목록 조회 |
| `updateOneRecordById(id, dto)` | `update_one_record_by_id(id, ...)` | ID로 수정 |
| `deleteManyRecordsByIds(ids)` | `delete_many_records_by_ids(ids)` | 여러 레코드 삭제 |

---

## 마이그레이션 체크리스트

### NestJS (csc-groupware / csc-control-tower)

기존 코드를 헥사고날 아키텍처로 전환할 때:

- [ ] `core/domain/entities/` - 도메인 엔티티 interface 정의
- [ ] `core/domain/types/` - Enum, Type 정의
- [ ] `core/application/ports/inbound/` - Inbound Port interface + Symbol 토큰 정의
- [ ] `core/application/ports/outbound/` - Outbound Port interface + Symbol 토큰 정의
- [ ] `core/application/services/` - Service 구현
- [ ] `adapters/inbound/http/controllers/` - Controller 구현
- [ ] `adapters/inbound/http/dto/` - DTO 정의
- [ ] `adapters/outbound/db/{groupwaredb|controltowerdb}/` - Repository Adapter 구현
- [ ] `adapters/outbound/db/{groupwaredb|controltowerdb}/mappers/` - Mapper 구현
- [ ] `<domain>.module.ts` - NestJS Module DI 설정
- [ ] Barrel exports (`index.ts`) 추가

### FastAPI (video-model)

- [ ] `core/domain/entities.py` - 순수 도메인 모델 정의(ORM/FastAPI import 금지)
- [ ] `core/domain/types.py` - Enum, Type 정의
- [ ] `core/application/ports/inbound.py` - Inbound Port(Protocol) 정의
- [ ] `core/application/ports/outbound.py` - Outbound Port(Protocol) 정의
- [ ] `core/application/services.py` - Service 구현
- [ ] `adapters/inbound/http/router.py` - APIRouter + 핸들러
- [ ] `adapters/inbound/http/schemas.py` - 요청/응답 Pydantic 모델
- [ ] `adapters/inbound/http/mappers.py` - schema ↔ entity 변환
- [ ] `adapters/outbound/db/models.py` - SQLAlchemy ORM 모델
- [ ] `adapters/outbound/db/repository.py` - Repository 구현
- [ ] `adapters/outbound/db/mappers.py` - ORM model ↔ domain entity 변환
- [ ] `module.py` - 도메인 라우터/의존성 묶음
- [ ] `app/container.py` - Service ↔ Repository DI 와이어링 + `Depends`
- [ ] Alembic 마이그레이션 추가 (`alembic revision`)
- [ ] `tests/` - Protocol 기반 가짜 Repository 로 Service 단위 테스트

---

## 참고 자료

- [헥사고날 아키텍처 (Alistair Cockburn)](https://alistair.cockburn.us/hexagonal-architecture/)
- [클린 아키텍처 (Robert C. Martin)](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
