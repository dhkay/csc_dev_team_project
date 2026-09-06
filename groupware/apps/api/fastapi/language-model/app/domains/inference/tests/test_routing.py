"""RoutingInference 디스패치 + build_inference 레지스트리 와이어링 테스트.

- provider 별로 올바른 어댑터에 디스패치하는지, 미등록 provider 는 default 로 폴백하는지.
- 외부(external) 어댑터가 조직 자격증명 미등록 시 CredentialNotConfiguredError 로 명확히 실패하는지.
- build_inference 가 stub/비-stub 설정에서 internal 은 레거시 동작(에코/내부 라우팅), external 은
  stub 모드에서도 등록됨을 재현하는지(Claude 는 원격 API 라 GPU 무관).
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.domains.inference.adapters.outbound.inference.anthropic import (
    AnthropicInference,
)
from app.domains.inference.adapters.outbound.inference.routing import RoutingInference
from app.domains.inference.core.domain.errors import CredentialNotConfiguredError
from app.domains.inference.core.domain.types import (
    EmbeddingRequestRecord,
    GenerationChunkRecord,
    GenerationRequestRecord,
    GenerationResultRecord,
    PromptMessageRecord,
)
from app.domains.inference.module import build_inference


class _Rec:
    """호출된 provider 를 표시로 되돌리는 가짜 InferencePort."""

    def __init__(self, tag: str) -> None:
        self.tag = tag
        self.closed = False

    async def generate(self, req: GenerationRequestRecord) -> GenerationResultRecord:
        return GenerationResultRecord(text=self.tag)

    async def stream(self, req: GenerationRequestRecord):
        yield GenerationChunkRecord(delta=self.tag)

    async def embed(self, req: EmbeddingRequestRecord):
        return []

    async def aclose(self) -> None:
        self.closed = True


class _FakeResolver:
    """CredentialResolverPort 가짜: 등록된 자격증명 유무를 주입한다."""

    def __init__(self, creds: dict | None = None) -> None:
        self._creds = creds

    async def resolve(self, organization_id: str, provider: str):
        return self._creds

    async def has(self, organization_id: str, provider: str) -> bool:
        return bool(self._creds and self._creds.get("apiKey"))


def _req(
    provider: str,
    *,
    organization_id: str | None = None,
    credential_provider: str | None = None,
) -> GenerationRequestRecord:
    return GenerationRequestRecord(
        model="m",
        messages=[PromptMessageRecord(role="user", content="hi")],
        provider=provider,
        organization_id=organization_id,
        credential_provider=credential_provider,
    )


async def test_dispatches_by_provider() -> None:
    a, b = _Rec("a"), _Rec("b")
    router = RoutingInference({"a": a, "b": b}, default_provider="a")

    result = await router.generate(_req("b"))
    assert result.text == "b"


async def test_unknown_provider_falls_back_to_default() -> None:
    a, b = _Rec("a"), _Rec("b")
    router = RoutingInference({"a": a, "b": b}, default_provider="a")

    chunks = [c async for c in router.stream(_req("does-not-exist"))]
    assert "".join(c.delta for c in chunks) == "a"


async def test_aclose_closes_all_adapters() -> None:
    a, b = _Rec("a"), _Rec("b")
    router = RoutingInference({"a": a, "b": b}, default_provider="a")
    await router.aclose()
    assert a.closed and b.closed


def test_invalid_default_provider_raises() -> None:
    with pytest.raises(ValueError):
        RoutingInference({"a": _Rec("a")}, default_provider="missing")


async def test_anthropic_adapter_requires_org_credential() -> None:
    # 조직 키 미등록(resolver 가 None 반환) → 명확한 도메인 에러로 실패(generate/stream 둘 다).
    ext = AnthropicInference(
        resolver=_FakeResolver(creds=None),
        base_url="https://api.anthropic.com",
        timeout=1.0,
        default_max_tokens=64,
    )
    req = _req("anthropic", organization_id="1", credential_provider="ANTHROPIC")
    with pytest.raises(CredentialNotConfiguredError):
        await ext.generate(req)
    with pytest.raises(CredentialNotConfiguredError):
        _ = [c async for c in ext.stream(req)]


def _stub_settings() -> SimpleNamespace:
    return SimpleNamespace(
        inference_engine="stub",
        inference_default_provider="internal",
        inference_base_url="http://engine/v1",
        inference_api_key="x",
        inference_timeout_s=1.0,
        inference_enable_thinking=False,
        external_base_url="https://api.anthropic.com",
        external_timeout_s=1.0,
        external_max_tokens=64,
        llm_max_concurrency=4,
    )


async def test_build_inference_stub_echoes_even_for_internal_provider() -> None:
    # stub 모드: internal 요청도 default=stub 로 폴백해 에코(네트워크 미접촉).
    infer = build_inference(_stub_settings(), _FakeResolver())
    result = await infer.generate(_req("internal"))
    await infer.aclose()
    assert result.text.startswith("(에코)")


async def test_build_inference_registers_vendor_even_in_stub_mode() -> None:
    # 외부 벤더(anthropic)는 원격 API 라 stub 모드에서도 등록된다. 조직 키 미등록이면 명확히 실패
    #   (= 벤더 요청이 stub 로 폴백하지 않고 벤더 어댑터로 라우팅됐다는 증거).
    infer = build_inference(_stub_settings(), _FakeResolver(creds=None))
    with pytest.raises(CredentialNotConfiguredError):
        await infer.generate(
            _req("anthropic", organization_id="1", credential_provider="ANTHROPIC")
        )
    await infer.aclose()
