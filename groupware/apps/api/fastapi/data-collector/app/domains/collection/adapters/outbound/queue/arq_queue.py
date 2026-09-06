"""JobQueuePort 구현 (arq) + 잡 이름/식별 규칙의 단일 출처.

enqueue 규칙을 여기 밖에서 다시 쓰지 않는다. 크론이 함수명과 페이로드와 job-id 를 손으로
재작성하면 두 벌이 되고, 한쪽만 고쳤을 때 조용히 어긋난다.
"""

from __future__ import annotations

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from ....core.domain.entities import CollectionTarget

# 워커의 코루틴 이름과 반드시 일치해야 한다(불일치 = 잡이 function not found 로 죽는다).
WORKER_FUNCTION = "collect_source"
# 구 이름. 롤링 배포 창에서 구 API 가 넣은 잡을 새 워커가 흡수하기 위해 한 릴리스 동안 유지한다.
LEGACY_WORKER_FUNCTION = "crawl_datalab_keywords"


async def create_arq_pool(redis_url: str) -> ArqRedis:
    return await create_pool(RedisSettings.from_dsn(redis_url))


def job_id(target: CollectionTarget) -> str:
    """같은 타깃의 중복 잡을 막는 키."""
    return f"collect:{target.source}:{target.target_key}"


class ArqJobQueue:
    """JobQueuePort 구현."""

    def __init__(self, pool: ArqRedis) -> None:
        self._pool = pool

    async def enqueue_refresh(self, target: CollectionTarget) -> None:
        # 페이로드에 target_key 를 넣지 않는다: 워커가 make_target(params) 로 다시 유도하므로
        #   키 생성 규칙이 한 곳에만 있고, 큐에 남은 구 페이로드가 낡은 키를 고정할 수 없다.
        await self._pool.enqueue_job(
            WORKER_FUNCTION,
            {"source": target.source, "params": dict(target.params)},
            _job_id=job_id(target),
        )
