"""무상태 생성(/inference/generate) 테스트: resolve_chat_by_ref + 서비스 + 라우터(서비스토큰).

- resolve_chat_by_ref: 카탈로그 키 / served 이름 / 미지 폴백.
- InferenceGenerationService: served/provider/credential/org 전파 + system 프리펜드 + 비스트리밍.
- 라우터: csc-marketing 토큰 200, 허용 외 서비스 403(require_services), body organizationId 신뢰.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from csc_net_utils import create_service_token

from app.config import get_settings
from app.domains.inference.adapters.inbound.http.router import (
    get_inference_generation_service,
)
from app.domains.inference.adapters.outbound.inference.openai_compat import (
    OpenAICompatInference,
)
from app.domains.inference.core.application.model_catalog import ModelCatalog
from app.domains.inference.core.application.services import InferenceGenerationService
from app.domains.inference.core.domain.errors import InferenceEngineUnavailableError
from app.domains.inference.core.domain.types import (
    EmbeddingRequestRecord,
    GenerationChunkRecord,
    GenerationRequestRecord,
    GenerationResultRecord,
    ModelSpecRecord,
    PromptMessageRecord,
)
from app.main import create_app


def _catalog() -> ModelCatalog:
    # key = 프론트 옵션 key/단가표 key(통일된 네임스페이스). served 이름은 엔진 배포명이라 다르다.
    specs = {
        "internal-qwen3": ModelSpecRecord(
            key="internal-qwen3",
            served_model_name="qwen3-14b",
            kind="chat",
            provider="internal",
            available=True,
        ),
        "claude-opus-4-8": ModelSpecRecord(
            key="claude-opus-4-8",
            served_model_name="claude-opus-4-8",
            kind="chat",
            provider="anthropic",
            credential_provider="ANTHROPIC",
            available=True,
        ),
    }
    return ModelCatalog(specs, default_key="internal-qwen3")


class _FakeInference:
    """InferencePort 가짜: 마지막 요청을 캡처하고 고정 텍스트를 반환한다."""

    def __init__(self) -> None:
        self.captured: GenerationRequestRecord | None = None

    async def generate(self, req: GenerationRequestRecord) -> GenerationResultRecord:
        self.captured = req
        return GenerationResultRecord(text="ok")

    async def stream(self, req: GenerationRequestRecord):
        yield GenerationChunkRecord(delta="ok")

    async def embed(self, req: EmbeddingRequestRecord):
        return []

    async def aclose(self) -> None:
        pass


def test_resolve_chat_by_ref_matches_key_served_and_falls_back() -> None:
    cat = _catalog()
    # 카탈로그 키 매칭(= 프론트가 저장하는 값과 같은 key).
    assert cat.resolve_chat_by_ref("claude-opus-4-8").served_model_name == "claude-opus-4-8"
    # 구 key(통일 전 저장값)도 같은 spec 으로 해석돼야 한다. 아니면 과거 기록/설정이 조용히
    #   기본 모델로 폴백해, 작업자가 고른 적 없는 모델로 응답하고 비용도 그쪽에 붙는다.
    legacy = cat.resolve_chat_by_ref("claude-opus")
    assert legacy.key == "claude-opus-4-8"
    assert legacy.provider == "anthropic"
    assert legacy.credential_provider == "ANTHROPIC"
    # served 이름(엔진 배포명)으로도 해석된다. 구 저장값이 그 형태일 수 있다.
    assert cat.resolve_chat_by_ref("qwen3-14b").key == "internal-qwen3"
    # 미지 id → 기본 chat 폴백.
    assert cat.resolve_chat_by_ref("nope-9").key == "internal-qwen3"
    # None → 기본.
    assert cat.resolve_chat_by_ref(None).key == "internal-qwen3"


async def test_service_propagates_resolved_spec_and_prepends_system() -> None:
    fake = _FakeInference()
    svc = InferenceGenerationService(fake, _catalog())

    result = await svc.generate(
        organization_id="7",
        model="claude-opus-4-8",  # served 이름으로 호출
        system="너는 기획자",
        messages=[PromptMessageRecord(role="user", content="안녕")],
        max_tokens=123,
        temperature=0.5,
    )

    assert result.text == "ok"
    req = fake.captured
    assert req is not None
    assert req.model == "claude-opus-4-8"  # served
    assert req.provider == "anthropic"
    assert req.credential_provider == "ANTHROPIC"
    assert req.organization_id == "7"
    assert req.stream is False
    assert req.max_tokens == 123
    assert req.temperature == 0.5
    assert req.messages[0].role == "system"
    assert req.messages[0].content == "너는 기획자"
    assert req.messages[1].content == "안녕"


class _FakeGenService:
    """InferenceGenerationInboundPort 가짜: 라우터 배선/인증만 검증."""

    async def generate(
        self, organization_id, model, system, messages, max_tokens=None, temperature=0.7
    ) -> GenerationResultRecord:  # noqa: ANN001
        return GenerationResultRecord(text="PLAN_JSON")


async def test_generate_route_allows_csc_marketing_and_rejects_others() -> None:
    app = create_app()
    app.dependency_overrides[get_inference_generation_service] = lambda: _FakeGenService()
    secret = get_settings().service_token_secret
    body = {
        "organizationId": "1",
        "model": "claude-opus-4-8",
        "messages": [{"role": "user", "content": "hi"}],
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        ok = await client.post(
            "/inference/generate",
            headers={"X-Service-Token": create_service_token(secret, "csc-marketing")},
            json=body,
        )
        assert ok.status_code == 200
        assert ok.json()["text"] == "PLAN_JSON"

        # 허용 목록엔 있지만 이 라우터의 require_services 엔 없는 서비스 → 403.
        denied = await client.post(
            "/inference/generate",
            headers={"X-Service-Token": create_service_token(secret, "web-groupware")},
            json=body,
        )
        assert denied.status_code == 403


class _EngineDownGenService:
    """생성 시 추론 엔진 연결 실패를 던지는 가짜: 라우터의 502 매핑 검증."""

    async def generate(self, **kwargs) -> GenerationResultRecord:  # noqa: ANN003
        raise InferenceEngineUnavailableError("엔진 연결 실패")


async def test_generate_route_maps_engine_unavailable_to_502() -> None:
    app = create_app()
    app.dependency_overrides[get_inference_generation_service] = lambda: _EngineDownGenService()
    secret = get_settings().service_token_secret

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post(
            "/inference/generate",
            headers={"X-Service-Token": create_service_token(secret, "csc-marketing")},
            json={"organizationId": "1", "messages": [{"role": "user", "content": "hi"}]},
        )
    assert r.status_code == 502
    assert "추론 엔진" in r.json()["detail"]


async def test_openai_compat_raises_engine_unavailable_on_connect_error() -> None:
    # 죽은 포트(연결 거부) → httpx.ConnectError → InferenceEngineUnavailableError 로 승격.
    infer = OpenAICompatInference(base_url="http://127.0.0.1:1/v1", api_key="x", timeout=1.0)
    req = GenerationRequestRecord(
        model="m",
        messages=[PromptMessageRecord(role="user", content="hi")],
        stream=False,
        provider="internal",
    )
    try:
        with pytest.raises(InferenceEngineUnavailableError):
            await infer.generate(req)
    finally:
        await infer.aclose()


async def test_openai_compat_distinguishes_slow_engine_from_unreachable_engine() -> None:
    """읽기 타임아웃(엔진이 느림) vs 연결 실패(엔진에 못 닿음): 조치가 정반대라 반드시 갈라야 한다.

    공유 vLLM(csc-ai-vllm: dev/staging/prod 공용 GPU 1장)은 바빠도 요청을 거절하지 않고 큐에 담아
    느려질 뿐이다. 그 지연을 '연결할 수 없습니다'로 보고하면 멀쩡한 엔진의 기동 상태를 뒤지게 된다.
    (ConnectTimeout 도 TimeoutException 이라 '타임아웃 = 느림'으로 뭉치면 정확히 반대로 진단한다.)
    """
    import httpx

    from app.domains.inference.core.domain.errors import InferenceEngineTimeoutError

    def _raise(exc: Exception):
        def handler(request: httpx.Request) -> httpx.Response:
            raise exc

        return handler

    req = GenerationRequestRecord(
        model="m",
        messages=[PromptMessageRecord(role="user", content="hi")],
        stream=False,
        provider="internal",
    )

    # 엔진이 느림(응답 대기 중 타임아웃) → Timeout 계열.
    slow = OpenAICompatInference(base_url="http://engine/v1", api_key="x", timeout=1.0)
    slow._client = httpx.AsyncClient(
        base_url="http://engine/v1",
        transport=httpx.MockTransport(_raise(httpx.ReadTimeout("read timed out"))),
    )
    with pytest.raises(InferenceEngineTimeoutError):
        await slow.generate(req)
    await slow.aclose()

    # 엔진에 못 닿음(연결 자체가 타임아웃) → Unavailable 이어야 한다(Timeout 으로 새면 안 된다).
    gone = OpenAICompatInference(base_url="http://engine/v1", api_key="x", timeout=1.0)
    gone._client = httpx.AsyncClient(
        base_url="http://engine/v1",
        transport=httpx.MockTransport(_raise(httpx.ConnectTimeout("connect timed out"))),
    )
    with pytest.raises(InferenceEngineUnavailableError):
        await gone.generate(req)
    await gone.aclose()


async def test_service_reports_public_identity_for_cost_attribution() -> None:
    """응답의 model 은 공용 식별자(served 이름) 여야 한다. 비용 귀속의 전제.

    호출자(csc-marketing)가 빈 모델을 보내는 경우가 실제로 있다(채널이 LLM 을 안 골랐을 때).
    그때 응답이 요청값(빈 문자열)을 되돌려주면 비용을 어느 모델에 붙일지 알 수 없어
    'rate-unknown' 으로 영구히 새어 나간다.

    카탈로그 내부 key('claude-opus')를 실어도 같은 결과가 된다. 단가 카드는 공용 key
    ('claude-opus-4-8')로만 조회되기 때문이다. 실제로 그렇게 새서 이 단언이 뒤집혔다.
    """
    fake = _FakeInference()
    svc = InferenceGenerationService(fake, _catalog())

    # 빈 모델 → 카탈로그가 기본 모델을 고른다.
    result = await svc.generate(
        organization_id="7",
        model=None,
        system=None,
        messages=[PromptMessageRecord(role="user", content="안녕")],
    )

    assert result.model, "resolve 된 모델 신원이 비어 있으면 비용을 귀속할 수 없다"
    # 카탈로그 key 그대로: 그 값이 곧 aiModelOptions/단가표의 key 다(네임스페이스 통일).
    assert result.model == _catalog().resolve_chat_by_ref(None, "7").key
    assert result.model == "internal-qwen3"


async def test_service_reports_catalog_key_even_for_legacy_ref() -> None:
    """구 key 로 호출해도 응답은 현재 카탈로그 key 다. 단가 조회가 그 key 로 이뤄진다.

    이 테스트가 막는 회귀: 저장된 구 값을 그대로 되돌려주어(또는 엔진 배포명을 실어) 호출자의
    단가 조회를 깨뜨리는 것. 실제로 그렇게 새서 기획서 생성 1건의 금액이 기록되지 않았다.
    """
    svc = InferenceGenerationService(_FakeInference(), _catalog())

    result = await svc.generate(
        organization_id="7",
        model="claude-opus",  # 구 key(통일 전 저장값)
        system=None,
        messages=[PromptMessageRecord(role="user", content="안녕")],
    )

    assert result.model == "claude-opus-4-8"
