"""최종 합성: 프레임은 영상 위에 덮인다.

이 파일이 지키는 계약 둘.

1. 캔버스는 프레임 모양이다. 프레임이 화면 전체이고 원천은 그 안의 한 자리에 앉으므로, 원천
   비율이 결과의 비율일 이유가 없다. 원천을 따르게 두면 4:5 원천을 넣는 순간 최종이 4:5 로 나와
   9:16 프레임과 배포처가 요구하는 모양이 함께 사라진다.
2. 프레임이 둘러싸고 영상이 그 안에 들어간다. 자리 밖은 프레임이고 자리 안은 영상이다. 영상이
   캔버스를 채우면 프레임이 완전히 가려져 "프레임이 적용되지 않는다" 가 된다(실제 신고).

2번은 필터 문자열이 아니라 픽셀로 단정한다. 필터를 맞게 조립해도 레이어 순서나 자리가 어긋나면
결과가 달라지고, 그 차이는 문자열에 나타나지 않는다.
"""

from __future__ import annotations

import shutil
import subprocess

import pytest

from app.domains.video.adapters.outbound.processing import ffmpeg_ops as ops

needs_ffmpeg = pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
    reason="ffmpeg/ffprobe 없음",
)

# 우리 렌더가 실제로 내는 원천 치수. 여기 숫자가 바뀌면 이 테스트의 전제도 바뀐다.
SRC_720_VERTICAL = ops.dims_for("720p", "9:16")  # (704, 1280). 정확한 9:16 이 아니다


def _stub_dims(monkeypatch, table: dict[str, tuple[int, int]]) -> None:
    """ffprobe 대신 표를 읽게 한다(파일 이름 → 치수). 표에 없으면 (0, 0)."""

    async def fake(path: str) -> tuple[int, int]:
        return table.get(path, (0, 0))

    monkeypatch.setattr(ops, "_probe_dims", fake)


class TestResolveFinalCanvas:
    @pytest.mark.asyncio
    async def test_follows_the_frame(self, monkeypatch) -> None:
        """프레임이 화면 전체다. 원천 치수는 캔버스를 정하지 않는다."""
        _stub_dims(monkeypatch, {"src.mp4": SRC_720_VERTICAL, "frame.png": (1080, 1920)})

        assert await ops.resolve_final_canvas("frame.png", "src.mp4") == (720, 1280)

    @pytest.mark.asyncio
    async def test_source_shape_does_not_win(self, monkeypatch) -> None:
        """원천이 다른 모양이어도 프레임을 따른다.

        이것이 이 규칙의 존재 이유다. 원천을 따르게 두면 4:5 원천을 넣는 순간 최종이 4:5 로 나와
        9:16 프레임이 사라진다. 원천은 프레임 안의 한 자리에 앉는 것이고 화면 전체가 아니다.
        """
        _stub_dims(monkeypatch, {"src.mp4": (768, 960), "frame.png": (1080, 1920)})

        assert await ops.resolve_final_canvas("frame.png", "src.mp4") == (720, 1280)

    @pytest.mark.asyncio
    async def test_no_frame_follows_source(self, monkeypatch) -> None:
        """프레임이 없으면 원천이 곧 화면이다."""
        _stub_dims(monkeypatch, {"src.mp4": (1080, 1920)})

        assert await ops.resolve_final_canvas(None, "src.mp4") == (720, 1280)

    @pytest.mark.asyncio
    async def test_unreadable_frame_falls_back_to_source(self, monkeypatch) -> None:
        """프레임을 못 재면 원천으로. 그것마저 없으면 기본 캔버스다."""
        _stub_dims(monkeypatch, {"src.mp4": (768, 960), "frame.png": (0, 0)})

        assert await ops.resolve_final_canvas("frame.png", "src.mp4") == (768, 960)

    @pytest.mark.asyncio
    async def test_unreadable_both_falls_back_to_the_frame_convention(self, monkeypatch) -> None:
        """아무것도 못 재면 프레임이 있을 모양으로 둔다(이 캔버스는 프레임을 담는 자리다)."""
        _stub_dims(monkeypatch, {})

        assert await ops.resolve_final_canvas("frame.png", "src.mp4") == ops.dims_for(
            ops.DEFAULT_RESOLUTION, ops.FRAME_CONVENTION_ASPECT
        )

    @pytest.mark.asyncio
    async def test_oversized_source_is_capped(self, monkeypatch) -> None:
        """과대 치수는 최대변으로 캡한다(4K 원천이 그대로 최종이 되지 않게)."""
        _stub_dims(monkeypatch, {"src.mp4": (2160, 3840)})

        assert await ops.resolve_final_canvas(None, "src.mp4") == (720, 1280)


