"""AnthropicInference 파싱 테스트: httpx.MockTransport 로 Messages API 응답 주입(실 네트워크 없이).

스트리밍 SSE(content_block_delta/message_delta) → 청크/usage 매핑, 비스트리밍 텍스트 추출,
그리고 4xx 오류 시 벤더 본문을 담은 ExternalInferenceError 를 검증한다.
"""

from __future__ import annotations

import json
from dataclasses import replace

import httpx
import pytest

from app.domains.inference.adapters.outbound.inference.anthropic import (
    AnthropicInference,
)
from app.domains.inference.core.domain.errors import ExternalInferenceError
from app.domains.inference.core.domain.thinking import ThinkingControl
from app.domains.inference.core.domain.types import (
    GenerationRequestRecord,
    PromptMessageRecord,
)

_SSE_BODY = (
    'event: message_start\n'
    'data: {"type":"message_start","message":{"usage":{"input_tokens":11}}}\n\n'
    'event: content_block_delta\n'
    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"안녕"}}\n\n'
    'event: content_block_delta\n'
    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"하세요"}}\n\n'
    'event: message_delta\n'
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}\n\n'
    'event: message_stop\n'
    'data: {"type":"message_stop"}\n\n'
)


class _Resolver:
    """조직 키가 항상 등록된 CredentialResolverPort 가짜."""

    async def resolve(self, organization_id: str, provider: str):
        return {"apiKey": "sk-test"}

    async def has(self, organization_id: str, provider: str) -> bool:
        return True


def _adapter(handler) -> AnthropicInference:  # noqa: ANN001
    return AnthropicInference(
        resolver=_Resolver(),
        base_url="https://api.anthropic.com",
        timeout=5.0,
        default_max_tokens=64,
        transport=httpx.MockTransport(handler),
    )


def _req() -> GenerationRequestRecord:
    return GenerationRequestRecord(
        model="claude-sonnet-5",
        messages=[
            PromptMessageRecord(role="system", content="간결하게."),
            PromptMessageRecord(role="user", content="안녕"),
        ],
        stream=True,
        provider="anthropic",
        organization_id="1",
        credential_provider="ANTHROPIC",
    )


async def test_stream_maps_deltas_usage_and_finish() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/messages"
        assert request.headers["x-api-key"] == "sk-test"
        assert request.headers["anthropic-version"] == "2023-06-01"
        return httpx.Response(200, text=_SSE_BODY)

    chunks = [c async for c in _adapter(handler).stream(_req())]

    assert "".join(c.delta for c in chunks) == "안녕하세요"
    last = chunks[-1]
    assert last.finish_reason == "end_turn"
    assert last.usage is not None
    assert (last.usage.prompt, last.usage.completion, last.usage.total) == (11, 7, 18)


async def test_stream_splits_system_and_omits_temperature() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(200, text=_SSE_BODY)

    _ = [c async for c in _adapter(handler).stream(_req())]

    assert seen["system"] == "간결하게."  # system 은 top-level 로 분리
    assert seen["messages"] == [{"role": "user", "content": "안녕"}]  # system 은 messages 에서 제외
    assert "temperature" not in seen  # 최신 Claude 모델 대응(미전송)
    assert seen["stream"] is True


async def test_generate_extracts_text() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "content": [{"type": "text", "text": "안녕하세요"}],
                "usage": {"input_tokens": 11, "output_tokens": 7},
            },
        )

    result = await _adapter(handler).generate(_req())
    assert result.text == "안녕하세요"
    assert result.usage is not None and result.usage.total == 18


async def test_thinking_wire_follows_the_catalog_form_and_the_request_intent() -> None:
    """무엇을 실을지는 카탈로그의 제어 형식과 요청 의도가 함께 정한다.

    생략하면 모델의 기본값이 사고 여부를 정해, 모델을 바꾸는 행위가 곧 사고 토글이 된다.
    끌 수 있는 모델에서 끌 때도 disabled 를 명시하는 이유다.
    """
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(200, json={"content": [{"type": "text", "text": "네"}]})

    adapter, base = _adapter(handler), _req()
    for control, wants in [
        (ThinkingControl.TOGGLE, False),
        (ThinkingControl.TOGGLE, True),
        (ThinkingControl.OMIT, False),
        (ThinkingControl.OMIT, True),
        (ThinkingControl.FORCED, False),
    ]:
        await adapter.generate(
            replace(base, thinking_control=control, enable_thinking=wants)
        )

    assert [b.get("thinking") for b in seen] == [
        {"type": "disabled"},  # 끌 수 있는 모델은 끌 때도 명시한다
        {"type": "adaptive"},  # 켤 때의 형식
        None,  # 생략형: 필드를 넣지 않는다
        None,  # 생략형에 켜 달라고 해도 그 형식으로는 켤 수 없다(400 을 부르지 않는다)
        None,  # 끌 수 없는 등급: 보낼 값이 없고 예산이 흡수한다
    ]


async def test_stream_uses_the_same_thinking_mapping() -> None:
    """스트림도 같은 매핑을 쓴다. 두 경로가 갈리면 채팅만 사고가 켜지는 상태가 생긴다."""
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(200, text=_SSE_BODY)

    req = replace(_req(), thinking_control=ThinkingControl.TOGGLE)
    _ = [c async for c in _adapter(handler).stream(req)]

    assert seen[0]["thinking"] == {"type": "disabled"}
    assert seen[0]["stream"] is True


async def test_generate_rejects_response_without_text_block() -> None:
    """text 블록 없는 200 은 실패로 올린다.

    빈 문자열로 돌려주면 소비자(기획 생성 등)의 파싱 실패로 뒤집혀 보고되고, 원인이 벤더 응답이
    아니라 파서를 가리킨다. 진단에 필요한 stop_reason 과 블록 종류를 메시지에 담는다.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "content": [{"type": "thinking", "thinking": ""}],
                "stop_reason": "max_tokens",
                "usage": {"input_tokens": 237, "output_tokens": 1024},
            },
        )

    with pytest.raises(ExternalInferenceError) as exc:
        await _adapter(handler).generate(_req())
    msg = str(exc.value)
    assert "max_tokens" in msg and "thinking" in msg


async def test_error_surfaces_vendor_body() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            400,
            json={"type": "error", "error": {"message": "temperature is deprecated"}},
        )

    with pytest.raises(ExternalInferenceError) as exc:
        _ = [c async for c in _adapter(handler).stream(_req())]
    msg = str(exc.value)
    assert "400" in msg and "temperature is deprecated" in msg
