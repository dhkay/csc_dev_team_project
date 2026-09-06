"""finalize 오버레이 배선: 제목/자막/밴드가 있으면 ASS 를 만들어 composite_final 로 단일 인코딩 번인.

실제 ffmpeg 는 monkeypatch 로 대체(파일 터치)하고, ass_builder(순수)는 실제로 돌려 최종 캔버스 기준
ASS 생성 + finalize 배선(프레임+원천+오버레이를 한 번의 composite_final 로)을 검증한다.
"""

from __future__ import annotations

import json
import os

import pytest

from app.domains.video.adapters.outbound.processing import ass_builder, ffmpeg_ops
from app.domains.video.adapters.outbound.processing.finalize import FinalizeProcessing
from app.domains.video.core.domain.types import VideoJobType


class _Files:
    def __init__(self, captions: list | None = None) -> None:
        self._captions = captions
        self.downloaded: list[str] = []

    async def download_source(self, file_id: str, dest_path: str) -> None:
        self.downloaded.append(file_id)
        with open(dest_path, "w", encoding="utf-8") as f:
            if file_id == "cap":
                json.dump(self._captions or [], f, ensure_ascii=False)
            else:
                f.write("x")


@pytest.fixture
def patched(monkeypatch):
    calls: dict[str, list] = {"composite": []}

    async def fake_resolve_canvas(frame_path, source_path, max_side=1280):  # noqa: ANN001
        return (720, 1280)

    async def fake_probe_duration(path):  # noqa: ANN001
        return 6.0

    async def fake_composite(  # noqa: ANN001
        src, frame, out, w, h, ass_path=None, fonts_dir=None, content_box=None
    ):
        # 단일 인코딩 합성: 원천+프레임+텍스트를 한 번에. 인자를 캡처해 배치까지 검증한다.
        calls["composite"].append(
            {
                "src": src,
                "frame": frame,
                "out": out,
                "canvas": (w, h),
                "ass": ass_path,
                "fonts": fonts_dir,
                "content_box": content_box,
            }
        )
        open(out, "w").close()

    async def fake_normalize(inp, out, w, h):  # noqa: ANN001
        open(out, "w").close()

    async def fake_concat_copy(clips, out):  # noqa: ANN001
        open(out, "w").close()

    async def fake_font_family(path):  # noqa: ANN001
        return "MyBrandFont"

    monkeypatch.setattr(ffmpeg_ops, "resolve_final_canvas", fake_resolve_canvas)
    monkeypatch.setattr(ffmpeg_ops, "probe_duration", fake_probe_duration)
    monkeypatch.setattr(ffmpeg_ops, "composite_final", fake_composite)
    monkeypatch.setattr(ffmpeg_ops, "normalize_clip_to_canvas", fake_normalize)
    monkeypatch.setattr(ffmpeg_ops, "concat_copy", fake_concat_copy)
    monkeypatch.setattr(ffmpeg_ops, "probe_font_family", fake_font_family)
    return calls


async def test_finalize_burns_title_and_captions(patched, tmp_path) -> None:
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir)
    src = str(tmp_path / "src.mp4")
    open(src, "w").close()
    files = _Files(captions=[{"text": "자막", "start": 0, "end": 3}])
    result = await FinalizeProcessing(files=files).process(
        VideoJobType.FINALIZE,
        {"title": "제목", "captions_file_id": "cap", "frame_file_id": None, "outro_file_id": None},
        source_path=src,
        out_dir=out_dir,
    )
    # 단일 composite 호출 + ass 경로 전달(오버레이 있음).
    assert len(patched["composite"]) == 1
    assert patched["composite"][0]["ass"] is not None
    with open(os.path.join(out_dir, "overlays.ass"), encoding="utf-8") as f:
        ass = f.read()
    assert "제목" in ass and "자막" in ass
    assert result.path.endswith("main.mp4")


