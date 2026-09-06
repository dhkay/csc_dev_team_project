"""arq Worker 엔트리포인트 (video-ai-server, 무상태 컴퓨트).

기동: `arq app.worker.WorkerSettings` (Dockerfile/compose command 오버라이드).
DB, 디스크 미접촉: 파일은 file-service(HTTP), 상태는 video-model 콜백으로만.
같은 이미지를 API(uvicorn) / Worker(arq) 두 모드로 기동한다.
"""

from __future__ import annotations

import logging
from typing import Any

from arq.connections import RedisSettings

from .config import get_settings
from .domains.video.adapters.outbound.callback.http_callback import HttpVideoCallback
from .domains.video.adapters.outbound.file_gateway.http_file_gateway import (
    HttpFileGateway,
)
from .domains.video.adapters.outbound.processing.ffmpeg_processing import (
    FfmpegProcessing,
)
from .domains.video.adapters.outbound.processing.comfyui_video_gen import (
    ComfyUIVideoGenProcessing,
)
from .domains.video.adapters.outbound.processing.compose import ComposeProcessing
from .domains.video.adapters.outbound.processing.grok_imagine_video import (
    GrokImagineVideoProcessing,
)
from .domains.video.adapters.outbound.processing.credential_crypto import decrypt_credential
from .domains.video.adapters.outbound.processing.finalize import FinalizeProcessing
from .domains.video.adapters.outbound.processing.slideshow import SlideshowProcessing
from .domains.video.adapters.outbound.processing.wan22_workflows import (
    build_wan22_workflows,
)
from .domains.video.adapters.outbound.processing.higgsfield_video import (
    HiggsfieldVideoProcessing,
)
from .domains.video.adapters.outbound.processing.gemini_veo_video import (
    GeminiVeoVideoProcessing,
)
from .domains.video.adapters.outbound.processing.routing import RoutingVideoProcessing
from .domains.video.adapters.outbound.processing.vendor_http import (
    ThrottledVisual,
    VendorThrottle,
)
from .domains.video.adapters.outbound.tts.edge_tts_adapter import EdgeTtsAdapter
from .domains.video.adapters.outbound.tts.elevenlabs_adapter import ElevenLabsTtsAdapter
from .domains.video.adapters.outbound.tts.routing import RoutingTts
from .domains.video.adapters.outbound.checkpoint.redis_checkpoint import (
    RedisSceneCheckpoint,
)
from .domains.video.core.application.ports.outbound import (
    FileGatewayPort,
    TtsPort,
    VideoProcessingPort,
)
from .domains.video.core.application.worker_service import VideoWorkerService
from .domains.video.core.domain.types import VideoJobType
from csc_net_utils import create_service_token


_logger = logging.getLogger(__name__)


def _build_wan(s) -> ComfyUIVideoGenProcessing:  # noqa: ANN001
    """Wan 2.2 TI2V-5B(ComfyUI GPU HTTP) 어댑터. comfyui_url 미설정이면 process 시 명시적 에러(미배포)."""
    return ComfyUIVideoGenProcessing(
        base_url=s.comfyui_url,
        # unet 파일명이 로더를 결정한다. GGUF(양자화, 이미지 모델과 동시 상주) vs fp16(롤백).
        workflows=build_wan22_workflows(s.wan_unet_name),
        num_frames=s.wan_num_frames,
        timeout=s.comfyui_timeout_s,
        busy_timeout=s.comfyui_busy_timeout_s,
    )


def _build_grok(s) -> ThrottledVisual:  # noqa: ANN001
    """xAI Grok Imagine 영상 생성 어댑터. 조직 키와 화질은 잡 params 로 오므로 여기선 base_url/모델/폴백만.

    한도 다루기(키별 제출 간격, 429 재시도)는 어댑터가 아니라 이 감싸기가 든다. 워커 싱글톤이라 여러
    잡이 같은 조직 키로 동시에 돌아도 합산 제출이 분당 상한 안에 든다(형제 벤더 둘도 같다).
    """
    return ThrottledVisual(
        GrokImagineVideoProcessing(
            base_url=s.xai_base_url,
            model=s.xai_video_model,
            default_resolution=s.xai_resolution,
            timeout=s.xai_timeout_s,
            poll_interval=s.xai_poll_interval_s,
        ),
        VendorThrottle(
            "xAI",
            submits_per_minute=s.xai_submits_per_minute,
            retries=s.xai_throttle_max_retries,
        ),
    )


