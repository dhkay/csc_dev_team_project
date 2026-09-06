"""InferencePort 라우터: provider 별로 실제 어댑터에 디스패치.

요청의 `provider`(카탈로그 spec.provider 에서 전파: "internal"/"external"/"stub")로 어느 어댑터가
처리할지 고른다. 레지스트리에 없는 provider 는 `default_provider` 로 폴백한다(예: stub 모드에서
provider="internal" 요청이 와도 default="stub" 로 에코). 엔진/벤더 교체 = 레지스트리 구성만 바꾼다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from ....core.application.ports.outbound import InferencePort
from ....core.domain.types import (
    EmbeddingRecord,
    EmbeddingRequestRecord,
    GenerationChunkRecord,
    GenerationRequestRecord,
    GenerationResultRecord,
)


class RoutingInference:
    """provider→InferencePort 레지스트리로 디스패치하는 InferencePort 구현."""

    def __init__(
        self, adapters: dict[str, InferencePort], default_provider: str
    ) -> None:
        if default_provider not in adapters:
            raise ValueError(
                f"default_provider {default_provider!r} 가 레지스트리에 없습니다"
                f" (등록: {sorted(adapters)})"
            )
        self._adapters = adapters
        self._default = default_provider

    def _pick(self, provider: str | None) -> InferencePort:
        # 미등록 provider 는 default 로 폴백(예: stub 모드의 internal 요청).
        return self._adapters.get(provider or self._default) or self._adapters[self._default]

    async def generate(self, req: GenerationRequestRecord) -> GenerationResultRecord:
        return await self._pick(req.provider).generate(req)

    async def stream(
        self, req: GenerationRequestRecord
    ) -> AsyncIterator[GenerationChunkRecord]:
        async for chunk in self._pick(req.provider).stream(req):
            yield chunk

    async def embed(self, req: EmbeddingRequestRecord) -> list[EmbeddingRecord]:
        return await self._pick(req.provider).embed(req)

    async def aclose(self) -> None:
        for adapter in self._adapters.values():
            await adapter.aclose()
