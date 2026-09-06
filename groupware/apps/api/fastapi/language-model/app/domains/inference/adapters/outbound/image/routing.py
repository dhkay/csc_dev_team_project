"""ImageGenerationPort 라우터: provider 별로 실제 어댑터에 디스패치.

요청의 `provider`(카탈로그 spec.provider 에서 전파: "openai"/"comfyui"/"stub")로 어느 어댑터가
처리할지 고른다. 레지스트리에 없는 provider 는 `default_provider` 로 폴백한다(예: stub 모드에서
provider="comfyui" 요청이 와도 default="stub" 로 placeholder). 텍스트의 RoutingInference 와 동형
엔진/벤더 교체 = 레지스트리 구성만 바꾼다.
"""

from __future__ import annotations

from ....core.application.ports.outbound import ImageGenerationPort
from ....core.domain.types import (
    ImageEngineLoadRecord,
    ImageGenerationRequestRecord,
    ImageGenerationResultRecord,
)


class RoutingImageGeneration:
    """provider→ImageGenerationPort 레지스트리로 디스패치하는 ImageGenerationPort 구현."""

    def __init__(
        self, adapters: dict[str, ImageGenerationPort], default_provider: str
    ) -> None:
        if default_provider not in adapters:
            raise ValueError(
                f"default_provider {default_provider!r} 가 레지스트리에 없습니다"
                f" (등록: {sorted(adapters)})"
            )
        self._adapters = adapters
        self._default = default_provider

    def _pick(self, provider: str | None) -> ImageGenerationPort:
        # 미등록 provider 는 default 로 폴백(예: stub 모드의 comfyui 요청).
        return self._adapters.get(provider or self._default) or self._adapters[self._default]

    async def generate(
        self, req: ImageGenerationRequestRecord
    ) -> ImageGenerationResultRecord:
        return await self._pick(req.provider).generate(req)

    async def load(self, provider: str | None = None) -> ImageEngineLoadRecord | None:
        """부하도 generate 와 같은 규칙으로 디스패치한다. 어느 엔진이 그리느냐가 곧 어느 큐냐이다."""
        return await self._pick(provider).load()

    async def aclose(self) -> None:
        for adapter in self._adapters.values():
            await adapter.aclose()
