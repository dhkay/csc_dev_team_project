"""도메인 DI wiring: inference.

provider 별 어댑터 레지스트리(internal/external/stub)를 조립하고, provider 로 디스패치하는
RoutingInference 를 동시성 래퍼로 감싼 InferencePort 를 만든다. 모델 카탈로그와 조직 자격증명
resolver 도 여기서 조립한다. 프로세스 수명 싱글톤으로 container 가 보관한다.

호스팅 교체 = 레지스트리 구성/기본 provider 만 바꾼다(file-upload `_build_storage` 와 동형).
"""

from __future__ import annotations

from csc_net_utils import create_service_token

from .adapters.outbound.credentials.http_api_credential import HttpApiCredentialResolver
from .adapters.outbound.image.comfyui_image import ComfyUIImageGeneration
from .adapters.outbound.image.flux_schnell_workflow import build_flux_schnell_workflow
from .adapters.outbound.image.openai_image import OpenAIImageInference
from .adapters.outbound.image.routing import RoutingImageGeneration
from .adapters.outbound.image.stub import StubImageGeneration
from .adapters.outbound.inference.anthropic import AnthropicInference
from .adapters.outbound.inference.concurrency import ConcurrencyLimitedInference
from .adapters.outbound.inference.echo_stub import EchoInference
from .adapters.outbound.inference.openai_compat import OpenAICompatInference
from .adapters.outbound.inference.routing import RoutingInference
from .core.application.model_catalog import ModelCatalog
from .core.application.ports.outbound import (
    CredentialResolverPort,
    ImageGenerationPort,
    InferencePort,
)

__all__ = [
    "build_inference",
    "build_image_generation",
    "build_model_catalog",
    "build_credential_resolver",
    "InferencePort",
    "ImageGenerationPort",
    "CredentialResolverPort",
    "ModelCatalog",
]


def build_model_catalog(settings) -> ModelCatalog:  # noqa: ANN001
    return ModelCatalog.from_settings(settings)


def build_credential_resolver(settings) -> CredentialResolverPort:  # noqa: ANN001
    """조직 공용 자격증명 resolver: csc-groupware 내부 엔드포인트를 language-model 신원으로 호출."""

    def token() -> str:
        return create_service_token(
            settings.service_token_secret, settings.worker_service_name
        )

    return HttpApiCredentialResolver(
        settings.groupware_url,
        token_provider=token,
        ttl_s=settings.credential_cache_ttl_s,
    )


def _anthropic_adapter(
    settings, resolver: CredentialResolverPort
) -> AnthropicInference:  # noqa: ANN001
    return AnthropicInference(
        resolver=resolver,
        base_url=settings.external_base_url,
        timeout=settings.external_timeout_s,
        default_max_tokens=settings.external_max_tokens,
    )


def _build_provider_adapters(
    settings, resolver: CredentialResolverPort
) -> dict[str, InferencePort]:  # noqa: ANN001
    """provider(라우팅 키)→어댑터 레지스트리.

    멀티벤더 확장: 외부 벤더는 벤더 id 를 키로 어댑터를 꽂는다(예: "anthropic"). 어느 조직 키를 쓸지는
    카탈로그 spec.credential_provider 로 데이터화되어 요청에 실려오므로, 여기선 벤더 어댑터만 등록하면 된다
    (새 벤더 = 어댑터 파일 1개 + 이 레지스트리 한 줄 + 카탈로그 spec).
    외부 벤더는 원격 API 라 GPU 가 필요없어 stub 모드에서도 등록한다(로컬 dev 에서도 조직 키만 있으면 사용).
    internal(자체 호스팅)만 stub 로 폴백.
    """
    anthropic = _anthropic_adapter(settings, resolver)
    if settings.inference_engine == "stub":
        return {"stub": EchoInference(), "anthropic": anthropic}
    return {
        # 자체 호스팅: OpenAI 호환 규격으로 내부망 vLLM/Ollama 호출.
        "internal": OpenAICompatInference(
            base_url=settings.inference_base_url,
            api_key=settings.inference_api_key,
            timeout=settings.inference_timeout_s,
            enable_thinking=settings.inference_enable_thinking,
        ),
        # 외부 벤더: Claude(Anthropic). 조직별 키 per-request 해석.
        "anthropic": anthropic,
    }


def _default_provider(settings) -> str:  # noqa: ANN001
    # 레거시 동작 보존: stub 엔진이면 internal 요청은 stub(에코)로, 그 외엔 설정된 기본 provider.
    #   외부 벤더 요청은 provider=<벤더 id> 로 명시 라우팅되므로 이 폴백과 무관.
    if settings.inference_engine == "stub":
        return "stub"
    return settings.inference_default_provider


def build_inference(
    settings, resolver: CredentialResolverPort
) -> InferencePort:  # noqa: ANN001
    router = RoutingInference(
        _build_provider_adapters(settings, resolver), _default_provider(settings)
    )
    return ConcurrencyLimitedInference(router, settings.llm_max_concurrency)


def _build_image_adapters(
    settings, resolver: CredentialResolverPort
) -> dict[str, ImageGenerationPort]:  # noqa: ANN001
    """provider(라우팅 키)→이미지 어댑터 레지스트리. 텍스트 _build_provider_adapters 와 동형.

    - 항상 "openai"(외장): 원격 API 라 GPU 무관(stub 엔진에서도 조직 키만 있으면 동작).
    - 내장: image_engine=="comfyui" → "comfyui"(자체 ComfyUI/FLUX, GPU 호스트), 그 외 → "stub"(placeholder).
    새 이미지 벤더/엔진 = 어댑터 파일 1개 + 이 레지스트리 한 줄 + 카탈로그 image spec.
    """
    openai = OpenAIImageInference(
        resolver=resolver,
        base_url=settings.openai_base_url,
        timeout=settings.openai_timeout_s,
    )
    if settings.image_engine == "comfyui":
        return {
            "openai": openai,
            "comfyui": ComfyUIImageGeneration(
                base_url=settings.image_comfyui_url,
                # unet 파일명이 그래프(로더)를 결정한다. GGUF(분리 로딩, 상주 지향) vs 올인원(롤백).
                workflow=build_flux_schnell_workflow(settings.image_flux_unet_name),
                timeout=settings.image_comfyui_timeout_s,
                busy_timeout=settings.image_comfyui_busy_timeout_s,
                default_size=settings.image_default_size,
                default_steps=settings.image_default_steps,
                queue_front=settings.image_comfyui_queue_front,
            ),
        }
    return {"openai": openai, "stub": StubImageGeneration()}


def _default_image_provider(settings) -> str:  # noqa: ANN001
    # 내장 요청(provider="comfyui")의 폴백 기본. comfyui 엔진이면 comfyui, 아니면 stub(placeholder).
    #   외장 요청(provider="openai")은 명시 라우팅되므로 이 폴백과 무관.
    return "comfyui" if settings.image_engine == "comfyui" else "stub"


def build_image_generation(
    settings, resolver: CredentialResolverPort
) -> ImageGenerationPort:  # noqa: ANN001
    """이미지 생성 포트: provider 라우팅(내장 comfyui/stub + 외장 openai).

    호스트 이동(image-ai-server) = settings.image_comfyui_url 만 변경(코드 무변경, 영상 COMFYUI_URL 동형).
    """
    return RoutingImageGeneration(
        _build_image_adapters(settings, resolver), _default_image_provider(settings)
    )
