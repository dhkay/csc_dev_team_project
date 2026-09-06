"""VideoProcessingPort 구현 (스텁).

출력은 변환된 영상이 아니다. TRANSCODE 는 원본을 그대로 복사하고 GENERATE 는 빈 파일을 만든다.
호출자가 코덱이 보장된 것으로 다루면 안 된다.
"""

from __future__ import annotations

import os
import shutil
from typing import Any

from ....core.domain.types import VideoJobType, ProcessedResult


class FfmpegProcessing:
    """VideoProcessingPort(Protocol) 구현."""

    async def process(
        self,
        type: VideoJobType,
        params: dict[str, Any],
        source_path: str | None,
        out_dir: str,
    ) -> ProcessedResult:
        file_name = params.get("file_name", "result.bin")
        mime_type = params.get("mime_type", "application/octet-stream")
        out_path = os.path.join(out_dir, "result")

        if type == VideoJobType.TRANSCODE and source_path:
            # TODO: subprocess ffmpeg -i {source_path} -c:v libx264 -c:a aac {out_path}
            shutil.copyfile(source_path, out_path)
        else:
            # TODO: AI 에이전트 호출 -> 결과 바이트
            with open(out_path, "wb") as fp:
                fp.write(b"")

        return ProcessedResult(path=out_path, file_name=file_name, mime_type=mime_type)
