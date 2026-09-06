"""StubImageGeneration: GPU/외부키 없이 파이프라인을 E2E 로 돌리는 placeholder 어댑터.

텍스트의 EchoInference 와 같은 철학: 로컬 dev(IMAGE_ENGINE=stub)에서 실제 엔진 없이도 위저드/
오케스트레이터/일관성 흐름을 검증할 수 있게 작은 PNG(base64)를 즉시 반환한다. 실추론 대상 아님.
"""

from __future__ import annotations

from ....core.domain.types import (
    ImageEngineLoadRecord,
    ImageGenerationRequestRecord,
    ImageGenerationResultRecord,
    ImageResultRecord,
)

# 1x1 PNG(회색). 유효한 이미지라 <img src=data:...> 로 바로 렌더된다(placeholder 용도).
_PLACEHOLDER_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4ceIEAAS0AlkWLoFAAAAAAElFTkSuQmCC"
)


class StubImageGeneration:
    """ImageGenerationPort 구현: 고정 placeholder 이미지 반환(dev/stub)."""

    async def generate(
        self, req: ImageGenerationRequestRecord
    ) -> ImageGenerationResultRecord:
        return ImageGenerationResultRecord(
            images=[ImageResultRecord(b64=_PLACEHOLDER_PNG_B64, mime="image/png")]
        )

    async def load(self, provider: str | None = None) -> ImageEngineLoadRecord | None:
        """placeholder 는 GPU 를 쓰지 않는다. 줄이 없다."""
        return None

    async def aclose(self) -> None:
        return None
