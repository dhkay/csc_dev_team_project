"""환경변수 (pydantic-settings): language-model.

재사용 LLM 역량 서버. 추론 엔진(vLLM/Ollama)은 OpenAI 호환 API 로 붙어 엔진 교체 = config 한 곳.
로컬은 GPU 없이도 동작하도록 기본 `INFERENCE_ENGINE=stub`(에코)로 둔다.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "language-model"
    # 배포 환경(dev/staging/prod). dev 외에서는 dev 기본 시크릿 사용 시 기동 거부(fail-closed).
    app_env: str = "dev"
    database_url: str = "postgresql+asyncpg://localhost:5432/languagemodeldb"

    # 프롬프트 자산 루트(prompts/) 오버라이드. 미설정 시 서버 루트의 prompts/ 를 쓴다(container 계산).
    #   컨테이너 배포 시 마운트 경로가 다르면 PROMPTS_DIR 로 지정.
    prompts_dir: str = ""

    # OpenAPI 스펙 노출(통합 문서 포털 수집): 토큰 면제 + 내부망 한정.
    expose_openapi: bool = True

    # 보안 Layer 3: 서버 간 인증(Service Token).
    service_token_secret: str = "dev-only-service-secret"
    # language-model = 자기 콜백(worker->language-model, Phase 2) 수신 위해 자신도 허용 목록에 포함.
    # scalar-gateway = 통합 문서 포털. csc-marketing = 기획서 생성(무상태 /inference/generate) 호출.
    # csc-control-tower 는 빠져 있다: 플랫폼에서 모델 정책(허용 목록/전역 기본 모델)을 걷어내면서
    #   control-tower→language-model 링크가 사라졌다(모델 선택은 조직 몫). 조직 화면은 csc-groupware 경유.
    allowed_services: str = (
        "web-groupware,web-control-tower,csc-groupware,csc-marketing,language-model,scalar-gateway"
    )

    # ---- 추론(inference) ----
    # 추론 엔진 선택:
    #   "stub"   = 에코(모델 없이 입력 반향, GPU 불필요): 로컬 개발 기본.
    #   "ollama" = 로컬 Ollama(Windows/WSL2 권장), "vllm" = 로컬/운영 vLLM.
    #   ※ ollama/vllm 은 둘 다 OpenAI 호환 규격(/v1/chat/completions)으로 호출할 뿐,
    #     OpenAI 회사/외부 API 가 아니다. 요청은 전부 내부망. (stub 이 아니면 실제 엔진 호출.)
    inference_engine: str = "stub"
    # OpenAI 호환 엔드포인트. dev(Ollama)=http://localhost:11434/v1, 운영(vLLM)=http://<video-ai-server>:8000/v1.
    inference_base_url: str = "http://localhost:11434/v1"
    inference_api_key: str = "not-needed"
    # 한 번의 생성이 걸리는 시간: 기획안 생성은 분량이 크다(실측: Claude 로 기획안 5개x씬 6개 = 118s,
    #   최대 조합 6x8 은 그 이상). 공유 vLLM 은 남의 부하로 더 느려질 수 있다.
    #   사다리: nginx(360s) > csc-marketing(300s) > 여기(240s): 아래층이 먼저 끊겨야 원인이 정확히 잡힌다.
    inference_timeout_s: float = 240.0
    # 자체 호스팅 모델이 한 번에 낼 수 있는 최대 출력 토큰: vLLM 창(max_model_len, 기본 8192)은
    #   프롬프트+출력 합계라 그중 프롬프트 몫(~2K)을 뺀 값. 이 상한을 넘겨 보내면 vLLM 이 400 으로 거절한다.
    #   호출자는 필요한 만큼 요청하고, 이 값으로 우리가 깎는다(domain/thinking.output_budget).
    #   창을 키우면(VLLM_MAX_MODEL_LEN) 이 값도 함께 올린다. 0 = 상한 없음.
    inference_max_output_tokens: int = 6000
    # Qwen3 등 사고형 모델의 <think> 출력 제어. 기본 off(챗봇용 간결 답변).
    #   vLLM 은 chat_template_kwargs.enable_thinking 로 존중, Ollama/기타는 무시(무해).
    inference_enable_thinking: bool = False
    # LLM 호출 동시성 상한(네트워크 I/O): 컨테이너 cpu/mem 캡과 독립.
    llm_max_concurrency: int = 8

    # provider 라우팅 기본값: 카탈로그 spec.provider 가 레지스트리에 없을 때 폴백.
    #   "internal"(자체 호스팅) 기본. stub 엔진이면 build_inference 가 "stub" 로 강제한다.
    inference_default_provider: str = "internal"

    # ---- 외부 벤더 API(provider="external"): Claude(Anthropic) ----
    # AI 어시스턴트의 외부 Claude 모델. 전역 키가 아니라 조직별 등록 키를 per-request 로
    # csc-groupware 에서 해석해 쓴다. 벤더 식별자는 어댑터가 고정(ANTHROPIC).
    external_base_url: str = "https://api.anthropic.com"
    external_timeout_s: float = 240.0  # 위 inference_timeout_s 와 같은 근거(실측 기반 사다리).
    external_max_tokens: int = 4096  # Anthropic /v1/messages 필수 필드(요청에 없으면 이 값).

    # ---- 이미지 생성: 외장(OpenAI) + 내장(자체 호스팅 ComfyUI) ----
    # 외장: OpenAI Images API. 전역 키가 아니라 조직별 등록 키(OPENAI)를 per-request 로 해석.
    #   벤더 API 라 GPU 무관(stub 엔진에서도 등록). base_url 은 OpenAI 공개 엔드포인트.
    openai_base_url: str = "https://api.openai.com"
    openai_timeout_s: float = 120.0
    # 이미지 카탈로그 기본 키/served 이름. 키는 프론트 옵션 key 와 일치해야 한다(불일치 시 조용한 폴백).
    #   served 는 OpenAI Images 의 모델 id: 다른 세대(gpt-image-1.5 등)로 바꾸려면 env 로 오버라이드.
    image_model_key: str = "gpt-image-2"
    image_served_model_name: str = "gpt-image-2"
    # 요청에 size/quality 미지정 시 기본값(gpt-image-2: 1024x1536 프리셋 지원, quality∈{low,medium,high,auto}).
    image_default_size: str = "1024x1536"
    image_default_quality: str = "medium"
    # 내장(자체 호스팅) 이미지 엔진 선택:
    #   "stub"    = placeholder(GPU 불필요): 로컬 dev 기본.
    #   "comfyui" = 자체 ComfyUI(FLUX.1 schnell): 웹서버 GPU(추후 image-ai-server). base_url env 로 호스트 추상화.
    image_engine: str = "stub"
    # ComfyUI 이미지 엔진 엔드포인트. 빈 값 = 미배포(선택 시 명시 에러). 영상의 COMFYUI_URL 과 동형
    #   image-ai-server 로 옮겨도 이 URL 만 바꾸면 됨(코드 무변경).
    image_comfyui_url: str = ""
    # 내 잡이 실제 실행되는 동안의 인내심. 큐에서 남의 잡을 기다린 시간은 여기 포함되지 않는다
    #   (그 대기는 아래 busy 쪽이 맡는다). 모델 로드가 이 시계에 포함된다: 영상이 끼어들어 모델이
    #   밀려난 직후엔 콜드 로드가 붙으므로 넉넉히 잡는다. 측정값은 런북(공유 GPU 운영 정책).
    image_comfyui_timeout_s: float = 300.0
    # 공유 엔진 혼잡 상한: 차례를 기다리는 시간의 한계.
    #   ComfyUI(csc-ai-comfyui)는 dev/staging/prod 가 함께 쓰는 GPU 1장이고 잡을 직렬 처리한다.
    #   따라서 내 잡이 남의 잡 뒤에서 대기하는 건 고장이 아니라 정상이며, 실행 인내심으로 재면 안 된다
    #   (그렇게 재다가 큐가 깊어질 때마다 멀쩡한 잡을 포기했다. 엔진엔 성공으로 남고 화면만 실패).
    #   환경을 분리하면 이 대기는 짧아질 뿐, 이 값은 그대로 두면 된다.
    image_comfyui_busy_timeout_s: float = 900.0
    # FLUX.1 schnell 권장 스텝(1~4). 워크플로 __STEPS__ 로 주입.
    image_default_steps: int = 4
    # FLUX unet 파일명: 영상(Wan)과 GPU 를 공유하므로 이 선택이 곧 VRAM 예산이다.
    #   확장자가 워크플로 로더를 정한다(flux_schnell_workflow.py). 측정값/롤백 절차는 런북:
    #   infra/docker/design-image-comfyui.md (공유 GPU 운영 정책).
    image_flux_unet_name: str = "flux1-schnell-Q4_K_S.gguf"
    # 대화형 이미지 잡을 ComfyUI 큐 앞으로 넣는다. 배치 영상 렌더 뒤에서 굶지 않게.
    #   같은 엔진을 dev/staging/prod 가 공유하므로, dev 가 prod 렌더를 앞지르면 안 되는 상황에선 false.
    image_comfyui_queue_front: bool = True
    # 내장 엔진이 막혔을 때 외부 모델로 강등해 생성을 이어갈지: 기본 off.
    #   내장(FLUX)을 쓰는 이유가 무료이기 때문이므로, 막혔다고 조용히 유료 벤더로 넘어가면 조직이
    #   의도하지 않은 과금을 맞는다(그 결제 한도가 애초에 자체 호스팅을 도입한 이유였다).
    #   그래서 기본 동작은 명시적 실패다. 호출자(csc-marketing)가 작업 전체를 취소하고
    #   사용자에게 사유를 알린다. 켜려면 true(강등 시 그 조직의 외부 키로 과금되며, 응답 모델 신원도
    #   그 모델로 바뀌어 비용이 올바르게 귀속된다). 환경 단위 스위치다. 조직/채널별 제어는 없다.
    image_external_fallback: bool = False

    # ---- 조직 공용 API 자격증명 resolve(csc-groupware) ----
    # 외부 provider 가 조직별 키를 가져오는 대상(내부 도커는 GROUPWARE_URL 로 오버라이드).
    groupware_url: str = "http://localhost:3000"
    credential_cache_ttl_s: int = 60  # resolve 결과 인메모리 TTL(초): 매 요청 호출 회피.

    # ---- 모델 카탈로그(env 기반, per-env 주입) ----
    # 요청 model key 기본값(프론트 드롭다운 id 와 일치, 예: "qwen").
    # 카탈로그 key = 프론트 옵션 key(aiModelOptions.ts 'internal-qwen3')/단가표 key 와 일치시킨다.
    #   served 이름(엔진 배포명, 아래 chat_served_model_name)과 다른 개념이다.
    chat_model_key: str = "internal-qwen3"
    # 기본 chat 모델의 표시명(프론트 드롭다운 라벨) 및 사고형(<think>) 지원 여부.
    #   드롭다운 SSOT = 백엔드 카탈로그. MODEL_CATALOG_JSON 으로 모델별 세밀 지정 가능.
    chat_model_label: str = "Qwen"
    # 자체 모델 제공 브랜드(드롭다운 '기업' 그룹). 외부 모델(Claude)은 카탈로그가 "Anthropic" 을 준다.
    chat_vendor: str = "Qwen"
    chat_supports_thinking: bool = True
    # 드롭다운 상세 메타(파라미터수/설명/컨텍스트): 기본값은 dev(Qwen3 4B, Ollama).
    #   운영은 env(CHAT_PARAMS/CHAT_DESCRIPTION/CHAT_CONTEXT_LENGTH)나 MODEL_CATALOG_JSON 으로 오버라이드.
    chat_params: str = "4B"
    chat_description: str = "Qwen3 4B Instruct"
    chat_context_length: int = 4096  # 0 이면 미표시
    # 기본 카탈로그(MODEL_CATALOG_JSON 미설정 시)로 매핑할 served model 이름.
    #   dev(Ollama)=예 "qwen3:8b"/"qwen3:4b", 운영(vLLM)=예 "qwen3-14b".
    chat_served_model_name: str = "qwen"
    # 카탈로그 오버라이드(JSON). {"qwen": {"served_model_name":"qwen3-14b","lora_adapter":null,"kind":"chat"}}
    model_catalog_json: str = ""
    # 임베딩(RAG, Phase 2).
    embedding_model_key: str = "qwen-embed"
    embedding_served_model_name: str = "qwen-embed"

    # ---- RAG(Phase 2) ----
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""

    # ---- 큐/워커(RAG 인제스트, Phase 2) ----
    # 전용 redis 논리 DB: 서비스별 격리(arq 잡 도난 방지, db 0 은 예약). language-model=db 3.
    #   상세 컨벤션: .claude/rules/system-architecture.md (redis 소유권).
    redis_url: str = "redis://localhost:6379/3"
    worker_service_name: str = "language-model"

    @property
    def allowed_services_set(self) -> set[str]:
        return {s.strip() for s in self.allowed_services.split(",") if s.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
