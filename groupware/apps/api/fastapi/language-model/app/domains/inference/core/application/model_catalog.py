"""모델 카탈로그: 요청 model key → 엔진 served 이름/LoRA 어댑터 resolve.

env(MODEL_CATALOG_JSON) 로 per-env 주입(14B prod/staging, 8B/4B local). 미설정 시 설정값으로
최소 1개 기본 항목을 만든다. `resolve(key, organization_id)` 의 organization_id 인자가
per-org LoRA(Phase 3) 슬롯: 지금은 org_lora_adapters 가 비어 있어 base 로 fallback.
"""

from __future__ import annotations

import json
import logging
from dataclasses import replace

from ..domain.thinking import ThinkingControl
from ..domain.types import ModelSpecRecord

# 외부 기본 모델: Claude(Anthropic). provider="anthropic"(라우팅 키=벤더 id) →
#   키는 프론트 옵션 key(aiModelOptions.ts)/단가표 key 와 글자 그대로 일치한다: 이미지와 같은 규칙.
#   어긋나면 (a) 저장된 선택이 폴백돼 다른 모델로 답하거나 (b) 비용이 rate-unknown 으로 새어 사라진다
#   (실측: key 'claude-opus' 를 응답에 실어 기획서 생성 1건의 금액이 기록되지 않았다).
#   RoutingInference 가 벤더별 어댑터로 디스패치. credential_provider="ANTHROPIC" 가 있으면 매퍼가
#   serving="api" 로 파생하고, 서비스(list_models)가 조직의 해당 키 등록 여부로 per-org 오버라이드한다.
#   served_model_name = Anthropic 공개 API 모델 id(계정/버전에 맞게 MODEL_CATALOG_JSON 으로 오버라이드 가능).
#   멀티벤더 확장: 새 벤더 모델은 provider=<벤더 id> + credential_provider=<키 provider> 로 여기(또는 JSON) 추가.
# 저장된 구 key 호환: 이름 통일(아래) 이전에 저장된 값이 남아 있을 수 있다.
#   대상: 채팅 세션/메시지의 model(과거 기록: 고쳐 쓰지 않는다), 통일 전에 설정된 어시스턴트 옵션.
#   없으면 그 값들이 어느 spec 에도 안 맞아 조용히 기본 모델로 폴백한다(작업자가 고른 모델이 아닌
#   모델로 답하고, 비용도 그 모델에 붙는다). 그래서 표를 남긴다. 새 저장은 전부 통일된 key 다.
_LEGACY_CHAT_KEY_ALIASES: dict[str, str] = {
    "claude-opus": "claude-opus-4-8",
    "claude-sonnet": "claude-sonnet-5",
    "claude-haiku": "claude-haiku-4-5-20251001",
    "qwen": "internal-qwen3",
}


def _warn_chat_fallback(ref: str, fallback: ModelSpecRecord) -> None:
    """고른 모델이 아닌 모델이 답을 쓰게 됐다는 사실을 남긴다(이미지 경로와 같은 문형).

    이 경로가 조용하면 카탈로그에 없는 key 로 기획서를 만든 건의 금액이 원장에 기록되지 않고
    그 사실을 알릴 신호도 남지 않는다.
    """
    logging.getLogger(__name__).warning(
        "채팅 모델 ref '%s' 를 카탈로그에서 해석하지 못해 '%s'(%s)로 폴백했다. "
        "고정 모델 key 오타나 배포 환경의 MODEL_CATALOG_JSON 누락인지 확인할 것.",
        ref,
        fallback.key,
        fallback.served_model_name,
    )

