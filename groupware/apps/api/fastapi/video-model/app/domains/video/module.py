"""도메인 DI wiring: Port -> 구현 바인딩 (video).

API 측: Repository + arq 큐 -> VideoJobService 조립.
worker 측 조립은 app/worker.py 가 담당(무상태 컴퓨트, 별도 프로세스).
"""

from __future__ import annotations

from arq.connections import ArqRedis
from sqlalchemy.ext.asyncio import AsyncSession

from .core.application.ports.outbound import SceneCheckpointPort
from .adapters.inbound.http.router import pipeline_router, router
from .adapters.outbound.db.repository import VideoJobRepository
from .adapters.outbound.queue.arq_queue import ArqJobQueue
from .core.application.ports.inbound import VideoJobInboundPort
from .core.application.services import VideoJobService

__all__ = ["router", "pipeline_router", "build_video_job_service"]


def build_video_job_service(
    session: AsyncSession,
    pool: ArqRedis,
    checkpoint: SceneCheckpointPort,
) -> VideoJobInboundPort:
    """Outbound(Repository + arq Queue + 진행률용 씬 체크포인트) -> Service 조립.

    체크포인트 종류(진행률용 Redis / 스위퍼용 Null)는 composition root(container/worker)가 정해 주입한다.
    """
    repository = VideoJobRepository(session)
    queue = ArqJobQueue(pool)
    return VideoJobService(repository, queue, checkpoint)
