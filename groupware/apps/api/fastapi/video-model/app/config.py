"""환경변수 (pydantic-settings)."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

from .domains.video.core.domain.retry_policy import RENDER_RETRY_POLICY


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "video-model"
    # 배포 환경(dev/staging/prod). dev 외에서는 dev 기본 시크릿 사용 시 기동 거부(fail-closed).
    app_env: str = "dev"
    database_url: str = "postgresql+asyncpg://localhost:5432/videomodeldb"

    # OpenAPI 스펙(/openapi.json) 노출 여부: 전 환경 기본 노출(통합 문서 포털 scalar-gateway 가 수집).
    # 스펙 경로는 ServiceTokenMiddleware 면제 + 내부망(LAN/nginx allowlist) 한정이라 외부 노출되지 않는다.
    # Swagger UI(/docs), ReDoc(/redoc) 은 개별 UI 라 dev 에서만 노출하고, 통합 UI 는 포털이 담당한다.
    expose_openapi: bool = True

    # 보안 Layer 3: 서버 간 인증(Service Token). dev 기본값은 BFF 폴백과 동일.
    # prod 는 compose 에서 SERVICE_TOKEN_SECRET 을 필수(:?)로 주입한다.
    service_token_secret: str = "dev-only-service-secret"
    # 조직 자격증명(잡 params, 예: Grok 키) 암호화 전용 키(선택): 설정 시 SERVICE_TOKEN_SECRET 대신 복호화 키로 사용(키 분리).
    #   csc-marketing(암호화)의 JOB_CREDENTIAL_ENC_KEY 와 반드시 동일해야 복호화된다. 미설정("")이면 service_token_secret 로 폴백.
    job_credential_enc_key: str = ""
    # video-model 콜백(worker->video) 수신을 위해 video-model 도 허용 목록에 포함.
    # scalar-gateway = 통합 문서 포털(서비스토큰으로 /openapi.json, Try-it-out 호출).
    allowed_services: str = (
        "web-groupware,web-control-tower,csc-groupware,csc-control-tower,"
        "csc-marketing,video-model,scalar-gateway"
    )

    # ---- video: 큐/워커/서버간 ----
    # 전용 redis 논리 DB: 서비스별 격리(arq 잡 도난 방지, db 0 은 예약). video-model=db 2.
    #   상세 컨벤션: .claude/rules/system-architecture.md (redis 소유권).
    redis_url: str = "redis://localhost:6379/2"
    # 워커 동시 처리 잡 수(arq max_jobs): ffmpeg/미디어 컴퓨트(TRANSCODE 등) 기준.
    # video-ai-server 를 staging/prod 가 공유하므로 env 별로 낮게 잡아 CPU/디스크가 서로를 굶기지 않게 한다.
    # compose 가 WORKER_MAX_JOBS 로 주입(staging 낮게, prod 우선).
    # 주의: LLM 호출(GENERATE/AI)은 네트워크 I/O 라 이 캡, 컨테이너 cpu/mem 캡과 무관하게
    #       별도 동시성 제한(전용 세마포어)으로 관리한다. 추후 배선(아래 [예정]).
    worker_max_jobs: int = 4
    # 병렬(빠른 생성) 렌더에서 한 잡이 동시에 생성 중인 씬 수 상한. 벤더 제출 빈도는 어댑터의
    #   VendorThrottle 이 따로 벌리므로 이 값은 "겹쳐 기다리는 생성" 의 수다. 1 이면 순차와 같다.
    compose_segment_parallelism: int = 3
    # worker 의 outbound 호출(서비스토큰 신원) 및 대상 베이스 URL.
    worker_service_name: str = "video-model"
    file_service_url: str = "http://localhost:9001"   # worker -> file-service
    video_service_url: str = "http://localhost:8000"  # worker -> video-model 콜백
    # 나레이션 TTS(edge-tts) 한 호출의 최대 시간(초). 네트워크 stall 시 예외 없이 무한 대기하는 걸 막아
    #   TimeoutError 로 끊는다 → worker_service 가 비최종 시도면 재시도(체크포인트 재개)로 자가복구.
    tts_timeout_s: float = 60.0

    # ---- 영상 처리 프로바이더(퍼-잡 라우팅) ----
    # 잡마다 params["provider"] 로 어댑터 선택(language-model RoutingInference 와 동형).
    # 미지정/미등록 시 이 기본 provider 로 폴백. 레지스트리: internal(ffmpeg) + 자체 영상(wan2.2-ti2v-5b).
    #   내부 모델 N개(+ 필요 시 외부 API)를 각각 provider key 로 레지스트리에 추가 가능(worker._build_provider_registry).
    #   출력은 provider 무관하게 store→URL(result_file_id) 균일.
    video_default_provider: str = "internal"

    # ---- 자체 영상 생성(provider="wan2.2-ti2v-5b"): ComfyUI(GPU) HTTP 백엔드 ----
    #   ComfyUIVideoGenProcessing 어댑터로 라우팅(프론트 aiModelOptions 의 video key 와 동일).
    #   Wan 2.2 TI2V-5B 를 ComfyUI 네이티브로 실행(diffusers 는 이 모델 I2V 미지원 #13258). T2V/I2V/TI2V
    #   모두 지원: 워크플로 세트(코드 임베드, wan22_workflows.py)를 어댑터에 주입, 소스 이미지 유무로 모드 선택.
    #   무거운 GPU 는 ComfyUI 컨테이너(video-ai-server)에 격리 → 이 워커는 httpx 호출만(torch 미탑재, CPU 이미지 유지).
    #   comfyui_url 이 비면 선택 시 명시적 에러(미배포).
    wan_provider_key: str = "wan2.2-ti2v-5b"
    comfyui_url: str = ""              # 예: http://csc-ai-comfyui:8188 (csc-ai 도커 네트워크). 빈 값=미배포.
    # 내 잡이 실제 렌더되는 동안의 인내심(영상 렌더는 수 분). 큐에서 남의 잡을 기다린 시간은 포함되지
    #   않는다. 그 대기는 아래 busy 가 맡는다.
    comfyui_timeout_s: float = 900.0
    # 공유 엔진 혼잡 상한: 차례를 기다리는 시간의 한계.
    #   ComfyUI(csc-ai-comfyui)는 staging/prod 가 함께 쓰는 GPU 1장(staging/ai 소유, prod 가 csc-ai
    #   네트워크로 공유)이고 잡을 FIFO 로 직렬 처리한다. 남의 렌더 뒤에서 기다리는 건 고장이 아니라 정상이라
    #   실행 인내심으로 재면 안 된다. 환경을 분리하면 이 대기가 짧아질 뿐, 값은 그대로 두면 된다.
    comfyui_busy_timeout_s: float = 1800.0
    wan_num_frames: int = 121          # 5초 @ 24fps. 워크플로에 __FRAMES__ 로 주입.
    # Wan unet 파일명: 이미지(FLUX)와 같은 GPU 를 쓰므로 상주 예산이 곧 이 선택이다.
    #   기본 GGUF Q6_K(약 4.3GB)는 FLUX Q4_K_S(약 6.3GB)와 동시 상주를 노린 값이다. fp16(9.4GB)이면
    #   합이 VRAM 을 넘어 이미지/영상이 번갈아 올 때마다 전체 교체가 일어난다(느려지는 주된 원인).
    #   확장자가 로더를 결정한다(wan22_workflows.py): *.gguf → UnetLoaderGGUF, 그 외 → UNETLoader.
    #   품질이 아쉬우면 wan2.2_ti2v_5B_fp16.safetensors 로 되돌린다(교체 재발은 감수).
    wan_unet_name: str = "Wan2.2-TI2V-5B-Q6_K.gguf"

    # ---- 외부 영상 생성(provider="grok-imagine-video"): xAI Grok Imagine HTTP 백엔드 ----
    #   조직이 등록한 xAI 키로 호출한다. 키는 config 가 아니라 잡 params 로 암호화 전달(조직마다 다름
    #   csc-marketing 이 enqueue 때 resolve→암호화, 워커가 사용 직전 복호화). 제출→폴링(ResumableVisualPort).
    #   base_url 기본값이 있어 상시 등록되며, 조직 키 없으면 csc-marketing 이 이 provider 로 라우팅하지 않는다.
    grok_provider_key: str = "grok-imagine-video"
    xai_base_url: str = "https://api.x.ai/v1"
    xai_video_model: str = "grok-imagine-video"
    # 화질 폴백: 실제 값은 COMPOSE 잡의 params.resolution(영상 만들기 시점 선택)이 정한다.
    #   잡이 화질을 안 실어 보낸 경우(구 잡 등)에만 쓰인다. 파이프라인 기본과 같은 720p 로 둘 것.
    xai_resolution: str = "720p"
    xai_timeout_s: float = 900.0       # 영상 생성 폴링 인내심(수 분).
    xai_poll_interval_s: float = 3.0
    # 한도 다루기(vendor_http.VendorThrottle). 분당 제출 상한은 조직이 키에 등록한 값이 우선하고 이 값은
    #   그 값이 없는 키의 기본이다. 모르면 0(간격 조절 없음), 429 재시도만. 대기 표는 RetryPolicy 가 갖는다.
    xai_submits_per_minute: float = 0.0
    xai_throttle_max_retries: int = RENDER_RETRY_POLICY.rate_limit_retries

    # ---- 외부 영상 생성(provider="higgsfield"): 여러 회사 모델을 중계하는 플랫폼 ----
    #   xAI 와 달리 어댑터가 하나다. 어느 회사 모델인지는 잡 params 의 모델 경로가 정하므로
    #   (scene_visual_model), 모델이 늘어도 이 설정도 워커 레지스트리도 바뀌지 않는다.
    #   자격증명도 잡 params 로 암호화 전달한다(조직마다 다름). 형식은 `{키id}:{시크릿}`.
    higgsfield_provider_key: str = "higgsfield"
    higgsfield_base_url: str = "https://platform.higgsfield.ai"
    higgsfield_timeout_s: float = 900.0
    higgsfield_poll_interval_s: float = 5.0
    # 한도 다루기. xAI 와 같은 규칙(키 등록값 우선, 모르면 0, 429 재시도만).
    higgsfield_submits_per_minute: float = 0.0
    higgsfield_throttle_max_retries: int = RENDER_RETRY_POLICY.rate_limit_retries

    # ---- 외부 영상 생성(provider="gemini"): Google Gemini API 의 Veo ----
    #   위 플랫폼과 같은 모델이 여기 또 있을 수 있다(Veo). 다른 것은 경로다: 이쪽은 조직의
    #   Google 키로 Google 을 직접 부르고 요금도 그 계정에 붙는다. 어느 Veo 모델인지는 잡 params
    #   (scene_visual_model)가 정하므로 모델이 늘어도 이 설정도 워커 레지스트리도 바뀌지 않는다.
    #   자격증명도 잡 params 로 암호화 전달한다(조직마다 다름). 값은 API 키 하나다.
    gemini_provider_key: str = "gemini"
    gemini_base_url: str = "https://generativelanguage.googleapis.com"
    # 생성 지연이 피크에 6분까지 간다(벤더 문서). 폴링 인내심을 그보다 넉넉히 둔다.
    gemini_timeout_s: float = 900.0
    gemini_poll_interval_s: float = 10.0
    # 같은 키(프로젝트)로 나가는 제출의 분당 상한. Google 이 프로젝트 단위로 재는 값인데 Veo 의
    #   수치는 문서에 없고 조직의 AI Studio 대시보드에만 보인다(Tier 1 사례 2, 프리뷰 기본 10 이라는 설).
    #   조직이 그 값을 키와 함께 등록하면(자격증명 필드 submitsPerMinute) 그것이 우선하고, 이 값은
    #   등록하지 않은 키의 기본이다. 기본 4 는 위 두 값 사이다. 한도가 더 낮은 프로젝트는 넘친 제출이
    #   429 재시도로 10초 뒤 다시 나가므로 씬을 잃지 않는다. 폴링은 세지 않으므로 무관.
    gemini_submits_per_minute: float = 4.0
    # 제출과 폴링이 429 를 받았을 때 그 자리에서 다시 보내는 횟수(대기 표는 RetryPolicy 가 갖는다).
    gemini_throttle_max_retries: int = RENDER_RETRY_POLICY.rate_limit_retries

    # ---- 외부 나레이션(ElevenLabs) ----
    #   음성 id 는 조직 자격증명에서 오고(잡 params 의 tts.voice), 키도 params 로 암호화 전달한다.
    #   provider key 는 모델 id 그대로다: 카탈로그가 모델을 고르면 그 값이 그대로 라우팅 키가 된다.
    elevenlabs_base_url: str = "https://api.elevenlabs.io"
    elevenlabs_tts_models: str = "eleven_v3,eleven_multilingual_v2,eleven_flash_v2_5"

    # ---- 리컨실리에이션 스위퍼(콜백 유실 복구) ----
    sweeper_interval_s: int = 60
    video_pending_timeout_s: int = 300        # 미소비 PENDING 임계
    # 워커 사망 PROCESSING 감지 임계: 나이가 아니라 큐(is_alive)가 죽음을 판정하므로 짧게 잡아 죽은
    #   잡을 빨리 발견해 부활(재큐잉)시킨다. 살아있는(느린) 렌더는 arq in_progress 라 is_alive=True → 나이와
    #   무관하게 안 건드린다. 즉 이 값은 "죽었는지 물어볼 시점"일 뿐, 긴 Wan 렌더를 조기 실패시키지 않는다.
    video_processing_timeout_s: int = 300

    @property
    def allowed_services_set(self) -> set[str]:
        return {s.strip() for s in self.allowed_services.split(",") if s.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
