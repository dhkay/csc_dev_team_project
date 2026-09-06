# Hexagonal Architecture 쉽게 이해하기

> 이 문서는 헥사고날 아키텍처를 처음 접하는 개발자를 위한 입문 가이드다.
> 상세한 기술 문서는 [clean-architecture-structure.md](./clean-architecture-structure.md)를 참고한다.

csc 백엔드는 모두 헥사고날(Ports & Adapters) 구조를 따릅니다. 다만 서버마다 사용하는 프레임워크가 다르다.

| 서버 | 프레임워크 | 언어 |
|------|-----------|------|
| `csc-groupware` | NestJS | TypeScript |
| `csc-control-tower` | NestJS | TypeScript |
| `video-model` (영상 제작 자동화) | FastAPI | Python |

같은 헥사고날 개념을 NestJS와 FastAPI 두 관용구로 모두 보여드립니다. **개념은 동일하고, 구현 도구만 다르다.**

---

## 한 줄 요약

**"외부와 연결되는 부분(Adapter)을 분리하고, 핵심 로직(Core)을 보호한다"**

---

## 폴더 구조

### NestJS (csc-groupware / csc-control-tower)

```
apps/api/nestjs/{csc-groupware|csc-control-tower}/src/domains/<도메인명>/
│
├── adapters/                           ← 외부와 연결하는 "변환기"
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
│   └── outbound/
│       └── db/
│           └── {groupwaredb|userdb|controltowerdb}/
│               ├── xxx.adapter.ts
│               └── mappers/
│                   └── index.ts
│
├── core/                               ← 핵심 영역 (보호받는 구역)
│   ├── domain/
│   │   ├── entities/
│   │   │   └── xxx.entity.ts
│   │   ├── types/
│   │   │   └── xxx.types.ts
│   │   └── index.ts
│   └── application/
│       ├── ports/
│       │   ├── inbound/
│       │   │   └── xxx.port.ts
│       │   └── outbound/
│       │       └── xxx.port.ts
│       └── services/
│           └── xxx.service.ts
│
└── xxx.module.ts
```

### FastAPI (video-model)

```
apps/api/fastapi/video-model/app/domains/<도메인명>/
│
├── adapters/                           ← 외부와 연결하는 "변환기"
│   ├── inbound/
│   │   └── http/
│   │       ├── router.py               (= NestJS Controller)
│   │       ├── schemas.py              (= NestJS DTO, Pydantic 모델)
│   │       └── mappers.py
│   └── outbound/
│       └── db/
│           ├── repository.py           (= NestJS Adapter)
│           ├── models.py               (SQLAlchemy 모델)
│           └── mappers.py
│
├── core/                               ← 핵심 영역 (FastAPI, SQLAlchemy import 금지!)
│   ├── entities.py                     (도메인 엔티티, dataclass/순수 Python)
│   ├── types.py                        (도메인 전용 타입/Enum)
│   ├── ports/
│   │   ├── inbound.py                  (Protocol/ABC)
│   │   └── outbound.py                 (Protocol/ABC)
│   └── services.py
│
└── module.py                           (의존성 조립; Depends 와이어링)
```

> **핵심 차이:** NestJS는 클래스 데코레이터(`@Injectable`, `@Module`)와 Symbol 토큰으로 DI를 구성하고, FastAPI는 `Protocol`/`ABC`로 포트를 정의하고 `Depends`로 주입한다. 폴더의 "역할 배치"는 완전히 동일한다.

---

## 식당 비유로 이해하기

```
손님이 김치찌개를 주문하는 과정
```

### 전체 흐름

