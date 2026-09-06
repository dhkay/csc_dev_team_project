"""무상태 이미지 생성(/inference/images) 테스트.

- resolve_image_by_ref: 카탈로그 키 / served 이름 / 프론트 저장 id 폴백.
- ImageGenerationService: served/provider/credential/org 전파 + size/quality 기본값.
- OpenAIImageInference: MockTransport 로 b64_json 파싱, 키 미등록 예외.
- 라우터: csc-marketing 토큰 200, 허용 외 서비스 403(require_services).
"""

from __future__ import annotations

import dataclasses
import json

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from csc_net_utils import create_service_token

from app.config import get_settings
from app.domains.inference.adapters.inbound.http.router import (
    get_image_generation_service,
)
from app.domains.inference.adapters.outbound.image.flux_schnell_workflow import (
    build_flux_schnell_workflow,
)

from app.domains.inference.adapters.outbound.image.openai_image import (
    OpenAIImageInference,
)
from app.domains.inference.core.application.model_catalog import ModelCatalog
from app.domains.inference.core.application.services import ImageGenerationService
from app.domains.inference.core.domain.image_failure import (
    ImageFailure,
    ImageFailureOrigin,
    ImageGenerationFailedError,
)
from app.domains.inference.core.domain.types import (
    ImageGenerationRequestRecord,
    ImageGenerationResultRecord,
    ImageResultRecord,
    ModelSpecRecord,
)
from app.main import create_app

# 테스트가 쓰는 unet: 실배포 기본값은 config(IMAGE_FLUX_UNET_NAME)가 소유하므로 여기선 명시한다.
_GGUF_UNET = "flux1-schnell-Q4_K_S.gguf"
_ALLINONE_CKPT = "flux1-schnell-fp8.safetensors"


def _catalog() -> ModelCatalog:
    specs = {
        "qwen": ModelSpecRecord(
            key="qwen",
            served_model_name="qwen3-14b",
            kind="chat",
            provider="internal",
            available=True,
        ),
        # key 는 프론트 옵션 key(aiModelOptions.ts)와 동일해야 한다. 카탈로그 실물과 같은 형태로 둔다.
        "gpt-image-2": ModelSpecRecord(
            key="gpt-image-2",
            served_model_name="gpt-image-2",
            kind="image",
            provider="openai",
            credential_provider="OPENAI",
            available=True,
        ),
        "flux-schnell": ModelSpecRecord(
            key="flux-schnell",
            served_model_name="flux-schnell",
            kind="image",
            provider="comfyui",
            credential_provider=None,
            available=True,
        ),
    }
    return ModelCatalog(specs, default_key="qwen", default_image_key="gpt-image-2")


class _Resolver:
    """조직 키가 항상 등록된 CredentialResolverPort 가짜."""

    async def resolve(self, organization_id: str, provider: str):
        return {"apiKey": "sk-openai-test"}

    async def has(self, organization_id: str, provider: str) -> bool:
        return True


class _EmptyResolver:
    async def resolve(self, organization_id: str, provider: str):
        return None

    async def has(self, organization_id: str, provider: str) -> bool:
        return False


class _FakeImage:
    """ImageGenerationPort 가짜: 마지막 요청 캡처 + 고정 이미지 반환."""

    def __init__(self) -> None:
        self.captured: ImageGenerationRequestRecord | None = None

    async def generate(
        self, req: ImageGenerationRequestRecord
    ) -> ImageGenerationResultRecord:
        self.captured = req
        return ImageGenerationResultRecord(images=[ImageResultRecord(b64="AAAA")])

    async def aclose(self) -> None:
        pass


def test_resolve_image_by_ref_matches_key_served_and_falls_back() -> None:
    cat = _catalog()
    # 프론트가 저장하는 key('gpt-image-2', aiModelOptions.ts)가 그대로 매칭돼야 한다
    # 카탈로그 key 와 어긋나면 폴백이 삼켜서 고른 것과 다른 모델로 생성된다(회귀 방지).
    picked = cat.resolve_image_by_ref("gpt-image-2")
    assert picked.key == "gpt-image-2"
    assert picked.served_model_name == "gpt-image-2"
    assert picked.provider == "openai"
    assert picked.credential_provider == "OPENAI"
    # None → 기본 image.
    assert cat.resolve_image_by_ref(None).key == "gpt-image-2"
    # 미지 ref → 기본 image 폴백(경고 로그와 함께).
    assert cat.resolve_image_by_ref("does-not-exist").key == "gpt-image-2"
    # 내장(자체) 이미지 키: provider=comfyui, credential 없음.
    flux = cat.resolve_image_by_ref("flux-schnell")
    assert flux.key == "flux-schnell"
    assert flux.provider == "comfyui"
    assert flux.credential_provider is None


