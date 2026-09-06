"""InferencePort 구현: Echo 스텁(GPU/엔진 불필요).

INFERENCE_ENGINE=stub 일 때 선택. 마지막 유저 메시지를 토큰 단위로 되돌려 스트리밍 경로를
end-to-end 로 검증할 수 있게 한다(로컬 개발/CI 기본값).
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from ....core.domain.types import (
    EmbeddingRecord,
    EmbeddingRequestRecord,
    GenerationChunkRecord,
    GenerationRequestRecord,
    GenerationResultRecord,
    TokenUsage,
)

_EMBED_DIM = 8


def _reply_text(req: GenerationRequestRecord) -> str:
    last_user = next(
        (m.content for m in reversed(req.messages) if m.role == "user"),
        "",
    )
    return f"(에코) {last_user}".strip()


class EchoInference:
    """InferencePort 구현: 입력을 되돌리는 스텁."""

    async def generate(self, req: GenerationRequestRecord) -> GenerationResultRecord:
        text = _reply_text(req)
        return GenerationResultRecord(
            text=text,
            usage=TokenUsage(prompt=0, completion=len(text.split()), total=len(text.split())),
        )

    async def stream(
        self, req: GenerationRequestRecord
    ) -> AsyncIterator[GenerationChunkRecord]:
        text = _reply_text(req)
        tokens = text.split(" ")
        for i, tok in enumerate(tokens):
            await asyncio.sleep(0.02)  # 스트리밍 체감(취소 지점 포함)
            piece = tok if i == 0 else f" {tok}"
            yield GenerationChunkRecord(delta=piece)
        yield GenerationChunkRecord(
            delta="",
            finish_reason="stop",
            usage=TokenUsage(prompt=0, completion=len(tokens), total=len(tokens)),
        )

    async def embed(self, req: EmbeddingRequestRecord) -> list[EmbeddingRecord]:
        return [EmbeddingRecord(vector=[0.0] * _EMBED_DIM) for _ in req.inputs]

    async def aclose(self) -> None:
        return None