def _build_higgsfield(s) -> ThrottledVisual:  # noqa: ANN001
    """Higgsfield 중계 텍스트→영상 어댑터. 조직 키와 모델 경로는 잡 params 로 오므로 여기선 base_url/인내심만."""
    return ThrottledVisual(
        HiggsfieldVideoProcessing(
            base_url=s.higgsfield_base_url,
            timeout=s.higgsfield_timeout_s,
            poll_interval=s.higgsfield_poll_interval_s,
        ),
        VendorThrottle(
            "Higgsfield",
            submits_per_minute=s.higgsfield_submits_per_minute,
            retries=s.higgsfield_throttle_max_retries,
        ),
    )


def _build_gemini(s) -> ThrottledVisual:  # noqa: ANN001
    """Gemini(Veo) 직접 호출 어댑터. 조직 키와 모델은 잡 params 로 오므로 여기선 base_url/인내심만."""
    return ThrottledVisual(
        GeminiVeoVideoProcessing(
            base_url=s.gemini_base_url,
            timeout=s.gemini_timeout_s,
            poll_interval=s.gemini_poll_interval_s,
        ),
        VendorThrottle(
            "Gemini",
            submits_per_minute=s.gemini_submits_per_minute,
            retries=s.gemini_throttle_max_retries,
        ),
    )


def _build_tts(s) -> RoutingTts:  # noqa: ANN001
    """나레이션 provider 레지스트리. 요청한 provider 가 여기 없으면 실패한다(대체하지 않는다).

    ElevenLabs 는 모델마다 provider key 를 갖는다(모델 id 가 곧 key). 씬 비주얼의 Higgsfield 와
    반대인데, 그쪽은 경로가 URL 이라 따로 실어야 했고 이쪽은 모델 id 가 요청 본문의 한 필드라
    라우팅 키를 그대로 쓰면 된다. 모델 추가 = 이 설정 문자열에 한 단어.
    """
    eleven = ElevenLabsTtsAdapter(s.elevenlabs_base_url, s.tts_timeout_s)
    adapters: dict[str, TtsPort] = {"edge-tts": EdgeTtsAdapter(s.tts_timeout_s)}
    for model in s.elevenlabs_tts_models.split(","):
        key = model.strip()
        if key:
            adapters[key] = eleven
    return RoutingTts(adapters, default_provider="edge-tts")


def _build_compose_visual_registry(  # noqa: ANN001
    s,
    slideshow: VideoProcessingPort,
    wan: VideoProcessingPort,
    grok: VideoProcessingPort,
    higgsfield: VideoProcessingPort,
    gemini: VideoProcessingPort,
) -> dict[str, VideoProcessingPort]:
    """조합(compose)이 씬마다 고르는 씬 비주얼 레지스트리(image→무음 클립).

    - "slideshow": 정지 이미지 + 켄번스 모션(ffmpeg, GPU 불필요). 어디서나 동작 + 기본.
    - "wan2.2-ti2v-5b": AI 모션 클립: 배포된 경우(comfyui_url 설정)만 등록한다.
    - "grok-imagine-video": 외부 xAI 영상: base_url 기본값이 있어 상시 등록. 조직 xAI 키가 없으면
      csc-marketing 이 이 provider 로 라우팅하지 않으므로(키 있는 조직만), 등록돼 있어도 무해하다.
    미배포/미라우팅 provider 는 compose 가 slideshow 로 폴백한다(여러 씬이 통째로 실패하지 않게).
    stateless 어댑터(slideshow/wan/grok)는 top-level 레지스트리와 같은 인스턴스를 재사용한다.
    """
    visual: dict[str, VideoProcessingPort] = {
        "slideshow": slideshow,
        s.grok_provider_key: grok,
        # 플랫폼 경유(Higgsfield): grok 과 같은 이유로 상시 등록한다. 조직 키가 없으면 csc-marketing 이
        #   이 provider 로 라우팅하지 않으므로 등록돼 있어도 무해하다.
        s.higgsfield_provider_key: higgsfield,
        # 운영사 직접(Gemini): 같은 이유로 상시 등록한다. 플랫폼 경유와 **같은 모델이 양쪽에 있을 수
        #   있고**(Veo), 조직이 어느 키를 등록했는지에 따라 csc-marketing 이 한쪽으로만 라우팅한다.
        s.gemini_provider_key: gemini,
    }
    if s.comfyui_url:
        visual[s.wan_provider_key] = wan
    return visual


