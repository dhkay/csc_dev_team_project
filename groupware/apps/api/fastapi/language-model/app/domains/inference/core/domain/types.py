"""도메인 Record/Type (inference 도메인): InferencePort 경계를 넘는 순수 DTO.

FastAPI/SQLAlchemy/httpx 를 import 하지 않는다. 엔진(vLLM/Ollama)에 비종속.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .thinking import ThinkingControl


@dataclass(frozen=True)
class TokenUsage:
    """토큰 사용량(가능할 때만 채움: 스트리밍은 엔진이 usage 를 줄 때만)."""

    prompt: int
    completion: int
    total: int


@dataclass(frozen=True)
class ImageTokenUsage:
    """이미지 생성 토큰 사용량.

    gpt-image 계열은 장당 정액이 아니라 토큰 과금이라 이 값이 비용의 유일한 근거다.
    셋으로 나누는 이유: 단가가 텍스트 입력($5/1M), 이미지 입력($8/1M), 이미지 출력($30/1M)으로
    모두 달라서 합계만 남기면 금액을 되계산할 수 없다.

    자체 호스팅(ComfyUI/FLUX)은 토큰 개념이 없어 None 이며, 그 부재가 곧 '무료' 의 표현이다.
    """

    input_text: int
    input_image: int
    output_image: int


@dataclass(frozen=True)
class PromptMessageRecord:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass(frozen=True)
class GenerationRequestRecord:
    """추론 요청. `model` 은 이미 카탈로그로 resolve 된 served model 이름(또는 LoRA 어댑터 id)."""

    model: str
    messages: list[PromptMessageRecord]
    max_tokens: int | None = None
    temperature: float = 0.7
    stream: bool = True
    # 사고를 원하는가(요청 의도). None = 어댑터 기본값 사용.
    enable_thinking: bool | None = None
    # 그 모델의 사고를 어떻게 제어하는가(모델의 사실). 카탈로그 spec.thinking 에서 전파된다.
    #   위 의도와 이 형식을 함께 봐야 실제로 무엇을 보낼지가 정해진다(core/domain/thinking.py).
    thinking_control: ThinkingControl = ThinkingControl.OMIT
    # 호스팅 provider 라우팅 키: 이 요청을 어느 어댑터가 처리할지 결정(RoutingInference).
    #   "internal"(자체 호스팅 vLLM/Ollama) | "stub"(에코) | 벤더 id(예: "anthropic")=외부 벤더 어댑터.
    #   카탈로그 spec.provider 에서 전파된다. 레지스트리에 없으면 default_provider 로 폴백.
    provider: str = "internal"
    # 요청 조직 id(멀티테넌트): 외부 어댑터가 조직별 자격증명(예: Claude 키)을 해석하는 데 쓴다.
    #   내부(자체 호스팅) 어댑터는 무시. BFF 가 넘긴 X-Organization-Id 에서 전파된다.
    organization_id: str | None = None
    # 외부 벤더 자격증명 provider(예: "ANTHROPIC"): 카탈로그 spec.credential_provider 에서 전파.
    #   외부 어댑터가 조직 키를 어느 api-credential provider 로 해석할지 결정한다. 내부/stub 은 None.
    credential_provider: str | None = None


@dataclass(frozen=True)
class GenerationChunkRecord:
    """스트리밍 단위. delta = 이번 토큰 조각, finish_reason/usage 는 종료 청크에만."""

    delta: str
    finish_reason: str | None = None
    usage: TokenUsage | None = None


@dataclass(frozen=True)
class GenerationResultRecord:
    text: str
    usage: TokenUsage | None = None
    #: 실제로 응답한 모델 key. 요청이 빈 모델(채널 미선택)이면 서버가 카탈로그에서 고르므로,
    #:  호출자가 비용을 실제로 돈이 나간 모델에 귀속하려면 이 값이 필요하다.
    model: str = ""


@dataclass(frozen=True)
class ImageGenerationRequestRecord:
    """이미지 생성 요청. `model` 은 카탈로그로 resolve 된 served 이름(예: gpt-image-1)."""

    model: str
    prompt: str
    size: str = "1024x1024"
    quality: str = "medium"
    n: int = 1
    # 생성 seed: 내장(ComfyUI/FLUX)은 같은 seed 로 재현/일관성 확보(같은 기획안 씬끼리 동일 seed).
    #   외부(OpenAI)는 seed 미지원이라 무시한다. None = 어댑터가 임의 seed.
    seed: int | None = None
    # 요청 조직 id(멀티테넌트): 외부 벤더 어댑터가 조직 키를 해석하는 데 쓴다.
    organization_id: str | None = None
    # 외부 벤더 자격증명 provider(예: "OPENAI"): 카탈로그 spec.credential_provider 에서 전파.
    credential_provider: str | None = None
    # 호스팅 provider 라우팅 키(벤더 id). 이미지는 현재 OpenAI 단일 벤더.
    provider: str = "openai"


@dataclass(frozen=True)
class ImageResultRecord:
    b64: str
    mime: str = "image/png"


@dataclass(frozen=True)
class ImageGenerationResultRecord:
    images: list[ImageResultRecord]
    #: 벤더가 보고한 토큰 사용량. 자체 호스팅은 None(무료라 과금 단위가 없다).
    usage: ImageTokenUsage | None = None
    #: 실제로 그린 모델 key(요청값이 아니다): 비용 귀속의 근거.
    model: str = ""


@dataclass(frozen=True)
class ImageEngineLoadRecord:
    """자체 호스팅 이미지 엔진의 현재 부하: 공유 자원의 상태.

    ComfyUI(csc-ai-comfyui)는 dev/staging/prod 와 모든 작업자가 함께 쓰는 GPU 1장이고 잡을 직렬
    처리한다. 그래서 내 작업이 얼마나 기다릴지는 내 화면이 아니라 이 큐가 정한다. 작업자에게
    "지금 앞에 몇 건"을 보여주려면 이 값이 필요하다(내 탭의 진행도로는 알 수 없다).

    외부 벤더(OpenAI 등)는 이런 큐가 없다(요청만큼 확장): 그쪽 어댑터는 None 을 돌려준다.
    """

    running: int
    """지금 그리는 중인 잡 수(GPU 1장이면 0 또는 1)."""
    pending: int
    """차례를 기다리는 잡 수: 내 잡이 뒤에 서면 이만큼 기다린다."""


@dataclass(frozen=True)
class EmbeddingRequestRecord:
    model: str
    inputs: list[str]
    # 호스팅 provider 라우팅 키(GenerationRequestRecord.provider 와 동일 의미).
    provider: str = "internal"


@dataclass(frozen=True)
class EmbeddingRecord:
    vector: list[float]


@dataclass(frozen=True)
class ModelSpecRecord:
    """카탈로그 1개 항목: 요청 key → 엔진에 보낼 served 이름(+선택 LoRA).

    엔진 resolve 정보(served/LoRA)와 함께, 프론트 드롭다운의 진실원이 되는 UI/능력 메타를
    담는다(label/available/supports_thinking). 프론트는 이 카탈로그를 받아 렌더링만 한다.
    호스팅 표기(self/api)는 응답 매퍼가 `credential_provider` 유무에서 파생한다(중복 필드 없음).
    """

    key: str
    served_model_name: str
    base_model: str | None = None
    lora_adapter: str | None = None
    kind: str = "chat"  # "chat" | "embedding"
    # per-org LoRA(Phase 3): organization_id -> lora_adapter 이름.
    org_lora_adapters: dict[str, str] = field(default_factory=dict)
    # 호스팅 provider: 이 모델을 처리할 어댑터 라우팅 키(RoutingInference 로 전파).
    #   "internal"(자체 호스팅) | "stub" | 벤더 id(예: "anthropic")=외부 벤더 어댑터.
    provider: str = "internal"
    # 외부 벤더 모델이 쓸 api-credential 프로바이더 key(예: "ANTHROPIC"). 내부/stub 은 None.
    #   이 값이 있으면 외부(serving="api")로 간주하고, 조직에 이 key 가 등록돼야 사용 가능하다.
    #   멀티벤더 확장의 단일 소스: 새 벤더 모델은 여기에 자기 credential provider 를 선언만 하면 된다.
    credential_provider: str | None = None
    # UI/능력 메타(프론트 드롭다운 SSOT)
    label: str | None = None  # 표시명. None 이면 key 를 그대로 노출.
    vendor: str | None = None  # 제공 기업/브랜드(드롭다운 '기업' 그룹핑, 예: "Qwen", "Anthropic").
    available: bool = True  # False = 준비중(선택 불가 placeholder: 실제 추론 대상 아님)
    # 사고 토글을 화면에 내주는가(제품 판단). 모델이 사고를 할 수 있는가(`thinking`)와 다르다.
    #   지금 응답과 스트림은 text 만 읽어서, 켜면 그 시간이 빈 화면으로 보이고 답이 짧아진다.
    #   그래서 할 수 있는 모델이라도 보여 줄 준비가 될 때까지 이 값은 False 다.
    supports_thinking: bool = False
    # 이 모델의 사고를 어떻게 제어하는가(벤더가 받는 형식). 어댑터가 이 값만 보고 와이어를 만든다.
    thinking: ThinkingControl = ThinkingControl.OMIT
    # 드롭다운 상세(선택: 없으면 미표시)
    params: str | None = None  # 파라미터 수 표기(예: "4B", "14B")
    description: str | None = None  # 한 줄 설명(예: "Qwen3 4B Instruct")
    context_length: int | None = None  # 컨텍스트 길이(토큰)
    # 이 모델이 한 번에 낼 수 있는 최대 출력 토큰. None = 상한 없음(호출자 요청 그대로).
    #   모델의 사실이므로 카탈로그가 소유한다. 호출자(csc-marketing 등)는 필요한 만큼 요청하고,
    #   창을 넘는지는 모델을 아는 이쪽이 깎는다. 호출자가 남의 모델 창을 추측해 상수로 박으면,
    #   창이 큰 모델(Claude 등)까지 가장 작은 모델에 맞춰 손해를 보고, 창이 바뀌면 호출자가 모른다.
    max_output_tokens: int | None = None

    @property
    def display_label(self) -> str:
        return self.label or self.key
