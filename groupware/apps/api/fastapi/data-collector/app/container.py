"""DI 조립: Depends provider 정의 (API 측).

AsyncSession 팩토리 + arq 풀 + 수집 커널 조회 서비스 + 카탈로그 + /lab 프로브 서비스.
소스 레지스트리(벤더 어댑터)는 여기 없다. 조회와 enqueue 에 벤더 지식이 필요 없으므로,
API 컨테이너는 어떤 벤더 클라이언트도 만들지 않는다. 실제 수집 조립은 app/worker.py 가 한다.
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
from .domains.catalog.core.application.ports.inbound import SourceCatalogPort
from .domains.collection.adapters.outbound.queue.arq_queue import create_arq_pool
from .domains.collection.core.application.ports.inbound import CollectionInboundPort
from .domains.collection.module import build_collection_query_service
from .domains.lab.core.application.ports.inbound import LabProbePort
from .domains.lab.module import build_lab_probe_service
from .source_catalog import get_source_catalog

_settings = get_settings()
# 워커와 같은 이유로 pre_ping/recycle 을 켠다(app/worker.py 주석 참고). API 는 요청 주도라 유휴가
#   더 짧지만, DB 재시작 직후 첫 요청이 죽은 커넥션을 잡아 500 이 나는 건 똑같다.
_engine = create_async_engine(
    _settings.database_url,
    pool_pre_ping=True,
    pool_recycle=1800,
)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False)
_pool: ArqRedis | None = None

# /lab 은 요청마다 조립하지 않는다: httpx 커넥션 풀을 재사용해야 하므로 프로세스 수명 싱글톤이다.
_lab_service: LabProbePort | None = None


async def init_pool() -> None:
    global _pool
    if _pool is None:
        _pool = await create_arq_pool(_settings.redis_url)


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def get_session() -> AsyncIterator[AsyncSession]:
    # 요청 단위 트랜잭션: 정상 종료 시 commit(레포지토리 upsert/touch 반영), 예외 시 rollback.
    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def provide_collection_service(session: AsyncSession) -> CollectionInboundPort:
    assert _pool is not None, "arq pool 미초기화 (lifespan init_pool 확인)"
    # 신선도 정책은 카탈로그가 소스별로 답한다(전역 TTL 상수를 두지 않는다: 쿼터가 소스마다 다르다).
    return build_collection_query_service(session, _pool, get_source_catalog())


def provide_source_catalog() -> SourceCatalogPort:
    return get_source_catalog()


def provide_lab_probe_service() -> LabProbePort:
    global _lab_service
    if _lab_service is None:
        _lab_service = build_lab_probe_service(_settings)
    return _lab_service


async def close_lab_clients() -> None:
    """httpx 풀 정리. 부모 앱 lifespan 에서 호출해야 한다(마운트된 서브앱의 lifespan 은 안 돈다)."""
    global _lab_service
    if _lab_service is not None:
        await _lab_service.aclose()
        _lab_service = None
