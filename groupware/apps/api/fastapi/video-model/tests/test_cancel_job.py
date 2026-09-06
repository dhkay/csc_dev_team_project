"""렌더 취소 잠금: 프로젝트 삭제가 진행 중 렌더를 실제로 멈추는지.

이 파일이 지키는 것: 취소가 없으면 사라진 프로젝트의 렌더가 끝까지 돌아 벤더 요금만 나가고
원장에도 남지 않는다(dev 실측: 삭제된 프로젝트의 xAI 15초가 그렇게 청구됐다).

특히 순서를 못박는다. 상태를 먼저 CANCELED 로 확정해야 취소와 경합한 워커 콜백이 단조 전이
보호에 걸려 무시된다. 순서가 뒤집히면 취소한 잡이 되살아난다.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.domains.video.adapters.outbound.checkpoint.redis_checkpoint import (
    NullSceneCheckpoint,
)
from app.domains.video.core.application.services import VideoJobService
from app.domains.video.core.domain.entities import VideoJob
from app.domains.video.core.domain.types import VideoJobStatus, VideoJobType


def _job(status: VideoJobStatus, job_id: str = "j1") -> VideoJob:
    now = datetime.now(timezone.utc)
    return VideoJob(
        id=job_id,
        type=VideoJobType.COMPOSE,
        status=status,
        attempts=0,
        created_at=now,
        updated_at=now,
    )


class _Repo:
    def __init__(self, jobs: list[VideoJob]) -> None:
        self._jobs = jobs
        self.saved: list[VideoJob] = []

    async def find_by_id(self, job_id: str) -> VideoJob | None:
        return next((j for j in self._jobs if j.id == job_id), None)

    async def save(self, job: VideoJob) -> VideoJob:
        self.saved.append(job)
        return job


class _Queue:
    def __init__(self) -> None:
        self.aborted: list[str] = []

    async def abort(self, job_id: str) -> None:
        self.aborted.append(job_id)

    async def worker_alive(self) -> bool:
        return True


class _Checkpoint(NullSceneCheckpoint):
    def __init__(self) -> None:
        self.cleared: list[str] = []

    async def clear(self, job_id: str) -> None:
        self.cleared.append(job_id)


def _svc(repo: _Repo, queue: _Queue, ckpt: _Checkpoint) -> VideoJobService:
    return VideoJobService(repo, queue, ckpt)


async def test_진행_중_잡은_취소되고_큐도_중단된다() -> None:
    job = _job(VideoJobStatus.PROCESSING)
    repo, queue, ckpt = _Repo([job]), _Queue(), _Checkpoint()

    result = await _svc(repo, queue, ckpt).cancel_job("j1")

    assert result is not None and result.status is VideoJobStatus.CANCELED
    assert queue.aborted == ["j1"], "큐에 중단을 요청하지 않으면 렌더가 계속 돌아 요금이 나간다"
    assert ckpt.cleared == ["j1"], "취소는 재개 대상이 아니다. 체크포인트를 남기면 오해/누수가 된다"
    assert repo.saved and repo.saved[0].status is VideoJobStatus.CANCELED


async def test_상태_확정이_큐_중단보다_먼저다() -> None:
    """저장이 abort 보다 먼저 일어나야 한다. 경합한 콜백이 취소를 덮지 못하게 하는 순서."""
    order: list[str] = []

    class _OrderRepo(_Repo):
        async def save(self, job: VideoJob) -> VideoJob:
            order.append("save")
            return await super().save(job)

    class _OrderQueue(_Queue):
        async def abort(self, job_id: str) -> None:
            order.append("abort")
            await super().abort(job_id)

    job = _job(VideoJobStatus.PROCESSING)
    await _svc(_OrderRepo([job]), _OrderQueue(), _Checkpoint()).cancel_job("j1")

    assert order == ["save", "abort"]


async def test_대기_중_잡도_취소된다() -> None:
    job = _job(VideoJobStatus.PENDING)
    repo, queue, ckpt = _Repo([job]), _Queue(), _Checkpoint()

    result = await _svc(repo, queue, ckpt).cancel_job("j1")

    assert result is not None and result.status is VideoJobStatus.CANCELED
    assert queue.aborted == ["j1"]


async def test_이미_완료된_잡은_되돌리지_않는다() -> None:
    """취소는 결과를 지우는 기능이 아니다. 완료된 렌더를 CANCELED 로 덮으면 결과물이 유령이 된다."""
    job = _job(VideoJobStatus.COMPLETED)
    repo, queue, ckpt = _Repo([job]), _Queue(), _Checkpoint()

    result = await _svc(repo, queue, ckpt).cancel_job("j1")

    assert result is not None and result.status is VideoJobStatus.COMPLETED
    assert repo.saved == [] and queue.aborted == []


async def test_취소_반복은_멱등이다() -> None:
    job = _job(VideoJobStatus.CANCELED)
    repo, queue, ckpt = _Repo([job]), _Queue(), _Checkpoint()

    result = await _svc(repo, queue, ckpt).cancel_job("j1")

    assert result is not None and result.status is VideoJobStatus.CANCELED
    assert repo.saved == [] and queue.aborted == []


async def test_없는_잡은_None() -> None:
    repo, queue, ckpt = _Repo([]), _Queue(), _Checkpoint()
    assert await _svc(repo, queue, ckpt).cancel_job("nope") is None


async def test_취소된_잡에_온_워커_콜백은_무시된다() -> None:
    """취소와 경합한 콜백이 잡을 되살리지 못해야 한다(단조 전이 보호에 CANCELED 포함)."""
    job = _job(VideoJobStatus.CANCELED)
    repo, queue, ckpt = _Repo([job]), _Queue(), _Checkpoint()

    result = await _svc(repo, queue, ckpt).apply_callback(
        "j1", VideoJobStatus.COMPLETED, result_file_id="late-result"
    )

    assert result.status is VideoJobStatus.CANCELED
    assert result.result_file_id is None, "취소된 잡에 결과가 붙으면 사라진 프로젝트의 산출물이 남는다"
    assert repo.saved == []
