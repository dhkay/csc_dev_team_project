"""수집 커널 Inbound 포트."""

from __future__ import annotations

from typing import Protocol

from ...domain.entities import CollectionSnapshot, CollectionTarget


class CollectionInboundPort(Protocol):
    """캐시 조회 + lazy 재수집 등록. 소스 라우터가 이 포트만 쓴다."""

    async def get_latest(self, target: CollectionTarget) -> CollectionSnapshot: ...

    async def enqueue_refresh(self, target: CollectionTarget) -> None: ...
