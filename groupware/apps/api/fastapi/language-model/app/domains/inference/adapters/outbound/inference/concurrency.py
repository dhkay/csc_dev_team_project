"""InferencePort 데코레이터: 동시성 상한(asyncio.Semaphore).

LLM 호출은 네트워크 I/O 라 컨테이너 cpu/mem 캡, 워커 max_jobs 와 별개로 전용 세마포어로
제한한다(LLM_MAX_CONCURRENCY). 스트리밍은 이터레이션 전체 동안 슬롯을 점유한다.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from ....core.application.ports.outbound import InferencePort
from ....core.domain.types import (
    EmbeddingRecord,
    EmbeddingRequestRecord,
    GenerationChunkRecord,
    GenerationRequestRecord,
    GenerationResultRecord,
)


class ConcurrencyLimitedInference:
    """다른 InferencePort 구현을 감싸 동시 실행 수를 제한한다."""

    def __init__(self, inner: InferencePort, max_concurrency: int) -> None:
        self._inner = inner
        self._sem = asyncio.Semaphore(max(1, max_concurrency))

    async def generate(self, req: GenerationRequestRecord) -> GenerationResultRecord:
        async with self._sem:
            return await self._inner.generate(req)

    async def stream(
        self, req: GenerationRequestRecord
    ) -> AsyncIterator[GenerationChunkRecord]:
        async with self._sem:
            async for chunk in self._inner.stream(req):
                yield chunk

    async def embed(self, req: EmbeddingRequestRecord) -> list[EmbeddingRecord]:
        async with self._sem:
            return await self._inner.embed(req)

    async def aclose(self) -> None:
        await self._inner.aclose()
