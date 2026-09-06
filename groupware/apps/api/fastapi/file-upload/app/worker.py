"""arq Worker 엔트리포인트 (자산 수거).

기동: `arq app.worker.WorkerSettings` (compose command 오버라이드).
같은 이미지를 API(uvicorn) / Worker(arq) 두 모드로 기동한다(data-collector 와 같은 형태).

하는 일은 하나다: 확정되지 않은 오래된 자산을 거둔다. 이 서비스는 큐로 받는 잡이 없다.
크론만 있고 enqueue 하는 쪽이 없으므로 API 컨테이너는 redis 에 붙지 않는다.

왜 이 워커가 필요한가: 자산을 참조할 행을 만드는 쪽(소비 서비스)이 확정(confirm)까지 함께 하도록
바꿨다. 그래서 그 쓰기가 실패하면 자산이 PENDING 으로 남는다. presign 만 받고 끝난 업로드도 같다.
둘 다 시간이 지나면 쓰이지 않으므로 한 메커니즘이 거둔다.
계약과 근거: docs/specs/marketing-write-consistency.md
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from arq import cron
from arq.connections import RedisSettings
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from .config import get_settings
from .container import _build_archive, _build_storage
from .domains.upload.module import build_upload_service

logger = logging.getLogger(__name__)

_settings = get_settings()
# 워커는 며칠씩 살아 있고 잡은 하루 한 번이다. 그 사이 풀 안의 커넥션이 죽으면(DB 재시작/유휴
#   타임아웃) 다음 잡이 죽은 커넥션을 꺼내 쓰다 실패한다. pre_ping 이 꺼내기 직전에 확인해 바꾼다.
#   증상은 `InterfaceError: connection is closed` 다.
_engine = create_async_engine(
    _settings.database_url,
    pool_pre_ping=True,
    pool_recycle=1800,
)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False)
_storage = _build_storage(_settings)
_archive = _build_archive(_settings)


async def reap_pending(_ctx: dict[str, Any]) -> None:
    """오래된 PENDING 자산 수거(크론). 남은 후보가 있으면 이어서 거둔다.

    한 번에 batch_limit 까지만 거두는 이유는 큰 백로그가 한 트랜잭션을 길게 잡지 않게 하는 것이다.
    그래서 has_more 가 참이면 같은 잡 안에서 이어 돈다(다음 크론까지 기다리면 백로그가 줄지 않는다).
    무한 루프를 막는 상한을 둔다: 그 이상은 다음 크론이 이어받는다.
    """
    max_rounds = 20
    total = 0
    for _ in range(max_rounds):
        async with _session_factory() as session:
            service = build_upload_service(
                session,
                _storage,
                _archive,
                _settings.max_upload_size,
                _settings.require_signed_download,
            )
            result = await service.reap_pending_assets(
                timedelta(hours=_settings.pending_reap_after_hours),
                _settings.pending_reap_batch_limit,
            )
            await session.commit()
        total += result.deleted
        if not result.has_more:
            break
    else:
        logger.warning(
            "수거 상한(%d 회)에 도달했습니다. 남은 후보는 다음 크론이 이어받습니다(누적 %d건).",
            max_rounds,
            total,
        )
    if total > 0:
        logger.info("확정되지 않은 오래된 자산 %d건을 거뒀습니다.", total)


class WorkerSettings:
    functions: list = []  # 큐로 받는 잡은 없다(크론 전용).
    # 매일 03:00 한 번. 자주 돌 이유가 없다: TTL 이 24시간이라 그보다 잦게 돌아도 거둘 것이 늘지 않는다.
    cron_jobs = [cron(reap_pending, hour={3}, minute=0, run_at_startup=False)]
    redis_settings = RedisSettings.from_dsn(_settings.redis_url)
    max_jobs = _settings.worker_max_jobs
    # 수거는 멱등이라 재시도가 안전하다(이미 지운 것은 조회에 안 잡힌다).
    max_tries = 3
    job_timeout = 60 * 30
    # 잡 결과를 보관하지 않는다: 이 잡의 결과를 읽는 소비자가 없다(로그가 기록이다).
    keep_result = 0