def test_resolve_image_by_ref_warns_when_selection_falls_back(caplog) -> None:  # noqa: ANN001
    # 조용한 폴백이 이 버그를 오래 묻었다. 선택이 해석되지 않으면 반드시 흔적을 남긴다.
    cat = _catalog()
    with caplog.at_level("WARNING"):
        cat.resolve_image_by_ref("gpt-image-9")
    assert any("gpt-image-9" in r.getMessage() for r in caplog.records)

    # 미지정(None)은 정상 경로라 경고하지 않는다.
    caplog.clear()
    with caplog.at_level("WARNING"):
        cat.resolve_image_by_ref(None)
    assert not caplog.records


async def test_service_propagates_resolved_spec_and_defaults() -> None:
    fake = _FakeImage()
    svc = ImageGenerationService(
        fake, _catalog(), default_size="1024x1536", default_quality="medium"
    )

    result = await svc.generate(
        organization_id="7",
        model="gpt-image-2",  # 프론트가 저장한 key: 그대로 그 모델로 가야 한다
        prompt="선크림 바르는 손 클로즈업",
        seed=12345,
    )

    assert result.images[0].b64 == "AAAA"
    req = fake.captured
    assert req is not None
    assert req.model == "gpt-image-2"  # served
    assert req.provider == "openai"
    assert req.credential_provider == "OPENAI"
    assert req.organization_id == "7"
    assert req.size == "1024x1536"  # 기본값 채움
    assert req.quality == "medium"
    assert req.seed == 12345  # seed 전파(내장 FLUX 일관성)
    assert req.prompt == "선크림 바르는 손 클로즈업"


async def test_service_routes_internal_flux_to_comfyui_provider() -> None:
    # 내장 모델(flux-schnell) → provider=comfyui, credential 없음으로 전파(외장 gpt-image 와 구분).
    fake = _FakeImage()
    svc = ImageGenerationService(
        fake, _catalog(), default_size="1024x1536", default_quality="medium"
    )
    await svc.generate(organization_id="7", model="flux-schnell", prompt="p")
    req = fake.captured
    assert req is not None
    assert req.model == "flux-schnell"
    assert req.provider == "comfyui"
    assert req.credential_provider is None


def test_image_failure_catalog_covers_every_reason() -> None:
    # 카탈로그에 빠진 사유는 런타임 KeyError 로 터진다(실패를 보고하다 실패). 전수 검사로 막는다.
    for failure in ImageFailure:
        err = ImageGenerationFailedError(failure)
        assert err.origin in (ImageFailureOrigin.EXTERNAL, ImageFailureOrigin.INTERNAL)
        assert err.status in (402, 502), "BFF 가 사유를 노출하는 상태만 쓴다(image_failure 주석 참고)"
        assert err.message, f"{failure} 안내 문구 없음"


def test_image_failure_origin_split_matches_reason() -> None:
    # 내부/외부는 작업자가 어디를 봐야 하는지를 가른다. 뒤집히면 엉뚱한 곳을 뒤지게 된다
    # (실제로 내장 ComfyUI 가 ExternalInferenceError 를, 외부 OpenAI 가 EngineUnavailable 을 던지고 있었다).
    external = {
        ImageFailure.CREDENTIAL_MISSING,
        ImageFailure.QUOTA_EXCEEDED,
        ImageFailure.RATE_LIMITED,
        ImageFailure.CONTENT_REJECTED,
        ImageFailure.VENDOR_UNREACHABLE,
        ImageFailure.VENDOR_ERROR,
    }
    for failure in ImageFailure:
        expected = (
            ImageFailureOrigin.EXTERNAL if failure in external else ImageFailureOrigin.INTERNAL
        )
        assert ImageGenerationFailedError(failure).origin is expected, failure


def test_classified_failures_do_not_leak_vendor_original() -> None:
    # 분류된 사유는 안내만 준다(영문 원문은 로그로). 분류 못 한 사유만 진단 위해 원문을 덧붙인다.
    quiet = ImageGenerationFailedError(ImageFailure.CONTENT_REJECTED, "raw vendor text")
    assert "raw vendor text" not in quiet.message

    loud = ImageGenerationFailedError(ImageFailure.VENDOR_ERROR, "raw vendor text")
    assert "raw vendor text" in loud.message


def _adapter(handler, resolver=None) -> OpenAIImageInference:  # noqa: ANN001
    return OpenAIImageInference(
        resolver=resolver or _Resolver(),
        base_url="https://api.openai.com",
        timeout=5.0,
        transport=httpx.MockTransport(handler),
    )


def _req() -> ImageGenerationRequestRecord:
    return ImageGenerationRequestRecord(
        model="gpt-image-2",
        prompt="세로 포스터",
        size="1024x1536",
        quality="medium",
        organization_id="1",
        credential_provider="OPENAI",
    )


async def test_openai_image_parses_b64_and_sends_key() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/images/generations"
        assert request.headers["Authorization"] == "Bearer sk-openai-test"
        return httpx.Response(200, json={"data": [{"b64_json": "IMGDATA"}]})

    result = await _adapter(handler).generate(_req())
    assert result.images[0].b64 == "IMGDATA"
    assert result.images[0].mime == "image/png"


