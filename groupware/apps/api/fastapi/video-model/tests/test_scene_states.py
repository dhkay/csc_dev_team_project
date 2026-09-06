"""씬별 상태가 조회에 나오고, 끝난 잡에서도 살아남는지.

이 파일이 지키는 것: 씬 목록의 출처가 둘(진행 중=체크포인트, 끝난 잡=저장된 씬 결과)인데 같은
모양으로 나와야 보는 쪽이 잡의 종료 여부를 몰라도 된다. 그리고 끝난 잡의 씬별 클립은 저장하지
않으면 되살릴 방법이 없다(체크포인트는 성공 시 지워지고 하루면 만료된다).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.domains.video.adapters.outbound.checkpoint.redis_checkpoint import (
    NullSceneCheckpoint,
)
from app.domains.video.adapters.outbound.db import mappers as db_mappers
from app.domains.video.core.application.services import (
    VideoJobService,
    _compose_scenes,
    _render_stage,
)
from app.domains.video.core.domain.entities import VideoJob
from app.domains.video.core.domain.types import (
    RenderStage,
    SceneRenderStatus,
    SceneState,
    VideoJobStatus,
    VideoJobType,
)


def _params(count: int) -> dict[str, Any]:
    return {
        "scenes": [
            {"order": i, "visual_prompt": f"묘사 {i}"} for i in range(1, count + 1)
        ]
    }


def _job(
    status: VideoJobStatus,
    *,
    scene_count: int = 3,
    scene_states: list[SceneState] | None = None,
) -> VideoJob:
    now = datetime.now(timezone.utc)
    return VideoJob(
        id="j1",
        type=VideoJobType.COMPOSE,
        status=status,
        params=_params(scene_count),
        scene_states=scene_states,
        created_at=now,
        updated_at=now,
    )


class _Repo:
    def __init__(self, job: VideoJob) -> None:
        self._job = job

    async def find_by_id(self, job_id: str) -> VideoJob | None:
        return self._job if self._job.id == job_id else None

    async def save(self, job: VideoJob) -> VideoJob:
        return job


class _Queue:
    async def worker_alive(self) -> bool:
        return True


class _Checkpoint(NullSceneCheckpoint):
    def __init__(self, data: dict[int, dict[str, Any]] | None = None) -> None:
        self._data = data or {}

    async def load(self, job_id: str) -> dict[int, dict[str, Any]]:
        return {k: dict(v) for k, v in self._data.items()}


def test_scene_list_reports_three_states_from_the_checkpoint() -> None:
    """체크포인트의 두 필드로 씬 상태가 갈린다: 클립 있음/보냈고 대기/아직 안 보냄."""
    scenes = _compose_scenes(
        _params(3),
        checkpoint={
            1: {"clip_file_id": "clip-1", "billed_seconds": 5},
            2: {"prompt_id": "vendor-req"},
        },
    )

    assert scenes is not None
    assert [s.status for s in scenes] == [
        SceneRenderStatus.DONE,
        SceneRenderStatus.RUNNING,
        SceneRenderStatus.WAITING,
    ]
    assert scenes[0].clip_file_id == "clip-1"
    # 화면 묘사를 함께 낸다: 다시 만들기 전에 고칠 대상이라 화면이 그것을 편집기에 채운다.
    assert [s.prompt for s in scenes] == ["묘사 1", "묘사 2", "묘사 3"]


def test_scene_list_of_a_finished_job_comes_from_saved_states() -> None:
    """끝난 잡은 체크포인트가 비어 있다. 저장된 씬 결과가 유일한 근거다."""
    scenes = _compose_scenes(
        _params(2),
        checkpoint={},  # 성공 시 지워졌다
        states=[
            SceneState(order=1, clip_file_id="clip-1", billed_seconds=5, duration_sec=4.2),
            SceneState(order=2, clip_file_id="clip-2", billed_seconds=6, duration_sec=5.0),
        ],
    )

    assert scenes is not None
    assert [s.status for s in scenes] == [SceneRenderStatus.DONE, SceneRenderStatus.DONE]
    assert [s.clip_file_id for s in scenes] == ["clip-1", "clip-2"]
    # 길이는 concat 전에 잰 값이라, 화면이 적는 길이와 실제 재생 길이가 같다.
    assert [s.duration_sec for s in scenes] == [4.2, 5.0]


def test_render_stage_switches_when_the_last_scene_is_done() -> None:
    """씬이 남았으면 SCENES, 다 만들었으면 FINALIZING(이어붙이기~업로드)."""
    partial = _compose_scenes(_params(2), checkpoint={1: {"clip_file_id": "c"}})
    whole = _compose_scenes(
        _params(2), checkpoint={1: {"clip_file_id": "c"}, 2: {"clip_file_id": "d"}}
    )

    assert _render_stage(partial) is RenderStage.SCENES
    assert _render_stage(whole) is RenderStage.FINALIZING
    assert _render_stage(None) is None


async def test_get_job_fills_scenes_while_rendering() -> None:
    job = _job(VideoJobStatus.PROCESSING)
    service = VideoJobService(
        _Repo(job), _Queue(), _Checkpoint({1: {"clip_file_id": "clip-1"}})
    )

    got = await service.get_job("j1")

    assert got is not None and got.scenes is not None
    assert got.scenes[0].status is SceneRenderStatus.DONE
    assert got.render_stage is RenderStage.SCENES
    assert got.progress == 33  # 1/3. 씬 목록과 같은 값에서 나온다


async def test_get_job_of_a_finished_job_has_scenes_but_no_progress() -> None:
    """끝난 잡에 진행률과 구간을 채우면 화면이 끝난 렌더를 진행 중으로 그린다."""
    job = _job(
        VideoJobStatus.COMPLETED,
        scene_count=2,
        scene_states=[
            SceneState(order=1, clip_file_id="clip-1", duration_sec=4.0),
            SceneState(order=2, clip_file_id="clip-2", duration_sec=5.0),
        ],
    )
    service = VideoJobService(_Repo(job), _Queue(), _Checkpoint())

    got = await service.get_job("j1")

    assert got is not None and got.scenes is not None
    assert [s.clip_file_id for s in got.scenes] == ["clip-1", "clip-2"]
    assert got.progress is None
    assert got.render_stage is None
    assert got.worker_alive is None


def test_scene_states_survive_a_persistence_round_trip() -> None:
    """저장 형태로 나갔다 돌아와도 같은 값이어야 한다. 이 값이 세그먼트 격자의 유일한 근거다."""
    states = [
        SceneState(order=1, clip_file_id="clip-1", billed_seconds=5, duration_sec=4.25),
        SceneState(order=2, clip_file_id=None, billed_seconds=None, duration_sec=None),
    ]

    raw = db_mappers._scene_states_to_json(states)
    back = db_mappers._scene_states_from_json(raw)

    assert back == states
    # 구형 행(NULL)과 손상된 값은 None 으로 접는다: 조회가 깨지지 않게.
    assert db_mappers._scene_states_from_json(None) is None
    assert db_mappers._scene_states_from_json("깨진 값") is None
