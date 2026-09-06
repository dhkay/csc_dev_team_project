"""외부 호출 재시도 경계 잠금.

여기서 지키는 건 "재시도한다"보다 "무엇을 재시도하지 않는가" 다.

배경: 기획서 생성이 prod 에서 한 번 죽었다. 원인은 벤더로 나가는 TCP 연결이 순간적으로 실패한
것(`httpx.ConnectError: All connection attempts failed`)인데, Anthropic 어댑터에 재시도가 없어
그대로 500 이 됐다. 그래서 연결 단계 재시도를 넣었다.

동시에 그 재시도가 응답을 받은 요청까지 다시 보내면 안 된다. 이미지 생성과 LLM 호출은 호출당
과금이라, 벤더에 닿은 요청을 재전송하는 순간 같은 작업을 두 번 청구당한다. 그 경계가 무너지는 건
조용해서(요금 청구서에서야 드러난다) 테스트로 못박는다.
"""

from __future__ import annotations

import httpcore
import httpx
import pytest

from app.domains.inference.adapters.outbound.inference.anthropic import AnthropicInference
from app.domains.inference.core.domain.errors import ExternalInferenceError
from app.domains.inference.core.domain.types import (
    GenerationRequestRecord,
    PromptMessageRecord,
)
from app.shared.adapters.outbound.http.client import (
    DEFAULT_CONNECT_RETRIES,
    create_http_client,
)


class _StubResolver:
    """조직 자격증명 해석 대역. 이 파일은 자격증명이 아니라 재시도 경계를 본다."""

    async def resolve(self, organization_id: str, provider: str) -> dict[str, str]:
        return {"apiKey": "test-key"}


def _request() -> GenerationRequestRecord:
    return GenerationRequestRecord(
        model="claude-opus-5",
        messages=[PromptMessageRecord(role="user", content="안녕")],
        organization_id="3",
        credential_provider="anthropic",
    )


class TestClientConstruction:
    def test_기본_클라이언트는_연결_재시도를_켠다(self) -> None:
        client = create_http_client(base_url="http://vendor", timeout=1.0)
        assert isinstance(client._transport, httpx.AsyncHTTPTransport)
        assert client._transport._pool._retries == DEFAULT_CONNECT_RETRIES

    def test_보조_조회는_재시도를_끌_수_있다(self) -> None:
        # 부하 표시처럼 실패하면 접는 호출은 죽은 대상을 두 번 두드릴 이유가 없다.
        client = create_http_client(base_url="http://vendor", timeout=1.0, retries=0)
        assert client._transport._pool._retries == 0

    def test_주입된_대역이_재시도_트랜스포트를_이긴다(self) -> None:
        # 테스트 대역이 재시도 트랜스포트에 가려지면 무엇을 검증하는지 흐려진다.
        mock = httpx.MockTransport(lambda request: httpx.Response(200))
        client = create_http_client(base_url="http://vendor", timeout=1.0, transport=mock)
        assert client._transport is mock

    def test_base_url_끝_슬래시를_정리한다(self) -> None:
        client = create_http_client(base_url="http://vendor/", timeout=1.0)
        assert str(client.base_url) == "http://vendor"