# Claude 출력 창(토큰). 선언하지 않으면 `output_budget` 이 깎지 못한다: 호출자가 보낸
#   값이 그대로 벤더로 나가고, 창을 넘기면 400 으로 거절된다. 그러면 호출자가 벤더 창을 스스로
#   추측해야 하는데, 그건 모델을 아는 이 서버의 일이다(그 함수 주석이 적어 둔 분담이다).
#
#   실측으로 정했다(2026-08-28, `/inference/generate` 로 확인):
#     sonnet-5 / opus-4-8   100,000 통과, 200,000 거절
#     haiku-4-5              64,000 통과,  80,000 거절
#   셋의 공통 안전값을 쓴다. 최댓값을 좇지 않는 이유: 이 값의 목적은 거절을 막는 것이지 한 토큰이라도
#   더 받는 것이 아니고, 하나로 두면 모델이 늘 때 표가 어긋날 자리가 줄어든다.
_CLAUDE_MAX_OUTPUT_TOKENS = 64_000

# 사고 제어 형식(`thinking`)은 모델의 사실이라 여기가 소유한다. 어댑터는 이 값을 옮길 뿐이다.
#   TOGGLE 인 모델은 생략하면 사고가 켜진다. 그래서 끌 때도 명시해야 하고, 명시하지 않으면
#   모델을 바꾸는 행위가 곧 사고 토글이 된다(그 상태에서 사고가 예산을 다 써 본문이 사라진 적이 있다).
#   haiku 는 adaptive 를 400 으로 거절해 OMIT 이다. 근거와 실측표는 core/domain/thinking.py 참고.
_EXTERNAL_DEFAULTS: list[ModelSpecRecord] = [
    ModelSpecRecord(
        key="claude-opus-4-8",
        served_model_name="claude-opus-4-8",
        kind="chat",
        provider="anthropic",
        credential_provider="ANTHROPIC",
        label="Claude Opus 4.8",
        vendor="Anthropic",
        available=True,
        max_output_tokens=_CLAUDE_MAX_OUTPUT_TOKENS,
        thinking=ThinkingControl.TOGGLE,
        description="최고 성능",
    ),
    ModelSpecRecord(
        key="claude-sonnet-5",
        served_model_name="claude-sonnet-5",
        kind="chat",
        provider="anthropic",
        credential_provider="ANTHROPIC",
        label="Claude Sonnet 5",
        vendor="Anthropic",
        available=True,
        max_output_tokens=_CLAUDE_MAX_OUTPUT_TOKENS,
        thinking=ThinkingControl.TOGGLE,
        description="균형",
    ),
    ModelSpecRecord(
        key="claude-haiku-4-5-20251001",
        served_model_name="claude-haiku-4-5-20251001",
        kind="chat",
        provider="anthropic",
        credential_provider="ANTHROPIC",
        label="Claude Haiku 4.5",
        vendor="Anthropic",
        available=True,
        max_output_tokens=_CLAUDE_MAX_OUTPUT_TOKENS,
        description="빠르고 경량",
    ),
]

# 기본 이미지 모델: 외장(OpenAI gpt-image-2) + 내장(자체 호스팅 ComfyUI FLUX.1 schnell).
#   provider = 라우팅 키(RoutingImageGeneration): "openai"(외장, 조직 OPENAI 키) / "comfyui"(내장, GPU).
#   내장은 credential_provider 없음(무료/자체). 새 이미지 벤더 = 여기 spec + 라우팅 레지스트리 한 줄.
#
#   키는 프론트 옵션 key(aiModelOptions.ts)와 글자 그대로 일치해야 한다. 어긋나면
#   resolve_image_by_ref 가 기본 모델로 폴백해, 작업자가 고른 모델과 다른 모델로 조용히 생성된다.
_IMAGE_DEFAULTS: list[ModelSpecRecord] = [
    ModelSpecRecord(
        key="gpt-image-2",
        served_model_name="gpt-image-2",
        kind="image",
        provider="openai",
        credential_provider="OPENAI",
        label="GPT Image 2",
        vendor="OpenAI",
        available=True,
    ),
    ModelSpecRecord(
        key="flux-schnell",
        served_model_name="flux-schnell",
        kind="image",
        provider="comfyui",
        credential_provider=None,
        label="FLUX.1 schnell (자체)",
        vendor="Black Forest Labs",
        available=True,
    ),
]