async def test_finalize_uses_fetched_font(patched, tmp_path) -> None:
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir)
    src = str(tmp_path / "src.mp4")
    open(src, "w").close()
    files = _Files(captions=[{"text": "자막", "start": 0, "end": 3}])
    result = await FinalizeProcessing(files=files).process(
        VideoJobType.FINALIZE,
        {
            "title": "제목",
            "captions_file_id": "cap",
            "frame_file_id": None,
            "outro_file_id": None,
            # 제목에 폰트 자산 지정 → fetch + 패밀리 해석(MyBrandFont) → ASS Fontname 반영, fontsdir 전달.
            "title_style": {"fontUploadId": "font-1"},
            "subtitle_style": {},
        },
        source_path=src,
        out_dir=out_dir,
    )
    assert "font-1" in files.downloaded  # 폰트 자산 fetch
    assert patched["composite"][0]["fonts"] is not None  # fonts_dir 전달됨
    with open(os.path.join(out_dir, "overlays.ass"), encoding="utf-8") as f:
        ass = f.read()
    assert "Style: Title,MyBrandFont," in ass  # 해석된 패밀리로 렌더
    assert result.path.endswith("main.mp4")


async def test_finalize_skips_overlays_when_none(patched, tmp_path) -> None:
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir)
    src = str(tmp_path / "src.mp4")
    open(src, "w").close()
    result = await FinalizeProcessing(files=_Files()).process(
        VideoJobType.FINALIZE,
        {"frame_file_id": None, "outro_file_id": None},  # 제목/자막 없음
        source_path=src,
        out_dir=out_dir,
    )
    # composite 은 여전히 1회(프레임/원천 합성) 호출되지만 ass 는 None(오버레이 없음).
    assert len(patched["composite"]) == 1
    assert patched["composite"][0]["ass"] is None
    assert result.path.endswith("main.mp4")
    assert not os.path.exists(os.path.join(out_dir, "overlays.ass"))


class TestFramePlacement:
    """프레임이 있으면 영상은 그 안에 들어간다.

    자리를 주지 않으면 영상이 캔버스를 채워 프레임이 완전히 가려진다. 그 상태가 "프레임이 적용되지
    않는다" 로 신고된 것이라, 자리를 주는지가 이 배선의 계약이다.
    """

    @staticmethod
    async def _run(patched, tmp_path, *, with_frame: bool) -> dict:
        src = str(tmp_path / "src.mp4")
        open(src, "w").close()

        await FinalizeProcessing(files=_Files()).process(
            VideoJobType.FINALIZE,
            {"frame_file_id": ("frame" if with_frame else None), "outro_file_id": None},
            source_path=src,
            out_dir=str(tmp_path),
        )
        assert len(patched["composite"]) == 1
        return patched["composite"][0]

    @pytest.mark.asyncio
    async def test_frame_gets_a_place_for_the_video(self, patched, tmp_path) -> None:
        """자리는 프레임 안전 구역이다(장식이 있는 위아래를 제외한 구역).

        경계 숫자를 여기 적지 않는다. 오버레이 레이아웃이 그 값의 주인이고(같은 값이 텍스트 위치도
        정한다), 구역을 옮기면 이 자리도 함께 움직여야 한다.
        """
        call = await self._run(patched, tmp_path, with_frame=True)
        cw, ch = call["canvas"]
        top_pct, bottom_pct = ass_builder.content_band_pct()

        assert call["frame"] is not None
        assert call["content_box"] == (
            0,
            round(ch * top_pct / 100.0),
            cw,
            round(ch * (bottom_pct - top_pct) / 100.0),
        )
        # 안전 구역을 벗어나지 않는다: 그 밖(위아래)이 프레임 장식 자리다.
        _x, y, _w, h = call["content_box"]
        assert y >= round(ch * top_pct / 100.0)
        assert y + h <= round(ch * bottom_pct / 100.0)

    @pytest.mark.asyncio
    async def test_no_frame_needs_no_place(self, patched, tmp_path) -> None:
        """프레임이 없으면 영상이 캔버스를 채운다. 자리를 줄 이유가 없다."""
        call = await self._run(patched, tmp_path, with_frame=False)

        assert call["frame"] is None
        assert call["content_box"] is None
