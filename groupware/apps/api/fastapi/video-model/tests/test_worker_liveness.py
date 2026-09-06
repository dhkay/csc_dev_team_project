"""워커 생사 신호: get_job 파생 필드(worker_alive) + 스위퍼의 '워커 없음' 경고.

워커가 없으면 잡이 조용히 무한 PENDING/PROCESSING 이 된다. 이를 (1) 조회 응답에 worker_alive 로
표출하고, (2) 스위퍼가 한 틱 안에 loud WARNING 으로 알린다. 이 계약을 고정한다.
"""

from __future__ import annotations

import logging

import pytest

from app.domains.video.adapters.outbound.checkpoint.redis_checkpoint import (
    NullSceneCheckpoint,
)
from app.domains.video.core.application.services import VideoJobService
from app.domains.video.core.domain.entities import VideoJob
from app.domains.video.core.domain.types import VideoJobStatus, VideoJobType


def _job(status: VideoJobStatus, job_type: VideoJobType = VideoJobType.TRANSCODE) -> VideoJob:
    return VideoJob(id="j", type=job_type, status=status)


class _Repo:
    def __init__(self, job: VideoJob | None = None, active: int = 0) -> None:
        self._job = job
        self._active = active
        self.saved: list[VideoJob] = []

    async def save(self, job: VideoJob) -> VideoJob:
        self.saved.append(job)
        return job

    async def find_by_id(self, job_id: str) -> VideoJob | None:
        return self._job

    async def find_stale(self, pending_before, processing_before) -> list[VideoJob]:  # noqa: ANN001
        return []

    async def count_active(self) -> int:
        return self._active


class _Queue:
    def __init__(self, worker_alive: bool = True) -> None:
        self._wa = worker_alive

    async def enqueue(self, job: VideoJob) -> None:
        pass

    async def requeue(self, job: VideoJob) -> None:
        pass

    async def is_alive(self, job_id: str) -> bool:
        return True

    async def worker_alive(self) -> bool:
        return self._wa


@pytest.mark.parametrize("status", [VideoJobStatus.PENDING, VideoJobStatus.PROCESSING])
async def test_get_job_fills_worker_alive_for_non_terminal(status: VideoJobStatus) -> None:
    # 비종료 잡 조회 시 큐 하트비트를 읽어 worker_alive 를 채운다.
    svc = VideoJobService(_Repo(_job(status)), _Queue(worker_alive=False), NullSceneCheckpoint())
    got = await svc.get_job("j")
    assert got is not None and got.worker_alive is False

    svc2 = VideoJobService(_Repo(_job(status)), _Queue(worker_alive=True), NullSceneCheckpoint())
    got2 = await svc2.get_job("j")
    assert got2 is not None and got2.worker_alive is True


@pytest.mark.parametrize("status", [VideoJobStatus.COMPLETED, VideoJobStatus.FAILED])
async def test_get_job_leaves_worker_alive_none_for_terminal(status: VideoJobStatus) -> None:
    # 종료 잡은 워커 생사가 무의미: None 그대로(큐를 건드리지 않는다).
    svc = VideoJobService(_Repo(_job(status)), _Queue(worker_alive=False), NullSceneCheckpoint())
    got = await svc.get_job("j")
    assert got is not None and got.worker_alive is None


async def test_sweeper_warns_when_worker_down_and_active_jobs(caplog) -> None:  # noqa: ANN001
    svc = VideoJobService(_Repo(active=3), _Queue(worker_alive=False), NullSceneCheckpoint())
    with caplog.at_level(logging.WARNING):
        await svc.reconcile_stale(300, 300)
    assert any("no arq worker consuming" in r.getMessage() for r in caplog.records)


async def test_sweeper_silent_when_worker_alive(caplog) -> None:  # noqa: ANN001
    svc = VideoJobService(_Repo(active=3), _Queue(worker_alive=True), NullSceneCheckpoint())
    with caplog.at_level(logging.WARNING):
        await svc.reconcile_stale(300, 300)
    assert not any("no arq worker consuming" in r.getMessage() for r in caplog.records)


async def test_sweeper_silent_when_no_active_jobs(caplog) -> None:  # noqa: ANN001
    # 워커가 없어도 밀린 잡이 없으면 조용하다(빈 큐에 경고 스팸 방지).
    svc = VideoJobService(_Repo(active=0), _Queue(worker_alive=False), NullSceneCheckpoint())
    with caplog.at_level(logging.WARNING):
        await svc.reconcile_stale(300, 300)
    assert not any("no arq worker consuming" in r.getMessage() for r in caplog.records)