async def test_openai_image_sends_low_moderation_for_gpt_image() -> None:
    # 마케팅 스틸은 기본 moderation(auto)이 과탐지로 거부하는 일이 잦아 gpt-image 계열엔 'low' 를 보낸다.
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(200, json={"data": [{"b64_json": "IMGDATA"}]})

    await _adapter(handler).generate(_req())
    assert seen["moderation"] == "low"


async def test_openai_image_omits_moderation_for_non_gpt_image_models() -> None:
    # dall-e-* 는 moderation 파라미터가 없어 보내면 400(unknown parameter) 이다.
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(200, json={"data": [{"b64_json": "IMGDATA"}]})

    await _adapter(handler).generate(dataclasses.replace(_req(), model="dall-e-3"))
    assert "moderation" not in seen


async def test_openai_image_raises_when_key_missing() -> None:
    def handler(request: httpx.Request) -> httpx.Response:  # 호출되면 안 됨
        raise AssertionError("키 없으면 벤더 호출 전에 실패해야 한다")

    with pytest.raises(ImageGenerationFailedError) as exc:
        await _adapter(handler, resolver=_EmptyResolver()).generate(_req())
    assert exc.value.failure is ImageFailure.CREDENTIAL_MISSING
    assert exc.value.status == 402  # 결제/자격 계열: BFF 가 이 상태에서 사유를 그대로 노출한다


def _err_handler(status: int, error: dict):  # noqa: ANN201
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"error": error})

    return handler


async def _fail(status: int, error: dict) -> ImageGenerationFailedError:
    with pytest.raises(ImageGenerationFailedError) as exc:
        await _adapter(_err_handler(status, error)).generate(_req())
    return exc.value


async def test_openai_image_classifies_billing_limit() -> None:
    # 실제 OpenAI 응답 형태(실측). 한도 초과는 콘텐츠와 무관하고 조치도 달라서 안전 거부와 구분해야 한다
    # 한 문구로 뭉치면 둘이 구분되지 않아 원인을 오해한다.
    err = await _fail(
        400,
        {
            "message": "Billing hard limit has been reached.",
            "type": "billing_limit_user_error",
            "code": "billing_hard_limit_reached",
        },
    )
    assert err.failure is ImageFailure.QUOTA_EXCEEDED
    assert err.origin is ImageFailureOrigin.EXTERNAL  # 벤더 쪽에서 조치할 사유
    assert "사용 한도를 초과" in err.message
    assert "안전" not in err.message  # 안전 정책 거부로 읽히면 안 된다


async def test_openai_image_classifies_rate_limit() -> None:
    err = await _fail(
        429, {"message": "Rate limit reached for gpt-image-2 ...", "code": "rate_limit_exceeded"}
    )
    assert err.failure is ImageFailure.RATE_LIMITED
    assert "분당 한도" in err.message


async def test_openai_image_classifies_safety_rejection() -> None:
    err = await _fail(
        400,
        {"message": "Your request was rejected by the safety system.", "code": "moderation_blocked"},
    )
    assert err.failure is ImageFailure.CONTENT_REJECTED
    assert "외부 이미지를 가져오세요" in err.message  # 작업자가 할 수 있는 조치를 알려준다


async def test_openai_image_unknown_vendor_error_keeps_original_for_diagnosis() -> None:
    # 분류에 없는 사유는 원문 없이는 진단이 불가능해 문구에 함께 노출한다(분류된 사유는 안내만).
    err = await _fail(400, {"message": "Something unexpected."})
    assert err.failure is ImageFailure.VENDOR_ERROR
    assert "Something unexpected." in err.message


class _FakeImageService:
    """ImageGenerationInboundPort 가짜: 라우터 배선/인증만 검증."""

    async def generate(self, organization_id, model, prompt, size=None, quality=None, seed=None):  # noqa: ANN001
        return ImageGenerationResultRecord(images=[ImageResultRecord(b64="ROUTE")])


async def test_images_route_allows_csc_marketing_and_rejects_others() -> None:
    app = create_app()
    app.dependency_overrides[get_image_generation_service] = lambda: _FakeImageService()
    secret = get_settings().service_token_secret
    body = {"organizationId": "1", "model": "gpt-image-2", "prompt": "hi"}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        ok = await client.post(
            "/inference/images",
            headers={"X-Service-Token": create_service_token(secret, "csc-marketing")},
            json=body,
        )
        assert ok.status_code == 200
        assert ok.json()["images"][0]["b64"] == "ROUTE"

        denied = await client.post(
            "/inference/images",
            headers={"X-Service-Token": create_service_token(secret, "web-groupware")},
            json=body,
        )
        assert denied.status_code == 403


# 내장 라우팅(RoutingImageGeneration) + ComfyUI/stub 어댑터


class _RecordingImage:
    def __init__(self, tag: str) -> None:
        self.tag = tag
        self.seen: ImageGenerationRequestRecord | None = None

    async def generate(
        self, req: ImageGenerationRequestRecord
    ) -> ImageGenerationResultRecord:
        self.seen = req
        return ImageGenerationResultRecord(images=[ImageResultRecord(b64=self.tag)])

    async def aclose(self) -> None:
        pass


