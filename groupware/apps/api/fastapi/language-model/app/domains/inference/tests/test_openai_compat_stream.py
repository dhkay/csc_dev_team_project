"""OpenAICompatInference 스트리밍 파싱 테스트: httpx.MockTransport 로 SSE 응답 주입."""

from __future__ import annotations

import httpx

from app.domains.inference.adapters.outbound.inference.openai_compat import (
    OpenAICompatInference,
)
from app.domains.inference.core.domain.types import (
    GenerationRequestRecord,
    PromptMessageRecord,
)

_SSE_BODY = (
    'data: {"choices":[{"delta":{"content":"안녕"},"finish_reason":null}]}\n\n'
    'data: {"choices":[{"delta":{"content":"하세요"},"finish_reason":null}]}\n\n'
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
    'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n'
    "data: [DONE]\n\n"
)


def _handler(request: httpx.Request) -> httpx.Response:
    assert request.url.path.endswith("/chat/completions")
    return httpx.Response(200, text=_SSE_BODY)


def _adapter() -> OpenAICompatInference:
    adapter = OpenAICompatInference(base_url="http://engine/v1", api_key="x")
    # MockTransport 로 교체(실제 네트워크 없이).
    adapter._client = httpx.AsyncClient(
        base_url="http://engine/v1", transport=httpx.MockTransport(_handler)
    )
    return adapter


async def test_stream_parses_deltas_and_usage_then_stops_on_done() -> None:
    adapter = _adapter()
    req = GenerationRequestRecord(
        model="qwen3-14b",
        messages=[PromptMessageRecord(role="user", content="hi")],
        stream=True,
    )
    chunks = [c async for c in adapter.stream(req)]
    await adapter.aclose()

    text = "".join(c.delta for c in chunks)
    assert text == "안녕하세요"

    usage = next((c.usage for c in chunks if c.usage is not None), None)
    assert usage is not None
    assert usage.total == 5