```
┌──────────── INBOUND (들어오는 방향) ────────────┐┌───────── OUTBOUND (나가는 방향) ─────────┐
│                                                ││                                          │
│  손님      서빙직원       메뉴판       주방장   ││   재료요청서      재료담당      냉장고    │
│   │       controller     port       service   ││     port         adapter        DB       │
│   │                                     │     ││                                   │      │
│   │       [adapters/   [ports/    [services/  ││   [ports/      [adapters/        │      │
│   │        inbound]     inbound]      ]       ││    outbound]    outbound]        │      │
│   │                                     │     ││                                   │      │
│   │                                     │─────요청────▶──────────▶───────────────▶│      │
│   │                                     │     ││                                   │      │
│   │                                     │◀────재료────◀──────────◀───────────────◀┘      │
│   │                                     │     ││                                          │
│   │◀────────── 김치찌개 완성! ◀─────────┘     ││                                          │
│                                                ││                                          │
└────────────────────────────────────────────────┘└──────────────────────────────────────────┘
```

### 각 역할 설명

| 비유 | NestJS | FastAPI | 역할 |
|------|--------|---------|------|
| 서빙 직원 | Controller | Router | HTTP 요청을 받아서 주방장에게 전달 |
| 메뉴판 | Inbound Port (interface + Symbol) | Inbound Port (Protocol) | "이렇게 주문하세요" 규칙 정의 |
| 주방장 | Service (`@Injectable`) | Service (일반 클래스) | 실제 요리 (비즈니스 로직) |
| 재료 요청서 | Outbound Port | Outbound Port (Protocol) | "창고야 이거 가져와" 규칙 정의 |
| 재료 담당 | Repository Adapter | Repository | 실제로 냉장고에서 재료 가져옴 |
| 냉장고 | Database (Drizzle) | Database (SQLAlchemy) | 데이터 저장소 |

---

## Port vs Adapter

### Port = 규칙 (Interface / Protocol)

```typescript
// NestJS: core/application/ports/inbound/notice.port.ts

export interface NoticePort {
  createOne(dto: { title: string; content: string }): Promise<NoticeEntity>;
  findOneById(id: number): Promise<NoticeEntity | null>;
}

export const NOTICE_PORT = Symbol('NOTICE_PORT');
```

```python
# FastAPI: core/ports/inbound.py

from typing import Protocol
from app.domains.video.core.entities import VideoJob


class VideoJobInboundPort(Protocol):
    async def create_one(self, title: str) -> VideoJob: ...
    async def find_one_by_id(self, job_id: str) -> VideoJob | None: ...
```

> NestJS는 런타임 DI를 위해 `interface` + `Symbol` 토큰을 함께 둡니다(타입은 컴파일 후 사라지므로 토큰이 필요). FastAPI는 `Protocol`(또는 `ABC`)만으로 충분한다.

### Adapter = 실제 구현 (Class)

```typescript
// NestJS: adapters/outbound/db/groupwaredb/notice.adapter.ts

@Injectable()
export class NoticeRepositoryAdapter implements NoticeRepositoryPort {
  async createRecord(dto: { title: string; content: string }): Promise<NoticeEntity> {
    const [result] = await groupwareDb.insert(notice).values(dto).returning();
    return toNoticeEntity(result);
  }
}
```

```python
# FastAPI: adapters/outbound/db/repository.py

class VideoJobRepository:  # VideoJobRepositoryPort 구현
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_record(self, title: str) -> VideoJob:
        model = VideoJobModel(title=title, status=VideoJobStatus.PENDING)
        self._session.add(model)
        await self._session.flush()
        return to_video_job_entity(model)
```

**비유:**
- Port = 채용 공고 ("요리 가능자 구함")
- Adapter = 실제 직원 (요리를 실제로 함)

---

## Inbound vs Outbound

### Inbound (들어오는 방향)

```
외부 → 코어
손님 → 주방장
HTTP 요청 → Service
```

| 구성요소 | 역할 |
|---------|------|
| Inbound Adapter (Controller / Router) | HTTP 요청 받음 |
| Inbound Port | Service가 받을 요청 규칙 |

### Outbound (나가는 방향)

```
코어 → 외부
주방장 → 냉장고
Service → DB
```

| 구성요소 | 역할 |
|---------|------|
| Outbound Port | Service가 필요한 기능 규칙 |
| Outbound Adapter (Repository) | 실제 DB 접근 |

