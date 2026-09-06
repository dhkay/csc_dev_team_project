"""DI 조립: Depends provider 정의.

AsyncSession 팩토리(async_sessionmaker), 도메인 서비스 provider, arq 큐 풀(싱글톤)을
한곳에서 조립한다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from arq.connections import ArqRedis
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .config import get_settings
from .domains.video.adapters.outbound.checkpoint.redis_checkpoint import (
    NullSceneCheckpoint,
    RedisSceneCheckpoint,
)
from .domains.video.adapters.outbound.db.repository import VideoJobRepository
from .domains.video.adapters.outbound.queue.arq_queue import (
    ArqJobQueue,
    create_arq_pool,
)
from .domains.video.core.application.ports.inbound import VideoJobInboundPort
from .domains.video.core.application.services import VideoJobService
from .domains.video.module import build_video_job_service

# DB 가 재시작하거나(배포/점검) 유휴 커넥션이 끊기면(pgbouncer/클라우드 PG idle timeout) 풀에 남은
#   커넥션은 죽어 있다. pre_ping 이 없으면 그걸 검사 없이 꺼내 써서 그 요청이 500 으로 죽는다.
#   증상은 `InterfaceError: connection is closed` 다.
_engine = create_async_engine(
    get_settings().database_url,
    pool_pre_ping=True,
    pool_recycle=1800,
)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False)

_arq_pool: ArqRedis | None = None


async def get_session() -> AsyncIterator[AsyncSession]:
    async with _session_factory() as session:
        try:
            yield session
            await session.commit()  # 요청 성공 시 커밋(쓰기 영속화)
        except Exception:
            await session.rollback()
            raise


async def get_arq_pool() -> ArqRedis:
    global _arq_pool
    if _arq_pool is None:
        _arq_pool = await create_arq_pool(get_settings().redis_url)
    return _arq_pool


async def provide_video_job_service(
    session: AsyncSession,
    pool: ArqRedis,
) -> VideoJobInboundPort:
    # API 조회 경로는 진행률(%) 계산을 위해 씬 체크포인트(redis)를 읽는다.
    checkpoint = RedisSceneCheckpoint(get_settings().redis_url)
    return build_video_job_service(session, pool, checkpoint)


async def run_video_reconcile_once() -> int:
    """스위퍼 1틱: 자체 세션으로 stale job 복구(콜백 유실 대비)."""
    settings = get_settings()
    pool = await get_arq_pool()
    async with _session_factory() as session:
        # 스위퍼는 진행률을 안 쓰므로 Null 체크포인트로 충분(불필요한 redis 연결 회피).
        service = VideoJobService(
            VideoJobRepository(session), ArqJobQueue(pool), NullSceneCheckpoint()
        )
        count = await service.reconcile_stale(
            settings.video_pending_timeout_s,
            settings.video_processing_timeout_s,
        )
        await session.commit()
        return count