async def test_routing_dispatches_by_provider_and_falls_back_to_default() -> None:
    from app.domains.inference.adapters.outbound.image.routing import (
        RoutingImageGeneration,
    )

    openai, stub = _RecordingImage("OPENAI"), _RecordingImage("STUB")
    router = RoutingImageGeneration({"openai": openai, "stub": stub}, default_provider="stub")

    # 등록된 provider 는 해당 어댑터로.
    r1 = await router.generate(ImageGenerationRequestRecord(model="m", prompt="p", provider="openai"))
    assert r1.images[0].b64 == "OPENAI"
    # 미등록 provider(comfyui)는 default(stub)로 폴백.
    r2 = await router.generate(ImageGenerationRequestRecord(model="m", prompt="p", provider="comfyui"))
    assert r2.images[0].b64 == "STUB"


async def test_stub_returns_valid_png_b64() -> None:
    import base64

    from app.domains.inference.adapters.outbound.image.stub import StubImageGeneration

    res = await StubImageGeneration().generate(
        ImageGenerationRequestRecord(model="flux-schnell", prompt="p", provider="stub")
    )
    raw = base64.b64decode(res.images[0].b64)
    assert raw[:8] == b"\x89PNG\r\n\x1a\n"  # 유효한 PNG 시그니처
    assert res.images[0].mime == "image/png"