---

## 구현하는 쪽과 호출하는 쪽

```
         INBOUND                              OUTBOUND

  Controller/Router                          Adapter
        │                                      ▲
        │ 호출                                 │ 구현
        ▼                                      │
┌───────────────┐                      ┌───────────────┐
│ Port Inbound  │                      │ Port Outbound │
│ (if / Protocol)│                     │ (if / Protocol)│
└───────────────┘                      └───────────────┘
        ▲                                      │
        │ 구현                                 │ 호출
        │                                      ▼
    Service ◀──────────────────────────── Service
```

| Port | 누가 정의 | 누가 구현 | 누가 호출 |
|------|----------|----------|----------|
| Inbound | Service | Service | Controller / Router |
| Outbound | Service | Adapter / Repository | Service |

**핵심: Service가 모든 Port를 정의한다.**

---

## 이 구조를 쓰는 이유

### 격리의 장점

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   ┌─────────┐      ┌─────────┐      ┌─────────┐            │
│   │ 외부    │      │  코어   │      │  외부   │            │
│   │(Inbound)│ ───▶ │(격리됨) │ ───▶ │(Outbound)│            │
│   └─────────┘      └─────────┘      └─────────┘            │
│                                                             │
│   HTTP, gRPC        비즈니스        DB, 외부 API            │
│   뭐든 가능          로직만!         뭐든 가능               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

| 상황 | 격리 안 했을 때 | 격리 했을 때 |
|------|----------------|-------------|
| DB 변경 (MySQL → PostgreSQL) | Service 코드 수정 필요 | Adapter만 교체 |
| ORM 변경 (Drizzle → SQLAlchemy 등) | Service 코드 수정 필요 | Adapter만 교체 |
| 요청 방식 변경 (HTTP → gRPC) | Service 코드 수정 필요 | Adapter만 교체 |
| 테스트 | 실제 DB 필요 | 가짜 Adapter로 테스트 |
| 외부 장애 | 코어까지 영향 | 코어는 안전 |

---

## 실제 파일 예시 ①: NestJS (csc-groupware, notice 도메인)

### 1. Domain Entity

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

### 2. Domain Types

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

### 3. Inbound Port

```typescript
// core/application/ports/inbound/notice.port.ts

import { NoticeEntity, OrderType, NoticeOrderColumn } from '../../domain';

export interface NoticePort {
  findAllByPage(
    skip: number,
    take: number,
    title: string,
    order: OrderType,
    orderColumn: NoticeOrderColumn,
  ): Promise<[NoticeEntity[], number]>;

  createOne(dto: { title: string; content: string }): Promise<NoticeEntity>;
  findOneById(id: number): Promise<NoticeEntity | null>;
  updateOneById(id: number, dto: { title?: string; content?: string }): Promise<NoticeEntity>;
  deleteManyByIds(ids: number[]): Promise<number>;
}

export const NOTICE_PORT = Symbol('NOTICE_PORT');
```

### 4. Outbound Port

```typescript
// core/application/ports/outbound/notice.port.ts

import { NoticeEntity, OrderType, NoticeOrderColumn } from '../../domain';

export interface NoticeRepositoryPort {
  findAllRecordsByPage(...): Promise<[NoticeEntity[], number]>;
  createRecord(dto: { title: string; content: string }): Promise<NoticeEntity>;
  findOneRecordById(id: number): Promise<NoticeEntity | null>;
  findOneRecordByTitle(title: string): Promise<NoticeEntity | null>;
  updateOneRecordById(id: number, dto: { title?: string; content?: string }): Promise<NoticeEntity>;
  deleteManyRecordsByIds(ids: number[]): Promise<number>;
}

export const NOTICE_REPOSITORY_PORT = Symbol('NOTICE_REPOSITORY_PORT');
```

### 5. Service

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
    const existTitle = await this.noticeRepository.findOneRecordByTitle(dto.title);
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

### 6. Repository Adapter