class TestNoResendAfterResponse:
    """응답을 받은 요청은 절대 다시 보내지 않는다(중복 과금 방지)."""

    @pytest.mark.asyncio
    async def test_벤더가_500_을_주면_한_번만_보낸다(self) -> None:
        calls: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request)
            return httpx.Response(500, json={"error": "overloaded"})

        adapter = AnthropicInference(
            resolver=_StubResolver(),
            base_url="http://vendor",
            timeout=1.0,
            default_max_tokens=64,
            transport=httpx.MockTransport(handler),
        )

        with pytest.raises(ExternalInferenceError):
            await adapter.generate(_request())

        # 500 은 벤더가 요청을 받아 처리한 결과다. 다시 보내면 두 번 청구된다.
        assert len(calls) == 1

    @pytest.mark.asyncio
    async def test_벤더가_429_를_주어도_한_번만_보낸다(self) -> None:
        # 429(레이트리밋)는 재시도하고 싶어지는 대표적인 상태다. 하지만 그 판단은 백오프 정책과
        # 함께 와야 하고, 연결 단계 재시도가 조용히 대신하면 안 된다.
        calls: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request)
            return httpx.Response(429, json={"error": "rate_limited"})

        adapter = AnthropicInference(
            resolver=_StubResolver(),
            base_url="http://vendor",
            timeout=1.0,
            default_max_tokens=64,
            transport=httpx.MockTransport(handler),
        )

        with pytest.raises(ExternalInferenceError):
            await adapter.generate(_request())

        assert len(calls) == 1

    @pytest.mark.asyncio
    async def test_성공한_요청도_한_번만_보낸다(self) -> None:
        calls: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request)
            return httpx.Response(
                200,
                json={
                    "content": [{"type": "text", "text": "안녕하세요"}],
                    "usage": {"input_tokens": 3, "output_tokens": 5},
                },
            )

        adapter = AnthropicInference(
            resolver=_StubResolver(),
            base_url="http://vendor",
            timeout=1.0,
            default_max_tokens=64,
            transport=httpx.MockTransport(handler),
        )

        result = await adapter.generate(_request())

        assert result.text == "안녕하세요"
        assert len(calls) == 1


class _CountingBackend(httpcore.AsyncNetworkBackend):
    """TCP 연결 시도 횟수를 세는 네트워크 대역. 연결은 항상 거부한다.

    MockTransport 로는 이걸 볼 수 없다. 그건 트랜스포트 자리를 통째로 대신해서 '이미 연결된 척'
    하므로 재시도 로직(httpcore `_connect`)을 지나가지 않는다. 그래서 한 겹 아래인 네트워크
    백엔드를 갈아 끼워 실제 재시도 경로를 통과시킨다.
    """

    def __init__(self) -> None:
        self.attempts = 0

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):  # noqa: ANN001, ANN201 - httpcore 시그니처 그대로
        self.attempts += 1
        raise httpcore.ConnectError("All connection attempts failed")

    async def sleep(self, seconds: float) -> None:
        # 재시도 사이 백오프. 테스트에서는 기다리지 않는다.
        return None


def _count_connect_attempts(client: httpx.AsyncClient) -> _CountingBackend:
    backend = _CountingBackend()
    client._transport._pool._network_backend = backend  # type: ignore[attr-defined]
    return backend


class TestConnectRetry:
    """연결이 맺어지지 않은 요청은 다시 시도한다(prod 에서 죽은 그 경로)."""

    @pytest.mark.asyncio
    async def test_연결_실패는_한_번_더_시도한다(self) -> None:
        client = create_http_client(base_url="http://vendor", timeout=1.0)
        backend = _count_connect_attempts(client)

        with pytest.raises(httpx.ConnectError):
            await client.get("/v1/messages")

        # 기대값을 상수로 쓰지 않고 숫자로 못박는다. `DEFAULT_CONNECT_RETRIES + 1` 로 쓰면
        # 상수를 0 으로 되돌려도 테스트가 같이 따라가서 통과한다(자기 자신을 검증하는 셈).
        # 여기서 지켜야 하는 건 상수와의 일관성이 아니라 "한 번으로 끝나지 않는다"는 정책이다.
        assert backend.attempts > 1, "연결 실패가 한 번으로 끝나면 prod 장애가 그대로 재현된다"
        assert backend.attempts == 2

    @pytest.mark.asyncio
    async def test_재시도를_끄면_한_번만_시도한다(self) -> None:
        client = create_http_client(base_url="http://vendor", timeout=1.0, retries=0)
        backend = _count_connect_attempts(client)

        with pytest.raises(httpx.ConnectError):
            await client.get("/queue")

        assert backend.attempts == 1
