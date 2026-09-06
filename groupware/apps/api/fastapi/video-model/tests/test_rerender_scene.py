"""씬 하나만 다시 만들기: 재과금이 그 씬 하나에 그치는지.

이 파일이 지키는 것은 비용이다. 완료된 잡은 체크포인트가 지워진 뒤라, 그대로 다시 태우면 워커가
이어서 할 근거를 못 찾아 전 씬을 다시 만들고 전액 재과금된다. 그래서 저장된 씬 결과로 체크포인트를
되살린 다음 대상 씬 하나만 버린다. 아래 테스트가 그 두 동작을 각각 못박는다.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest

from app.domains.video.core.application.services import VideoJobService
from app.domains.video.core.domain.entities import VideoJob
from app.domains.video.core.domain.types import (
    SceneState,
    VideoJobStatus,
    VideoJobType,
)


def _job(
    *,
    type: VideoJobType = VideoJobType.COMPOSE,
    status: VideoJobStatus = VideoJobStatus.COMPLETED,
) -> VideoJob:
    now = datetime.now(timezone.utc)
    return VideoJob(
        id="j1",
        type=type,
        status=status,
        params={
            "scenes": [
                {"order": 1, "visual_prompt": "묘사 1"},
                {"order": 2, "visual_prompt": "묘사 2"},
                {"order": 3, "visual_prompt": "묘사 3"},
            ]
        },
        result_file_id="final-video",
        captions_file_id="captions",
        attempts=4,
        scene_states=[
            SceneState(order=1, clip_file_id="clip-1", billed_seconds=5, duration_sec=4.0),
            SceneState(order=2, clip_file_id="clip-2", billed_seconds=6, duration_sec=5.0),
            SceneState(order=3, clip_file_id="clip-3", billed_seconds=7, duration_sec=6.0),
        ],
        created_at=now,
        updated_at=now,
    )


class _Repo:
    def __init__(self, job: VideoJob) -> None:
        self._job = job
        self.saved: list[VideoJob] = []

    async def find_by_id(self, job_id: str) -> VideoJob | None:
        return self._job if self._job.id == job_id else None

    async def save(self, job: VideoJob) -> VideoJob:
        self.saved.append(job)
        return job


class _Queue:
    def __init__(self) -> None:
        self.requeued: list[str] = []

    async def requeue(self, job: VideoJob) -> None:
        self.requeued.append(job.id)

    async def worker_alive(self) -> bool:
        return True


class _MemoryCheckpoint:
    """실제 어댑터의 부분 병합/필드 삭제를 흉내낸다(SceneCheckpointPort 구현)."""

    def __init__(self) -> None:
        self.data: dict[int, dict[str, Any]] = {}
        self.cleared = 0

    async def load(self, job_id: str) -> dict[int, dict[str, Any]]:
        return {k: dict(v) for k, v in self.data.items()}

    async def save_scene(
        self,
        job_id: str,
        order: int,
        *,
        prompt_id: str | None = None,
        clip_file_id: str | None = None,
        billed_seconds: int | None = None,
    ) -> None:
        state = self.data.setdefault(order, {})
        if prompt_id is not None:
            state["prompt_id"] = prompt_id
        if clip_file_id is not None:
            state["clip_file_id"] = clip_file_id
        if billed_seconds is not None:
            state["billed_seconds"] = billed_seconds

    async def drop_scene_handle(self, job_id: str, order: int) -> None:
        self.data.get(order, {}).pop("prompt_id", None)

    async def drop_scene(self, job_id: str, order: int) -> None:
        self.data.pop(order, None)

    async def clear(self, job_id: str) -> None:
        self.data.clear()
        self.cleared += 1


def _svc(job: VideoJob) -> tuple[VideoJobService, _Repo, _Queue, _MemoryCheckpoint]:
    repo, queue, ckpt = _Repo(job), _Queue(), _MemoryCheckpoint()
    return VideoJobService(repo, queue, ckpt), repo, queue, ckpt


async def test_only_the_target_scene_is_rebuilt() -> None:
    """나머지 씬은 체크포인트에 되살아나 건너뛰어진다. 이것이 재과금을 그 씬 하나로 묶는다."""
    service, _repo, _queue, ckpt = _svc(_job())

    await service.rerender_scene("j1", 2)

    assert 2 not in ckpt.data, "다시 만들 씬이 남아 있으면 워커가 옛 클립을 재사용해 아무것도 안 바뀐다"
    assert ckpt.data[1] == {"clip_file_id": "clip-1", "billed_seconds": 5}
    assert ckpt.data[3] == {"clip_file_id": "clip-3", "billed_seconds": 7}


async def test_job_returns_to_pending_and_is_requeued() -> None:
    service, repo, queue, _ckpt = _svc(_job())

    saved = await service.rerender_scene("j1", 2)

    assert saved is not None and saved.status is VideoJobStatus.PENDING
    assert queue.requeued == ["j1"], "다시 태우지 않으면 아무도 이 잡을 집지 않는다"
    # 결과물은 전 씬을 이어붙여 새로 만들어진다. 옛 결과를 남겨 두면 화면이 그것을 최신으로 보여준다.
    assert repo.saved[-1].result_file_id is None
    assert repo.saved[-1].captions_file_id is None
    assert repo.saved[-1].error is None


async def test_attempts_is_not_touched() -> None:
    """attempts 는 스위퍼의 재큐잉 횟수다. 사용자 조작으로 올리면 재개 한도가 헛돈다."""
    service, repo, _queue, _ckpt = _svc(_job())

    await service.rerender_scene("j1", 2)

    assert repo.saved[-1].attempts == 4


async def test_saved_scene_states_are_kept_during_the_rerun() -> None:
    """다시 만드는 동안에도 세그먼트 격자의 근거는 이 값뿐이다. 비우면 화면의 칸이 전부 사라진다."""
    service, repo, _queue, _ckpt = _svc(_job())

    await service.rerender_scene("j1", 2)

    assert repo.saved[-1].scene_states is not None
    assert len(repo.saved[-1].scene_states) == 3


async def test_new_prompt_is_written_into_the_render_spec() -> None:
    service, repo, _queue, _ckpt = _svc(_job())

    await service.rerender_scene("j1", 2, "새 묘사")

    scenes = repo.saved[-1].params["scenes"]
    assert [s["visual_prompt"] for s in scenes] == ["묘사 1", "새 묘사", "묘사 3"]


async def test_prompt_is_left_alone_when_not_given() -> None:
    """같은 묘사로 한 번 더 만드는 경우. 묘사를 비우면 그 씬이 무엇이었는지 잃는다."""
    service, repo, _queue, _ckpt = _svc(_job())

    await service.rerender_scene("j1", 2, None)

    scenes = repo.saved[-1].params["scenes"]
    assert [s["visual_prompt"] for s in scenes] == ["묘사 1", "묘사 2", "묘사 3"]


async def test_unknown_job_returns_none() -> None:
    service, _repo, _queue, _ckpt = _svc(_job())

    assert await service.rerender_scene("nope", 1) is None


async def test_unknown_scene_order_is_rejected() -> None:
    service, _repo, queue, ckpt = _svc(_job())

    with pytest.raises(LookupError):
        await service.rerender_scene("j1", 99)

    assert queue.requeued == [], "없는 씬 요청으로 잡을 다시 태우면 이유 없이 렌더가 한 번 더 돈다"
    assert ckpt.data == {}, "실패한 요청이 체크포인트를 건드리면 안 된다"


async def test_non_compose_job_is_rejected() -> None:
    """씬이라는 단위가 없는 작업이다. 400 으로 갈린다(라우터가 번역)."""
    service, _repo, _queue, _ckpt = _svc(_job(type=VideoJobType.TRANSCODE))

    with pytest.raises(ValueError):
        await service.rerender_scene("j1", 1)