```typescript
// adapters/outbound/db/groupwaredb/notice.adapter.ts

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

### 7. Mapper

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

### 8. Controller

```typescript
// adapters/inbound/http/controllers/notice.controller.ts

import { Controller, Get, Post, Delete, Param, Body, Inject } from '@nestjs/common';
import { NoticePort, NOTICE_PORT } from '../../../../core/application/ports/inbound';
import { CreateOneNoticeDto } from '../dto';

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

  @Delete('delete/many/:ids')
  async deleteManyByIds(@Param('ids') ids: string) {
    const idArray = ids.split(',').map(Number);
    return await this.noticeService.deleteManyByIds(idArray);
  }
}
```

### 9. DTO

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

### 10. Module

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
    { provide: NOTICE_PORT, useClass: NoticeService },
    { provide: NOTICE_REPOSITORY_PORT, useClass: NoticeRepositoryAdapter },
  ],
})
export class NoticeModule {}
```

---

## 실제 파일 예시 ②: FastAPI (video-model, video 도메인)

같은 헥사고날 구조를 FastAPI/SQLAlchemy로 옮기면 다음과 같다. **파일은 클래스 단위가 아니라 역할 단위로 묶이다.**

### 1. Domain Entity & Types: `core/entities.py`, `core/types.py`

```python
# core/types.py
from enum import StrEnum


class VideoJobStatus(StrEnum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
```

```python
# core/entities.py
from dataclasses import dataclass
from datetime import datetime

from app.domains.video.core.types import VideoJobStatus


@dataclass
class VideoJob:
    """영상 제작 작업 엔티티 (순수 Python: FastAPI/SQLAlchemy import 금지)"""
    id: str
    title: str
    status: VideoJobStatus
    created_at: datetime
```

### 2. Inbound Port: `core/ports/inbound.py`

```python
from typing import Protocol

from app.domains.video.core.entities import VideoJob


class VideoJobInboundPort(Protocol):
    async def create_one(self, title: str) -> VideoJob: ...
    async def find_one_by_id(self, job_id: str) -> VideoJob | None: ...
    async def delete_many_by_ids(self, ids: list[str]) -> int: ...
```

### 3. Outbound Port: `core/ports/outbound.py`

```python
from typing import Protocol

from app.domains.video.core.entities import VideoJob


class VideoJobRepositoryPort(Protocol):
    async def create_record(self, title: str) -> VideoJob: ...
    async def find_one_record_by_id(self, job_id: str) -> VideoJob | None: ...
    async def find_one_record_by_title(self, title: str) -> VideoJob | None: ...
    async def delete_many_records_by_ids(self, ids: list[str]) -> int: ...
```

### 4. Service: `core/services.py`

```python
# core/services.py  (FastAPI/SQLAlchemy를 import 하지 않는다!)

from app.domains.video.core.entities import VideoJob
from app.domains.video.core.ports.outbound import VideoJobRepositoryPort


class VideoJobService:  # VideoJobInboundPort 구현
    def __init__(self, repository: VideoJobRepositoryPort) -> None:
        self._repository = repository

    async def create_one(self, title: str) -> VideoJob:
        exist = await self._repository.find_one_record_by_title(title)
        if exist:
            raise ValueError("이미 존재하는 title입니다.")
        return await self._repository.create_record(title)

    async def find_one_by_id(self, job_id: str) -> VideoJob | None:
        return await self._repository.find_one_record_by_id(job_id)
```

> NestJS의 `@Injectable` + `@Inject(TOKEN)` 대신, FastAPI Service는 그냥 생성자 인자로 포트를 받는다. 조립은 `module.py`가 `Depends`로 한다.

### 5. SQLAlchemy Model: `adapters/outbound/db/models.py`

```python
from datetime import datetime

from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base  # SQLAlchemy DeclarativeBase
from app.domains.video.core.types import VideoJobStatus


class VideoJobModel(Base):
    __tablename__ = "video_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String)
    status: Mapped[VideoJobStatus] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
```

