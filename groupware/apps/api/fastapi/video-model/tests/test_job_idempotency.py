"""잡 등록 멱등: 같은 호출자 키로 다시 오면 유료 잡을 두 번 만들지 않는다.

이 파일이 지키는 것은 이중 과금이다. 호출자(csc-marketing 사가)는 벤더 호출과 자기 진행 기록
사이에서 죽을 수 있고(폭은 DB 쓰기 한 번), 그때 재실행이 그 단계를 한 번 더 돌린다. 호출자 쪽에서는
이것을 닫을 수 없다: 이미 만들어진 잡을 알아보는 일은 잡을 만든 쪽만 할 수 있다.

접지 않으면 요금이 두 번 나가고, 나중에 붙은 잡만 폴링되므로 먼저 만든 잡은 아무도 보지 않는 고아가
된다(그 상태로 완료돼도 원장에 남지 않는다).
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.domains.video.adapters.outbound.checkpoint.redis_checkpoint import (
    NullSceneCheckpoint,
)
from app.domains.video.core.application.services import VideoJobService
from app.domains.video.core.domain.entities import VideoJob
from app.domains.video.core.domain.errors import DuplicateClientRequestError
from app.domains.video.core.domain.types import VideoJobStatus, VideoJobType


class _Repo:
    """멱등키 부분 유니크를 흉내내는 인메모리 저장소."""

    def __init__(self) -> None:
        self.rows: list[VideoJob] = []
        self.save_calls = 0

    async def save(self, job: VideoJob) -> VideoJob:
        self.save_calls += 1
        if job.client_request_id and any(
            r.client_request_id == job.client_request_id and r.id != job.id
            for r in self.rows
        ):
            # DB 의 부분 유니크가 하는 일: 저장소 어댑터가 이 도메인 예외로 번역한다.
            raise DuplicateClientRequestError(job.client_request_id)
        self.rows = [r for r in self.rows if r.id != job.id] + [job]
        return job

    async def find_by_id(self, job_id: str) -> VideoJob | None:
        return next((r for r in self.rows if r.id == job_id), None)

    async def find_by_client_request_id(self, key: str) -> VideoJob | None:
        return next((r for r in self.rows if r.client_request_id == key), None)


class _Queue:
    def __init__(self) -> None:
        self.enqueued: list[str] = []

    async def enqueue(self, job: VideoJob) -> None:
        self.enqueued.append(job.id)


def _service(repo: _Repo, queue: _Queue) -> VideoJobService:
    return VideoJobService(
        repository=repo, queue=queue, checkpoint=NullSceneCheckpoint()
    )


@pytest.mark.asyncio
async def test_same_key_returns_the_first_job():
    """같은 키로 다시 요청하면 먼저 만든 잡을 그대로 돌려준다(큐에도 다시 넣지 않는다)."""
    repo, queue = _Repo(), _Queue()
    service = _service(repo, queue)

    first = await service.create_job(
        VideoJobType.COMPOSE, {}, None, "csc-marketing:saga:12:1"
    )
    second = await service.create_job(
        VideoJobType.COMPOSE, {}, None, "csc-marketing:saga:12:1"
    )

    assert second.id == first.id
    assert len(repo.rows) == 1
    # 워커가 이미 그 잡을 들고 있다: 다시 넣으면 같은 렌더가 두 번 돈다.
    assert queue.enqueued == [first.id]


@pytest.mark.asyncio
async def test_concurrent_conflict_folds_into_the_winner():
    """사전 조회를 통과한 두 요청이 동시에 등록해도, 진 쪽은 이긴 잡을 받는다."""
    repo, queue = _Repo(), _Queue()
    service = _service(repo, queue)
    key = "csc-marketing:saga:12:1"

    # 다른 요청이 먼저 등록을 끝낸 상태를 만든다(사전 조회를 이미 통과한 뒤).
    now = datetime.now(timezone.utc)
    winner = VideoJob(
        id="winner",
        type=VideoJobType.COMPOSE,
        status=VideoJobStatus.PENDING,
        attempts=0,
        created_at=now,
        updated_at=now,
        client_request_id=key,
    )
    original_find = repo.find_by_client_request_id
    calls = {"n": 0}

    async def find_after_first_miss(k: str):
        # 첫 조회는 못 찾고(경합), INSERT 가 유니크에 걸린 뒤의 재조회는 찾는다.
        calls["n"] += 1
        if calls["n"] == 1:
            return None
        repo.rows.append(winner)
        return await original_find(k)

    repo.find_by_client_request_id = find_after_first_miss  # type: ignore[assignment]
    repo.rows.append(winner)

    result = await service.create_job(VideoJobType.COMPOSE, {}, None, key)

    # 실패로 올리면 호출자에겐 실패로 보이는데 잡은 이미 돌고 있다. 그 어긋남이 다시 호출하게 만든다.
    assert result.id == "winner"
    assert queue.enqueued == []


@pytest.mark.asyncio
async def test_no_key_creates_every_time():
    """키가 없으면 매번 새 잡이다(키를 쓰지 않는 호출자를 막지 않는다)."""
    repo, queue = _Repo(), _Queue()
    service = _service(repo, queue)

    a = await service.create_job(VideoJobType.COMPOSE, {}, None, None)
    b = await service.create_job(VideoJobType.COMPOSE, {}, None, None)

    assert a.id != b.id
    assert len(repo.rows) == 2
    assert len(queue.enqueued) == 2


@pytest.mark.asyncio
async def test_key_is_persisted_on_the_job():
    """키를 잡에 남긴다: 남기지 않으면 다음 요청이 무엇과 같은지 알 수 없다."""
    repo, queue = _Repo(), _Queue()
    service = _service(repo, queue)

    job = await service.create_job(VideoJobType.COMPOSE, {}, None, "k-1")

    assert job.client_request_id == "k-1"
    assert repo.rows[0].client_request_id == "k-1"