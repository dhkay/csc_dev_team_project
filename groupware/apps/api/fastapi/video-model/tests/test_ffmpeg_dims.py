"""캔버스 크기 해석 단위: (화질 × 화면비) → 픽셀.

이 맵이 틀어지면 씬 클립과 concat 캔버스가 어긋나 렌더가 통째로 깨지거나, 사용자가 고른 화질이
조용히 무시된다. 16 배수(Wan latent 제약)와 폴백 규칙을 못박아 둔다.
"""

from __future__ import annotations

import pytest

from app.domains.video.adapters.outbound.processing import ffmpeg_ops as ops


def test_resolution_selects_different_canvas() -> None:
    assert ops.dims_for("720p", "9:16") == (704, 1280)
    assert ops.dims_for("480p", "9:16") == (480, 848)


@pytest.mark.parametrize("resolution", ["480p", "720p"])
@pytest.mark.parametrize("aspect", ["9:16", "16:9", "1:1", "4:5"])
def test_all_dims_are_multiples_of_16(resolution: str, aspect: str) -> None:
    """Wan 2.2 TI2V-5B latent 제약: 16 배수가 아니면 워크플로가 거부한다."""
    w, h = ops.dims_for(resolution, aspect)
    assert w % 16 == 0 and h % 16 == 0


def test_unknown_values_fall_back_to_defaults() -> None:
    """미지의 화질/화면비(구 잡, 오타)는 기본값으로 떨어진다. 예외가 아니라 폴백."""
    default = ops.dims_for(ops.DEFAULT_RESOLUTION, ops.DEFAULT_ASPECT)
    assert ops.dims_for("1080p", ops.DEFAULT_ASPECT) == default
    assert ops.dims_for(ops.DEFAULT_RESOLUTION, "21:9") == default
    assert ops.dims_for("", "") == default


def test_480p_is_smaller_than_720p_everywhere() -> None:
    """등급이 낮으면 항상 픽셀 수가 적어야 한다(등급 표기와 실제 비용/화질이 일치)."""
    for aspect in ("9:16", "16:9", "1:1", "4:5"):
        w480, h480 = ops.dims_for("480p", aspect)
        w720, h720 = ops.dims_for("720p", aspect)
        assert w480 * h480 < w720 * h720
