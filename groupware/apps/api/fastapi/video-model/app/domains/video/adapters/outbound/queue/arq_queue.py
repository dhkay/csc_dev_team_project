"""JobQueuePort 구현: arq Redis 큐 (작업 전달 전용, 상태 보관 안 함).

worker 의 함수명(WORKER_FUNCTION)으로 enqueue 한다. `_job_id=job.id` 로 같은 작업의
중복 enqueue 를 차단한다(멱등).
"""

from __future__ import annotations

import logging

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings
from arq.constants import (
    default_queue_name,
    health_check_key_suffix,
    job_key_prefix,
    result_key_prefix,
)
from arq.jobs import Job, JobStatus

from ....core.domain.entities import VideoJob

WORKER_FUNCTION = "process_video_job"

# 아직 결과가 나오지 않은 = 살아 있는 상태. complete/not_found 는 큐를 떠났다는 뜻.
_ALIVE = (JobStatus.deferred, JobStatus.queued, JobStatus.in_progress)


_logger = logging.getLogger(__name__)


async def create_arq_pool(redis_url: str) -> ArqRedis:
    return await create_pool(RedisSettings.from_dsn(redis_url))


class ArqJobQueue:
    """JobQueuePort(Protocol) 구현."""

    def __init__(self, pool: ArqRedis) -> None:
        self._pool = pool

    async def enqueue(self, job: VideoJob) -> None:
        await self._pool.enqueue_job(
            WORKER_FUNCTION,
            {
                "job_id": job.id,
                "type": job.type.value,
                "params": job.params,
                "source_file_id": job.source_file_id,
            },
            _job_id=job.id,
        )

    async def requeue(self, job: VideoJob) -> None:
        # arq 가 이 id 를 '완료'로 기억하면 재enqueue 가 무시된다 → 결과/잡 키를 지워 재실행 가능하게 한 뒤 enqueue.
        #   video_jobs 상태(SSoT)는 서비스가 따로 관리하므로 arq 기록만 지운다.
        await self._pool.delete(result_key_prefix + job.id, job_key_prefix + job.id)
        await self.enqueue(job)

    async def abort(self, job_id: str) -> None:
        """arq 에 중단을 요청한다. 대기 중이면 큐에서 빠지고, 실행 중이면 워커가 취소된다.

        `WorkerSettings.allow_abort_jobs = True` 가 있어야 실행 중 잡이 실제로 취소된다.
        실패는 삼킨다(best-effort): 취소 신호가 못 갔더라도 상태는 서비스가 CANCELED 로 확정하므로
        스위퍼가 되살리지 않고, 렌더는 최대 한 번 더 헛돌 뿐 잘못된 상태를 만들지 않는다.
        """
        try:
            await Job(job_id, self._pool).abort(timeout=0)
        except Exception:  # noqa: BLE001 - 이미 끝났거나 redis 일시 장애. 취소는 best-effort.
            _logger.warning("렌더 잡 중단 요청 실패(job=%s): 상태는 CANCELED 로 확정됨", job_id)

    async def is_alive(self, job_id: str) -> bool:
        """arq 에 이 작업이 아직 있는가: enqueue 시 `_job_id=job.id` 라 우리 id 로 그대로 조회된다.

        조회 실패(redis 장애 등)는 살아 있다로 본다: 확인 못 했다는 이유로 멀쩡한 작업을
        되돌릴 수 없게 실패시키는 것보다, 한 틱 더 기다리는 쪽이 안전하다(다음 틱에 다시 본다).
        """
        try:
            status = await Job(job_id, self._pool).status()
        except Exception:  # noqa: BLE001 - redis 일시 장애 등. 판단 보류가 안전한 쪽.
            return True
        return status in _ALIVE

    async def worker_alive(self) -> bool:
        """arq 워커 하트비트 키(`arq:queue:health-check`) 존재 여부로 워커 생사를 본다.

        워커는 health_check_interval 마다 이 키를 TTL(주기+1s)로 갱신하므로, 키가 있으면 최근에
        살아있던 워커가 있다는 뜻이다. redis 조회 실패는 살아있다로 본다(is_alive 와 같은 안전쪽
        확인 못 했다고 멀쩡한 렌더를 STALLED 로 몰지 않는다).
        """
        key = default_queue_name + health_check_key_suffix
        try:
            return bool(await self._pool.exists(key))
        except Exception:  # noqa: BLE001 - redis 일시 장애 등. 판단 보류가 안전한 쪽.
            return True
