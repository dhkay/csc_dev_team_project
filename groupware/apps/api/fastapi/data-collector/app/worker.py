"""arq Worker 엔트리포인트 (수집 컴퓨트).

기동: `arq app.worker.WorkerSettings` (compose command 오버라이드).
같은 이미지를 API(uvicorn) / Worker(arq) 두 모드로 기동한다.

소스 레지스트리는 여기(워커)에만 있다. 벤더 어댑터를 만드는 건 실제로 수집하는 프로세스뿐이다.
cron 이 조회된 활성 타깃을 주기적으로 재수집한다.
"""

from __future__ import annotations

import logging
from typing import Any

from arq import cron
from arq.connections import RedisSettings
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from .collection_sources import build_source_registry
from .config import get_settings
from .domains.collection.adapters.outbound.db.repository import CollectionRepository
from .domains.collection.adapters.outbound.queue.arq_queue import (
    LEGACY_WORKER_FUNCTION,
    WORKER_FUNCTION,
    ArqJobQueue,
)
from .domains.collection.core.application.services import CollectionRunService
from .domains.datalab.core.domain.types import SOURCE_ID as DATALAB_SOURCE_ID
from .source_catalog import get_source_catalog

logger = logging.getLogger(__name__)

_settings = get_settings()
# 워커는 며칠씩 살아 있고 잡은 드문드문 온다(크론 1시간 간격 + 조회 유발 refresh). 그 사이 풀 안의
#   커넥션이 죽으면(DB 재시작/장애조치/유휴 타임아웃) 다음 잡이 죽은 커넥션을 그대로 꺼내 쓰다 실패한다.
#   그 실패는 조용하다: mark_attempted 가 첫 쓰기라 "시도했음"조차 못 남기고, 소비자에겐 그 타깃이
#   계속 collecting 으로 보인다(다음 조회가 재수집을 걸어 회복되지만 그 사이 한 번은 헛돈다).
#   pre_ping 은 꺼내기 직전에 확인해 죽은 커넥션을 조용히 새것으로 바꾼다.
_engine = create_async_engine(
    _settings.database_url,
    pool_pre_ping=True,
    # 유휴 커넥션을 30분마다 교체(pgbouncer/클라우드 PG 의 idle timeout 이 먼저 끊는 것 대비).
    pool_recycle=1800,
)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False)


async def collect_source(ctx: dict[str, Any], payload: dict[str, Any]) -> None:
    """arq task(제네릭). enqueue 의 WORKER_FUNCTION 과 함수명이 일치해야 한다.

    페이로드는 source + params 뿐이다. 타깃 키는 플러그인이 다시 유도하므로 키 생성 규칙이
    한 곳에만 있고, 큐에 남은 구 페이로드가 낡은 키를 고정할 수 없다.
    """
    sources = ctx["sources"]
    target = sources.make_target(payload["source"], payload["params"])
    async with _session_factory() as session:
        service = CollectionRunService(
            sources=sources, repository=CollectionRepository(session)
        )
        try:
            await service.run(target)
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def crawl_datalab_keywords(ctx: dict[str, Any], payload: dict[str, Any]) -> None:
    """구 잡 이름 호환 shim.

    롤링 배포 창에서 구 API 가 넣은 {"cid","period"} 잡을 새 워커가 흡수한다. 이게 없으면 그
    잡들이 `function not found` 로 죽는다(레포에 같은 유형의 사고 기록이 있다).
    다음 릴리스에서 이 함수와 LEGACY_WORKER_FUNCTION, 관련 테스트 단언을 함께 삭제한다.
    """
    await collect_source(
        ctx,
        {
            "source": DATALAB_SOURCE_ID,
            "params": {"cid": payload["cid"], "period": payload["period"]},
        },
    )


async def refresh_active_targets(ctx: dict[str, Any]) -> None:
    """cron: 활성 타깃 재수집 enqueue.

    소스를 모른다. 저장된 params 를 그대로 되돌려 주기 때문에 소스가 늘어도 이 함수는 그대로다.
    enqueue 규칙은 ArqJobQueue 를 재사용한다. 여기서 함수명과 페이로드와 job-id 를 다시 쓰면
    두 벌이 되고 한쪽만 고쳤을 때 조용히 어긋난다.

    다만 모든 소스를 매시간 다시 모으지는 않는다. 쿼터가 좁은 소스(RefreshPolicy.auto=False)는
    여기서 빠지고 조회가 있을 때만 모인다. 그 판단은 카탈로그가 소스별로 답한다.
    """
    async with _session_factory() as session:
        targets = await CollectionRepository(session).list_active_targets(
            _settings.active_target_max_idle_days
        )
    queue = ArqJobQueue(ctx["redis"])
    sources = ctx["sources"]
    catalog = get_source_catalog()
    for target in targets:
        if not sources.supports(target.source):
            # 레지스트리에서 빠진 소스의 잔여 행. 잡을 넣으면 매시간 실패만 쌓인다.
            logger.warning("미등록 소스 타깃 건너뜀: %s / %s", target.source, target.target_key)
            continue
        if not catalog.is_auto_refresh(target.source):
            # 쿼터가 좁아 자동 재수집을 끈 소스. 조회가 오면 그때 TTL 을 보고 모은다.
            continue
        await queue.enqueue_refresh(target)


async def on_startup(ctx: dict[str, Any]) -> None:
    ctx["sources"] = build_source_registry(_settings)


async def on_shutdown(ctx: dict[str, Any]) -> None:
    sources = ctx.get("sources")
    if sources is not None:
        await sources.aclose()


class WorkerSettings:
    # WORKER_FUNCTION / LEGACY_WORKER_FUNCTION 과 이름이 일치해야 한다(테스트가 고정한다).
    functions = [collect_source, crawl_datalab_keywords]
    # 조회된 활성 타깃 재수집: 매시 정각(간격 넓게, 대상 사이트 부하 완화).
    cron_jobs = [cron(refresh_active_targets, minute=0, run_at_startup=False)]
    on_startup = on_startup
    on_shutdown = on_shutdown
    redis_settings = RedisSettings.from_dsn(_settings.redis_url)
    max_jobs = _settings.worker_max_jobs
    max_tries = 3
    job_timeout = 60 * 10
    # 잡 결과 미보존: job_id 는 큐/실행 중 중복만 차단하고, 완료 즉시 id 를 풀어
    # 다음 refresh(TTL 만료 시)가 재수집할 수 있게 한다.
    # (기본 keep_result=3600s 이면 TTL(30분)보다 오래 잡혀 재수집이 막힌다.)
    keep_result = 0


assert collect_source.__name__ == WORKER_FUNCTION
assert crawl_datalab_keywords.__name__ == LEGACY_WORKER_FUNCTION