async def test_comfyui_image_submits_polls_downloads_and_returns_b64() -> None:
    # /prompt → id, /history → 이미지 출력, /view → PNG bytes → base64.
    import base64

    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4ceIEAAS0AlkWLoFAAAAAAElFTkSuQmCC"
    )
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/prompt":
            import json as _json

            seen["workflow"] = _json.loads(request.content)["prompt"]
            return httpx.Response(200, json={"prompt_id": "pid-1"})
        if path == "/history/pid-1":
            return httpx.Response(
                200,
                json={
                    "pid-1": {
                        "status": {"status_str": "success"},
                        "outputs": {"7": {"images": [{"filename": "plan_scene_0001.png", "subfolder": "", "type": "output"}]}},
                    }
                },
            )
        if path == "/view":
            return httpx.Response(200, content=png, headers={"content-type": "image/png"})
        raise AssertionError(f"unexpected path {path}")

    from app.domains.inference.adapters.outbound.image.comfyui_image import (
        ComfyUIImageGeneration,
    )

    adapter = ComfyUIImageGeneration(
        base_url="http://comfyui:8188",
        workflow=build_flux_schnell_workflow(_GGUF_UNET),
        timeout=5.0,
        busy_timeout=30.0,
        default_size="1024x1536",
        default_steps=4,
    )
    # httpx MockTransport 주입: 어댑터가 여는 AsyncClient 에 transport 를 쓰도록 monkeypatch.
    orig_client = httpx.AsyncClient

    def _client(**kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return orig_client(**kwargs)

    import app.domains.inference.adapters.outbound.image.comfyui_image as mod

    mod.httpx.AsyncClient = _client  # type: ignore[assignment]
    try:
        res = await adapter.generate(
            ImageGenerationRequestRecord(
                model="flux-schnell",
                prompt="선크림 클로즈업",
                size="1024x1536",
                seed=777,
                provider="comfyui",
            )
        )
    finally:
        mod.httpx.AsyncClient = orig_client  # type: ignore[assignment]

    assert base64.b64decode(res.images[0].b64)[:8] == b"\x89PNG\r\n\x1a\n"
    # 플레이스홀더 치환 검증: 프롬프트/크기/seed/스텝이 워크플로에 주입됨.
    wf = seen["workflow"]
    assert wf["2"]["inputs"]["text"] == "선크림 클로즈업"
    assert wf["4"]["inputs"]["width"] == 1024 and wf["4"]["inputs"]["height"] == 1536
    assert wf["5"]["inputs"]["seed"] == 777
    assert wf["5"]["inputs"]["steps"] == 4


# 공유 엔진 대기(ComfyUI 는 dev/staging/prod 가 함께 쓰는 GPU 1장, 잡을 직렬 처리)
#
# 큐에서 남의 잡을 기다리는 건 정상이다. 이 대기를 '실행 인내심'으로 재면 큐가 깊어질 때마다 멀쩡한
# 잡을 포기하게 된다. 엔진엔 성공으로 남고 화면만 실패하는 형태다. 그래서 시계를 둘로
# 나눴고, 아래 둘이 그 분리를 고정한다.


def _comfy_adapter(handler, *, timeout: float, busy_timeout: float, queue_front: bool = True):
    """MockTransport 를 물린 ComfyUI 어댑터 + 원복 함수."""
    from app.domains.inference.adapters.outbound.image.comfyui_image import (
        ComfyUIImageGeneration,
    )
    import app.domains.inference.adapters.outbound.image.comfyui_image as mod

    adapter = ComfyUIImageGeneration(
        base_url="http://comfyui:8188",
        workflow=build_flux_schnell_workflow(_GGUF_UNET),
        timeout=timeout,
        busy_timeout=busy_timeout,
        default_size="1024x1536",
        default_steps=4,
        queue_front=queue_front,
    )
    orig = httpx.AsyncClient

    def _client(**kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return orig(**kwargs)

    mod.httpx.AsyncClient = _client  # type: ignore[assignment]
    return adapter, lambda: setattr(mod.httpx, "AsyncClient", orig)


def _comfy_req() -> ImageGenerationRequestRecord:
    return ImageGenerationRequestRecord(
        model="flux-schnell", prompt="p", size="768x1152", seed=1, provider="comfyui"
    )


async def test_comfyui_queue_wait_does_not_burn_execution_patience(monkeypatch) -> None:
    # 내 잡이 큐에서 남의 잡 뒤에 오래 대기하다가 결국 성공하는 시나리오.
    # 실행 인내심(timeout)은 짧게(2s) 두고, 큐 대기를 그보다 훨씬 길게(폴링 20회) 끈다.
    # 총 시간으로 쟀다면 여기서 ENGINE_TIMEOUT 이 났을 것. 성공해야 분리가 지켜진 것이다.
    import base64

    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4ceIEAAS0AlkWLoFAAAAAAElFTkSuQmCC"
    )
    polls = {"n": 0}
    QUEUED_POLLS = 20  # 2s 인내심 / 1.5s 폴링 → 총 시간으로 쟀다면 진작 초과

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/prompt":
            return httpx.Response(200, json={"prompt_id": "pid-q"})
        if path == "/queue":
            # 앞선 폴링 동안 내 잡은 pending(= 남의 잡이 앞에 있다).
            queued = polls["n"] < QUEUED_POLLS
            return httpx.Response(
                200,
                json={
                    "queue_running": [[1, "someone-else", {}, {}, []]],
                    "queue_pending": [[2, "pid-q", {}, {}, []]] if queued else [],
                },
            )
        if path == "/history/pid-q":
            polls["n"] += 1
            if polls["n"] <= QUEUED_POLLS:
                return httpx.Response(200, json={})  # 큐 대기 중 → 히스토리에 없음
            return httpx.Response(
                200,
                json={
                    "pid-q": {
                        "status": {"status_str": "success"},
                        "outputs": {"7": {"images": [{"filename": "a.png", "subfolder": "", "type": "output"}]}},
                    }
                },
            )
        if path == "/view":
            return httpx.Response(200, content=png, headers={"content-type": "image/png"})
        raise AssertionError(f"unexpected path {path}")

    # 폴링 간격만큼 실제로 자면 테스트가 30초 걸린다. 대기는 즉시 반환시키고 회수만 센다.
    async def _no_sleep(_seconds: float) -> None:
        return None

    import app.domains.inference.adapters.outbound.image.comfyui_image as mod

    monkeypatch.setattr(mod.asyncio, "sleep", _no_sleep)
    adapter, restore = _comfy_adapter(handler, timeout=2.0, busy_timeout=300.0)
    try:
        res = await adapter.generate(_comfy_req())
    finally:
        restore()

    assert base64.b64decode(res.images[0].b64)[:8] == b"\x89PNG\r\n\x1a\n"
    assert polls["n"] > QUEUED_POLLS  # 실제로 오래 대기했다(빨리 끝난 게 아니다)


async def test_comfyui_reports_busy_when_queue_wait_exceeds_cap(monkeypatch) -> None:
    # 차례가 영영 오지 않는 경우: 내 잡이 느린 게 아니라 엔진이 혼잡한 것이므로
    # ENGINE_TIMEOUT 이 아니라 ENGINE_BUSY 여야 한다(작업자 조치가 다르다).
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/prompt":
            return httpx.Response(200, json={"prompt_id": "pid-b"})
        if path == "/queue":
            return httpx.Response(
                200, json={"queue_running": [], "queue_pending": [[9, "pid-b", {}, {}, []]]}
            )
        if path == "/history/pid-b":
            return httpx.Response(200, json={})
        raise AssertionError(f"unexpected path {path}")

    async def _no_sleep(_seconds: float) -> None:
        return None

    import app.domains.inference.adapters.outbound.image.comfyui_image as mod

    monkeypatch.setattr(mod.asyncio, "sleep", _no_sleep)
    adapter, restore = _comfy_adapter(handler, timeout=120.0, busy_timeout=6.0)
    try:
        with pytest.raises(ImageGenerationFailedError) as exc:
            await adapter.generate(_comfy_req())
    finally:
        restore()

    assert exc.value.failure is ImageFailure.ENGINE_BUSY
    assert exc.value.origin is ImageFailureOrigin.INTERNAL
    assert "혼잡" in exc.value.message


# 공유 엔진 부하(load): "지금 앞에 몇 건"
#
# 자체 이미지 엔진(ComfyUI)은 dev/staging/prod 전체가 함께 쓰는 GPU 1장이라, 내 대기 시간을 내 화면이
# 아니라 그 큐가 정한다. 그래서 부하를 화면에 보여준다. 외부 벤더는 그런 큐가 없어 None 이어야 하고,
# 부하 조회가 실패해도 생성 흐름을 막지 않도록 None(에러 아님)으로 접어야 한다.


class _RecordingImageWithLoad(_RecordingImage):
    def __init__(self, tag: str, load) -> None:  # noqa: ANN001
        super().__init__(tag)
        self._load = load
        self.load_calls = 0

    async def load(self):
        self.load_calls += 1
        return self._load


async def test_routing_load_dispatches_like_generate() -> None:
    from app.domains.inference.adapters.outbound.image.routing import RoutingImageGeneration
    from app.domains.inference.core.domain.types import ImageEngineLoadRecord

    comfy = _RecordingImageWithLoad("COMFY", ImageEngineLoadRecord(running=1, pending=4))
    openai = _RecordingImageWithLoad("OPENAI", None)  # 외부 = 큐 없음
    router = RoutingImageGeneration({"comfyui": comfy, "openai": openai}, default_provider="openai")

    # 자체 provider → 그 엔진의 큐 현황.
    load = await router.load("comfyui")
    assert load is not None and load.pending == 4
    assert comfy.load_calls == 1 and openai.load_calls == 0

    # 외부 provider → 큐 없음(None).
    assert await router.load("openai") is None


async def test_service_load_resolves_model_then_asks_engine() -> None:
    # 화면은 모델만 안다. 그게 자체인지 외부인지(=큐가 있는지)는 카탈로그가 정한다.
    from app.domains.inference.core.application.services import ImageGenerationService
    from app.domains.inference.core.domain.types import ImageEngineLoadRecord

    seen: dict = {}

    class _Img:
        async def generate(self, req):  # noqa: ANN001
            raise AssertionError("load 경로는 generate 를 부르지 않는다")

        async def load(self, provider=None):  # noqa: ANN001
            seen["provider"] = provider
            return ImageEngineLoadRecord(running=0, pending=2) if provider == "comfyui" else None

        async def aclose(self):
            pass

    svc = ImageGenerationService(_Img(), _catalog(), default_size="1024x1536", default_quality="medium")

    # 자체 이미지 키(flux-schnell → provider=comfyui) → 큐 현황.
    load = await svc.load("flux-schnell")
    assert seen["provider"] == "comfyui"
    assert load is not None and load.pending == 2

    # 외부 이미지 키(gpt-image-2 → provider=openai) → None.
    assert await svc.load("gpt-image-2") is None


async def test_comfyui_load_reads_queue_and_folds_failure_to_none() -> None:
    # /queue 를 읽어 running/pending 을 센다. 조회 실패는 None(표시 안 함): 에러로 올리지 않는다.
    from app.domains.inference.core.domain.types import ImageEngineLoadRecord

    def ok_handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/queue"
        return httpx.Response(
            200,
            json={
                "queue_running": [[1, "a", {}, {}, []]],
                "queue_pending": [[2, "b", {}, {}, []], [3, "c", {}, {}, []]],
            },
        )

    adapter, restore = _comfy_adapter(ok_handler, timeout=5.0, busy_timeout=30.0)
    try:
        load = await adapter.load()
    finally:
        restore()
    assert isinstance(load, ImageEngineLoadRecord)
    assert load.running == 1 and load.pending == 2

    def boom_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="down")

    adapter2, restore2 = _comfy_adapter(boom_handler, timeout=5.0, busy_timeout=30.0)
    try:
        assert await adapter2.load() is None  # 실패 → None(에러 아님)
    finally:
        restore2()


