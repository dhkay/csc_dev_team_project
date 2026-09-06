"""VideoProcessingPort 구현: 슬라이드쇼 씬 비주얼(정지 이미지 + 켄번스 모션).

씬 하나의 무음 비주얼 클립을 만든다(GPU 불필요, ffmpeg 만). 조합(ComposeProcessing)이 씬마다
호출하고, 오디오(TTS 나레이션)는 조합이 별도로 mux 한다. 같은 씬-비주얼 계약(image → 무음 클립)을
Wan(comfyui_video_gen)도 만족하므로 provider 라우팅으로 교체 가능(dev=slideshow, staging/prod=wan).

params:
  - duration_sec: 클립 길이(초). 조합이 나레이션 길이로 채운다.
  - width/height: 출력 해상도(조합이 화면비에서 산출).
  - ken_burns: 줌 모션 여부(기본 True).
"""

from __future__ import annotations

import os
from typing import Any

from ....core.domain.errors import PermanentRenderError
from ....core.domain.types import ProcessedResult, VideoJobType
from . import ffmpeg_ops


class SlideshowProcessing:
    """VideoProcessingPort(Protocol) 구현: 정지 이미지 1장을 무음 클립으로."""

    async def process(
        self,
        type: VideoJobType,
        params: dict[str, Any],
        source_path: str | None,
        out_dir: str,
    ) -> ProcessedResult:
        if not source_path:
            # 재시도가 이미지를 만들어 주지 않는다. 일반 실패로 두면 스위퍼가 300초 간격으로 열 번을
            #   되풀이하는 동안 화면이 '만드는 중' 이고, 마지막에 원인이 "reconciliation timeout" 으로
            #   덮인다. 이 provider 를 씬 이미지 없는 잡에 붙인 것은 배선의 문제이므로 즉시 알린다.
            raise PermanentRenderError("slideshow: 씬 이미지(source_path)가 필요합니다")
        duration = float(params.get("duration_sec") or 4.0)
        width = int(params.get("width") or 1080)
        height = int(params.get("height") or 1920)
        ken_burns = bool(params.get("ken_burns", True))

        out_path = os.path.join(out_dir, "clip.mp4")
        await ffmpeg_ops.still_to_silent_clip(
            image_path=source_path,
            out_path=out_path,
            duration=duration,
            width=width,
            height=height,
            ken_burns=ken_burns,
        )
        return ProcessedResult(path=out_path, file_name="clip.mp4", mime_type="video/mp4")