class ModelCatalog:
    def __init__(
        self,
        specs: dict[str, ModelSpecRecord],
        default_key: str,
        default_image_key: str | None = None,
    ) -> None:
        self._specs = specs
        self._default_key = default_key
        self._default_image_key = default_image_key

    def resolve(
        self,
        model_key: str | None,
        organization_id: str | None = None,
    ) -> ModelSpecRecord:
        key = model_key or self._default_key
        spec = self._specs.get(key) or self._specs[self._default_key]
        # per-org LoRA(Phase 3): 조직 전용 어댑터가 있으면 그 어댑터를 served 이름으로 승격.
        if organization_id and organization_id in spec.org_lora_adapters:
            adapter = spec.org_lora_adapters[organization_id]
            return replace(
                spec,
                served_model_name=adapter,
                base_model=spec.base_model or spec.served_model_name,
                lora_adapter=adapter,
            )
        return spec

    def resolve_chat(
        self,
        model_key: str | None,
        organization_id: str | None = None,
    ) -> ModelSpecRecord:
        """실제 추론용 chat 모델 resolve: 미지/비활성/비-chat 이면 기본 chat 모델로 폴백."""
        spec = self.resolve(model_key, organization_id)
        if spec.kind != "chat" or not spec.available:
            spec = self.resolve(self._default_key, organization_id)
        return spec

    def resolve_chat_by_ref(
        self,
        ref: str | None,
        organization_id: str | None = None,
    ) -> ModelSpecRecord:
        """느슨한 chat resolve: 호출측이 카탈로그 키 대신 served 이름(프론트 저장 id)을 보낼 수 있다.

        ① 카탈로그 키 매칭 → ② served_model_name 매칭(chat/available) → ③ 기본 chat 폴백.
        예: 프론트가 저장한 'claude-opus-4-8'(=spec.served_model_name)은 ②로, 'internal-qwen3'
        (키/served 둘 다 불일치)은 ③(기본 내부 chat)로 흡수된다. 서버 간 호출이 프론트 모델 id 를
        그대로 넘겨도 동작하게 하는 어댑터 지점(카탈로그가 SSOT, 매핑표 불필요).

        ref 가 있는데 그 모델로 해석되지 않으면 경고를 남긴다(이미지 경로와 같은 규칙).
        호출자가 고른 모델과 다른 모델이 답을 쓰는 상황이라 조용히 넘어가면 안 된다. 특히 도구
        버전이 모델을 고정한 경우(v1.5 의 기획 LLM), 그 key 에 오타가 나거나 배포 환경의
        MODEL_CATALOG_JSON 이 그 모델을 빼면 내장 모델이 기획서를 쓰고 아무 신호도 남지 않는다.
        None/빈 값은 "미지정 = 기본" 이라 정상 경로이므로 경고하지 않는다.
        """
        if ref and ref in self._specs:
            return self._resolved_chat_or_warn(ref, self.resolve_chat(ref, organization_id))
        # 구 key(통일 전 저장값) → 현재 key. 과거 채팅 기록/설정이 기본 모델로 조용히 폴백하지 않게 한다.
        legacy = _LEGACY_CHAT_KEY_ALIASES.get(ref or "")
        if legacy and legacy in self._specs:
            # 별칭 자체는 의도된 매핑이라 경고 대상이 아니다. 그 대상이 사라진 경우만 걸린다.
            return self._resolved_chat_or_warn(legacy, self.resolve_chat(legacy, organization_id))
        if ref:
            for spec in self._specs.values():
                if spec.served_model_name == ref and spec.kind == "chat" and spec.available:
                    # org LoRA 승격은 resolve 경로를 재사용.
                    return self.resolve(spec.key, organization_id)
        fallback = self.resolve_chat(None, organization_id)
        if ref:
            _warn_chat_fallback(ref, fallback)
        return fallback

    def _resolved_chat_or_warn(
        self, requested_key: str, spec: ModelSpecRecord
    ) -> ModelSpecRecord:
        """요청한 key 가 아닌 모델이 나왔으면 경고한다(비활성/비-chat 이라 기본으로 밀린 경우).

        key 비교로 판정하는 것이 안전하다: org LoRA 승격은 `served_model_name` 만 바꾸고 key 는
        그대로 두므로(`resolve`) 승격을 폴백으로 오인하지 않는다.
        """
        if spec.key != requested_key:
            _warn_chat_fallback(requested_key, spec)
        return spec

    def _default_image_spec(self) -> ModelSpecRecord:
        """기본 image spec: default_image_key 우선, 없으면 첫 available image spec."""
        if self._default_image_key and self._default_image_key in self._specs:
            spec = self._specs[self._default_image_key]
            if spec.kind == "image":
                return spec
        for spec in self._specs.values():
            if spec.kind == "image" and spec.available:
                return spec
        # 이미지 spec 이 하나도 없으면 안 되지만, 방어적으로 첫 image spec.
        for spec in self._specs.values():
            if spec.kind == "image":
                return spec
        raise KeyError("카탈로그에 image 모델이 없습니다")

    def resolve_image_by_ref(
        self,
        ref: str | None,
        organization_id: str | None = None,
    ) -> ModelSpecRecord:
        """느슨한 image resolve: 호출측이 카탈로그 키 대신 프론트 저장 id(예: 'gpt-image-2')를 보낼 수 있다.

        ① 카탈로그 키 매칭(kind=image/available) → ② served_model_name 매칭 → ③ 기본 image 폴백.
        resolve_chat_by_ref 와 동형(카탈로그가 SSOT, 매핑표 불필요).

        ref 가 있는데 해석되지 않으면 경고를 남긴다. 작업자가 고른 모델과 다른 모델로 생성되는 상황이라
        조용히 넘어가면 안 된다(프론트 옵션 key 와 카탈로그 key 가 어긋나 gpt-image-2 선택이 gpt-image-1
        으로 생성되던 버그가 로그가 없어 오래 묻혔다). None/빈 값은 "미지정 = 기본"이라 정상 경로다.
        """
        if ref and ref in self._specs:
            spec = self._specs[ref]
            if spec.kind == "image" and spec.available:
                return self.resolve(ref, organization_id)
        if ref:
            for spec in self._specs.values():
                if spec.served_model_name == ref and spec.kind == "image" and spec.available:
                    return self.resolve(spec.key, organization_id)
        fallback = self._default_image_spec()
        if ref:
            logging.getLogger(__name__).warning(
                "이미지 모델 ref '%s' 를 카탈로그에서 찾지 못해 기본 모델 '%s'(%s)로 폴백했다. "
                "프론트 옵션 key 와 카탈로그 key 가 어긋났는지 확인할 것.",
                ref,
                fallback.key,
                fallback.served_model_name,
            )
        return fallback

    def chat_models(self) -> list[ModelSpecRecord]:
        """프론트 드롭다운용 chat 모델 목록: 사용 가능 항목 먼저(삽입 순서 유지)."""
        chat = [s for s in self._specs.values() if s.kind == "chat"]
        return sorted(chat, key=lambda s: (not s.available,))

    def first_external_image_spec(self, organization_id: str) -> ModelSpecRecord | None:
        """내장 엔진이 막혔을 때의 강등 대상 외부 image spec: 없으면 None.

        판별 기준은 `credential_provider` 유무다. 조직 키로 호출하는 모델이 곧 외부 모델이다
        (provider 문자열을 하드코딩하면 벤더가 늘 때마다 이 함수를 고쳐야 한다).

        지정 모델(default_image_key)을 먼저 본다: `_default_image_spec` 과 같은 규칙이다.
        순회 첫 항목만 쓰면 외부 벤더가 둘 이상이 될 때 누구에게 과금되는지가 dict 순서로 결정되고,
        config 에도 테스트에도 그 사실이 드러나지 않는다.
        """
        designated = self._specs.get(self._default_image_key or "")
        candidates = [designated, *self._specs.values()] if designated else self._specs.values()
        for spec in candidates:
            if spec.kind == "image" and spec.available and spec.credential_provider:
                return self.resolve(spec.key, organization_id)
        return None

    @classmethod
    def from_settings(cls, settings) -> "ModelCatalog":  # noqa: ANN001 (avoid config import cycle)
        specs: dict[str, ModelSpecRecord] = {}
        raw = (settings.model_catalog_json or "").strip()
        if raw:
            data = json.loads(raw)
            for key, spec in data.items():
                specs[key] = ModelSpecRecord(
                    key=key,
                    served_model_name=spec["served_model_name"],
                    base_model=spec.get("base_model"),
                    lora_adapter=spec.get("lora_adapter"),
                    kind=spec.get("kind", "chat"),
                    org_lora_adapters=spec.get("org_lora_adapters", {}),
                    # provider = 라우팅 키(벤더 id). 미지정 시 internal 로 둔다.
                    provider=spec.get("provider", "internal"),
                    # 외부 벤더 모델은 credential_provider(예: "ANTHROPIC")를 선언 → serving/가용성 파생.
                    credential_provider=spec.get("credential_provider"),
                    label=spec.get("label"),
                    vendor=spec.get("vendor"),
                    available=spec.get("available", True),
                    supports_thinking=spec.get("supports_thinking", False),
                    # 미지정이면 OMIT(사고 파라미터 미전송). 새 모델을 여기로 넣을 때 안전한 쪽이
                    #   기본값이어야 한다. 사고가 켜진 채로 새어 들어오면 본문이 사라진다.
                    thinking=ThinkingControl(spec.get("thinking", ThinkingControl.OMIT)),
                    params=spec.get("params"),
                    description=spec.get("description"),
                    context_length=spec.get("context_length"),
                    max_output_tokens=spec.get("max_output_tokens"),
                )
        # 기본 chat 모델(카탈로그 비어 있거나 default key 누락 시 보강).
        if settings.chat_model_key not in specs:
            specs[settings.chat_model_key] = ModelSpecRecord(
                key=settings.chat_model_key,
                served_model_name=settings.chat_served_model_name,
                kind="chat",
                provider="internal",  # 자체 호스팅(vLLM/Ollama). 매퍼가 serving="self" 로 파생.
                label=settings.chat_model_label,
                vendor=settings.chat_vendor,
                available=True,
                supports_thinking=settings.chat_supports_thinking,
                params=settings.chat_params or None,
                description=settings.chat_description or None,
                context_length=settings.chat_context_length or None,
                max_output_tokens=settings.inference_max_output_tokens or None,
            )
        # 기본 embedding 모델.
        if settings.embedding_model_key not in specs:
            specs[settings.embedding_model_key] = ModelSpecRecord(
                key=settings.embedding_model_key,
                served_model_name=settings.embedding_served_model_name,
                kind="embedding",
            )
        # 외부 기본 모델(Claude) 보강(JSON 에서 이미 정의했으면 유지).
        for spec in _EXTERNAL_DEFAULTS:
            specs.setdefault(spec.key, spec)
        # 기본 이미지 모델(OpenAI gpt-image + 자체 FLUX) 보강.
        #   기본 image 키(gpt-image)만 served 이름을 config 로 오버라이드(OpenAI Images 모델 id).
        #   나머지(flux-schnell 등)는 자기 served 유지(ComfyUI 는 워크플로 주입이라 served 미사용).
        for spec in _IMAGE_DEFAULTS:
            if spec.key == settings.image_model_key:
                specs.setdefault(
                    spec.key,
                    replace(spec, served_model_name=settings.image_served_model_name),
                )
            else:
                specs.setdefault(spec.key, spec)
        return cls(
            specs,
            default_key=settings.chat_model_key,
            default_image_key=settings.image_model_key,
        )
