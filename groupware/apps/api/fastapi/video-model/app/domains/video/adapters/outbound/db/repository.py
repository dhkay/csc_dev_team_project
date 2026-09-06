"""Outbound Adapter: VideoJobRepositoryPort 구현 (SQLAlchemy 2.0, AsyncSession).

SQLAlchemy 는 이 계층에서만. Row ↔ Domain 변환은 mappers 로만.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.domain.entities import VideoJob
from ....core.domain.errors import DuplicateClientRequestError
from ....core.domain.types import VideoJobStatus
from . import mappers
from .models import VideoJobModel


class VideoJobRepository:
    """VideoJobRepositoryPort(Protocol) 의 구현."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, job: VideoJob) -> VideoJob:
        # merge = upsert (생성, 콜백 갱신 양쪽 처리). video_jobs 유일 라이터.
        try:
            await self._session.merge(mappers.to_model(job))
            await self._session.flush()
        except IntegrityError as exc:
            # 멱등키 부분 유니크 위반만 도메인 예외로 번역한다(다른 무결성 위반은 그대로 올린다).
            #   core 가 드라이버 예외를 잡으면 ORM 을 알게 되므로 번역은 여기서 한다.
            if job.client_request_id and "client_request" in str(exc.orig):
                raise DuplicateClientRequestError(job.client_request_id) from exc
            raise
        return job

    async def find_by_id(self, job_id: str) -> VideoJob | None:
        row = await self._session.get(VideoJobModel, job_id)
        return mappers.to_domain(row) if row is not None else None

    async def find_by_client_request_id(self, key: str) -> VideoJob | None:
        # 부분 유니크와 같은 열로 찾는다(그 인덱스를 그대로 쓴다).
        stmt = select(VideoJobModel).where(VideoJobModel.client_request_id == key).limit(1)
        row = (await self._session.scalars(stmt)).first()
        return mappers.to_domain(row) if row is not None else None

    async def find_stale(
        self,
        pending_before: datetime,
        processing_before: datetime,
    ) -> list[VideoJob]:
        stmt = select(VideoJobModel).where(
            or_(
                and_(
                    VideoJobModel.status == VideoJobStatus.PENDING.value,
                    VideoJobModel.updated_at < pending_before,
                ),
                and_(
                    VideoJobModel.status == VideoJobStatus.PROCESSING.value,
                    VideoJobModel.updated_at < processing_before,
                ),
            )
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [mappers.to_domain(r) for r in rows]

    async def count_active(self) -> int:
        stmt = select(func.count()).select_from(VideoJobModel).where(
            VideoJobModel.status.in_(
                (VideoJobStatus.PENDING.value, VideoJobStatus.PROCESSING.value)
            )
        )
        return int((await self._session.execute(stmt)).scalar_one())