def _build_provider_registry(  # noqa: ANN001
    s, files: FileGatewayPort
) -> dict[str, VideoProcessingPort]:
    """provider→처리 어댑터 레지스트리. 새 내부 모델/외부 API 는 여기 한 줄로 꽂는다.

    file-upload `_build_storage` / language-model `_build_provider_adapters` 와 동형.
    - "internal": 자체 호스팅(video-ai-server ffmpeg): 기본값(TRANSCODE).
    - "compose": 다중 씬 조합(씬별 비주얼+TTS → 이어붙인 쇼츠). file_gateway/TTS/씬비주얼을 주입.
    - "slideshow": 씬 비주얼(ffmpeg): 직접 선택도 가능.
    - "wan2.2-ti2v-5b": 자체 영상 생성: 항상 등록하되 미배포면 선택 시 명시적 에러(기존 계약, direct GENERATE).
    향후 외부 API("runway" 등)/추가 내부 모델(LTX 등)을 key 하나로 추가.
    """
    # stateless 어댑터는 한 번만 만들어 top-level + compose 비주얼 레지스트리가 공유한다.
    slideshow = SlideshowProcessing()
    wan = _build_wan(s)
    grok = _build_grok(s)
    higgsfield = _build_higgsfield(s)
    gemini = _build_gemini(s)
    visual = _build_compose_visual_registry(s, slideshow, wan, grok, higgsfield, gemini)
    # 이 워커가 무엇을 처리할 수 있는지를 기동 로그에 남긴다. 이 목록은 코드에서 나오므로 옛
    #   코드로 떠 있는 워커에는 새 provider 가 없다. 그 사실을 어디서도 볼 수 없으면, 그 워커가 받은
    #   잡이 "그 provider 를 모른다" 로 끝났을 때 원인을 실패 메시지에서만 추측하게 된다(dev 에서
    #   어댑터 추가 전에 떠 있던 워커가 새 provider 의 잡을 받아 실제로 그렇게 됐다. dev 워커는
    #   의도적으로 리로드하지 않는다: scripts/dev.mjs).
    _logger.info("씬 비주얼 등록: %s", sorted(visual))
    return {
        "internal": FfmpegProcessing(),
        "slideshow": slideshow,
        # 직접 선택용 wan 은 항상 등록: 미배포면 process 시 NotImplementedError(조용한 성공 금지).
        s.wan_provider_key: wan,
        # 외부 영상 생성(xAI Grok): 직접 GENERATE 도 가능하게 등록(조직 키는 params 로).
        s.grok_provider_key: grok,
        # 외부 영상 생성(Higgsfield 중계): 직접 GENERATE 도 가능하게 등록(조직 키/모델 경로는 params 로).
        s.higgsfield_provider_key: higgsfield,
        # 외부 영상 생성(Gemini 직접): 직접 GENERATE 도 가능하게 등록(조직 키/모델은 params 로).
        s.gemini_provider_key: gemini,
        # 다중 씬 조합: 씬 이미지 fetch(file_gateway) + 나레이션 TTS(edge-tts) + 씬 비주얼(slideshow/wan/grok) + concat.
        #   redis 체크포인트로 재개 가능(워커가 죽어도 완료 씬 건너뛰고 진행 중 렌더 재폴링).
        #   credential_decryptor: 조직 키(잡 params 암호문)를 사용 직전 복호화: grok 씬 비주얼용(전 서버 공유 시크릿 파생).
        "compose": ComposeProcessing(
            files=files,
            tts=_build_tts(s),
            visual=visual,
            default_visual="slideshow",
            checkpoint=RedisSceneCheckpoint(s.redis_url),
            credential_decryptor=lambda c: decrypt_credential(
                c, s.job_credential_enc_key or s.service_token_secret
            ),
            segment_parallelism=s.compose_segment_parallelism,
        ),
        # 최종 합성: 원천 영상(source) + 세트(프레임 오버레이 + 아웃트로). 프레임/아웃트로 fetch 에 file_gateway 재사용.
        "finalize": FinalizeProcessing(files=files),
    }