async def test_comfyui_load_none_when_unwired() -> None:
    # 미배포(base_url 없음)면 큐도 없다. None.
    from app.domains.inference.adapters.outbound.image.comfyui_image import ComfyUIImageGeneration

    adapter = ComfyUIImageGeneration(
        base_url="",
        workflow=build_flux_schnell_workflow(_GGUF_UNET),
        timeout=5.0,
        busy_timeout=30.0,
        default_size="1024x1536",
        default_steps=4,
    )
    assert await adapter.load() is None


async def test_openai_image_captures_vendor_usage() -> None:
    """벤더 usage 를 잡아야 이미지 비용이 계산된다. 여기가 그 유일한 근거다.

    gpt-image 는 장당 정액이 아니라 토큰 과금이고 단가가 텍스트입력/이미지입력/이미지출력별로
    다르므로, 셋을 따로 보존해야 금액을 되계산할 수 있다.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "data": [{"b64_json": "IMGDATA"}],
                "usage": {
                    "input_tokens": 26,
                    "output_tokens": 1056,
                    "input_tokens_details": {"text_tokens": 20, "image_tokens": 6},
                },
            },
        )

    result = await _adapter(handler).generate(_req())
    assert result.usage is not None
    assert result.usage.input_text == 20
    assert result.usage.input_image == 6
    assert result.usage.output_image == 1056


async def test_openai_image_usage_absent_is_none_not_zero() -> None:
    """usage 가 없으면 None 이어야 한다. 0 으로 채우면 '무료' 로 오인된다(dall-e 등)."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"b64_json": "IMGDATA"}]})

    result = await _adapter(handler).generate(_req())
    assert result.usage is None


