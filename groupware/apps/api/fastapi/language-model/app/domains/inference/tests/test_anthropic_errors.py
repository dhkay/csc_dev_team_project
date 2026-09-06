"""Anthropic 오류 응답 분류: 한도와 크레딧 부족을 일반 벤더 오류와 가른다.

조치가 정반대다. 한도는 기다리면 풀리고 크레딧은 사람이 채워야 한다. 둘을 같은 502 로 덮으면
기다리면 되는 사람에게 결제를 확인하라고 하고, 결제가 필요한 사람에게 잠시 후 다시 시도하라고 한다.
"""

from __future__ import annotations

import httpx
import pytest

from app.domains.inference.adapters.outbound.inference.anthropic import AnthropicInference
from app.domains.inference.core.domain.errors import (
    ExternalInferenceError,
    ExternalQuotaExceededError,
    ExternalRateLimitedError,
)
from app.domains.inference.core.domain.types import (
    GenerationRequestRecord,
    PromptMessageRecord,
)


class _Resolver:
    async def resolve(self, organization_id: str, provider: str):
        return {"apiKey": "sk-test"}

    async def has(self, organization_id: str, provider: str) -> bool:
        return True


def _adapter(status: int, body: dict) -> AnthropicInference:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json=body)

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
        messages=[PromptMessageRecord(role="user", content="안녕")],
        stream=False,
        provider="anthropic",
        organization_id="1",
        credential_provider="ANTHROPIC",
    )


def _error(kind: str, message: str) -> dict:
    return {"type": "error", "error": {"type": kind, "message": message}}


async def test_rate_limit_is_classified() -> None:
    """429 rate_limit_error 는 한도다."""
    with pytest.raises(ExternalRateLimitedError):
        await _adapter(429, _error("rate_limit_error", "This request would exceed your rate limit")).generate(_req())


async def test_overloaded_is_classified_as_rate_limit() -> None:
    """529 overloaded_error 도 시점의 문제라 같은 부류다."""
    with pytest.raises(ExternalRateLimitedError):
        await _adapter(529, _error("overloaded_error", "Overloaded")).generate(_req())


async def test_low_credit_is_classified() -> None:
    """크레딧 부족은 전용 상태가 아니라 400 본문의 문구로만 온다."""
    body = _error(
        "invalid_request_error",
        "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing.",
    )
    with pytest.raises(ExternalQuotaExceededError) as exc:
        await _adapter(400, body).generate(_req())
    assert "credit balance" in str(exc.value), "벤더 본문은 진단을 위해 남는다"


async def test_other_bad_requests_stay_generic() -> None:
    """같은 400 이라도 크레딧 문구가 없으면 일반 벤더 오류다(잘못 가르면 결제 안내가 엉뚱하게 뜬다)."""
    with pytest.raises(ExternalInferenceError) as exc:
        await _adapter(400, _error("invalid_request_error", "temperature is deprecated")).generate(_req())
    assert not isinstance(exc.value, (ExternalRateLimitedError, ExternalQuotaExceededError))
