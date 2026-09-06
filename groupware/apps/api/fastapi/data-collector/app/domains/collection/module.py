"""수집 커널 DI 와이어링."""

from __future__ import annotations

from arq.connections import ArqRedis
from sqlalchemy.ext.asyncio import AsyncSession

from .adapters.outbound.db.repository import CollectionRepository
from .adapters.outbound.queue.arq_queue import ArqJobQueue
from .core.application.ports.inbound import CollectionInboundPort
from .core.application.ports.outbound import FreshnessPolicyPort
from .core.application.services import CollectionQueryService

__all__ = ["build_collection_query_service", "CollectionInboundPort"]


def build_collection_query_service(
    session: AsyncSession, pool: ArqRedis, freshness: FreshnessPolicyPort
) -> CollectionInboundPort:
    return CollectionQueryService(
        repository=CollectionRepository(session),
        queue=ArqJobQueue(pool),
        freshness=freshness,
    )
