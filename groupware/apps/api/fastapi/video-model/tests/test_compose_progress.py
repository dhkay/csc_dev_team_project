"""COMPOSE 진행률(%): 씬 목록에서 파생한다(완료=1, 렌더중=0.5 가중 / 전체 씬).

진행률을 체크포인트에서 따로 세지 않고 화면이 보는 씬 목록과 같은 값에서 뽑는지 확인한다.
따로 세면 칸은 셋이 끝났다고 하는데 막대는 다른 숫자를 가리키는 어긋남이 생긴다.
"""

from __future__ import annotations

from typing import Any

from app.domains.video.core.application.services import (
    _compose_progress,
    _compose_scenes,
)


def _params(count: int) -> dict[str, Any]:
    return {"scenes": [{"order": i} for i in range(1, count + 1)]}


def _pct(scene_count: int, ckpt: dict[int, dict[str, Any]]) -> int | None:
    """체크포인트 → 씬 목록 → 진행률. 실제 조회 경로와 같은 순서로 통과시킨다."""
    return _compose_progress(_compose_scenes(_params(scene_count), checkpoint=ckpt))


def test_multi_scene_progression() -> None:
    assert _pct(3, {}) == 0
    assert _pct(3, {1: {"prompt_id": "a"}}) == 17                      # 0.5/3
    assert _pct(3, {1: {"clip_file_id": "c"}}) == 33                   # 1/3
    assert _pct(3, {1: {"clip_file_id": "c"}, 2: {"prompt_id": "b"}}) == 50  # 1.5/3
    assert _pct(
        3, {1: {"clip_file_id": "c"}, 2: {"clip_file_id": "d"}, 3: {"prompt_id": "e"}}
    ) == 83  # 2.5/3
    # 전부 완료면 99 상한(100 은 완료 콜백이 COMPLETED 로).
    assert _pct(
        3,
        {1: {"clip_file_id": "c"}, 2: {"clip_file_id": "d"}, 3: {"clip_file_id": "e"}},
    ) == 99


def test_scale_by_total_scenes() -> None:
    # 씬 수가 다르면 분모가 달라진다(같은 완료 1개라도 %가 다름).
    assert _pct(2, {1: {"clip_file_id": "c"}}) == 50    # 1/2
    assert _pct(5, {1: {"clip_file_id": "c"}}) == 20    # 1/5


def test_no_scenes_returns_none() -> None:
    assert _compose_progress(_compose_scenes({"scenes": []}, checkpoint={})) is None
    assert _compose_progress(_compose_scenes({}, checkpoint={})) is None