def _png(path: str, spec: str, size: str = "64x64") -> str:
    """단색 PNG 한 장. spec 은 lavfi 색 지정(알파 포함 가능)."""
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c={spec}:s={size}",
         "-frames:v", "1", path],
        capture_output=True, check=True,
    )
    return path


@needs_ffmpeg
class TestCompositeFinal:
    """픽셀로 확인한다. 필터 문자열이 맞아도 자리나 순서가 어긋나면 결과가 달라진다."""

    @staticmethod
    def _make_source(path: str) -> None:
        # 초록 세로 영상(우리 렌더 캔버스와 같은 치수).
        w, h = SRC_720_VERTICAL
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c=green:s={w}x{h}:d=1:r=10",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", path],
            capture_output=True, check=True,
        )

    @staticmethod
    def _pixel(path: str, x: int, y: int) -> tuple[int, int, int]:
        """그 좌표의 RGB. 첫 프레임에서 2x2 를 잘라 첫 픽셀을 읽는다.

        1x1 은 쓸 수 없다(홀수 크기는 크로마 서브샘플링에서 거부된다: 실측 -22).
        """
        r = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", path, "-vf", f"crop=2:2:{x}:{y},format=rgb24",
             "-frames:v", "1", "-f", "rawvideo", "-"],
            capture_output=True, check=True,
        )
        b = r.stdout[:3]
        return (b[0], b[1], b[2])

    @pytest.mark.asyncio
    async def test_output_keeps_the_canvas_size(self, tmp_path) -> None:
        src, frame = str(tmp_path / "s.mp4"), str(tmp_path / "f.png")
        out = str(tmp_path / "out.mp4")
        self._make_source(src)
        _png(frame, "red", "x".join(map(str, SRC_720_VERTICAL)))
        w, h = await ops.resolve_final_canvas(frame, src)

        await ops.composite_final(src, frame, out, w, h, None, None, (0, 100, w, 600))

        assert await ops._probe_dims(out) == (w, h)

    @pytest.mark.asyncio
    async def test_without_a_frame_the_video_fills_the_canvas(self, tmp_path) -> None:
        """프레임이 없으면 오버레이 단계가 없다. 모서리까지 영상이다."""
        src, out = str(tmp_path / "s.mp4"), str(tmp_path / "out.mp4")
        self._make_source(src)
        w, h = await ops.resolve_final_canvas(None, src)

        await ops.composite_final(src, None, out, w, h)

        r, g, _b = self._pixel(out, 5, 5)
        assert g > 100 and r < 90

    @pytest.mark.asyncio
    async def test_frame_surrounds_the_video(self, tmp_path) -> None:
        """프레임이 둘러싸고 원천이 그 안에 들어간다.

        자리 밖에서는 프레임이 보이고 자리 안에서는 영상이 보인다. 이 단계가 '프레임 적용' 인
        이유가 그것이다. 위에 덮으면 영상이 100% 가려져 정지화면 한 장이 나온다(실제 신고).
        """
        src, frame = str(tmp_path / "s.mp4"), str(tmp_path / "f.png")
        out = str(tmp_path / "out.mp4")
        self._make_source(src)
        _png(frame, "red", "x".join(map(str, SRC_720_VERTICAL)))  # 불투명 전면 프레임
        w, h = await ops.resolve_final_canvas(frame, src)
        box = (0, round(h * 0.18), w, round(h * 0.62))

        await ops.composite_final(src, frame, out, w, h, None, None, box)

        # 자리 밖(맨 위): 프레임의 빨강.
        r, g, _b = self._pixel(out, w // 2, 10)
        assert r > 100 and g < 90, f"위쪽에 프레임이 없다: {(r, g, _b)}"
        # 자리 안(가운데): 영상의 초록.
        r2, g2, _b2 = self._pixel(out, w // 2, h // 2)
        assert g2 > 100 and r2 < 90, f"자리 안에 영상이 없다: {(r2, g2, _b2)}"