### 6. Repository (Outbound Adapter): `adapters/outbound/db/repository.py`

```python
import uuid

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.video.core.entities import VideoJob
from app.domains.video.core.types import VideoJobStatus
from app.domains.video.adapters.outbound.db.models import VideoJobModel
from app.domains.video.adapters.outbound.db.mappers import to_video_job_entity


class VideoJobRepository:  # VideoJobRepositoryPort 구현
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_record(self, title: str) -> VideoJob:
        model = VideoJobModel(
            id=str(uuid.uuid4()),
            title=title,
            status=VideoJobStatus.PENDING,
        )
        self._session.add(model)
        await self._session.flush()
        return to_video_job_entity(model)

    async def find_one_record_by_id(self, job_id: str) -> VideoJob | None:
        result = await self._session.scalar(
            select(VideoJobModel).where(VideoJobModel.id == job_id)
        )
        return to_video_job_entity(result) if result else None

    async def delete_many_records_by_ids(self, ids: list[str]) -> int:
        result = await self._session.execute(
            delete(VideoJobModel).where(VideoJobModel.id.in_(ids))
        )
        return result.rowcount
```

### 7. Mapper: `adapters/outbound/db/mappers.py`

```python
from app.domains.video.core.entities import VideoJob
from app.domains.video.adapters.outbound.db.models import VideoJobModel


def to_video_job_entity(model: VideoJobModel) -> VideoJob:
    """SQLAlchemy VideoJobModel → Domain VideoJob 변환"""
    return VideoJob(
        id=model.id,
        title=model.title,
        status=model.status,
        created_at=model.created_at,
    )
```

### 8. Router (Inbound Adapter): `adapters/inbound/http/router.py`

```python
from fastapi import APIRouter, Depends, HTTPException

from app.domains.video.core.ports.inbound import VideoJobInboundPort
from app.domains.video.adapters.inbound.http.schemas import (
    CreateVideoJobRequest,
    VideoJobResponse,
)
from app.domains.video.adapters.inbound.http.mappers import to_video_job_response
from app.domains.video.module import get_video_job_service

router = APIRouter(prefix="/video-jobs", tags=["video-jobs"])


@router.post("/create/one", response_model=VideoJobResponse)
async def create_one(
    body: CreateVideoJobRequest,
    service: VideoJobInboundPort = Depends(get_video_job_service),
):
    try:
        job = await service.create_one(body.title)
    except ValueError as exc:  # 도메인 에러 → HTTP 변환은 어댑터 책임
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return to_video_job_response(job)


@router.get("/find/one/{job_id}", response_model=VideoJobResponse | None)
async def find_one_by_id(
    job_id: str,
    service: VideoJobInboundPort = Depends(get_video_job_service),
):
    job = await service.find_one_by_id(job_id)
    return to_video_job_response(job) if job else None
```

### 9. Schemas (DTO): `adapters/inbound/http/schemas.py`

```python
from datetime import datetime

from pydantic import BaseModel

from app.domains.video.core.types import VideoJobStatus


class CreateVideoJobRequest(BaseModel):
    title: str


class VideoJobResponse(BaseModel):
    id: str
    title: str
    status: VideoJobStatus
    created_at: datetime
```

### 10. Module (의존성 조립): `module.py`

```python
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session  # AsyncSession 제공 의존성
from app.domains.video.adapters.outbound.db.repository import VideoJobRepository
from app.domains.video.core.services import VideoJobService


def get_video_job_repository(
    session: AsyncSession = Depends(get_session),
) -> VideoJobRepository:
    return VideoJobRepository(session)


def get_video_job_service(
    repository: VideoJobRepository = Depends(get_video_job_repository),
) -> VideoJobService:
    return VideoJobService(repository)
```

> NestJS의 `@Module({ providers: [...] })`가 하는 "어떤 Port에 어떤 구현을 꽂을지" 결정을, FastAPI에서는 `module.py`의 `Depends` 체인이 담당한다.