async def test_openai_image_usage_without_details_counts_all_as_text() -> None:
    """details 가 없으면 입력 전량을 텍스트로 본다. 이 파이프라인은 입력 이미지를 붙이지 않는다."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"data": [{"b64_json": "X"}], "usage": {"input_tokens": 30, "output_tokens": 100}},
        )

    result = await _adapter(handler).generate(_req())
    assert result.usage is not None
    assert result.usage.input_text == 30
    assert result.usage.input_image == 0


async def test_openai_image_malformed_usage_does_not_break(
) -> None:
    """벤더가 숫자가 아닌 값을 주면 0 으로 떨어져야 한다. NaN 이 금액 계산으로 흘러가면 안 된다."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "data": [{"b64_json": "X"}],
                "usage": {"input_tokens": "많음", "output_tokens": None},
            },
        )

    result = await _adapter(handler).generate(_req())
    assert result.usage is not None
    assert result.usage.input_text == 0
    assert result.usage.output_image == 0


# ---- FLUX 워크플로 로더 선택 (GPU 공유 대응) ----
#
# 영상과 GPU 를 공유하므로 기본은 분리 로딩 + 양자화다(근거/측정값은 런북). 올인원 롤백 경로도 살아
# 있어야 하며, 그 분기는 파일 확장자 하나로 갈린다. 뒤바뀌면 여기서 잡는다.


def test_gguf_unet_builds_split_graph() -> None:
    wf = build_flux_schnell_workflow(_GGUF_UNET)
    assert wf["1"]["class_type"] == "UnetLoaderGGUF"
    assert wf["10"]["class_type"] == "DualCLIPLoader"
    # 텍스트 인코더는 CPU: GPU 피크를 만들면 상주 중인 영상 모델이 밀려난다.
    assert wf["10"]["inputs"]["device"] == "cpu"
    assert wf["10"]["inputs"]["type"] == "flux"
    assert wf["11"]["class_type"] == "VAELoader"
    # 샘플러는 분리 로더들을 참조한다(올인원과 배선이 다르다).
    assert wf["5"]["inputs"]["model"] == ["1", 0]
    assert wf["2"]["inputs"]["clip"] == ["10", 0]
    assert wf["6"]["inputs"]["vae"] == ["11", 0]


def test_allinone_checkpoint_builds_single_loader_graph() -> None:
    wf = build_flux_schnell_workflow(_ALLINONE_CKPT)
    assert wf["1"]["class_type"] == "CheckpointLoaderSimple"
    assert "10" not in wf and "11" not in wf
    # 하나의 로더가 model/clip/vae 를 모두 공급한다.
    assert wf["5"]["inputs"]["model"] == ["1", 0]
    assert wf["2"]["inputs"]["clip"] == ["1", 1]
    assert wf["6"]["inputs"]["vae"] == ["1", 2]


def test_placeholders_survive_graph_build() -> None:
    # 어댑터가 치환하는 자리: 그래프를 바꿔도 이 계약은 유지돼야 한다.
    wf = build_flux_schnell_workflow(_GGUF_UNET)
    assert wf["2"]["inputs"]["text"] == "__PROMPT__"
    assert wf["4"]["inputs"]["width"] == "__WIDTH__"
    assert wf["5"]["inputs"]["seed"] == "__SEED__"
    assert wf["5"]["inputs"]["steps"] == "__STEPS__"


# ---- 내장 엔진 막힘 → 외부 강등 (끊김 방지) ----
#
# 이 GPU 는 영상과 공유한다. 영상 렌더가 길어지면 이미지가 차례를 못 받는 구간이 생기는데, 씬 이미지가
# 빈칸으로 남는 것보다 조직 키로 외부에서 그려 채우는 편이 낫다. 단 좁게 적용해야 한다
# 우리 그래프 문제(ENGINE_FAILED)까지 외부로 넘기면 GPU/비용만 낭비하고 원인도 흐려진다.


class _ScriptedImage:
    """ImageGenerationPort 가짜: 호출 순서대로 결과를 연출한다(None = 성공).

    강등 경로는 "n번째 호출이 어떻게 끝나는가"만 다르므로, 시나리오별 가짜를 따로 두지 않고
    시퀀스로 표현한다. 호출 횟수는 `len(self.requests)` 로 센다(기록 필드도 하나).
    """

    def __init__(self, *outcomes: ImageFailure | None) -> None:
        self._outcomes = outcomes
        self.requests: list[ImageGenerationRequestRecord] = []

    async def generate(
        self, req: ImageGenerationRequestRecord
    ) -> ImageGenerationResultRecord:
        self.requests.append(req)
        idx = min(len(self.requests) - 1, len(self._outcomes) - 1)
        failure = self._outcomes[idx]
        if failure is not None:
            raise ImageGenerationFailedError(failure)
        return ImageGenerationResultRecord(images=[ImageResultRecord(b64="BBBB")])

    async def aclose(self) -> None:
        pass


def _svc(image, *, external_fallback: bool = True) -> ImageGenerationService:  # noqa: ANN001
    return ImageGenerationService(
        image,
        _catalog(),
        default_size="1024x1536",
        default_quality="medium",
        external_fallback=external_fallback,
    )


