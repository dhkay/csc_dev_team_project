"""CollectionRepositoryPort 구현 (SQLAlchemy 2.0 async)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.domain.entities import CollectionTarget, StoredSnapshot
from .models import CollectionRecordModel

_PK = ["source", "target_key"]


class CollectionRepository:
    """CollectionRepositoryPort 구현: (source, target_key) 키."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, target: CollectionTarget) -> StoredSnapshot | None:
        model = await self._session.get(
            CollectionRecordModel, (target.source, target.target_key)
        )
        if model is None:
            return None
        return StoredSnapshot(
            items=model.items,
            collected_at=model.collected_at,
            last_attempted_at=model.last_attempted_at,
        )

    async def upsert(
        self,
        target: CollectionTarget,
        items: list[dict[str, Any]],
        collected_at: datetime,
    ) -> None:
        now = datetime.now(timezone.utc)
        stmt = (
            pg_insert(CollectionRecordModel)
            .values(
                source=target.source,
                target_key=target.target_key,
                params=dict(target.params),
                items=items,
                collected_at=collected_at,
                last_attempted_at=collected_at,
                last_requested_at=now,
            )
            .on_conflict_do_update(
                index_elements=_PK,
                # params 도 갱신한다: 같은 키의 재수집 파라미터가 바뀔 수 있다(상대 표현이라도
                #   표기가 정규화되는 경우). last_requested_at 은 건드리지 않는다(조회 이력이지 수집 이력이 아니다).
                set_={
                    "params": dict(target.params),
                    "items": items,
                    "collected_at": collected_at,
                    "last_attempted_at": collected_at,
                },
            )
        )
        await self._session.execute(stmt)

    async def mark_attempted(
        self, target: CollectionTarget, attempted_at: datetime
    ) -> None:
        stmt = (
            pg_insert(CollectionRecordModel)
            .values(
                source=target.source,
                target_key=target.target_key,
                params=dict(target.params),
                last_attempted_at=attempted_at,
                last_requested_at=attempted_at,
            )
            .on_conflict_do_update(
                index_elements=_PK, set_={"last_attempted_at": attempted_at}
            )
        )
        await self._session.execute(stmt)

    async def touch_requested(self, target: CollectionTarget) -> None:
        now = datetime.now(timezone.utc)
        stmt = (
            pg_insert(CollectionRecordModel)
            .values(
                source=target.source,
                target_key=target.target_key,
                params=dict(target.params),
                last_requested_at=now,
            )
            .on_conflict_do_update(index_elements=_PK, set_={"last_requested_at": now})
        )
        await self._session.execute(stmt)

    async def list_active_targets(self, max_idle_days: int) -> list[CollectionTarget]:
        cutoff = datetime.now(timezone.utc) - timedelta(days=max_idle_days)
        rows = await self._session.scalars(
            select(CollectionRecordModel).where(
                CollectionRecordModel.last_requested_at >= cutoff
            )
        )
        return [
            CollectionTarget(
                source=m.source, target_key=m.target_key, params=m.params or {}
            )
            for m in rows.all()
        ]