def _build_worker_service() -> VideoWorkerService:
    s = get_settings()

    def token() -> str:
        # worker 의 outbound 호출 신원 = video-model.
        return create_service_token(s.service_token_secret, s.worker_service_name)

    files = HttpFileGateway(s.file_service_url, token)
    callback = HttpVideoCallback(s.video_service_url, token)
    # 잡 params["provider"] 로 어댑터를 고르는 라우터(기본 internal). 출력은 store→URL 균일.
    # compose 는 씬 이미지 fetch 를 위해 file_gateway 를 주입받는다(같은 files 인스턴스 재사용).
    processing = RoutingVideoProcessing(
        _build_provider_registry(s, files), s.video_default_provider
    )
    return VideoWorkerService(files=files, processing=processing, callback=callback)


async def process_video_job(ctx: dict[str, Any], payload: dict[str, Any]) -> None:
    """arq task: enqueue 의 WORKER_FUNCTION 과 함수명이 일치해야 한다.

    실패의 종료 여부는 서비스가 예외 종류로 판단한다(worker_service.run 주석): arq 의 job_try 는
    쓰지 않는다. arq 는 일반 예외를 재시도하지 않아(max_tries 는 Retry 예외 전용) 그 값이 늘 1 이고,
    그걸 '마지막 시도' 판정에 쓰면 실패가 영영 보고되지 않는다(실제로 그렇게 새어 렌더가 이틀간
    '만드는중' 으로 남았다). 재시도 예산은 스위퍼가 소유한다.
    """
    service: VideoWorkerService = ctx["worker_service"]
    await service.run(
        job_id=payload["job_id"],
        type=VideoJobType(payload["type"]),
        params=payload.get("params", {}),
        source_file_id=payload.get("source_file_id"),
    )


async def on_startup(ctx: dict[str, Any]) -> None:
    ctx["worker_service"] = _build_worker_service()


class WorkerSettings:
    functions = [process_video_job]
    on_startup = on_startup
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    # 동시 처리 잡 수: ffmpeg/미디어 컴퓨트 기준. video-ai-server 를 staging/prod 가 공유하므로 env 별 캡.
    # (LLM 호출 동시성은 이 값과 별개로 전용 세마포어로 제한: config.worker_max_jobs 주석 참고.)
    max_jobs = get_settings().worker_max_jobs
    # 실행 중 잡의 취소를 허용한다. 프로젝트를 삭제하면 그 렌더를 즉시 중단해야 한다.
    #   없으면 abort 요청이 무시되고 렌더가 끝까지 돌아, 사라진 프로젝트를 위해 벤더 요금만 나간다
    #   (실측: 삭제된 프로젝트의 렌더가 완주해 xAI 15초가 청구됐고 원장에도 남지 않았다).
    allow_abort_jobs = True
    # max_tries 는 설정하지 않는다. arq 는 일반 예외를 재시도하지 않아(Retry/CancelledError 전용)
    #   렌더 실패에는 영향이 없고, 값도 arq 기본값과 같아 적어두면 "여기서 재시도 횟수를 정한다"는
    #   오해만 남는다. 렌더 재시도 예산은 스위퍼의 재큐잉(attempts, RetryPolicy.max_resume_attempts)이 소유한다.
    # 한 시도의 최대 실행 시간: 다중 씬 Wan 렌더는 씬당 수 분이라 길다(공유 GPU). 넉넉히 잡아 렌더 도중
    #   잘리지 않게 한다. 그래도 잘리면(워커 사망 등) 재개 설계가 완료 씬을 건너뛰고 이어서 한다.
    job_timeout = 60 * 60 * 3  # 3시간
    # 워커 종료 시 실행 중 잡을 기다리는 유예(초). 급히 죽어도 체크포인트가 있어 다음 실행이 재개한다.
    #   (Wan prompt_id 는 긴 폴링 전에 이미 영속되므로, 하드 킬에도 GPU 작업은 잃지 않는다.)
    shutdown_delay = 10
    # 하트비트 주기(초): arq 가 `arq:queue:health-check`(TTL=주기+1) 를 이 간격으로 갱신한다.
    #   기본 3600s 는 "워커 살아있나"를 실시간으로 못 본다. 30s 로 낮춰, API 가 이 키로 워커 생사를
    #   판별(worker_alive)해 무한 RENDERING 대신 STALLED 를 표출할 수 있게 한다.
    health_check_interval = 30