@pytest.mark.parametrize(
    "failure",
    [ImageFailure.ENGINE_BUSY, ImageFailure.ENGINE_UNREACHABLE, ImageFailure.ENGINE_TIMEOUT],
)
async def test_internal_transient_failure_falls_back_to_external(failure) -> None:  # noqa: ANN001
    fake = _ScriptedImage(failure, None)
    result = await _svc(fake).generate(organization_id="7", model="flux-schnell", prompt="p")

    assert result.images[0].b64 == "BBBB"
    first, second = fake.requests
    assert first.provider == "comfyui" and first.credential_provider is None
    # 강등 요청은 외부 벤더로 재구성된다(조직 키 해석에 credential_provider 가 필요하다).
    assert second.provider == "openai"
    assert second.credential_provider == "OPENAI"
    assert second.model == "gpt-image-2"
    assert second.prompt == "p"  # 프롬프트/사이즈 등 나머지는 그대로
    # 비용 귀속은 실제로 그린 모델을 따라가야 한다.
    assert result.model == "gpt-image-2"


async def test_engine_failed_does_not_fall_back() -> None:
    # 그래프/콘텐츠 문제는 외부에서도 같은 결과이거나 원인이 우리 쪽이다. 강등은 낭비다.
    fake = _ScriptedImage(ImageFailure.ENGINE_FAILED, None)
    with pytest.raises(ImageGenerationFailedError) as exc:
        await _svc(fake).generate(organization_id="7", model="flux-schnell", prompt="p")
    assert exc.value.failure is ImageFailure.ENGINE_FAILED
    assert len(fake.requests) == 1


async def test_external_model_selection_is_not_downgraded() -> None:
    # 처음부터 외부 모델을 골랐다면 강등할 곳이 없다(같은 벤더로 두 번 던지지 않는다).
    fake = _ScriptedImage(ImageFailure.QUOTA_EXCEEDED)
    with pytest.raises(ImageGenerationFailedError) as exc:
        await _svc(fake).generate(organization_id="7", model="gpt-image-2", prompt="p")
    assert exc.value.failure is ImageFailure.QUOTA_EXCEEDED
    assert len(fake.requests) == 1


async def test_fallback_failure_preserves_original_reason() -> None:
    # 조직 키가 없으면 강등도 실패한다. 그때 화면에 뜨는 사유는 내장 엔진 혼잡이어야 한다.
    #   외부 키 문제를 앞세우면 작업자가 엉뚱한 곳(벤더 대시보드)을 뒤진다.
    fake = _ScriptedImage(ImageFailure.ENGINE_BUSY, ImageFailure.CREDENTIAL_MISSING)
    with pytest.raises(ImageGenerationFailedError) as exc:
        await _svc(fake).generate(organization_id="7", model="flux-schnell", prompt="p")
    assert exc.value.failure is ImageFailure.ENGINE_BUSY
    assert len(fake.requests) == 2


async def test_fallback_can_be_disabled() -> None:
    # 과금을 원치 않는 조직/환경은 끌 수 있다. 그 경우 혼잡은 그대로 실패로 남는다.
    fake = _ScriptedImage(ImageFailure.ENGINE_BUSY, None)
    with pytest.raises(ImageGenerationFailedError):
        await _svc(fake, external_fallback=False).generate(
            organization_id="7", model="flux-schnell", prompt="p"
        )
    assert len(fake.requests) == 1


# ---- 제출 정책: 대화형 우선(front) + 연결 순간 실패 재시도 ----


async def test_submit_puts_image_job_at_queue_front() -> None:
    # 이 엔진은 영상 렌더와 큐를 공유하고 영상 씬 하나가 5분 넘는다(실측 311s). 사람이 화면에서
    # 기다리는 이미지가 그 뒤에 줄을 서면 혼잡 상한을 넘겨 실패한다 → 앞으로 넣는다.
    sent: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/prompt":
            sent.update(json.loads(request.content))
            return httpx.Response(200, json={"prompt_id": "pid-front"})
        raise AssertionError(f"unexpected {request.url.path}")

    adapter, restore = _comfy_adapter(handler, timeout=5.0, busy_timeout=5.0)
    try:
        async with httpx.AsyncClient(base_url="http://comfyui:8188") as client:
            await adapter._submit(client, {"1": {"class_type": "X", "inputs": {}}})
    finally:
        restore()

    assert sent.get("front") is True
    assert "prompt" in sent


async def test_queue_front_can_be_disabled() -> None:
    # 같은 엔진을 dev/staging/prod 가 공유한다. dev 가 prod 렌더를 앞지르면 안 될 때 끌 수 있어야 한다.
    sent: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        sent.update(json.loads(request.content))
        return httpx.Response(200, json={"prompt_id": "pid-normal"})

    adapter, restore = _comfy_adapter(handler, timeout=5.0, busy_timeout=5.0, queue_front=False)
    try:
        async with httpx.AsyncClient(base_url="http://comfyui:8188") as client:
            await adapter._submit(client, {"1": {"class_type": "X", "inputs": {}}})
    finally:
        restore()

    assert "front" not in sent