---

## 두 프레임워크 매핑 한눈에 보기

| 개념 | NestJS (csc-groupware / csc-control-tower) | FastAPI (video-model) |
|------|--------------------------------------------|--------------------|
| Port | `interface` + `Symbol` 토큰 | `Protocol` (또는 `ABC`) |
| Service | `@Injectable()` 클래스 | 일반 클래스 |
| DI 주입 | `@Inject(TOKEN)` 생성자 | 생성자 인자 + `Depends` |
| DI 조립 | `@Module({ providers })` | `module.py` `Depends` 체인 |
| Inbound Adapter | Controller (`@Controller`) | Router (`APIRouter`) |
| DTO | `class-validator` DTO | Pydantic `BaseModel` (schemas) |
| ORM | Drizzle | SQLAlchemy 2.0 (async) |
| 마이그레이션 | `drizzle-kit` | Alembic |
| 패키지 매니저 | pnpm | uv |
| 설정 | env / config | pydantic-settings |

---

## 에러 처리 패턴

Hexagonal Architecture에서 **Service는 HTTP를 모른다**. 에러 처리도 마찬가지다.

### Service - 순수 도메인 예외

```typescript
// NestJS: 도메인 에러만 throw
@Injectable()
export class NoticeService implements NoticePort {
  async createOne(dto: { title: string; content: string }) {
    const exist = await this.noticeRepository.findOneRecordByTitle(dto.title);
    if (exist) throw new Error('이미 존재하는 title입니다.');
    return await this.noticeRepository.createRecord(dto);
  }
}

// 잘못된 방법: HTTP 관심사가 Service 에 침투
@Injectable()
export class NoticeService {
  async createOne(dto) {
    try {
      // ...
    } catch (err) {
      throw new HttpException(message, statusCode);  // HTTP는 Service가 모르는 개념
    }
  }
}
```

```python
# FastAPI: 도메인 에러만 raise (HTTP 를 모름)
class VideoJobService:
    async def create_one(self, title: str) -> VideoJob:
        exist = await self._repository.find_one_record_by_title(title)
        if exist:
            raise ValueError("이미 존재하는 title입니다.")  # 도메인 언어
        return await self._repository.create_record(title)

# 잘못된 방법: Service 가 HTTPException 을 던짐
class VideoJobService:
    async def create_one(self, title: str):
        ...
        raise HTTPException(status_code=409, detail=...)  # HTTP는 Service가 모름
```

### Inbound Adapter - HTTP 변환 책임

```typescript
// NestJS: adapters/inbound/http/filters/domain-exception.filter.ts

@Catch(Error)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    // 도메인 에러 → HTTP 상태 코드 매핑
    const statusCode = this.getStatusCode(exception.message);
    response.status(statusCode).send({ message: exception.message });
  }
}
```

```python
# FastAPI: Router에서 도메인 예외를 HTTP로 변환
@router.post("/create/one")
async def create_one(body: CreateVideoJobRequest, service=Depends(get_video_job_service)):
    try:
        job = await service.create_one(body.title)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc  # 변환은 어댑터에서
    return to_video_job_response(job)
```

**핵심:** Service는 HTTP 상태 코드, `HttpException`/`HTTPException`을 전혀 모른다. 오직 도메인 언어로만 에러를 표현한다.

---

## 패키지 의존성 규칙

Core(Port, Service, Domain)는 외부 패키지에 **직접** 의존하지 않는다.

### 의존성 방향

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ┌─────────────────┐      ┌─────────────────────────┐      ┌──────────────┐ │
│  │ Inbound Adapter │      │          Core           │      │   Outbound   │ │
│  │ (Controller/    │ ───▶ │  (Port/Service/Domain)  │ ◀─── │   Adapter    │ │
│  │  Router)        │      │                         │      │ (Repository) │ │
│  └─────────────────┘      └─────────────────────────┘      └──────────────┘ │
│          │                           │                            │          │
│          ▼                           ▼                            ▼          │
│   shared / schemas        core domain types           @csc/database / │
│   (공통 DTO)             (도메인 전용 타입)          SQLAlchemy 모델       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 계층별 허용 패키지: NestJS

