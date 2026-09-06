"""video-model 퍼-잡 프로바이더 라우팅 테스트.

- 프로바이더 레지스트리 구성(internal=ffmpeg, wan2.2-ti2v-5b=ComfyUI 어댑터).
- RoutingVideoProcessing 이 잡 params["provider"] 로 올바른 어댑터에 디스패치 + 미등록 폴백.
- 미배포(comfyui_url 빈 값) Wan 선택 시 NotImplementedError.
language-model `test_routing.py` 미러.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.domains.video.adapters.outbound.processing.ffmpeg_processing import (
    FfmpegProcessing,
)
from app.domains.video.adapters.outbound.processing.routing import (
    RoutingVideoProcessing,
)
from app.domains.video.core.domain.types import ProcessedResult, VideoJobType
from app.worker import _build_provider_registry


def _settings(**overrides) -> SimpleNamespace:
    base = dict(
        video_default_provider="internal",
        # 자체 영상 생성(Wan, ComfyUI 백엔드): 기본 미배포(comfyui_url 빈 값).
        wan_provider_key="wan2.2-ti2v-5b",
        comfyui_url="",
        comfyui_timeout_s=1.0,
        comfyui_busy_timeout_s=1800.0,
        wan_num_frames=121,
        # unet 파일명이 워크플로 로더를 고른다(GGUF=양자화 상주 / safetensors=fp16 롤백).
        wan_unet_name="Wan2.2-TI2V-5B-Q6_K.gguf",
        # 외부 영상 생성(xAI Grok): 조직 키는 잡 params 로. base_url 기본값이 있어 상시 등록.
        grok_provider_key="grok-imagine-video",
        xai_base_url="https://api.x.ai/v1",
        xai_video_model="grok-imagine-video",
        xai_resolution="720p",
        xai_timeout_s=1.0,
        xai_poll_interval_s=0.1,
        # 외부 영상 생성(Higgsfield 중계): 어댑터가 하나이고 모델 경로는 잡 params 로 온다.
        higgsfield_provider_key="higgsfield",
        higgsfield_base_url="https://platform.higgsfield.ai",
        higgsfield_timeout_s=1.0,
        higgsfield_poll_interval_s=0.1,
        higgsfield_submits_per_minute=0.0,
        higgsfield_throttle_max_retries=4,
        xai_submits_per_minute=0.0,
        xai_throttle_max_retries=4,
        # 외부 영상 생성(Gemini 직접): 같은 모양이다(어댑터 하나, 모델은 잡 params 로).
        gemini_provider_key="gemini",
        gemini_base_url="https://generativelanguage.googleapis.com",
        gemini_timeout_s=1.0,
        gemini_poll_interval_s=0.1,
        gemini_submits_per_minute=4.0,
        gemini_throttle_max_retries=4,
        compose_segment_parallelism=3,
        # 외부 나레이션(ElevenLabs): 모델 id 가 곧 TTS 라우팅 key.
        elevenlabs_base_url="https://api.elevenlabs.io",
        elevenlabs_tts_models="eleven_v3,eleven_multilingual_v2,eleven_flash_v2_5",
        # compose 가 redis 체크포인트를 만든다(연결은 지연: 구성만으론 redis 불필요).
        redis_url="redis://localhost:6379/2",
        # 나레이션 TTS 타임아웃: EdgeTtsAdapter 생성 인자.
        tts_timeout_s=60.0,
        # compose credential_decryptor 람다(서비스토큰 시크릿 파생)용.
        service_token_secret="dev-only-service-secret",
    )
    base.update(overrides)
    return SimpleNamespace(**base)


class _Rec:
    """호출된 provider 태그를 결과 file_name 으로 되돌리는 가짜 어댑터."""

    def __init__(self, tag: str) -> None:
        self.tag = tag

    async def process(self, type, params, source_path, out_dir) -> ProcessedResult:
        return ProcessedResult(path="/x", file_name=self.tag, mime_type="video/mp4")


def test_registry_has_internal_ffmpeg() -> None:
    reg = _build_provider_registry(_settings(), object())
    assert isinstance(reg["internal"], FfmpegProcessing)
    assert "external" not in reg  # 죽은 외부 스텁 제거 회귀 가드


def test_registry_has_wan_provider() -> None:
    # Wan(ComfyUI) 어댑터가 provider key 로 등록된다(httpx 만 쓰므로 torch 없이 등록 성공).
    reg = _build_provider_registry(_settings(), object())
    assert "wan2.2-ti2v-5b" in reg


def test_registry_has_compose_and_slideshow() -> None:
    # COMPOSE(다중 씬 조합) + slideshow(씬 비주얼, GPU 불필요) 등록: 영상 프로젝트 렌더 경로.
    reg = _build_provider_registry(_settings(), object())
    assert "compose" in reg
    assert "slideshow" in reg


def test_compose_visual_excludes_wan_when_undeployed() -> None:
    # 미배포(comfyui_url="") 면 compose 씬 비주얼에서 wan 을 빼 slideshow 로 폴백(조합이 통째로 실패하지 않게).
    from app.worker import _build_compose_visual_registry

    slideshow, wan, grok, higgsfield, gemini = (object() for _ in range(5))
    visual = _build_compose_visual_registry(
        _settings(comfyui_url=""), slideshow, wan, grok, higgsfield, gemini
    )
    assert visual["slideshow"] is slideshow  # top-level 과 같은 인스턴스 재사용
    assert "wan2.2-ti2v-5b" not in visual
    # 외부 provider 는 상시 등록이다(조직 키가 있으면 csc-marketing 이 그쪽으로 라우팅한다).
    #   빠지면 compose 가 조용히 slideshow 로 대체해, 고른 모델과 다른 영상이 나오고도 성공으로 끝난다.
    assert visual["grok-imagine-video"] is grok
    assert visual["higgsfield"] is higgsfield
    assert visual["gemini"] is gemini


def test_compose_visual_includes_wan_when_deployed() -> None:
    # 배포(comfyui_url 설정) 면 compose 가 wan 도 씬 비주얼로 쓸 수 있게 등록(같은 인스턴스 재사용).
    from app.worker import _build_compose_visual_registry

    slideshow, wan, grok, higgsfield, gemini = (object() for _ in range(5))
    visual = _build_compose_visual_registry(
        _settings(comfyui_url="http://comfyui:8188"), slideshow, wan, grok, higgsfield, gemini
    )
    assert visual["wan2.2-ti2v-5b"] is wan


def test_registry_has_external_video_providers() -> None:
    # 외부 영상 어댑터 셋이 provider key 로 등록된다(httpx 만 쓰므로 등록 성공).
    #   두 경로가 함께 있는 것이 정상이다: 플랫폼 경유(higgsfield)와 운영사 직접(gemini)은 같은
    #   모델을 다른 계정으로 부르고, 조직이 등록한 키가 어느 쪽으로 갈지 정한다.
    reg = _build_provider_registry(_settings(), object())
    assert {"grok-imagine-video", "higgsfield", "gemini"} <= set(reg)


async def test_wan_unwired_raises_when_comfyui_unset() -> None:
    # ComfyUI 미배포(comfyui_url="") 상태에서 선택되면 명시적 에러(조용한 성공 금지).
    reg = _build_provider_registry(_settings(), object())
    with pytest.raises(NotImplementedError):
        await reg["wan2.2-ti2v-5b"].process(
            VideoJobType.GENERATE, {}, "/src.png", "/tmp/out"
        )


async def test_routing_dispatches_by_job_provider() -> None:
    router = RoutingVideoProcessing({"internal": _Rec("i"), "runway": _Rec("r")}, "internal")
    result = await router.process(VideoJobType.GENERATE, {"provider": "runway"}, None, "/tmp")
    assert result.file_name == "r"


async def test_routing_falls_back_to_default_for_unknown_provider() -> None:
    router = RoutingVideoProcessing({"internal": _Rec("i")}, "internal")
    result = await router.process(VideoJobType.GENERATE, {"provider": "nope"}, None, "/tmp")
    assert result.file_name == "i"


async def test_routing_uses_default_when_no_provider_in_params() -> None:
    router = RoutingVideoProcessing({"internal": _Rec("i")}, "internal")
    result = await router.process(VideoJobType.TRANSCODE, {}, "/src", "/tmp")
    assert result.file_name == "i"


def test_invalid_default_provider_raises() -> None:
    with pytest.raises(ValueError):
        RoutingVideoProcessing({"internal": _Rec("i")}, "missing")