| 계층 | 위치 | Import 가능 | 금지 |
|------|------|-------------|------|
| **Domain** | `core/domain/` | 없음 (순수 TypeScript) | 외부 패키지 |
| **Port** | `core/application/ports/` | `core/domain`만 | 외부 패키지 |
| **Service** | `core/application/services/` | `core/domain`, `ports`만 | 외부 패키지 |
| **Inbound Adapter** | `adapters/inbound/` | `shared/types`, `core/domain` | `@csc/database` |
| **Outbound Adapter** | `adapters/outbound/db/` | `@csc/database`, `core/domain` | - |

### 계층별 허용 패키지: FastAPI

| 계층 | 위치 | Import 가능 | 금지 |
|------|------|-------------|------|
| **Domain** | `core/entities.py`, `core/types.py` | 표준 라이브러리만 | FastAPI, SQLAlchemy |
| **Port** | `core/ports/` | `core` 도메인만 | FastAPI, SQLAlchemy |
| **Service** | `core/services.py` | `core` 도메인, `ports`만 | FastAPI, SQLAlchemy |
| **Inbound Adapter** | `adapters/inbound/` | FastAPI, Pydantic, `core` | SQLAlchemy 모델 |
| **Outbound Adapter** | `adapters/outbound/db/` | SQLAlchemy, `core` | FastAPI |

> video-model의 철칙: **`core/`는 FastAPI도 SQLAlchemy도 import 하지 않는다.** core는 순수 Python으로만 작성한다.

### 올바른 예시

```typescript
// NestJS Service (Core): core/domain 에서만 import
import { NoticeEntity } from '../../domain';
import { NoticeRepositoryPort, NOTICE_REPOSITORY_PORT } from '../ports/outbound';
```

```python
# FastAPI Service (Core): core 도메인/포트만 import
from app.domains.video.core.entities import VideoJob
from app.domains.video.core.ports.outbound import VideoJobRepositoryPort
```

```typescript
// NestJS Adapter (Outbound): @csc/database 사용 가능
import { groupwareDb, notice } from '@csc/database/groupwaredb';
import { NoticeEntity } from '../../../../core/domain';
```

```python
# FastAPI Repository (Outbound): SQLAlchemy 사용 가능
from sqlalchemy.ext.asyncio import AsyncSession
from app.domains.video.adapters.outbound.db.models import VideoJobModel
```

```python
# 잘못된 예: core/services.py 에서 SQLAlchemy 직접 import
from sqlalchemy.ext.asyncio import AsyncSession  # core는 SQLAlchemy를 모른다!

class VideoJobService:
    ...
```

---

## Outbound Port 메서드 네이밍 컨벤션

Outbound Port의 메서드는 `Record` 접미사(Python은 `_record`)를 사용하여 DB 작업임을 명시한다.

| Port 메서드 (NestJS) | Drizzle 구현 | Port 메서드 (FastAPI) | SQLAlchemy 구현 |
|----------------------|--------------|------------------------|------------------|
| `createRecord(dto)` | `db.insert(table).values(dto).returning()` | `create_record(...)` | `session.add(model); await session.flush()` |
| `findOneRecordById(id)` | `db.query.table.findFirst({ where: eq(table.id, id) })` | `find_one_record_by_id(id)` | `await session.scalar(select(M).where(M.id == id))` |
| `findOneRecordByTitle(title)` | `db.query.table.findFirst({ where: eq(table.title, title) })` | `find_one_record_by_title(title)` | `await session.scalar(select(M).where(M.title == title))` |
| `findManyRecords(...)` | `db.query.table.findMany({ where, limit, offset })` | `find_many_records(...)` | `await session.scalars(select(M).where(...).limit().offset())` |
| `findAllRecordsByPage(...)` | `db.query.table.findMany({ offset: skip, limit: take, ... })` | `find_all_records_by_page(...)` | `select(M).offset(skip).limit(take)` |
| `updateOneRecordById(id, dto)` | `db.update(table).set(dto).where(eq(table.id, id))` | `update_one_record_by_id(id, dto)` | `update(M).where(M.id == id).values(...)` |
| `deleteManyRecordsByIds(ids)` | `db.delete(table).where(inArray(table.id, ids))` | `delete_many_records_by_ids(ids)` | `delete(M).where(M.id.in_(ids))` |

> **접미사를 빼는 경우**: 엔티티 행(record) 대신 **key 목록**이나 **resolve(파생 계산)** 값을 돌려주는 메서드는 `Record`/`_record` 를 붙이지 않는다. 예: `findOrganizationAiToolKeys`(key 목록), `resolveAdminFeatures`(계산). 즉 접미사는 "행 CRUD"에만 일관 적용한다. (상세: [api-architecture.md](./api-architecture.md) §4 Outbound Port 메서드 네이밍.)

---

## 순환 의존성 해결

### NestJS: forwardRef

모듈 간 순환 의존성이 있을 때 `forwardRef`를 사용해야 한다.

```typescript
// notice.module.ts

@Module({
  imports: [
    forwardRef(() => NoticeCategoryModule),  // 순환 참조 모듈
  ],
  // ...
})
export class NoticeModule {}
```

```typescript
// adapters/outbound/db/groupwaredb/xxx.adapter.ts

@Injectable()
export class NoticeCategoryRepositoryAdapter implements NoticeCategoryRepositoryPort {
  constructor(
    @Inject(forwardRef(() => NoticeService))  // forwardRef 필수!
    private readonly noticeService: NoticeService,
  ) {}
}
```

| 상황 | forwardRef 필요 |
|------|-----------------|
| 같은 모듈 내 서비스 주입 | 불필요 |
| 다른 모듈 서비스 주입 (순환 없음) | 불필요 |
| 다른 모듈 서비스 주입 (순환 있음) | 필요 |

### FastAPI: 순환 import 회피

FastAPI에는 `forwardRef` 같은 런타임 장치가 없다. Port가 `Protocol`이고 DI 조립이 `module.py`에 모여 있으므로 순환 자체가 잘 생기지 않는다. 그래도 타입 힌트 때문에 순환 import가 필요해지면:

```python
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # 런타임이 아니라 타입 검사 시에만 import
    from app.domains.notice_category.core.services import NoticeCategoryService
```

핵심은 **Service는 다른 Service의 구체 클래스가 아니라 Port(Protocol)에 의존**하게 만들어 순환을 끊는 것이다.

---

## 기억할 것

1. **Service가 왕이다** - 모든 Port를 Service가 정의 (NestJS, FastAPI 공통)
2. **Inbound끼리, Outbound끼리** - 짝꿍으로 연결됨
3. **Port = 규칙, Adapter = 실행** - interface/Symbol(NestJS) 또는 Protocol(FastAPI) vs Class
4. **코어는 외부를 모른다** - 의존성이 항상 코어를 향함. video-model의 `core/`는 FastAPI, SQLAlchemy import 금지
5. **DI 조립 위치** - NestJS는 `@Module providers`, FastAPI는 `module.py`의 `Depends` 체인
6. **에러 변환은 Inbound Adapter 책임** - Service는 도메인 에러만, HTTP 변환은 Controller/Router(Filter/except)에서
7. **Domain Types 자체 정의** - NestJS는 `core/domain/types/`, FastAPI는 `core/types.py`에 정의
8. **Mapper로 변환** - Drizzle ↔ Domain은 `adapters/outbound/db/{db}/mappers/`, SQLAlchemy ↔ Domain은 `adapters/outbound/db/mappers.py`에서

---

## 참고

- 상세 기술 문서: [clean-architecture-structure.md](./clean-architecture-structure.md)
- 요청 흐름: [request-flow.md](./request-flow.md)
