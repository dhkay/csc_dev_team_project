"""Service: 무상태 생성(inference 도메인).

InferenceGenerationInboundPort 구현. 카탈로그로 모델 ref 를 resolve(키 또는 served 이름)해
provider/served/credential 을 요청에 전파하고, InferencePort.generate(비스트리밍)로 위임한다.
외부 벤더(예: Claude)는 organization_id + credential_provider 로 조직 키가 per-request 해석된다.
"""

from __future__ import annotations

import logging
from dataclasses import replace

from .model_catalog import ModelCatalog
from .ports.outbound import ImageGenerationPort, InferencePort
from ..domain.image_failure import ImageFailure, ImageGenerationFailedError, is_degradable
from ..domain.thinking import output_budget, thinking_runs
from ..domain.types import (
    GenerationRequestRecord,
    GenerationResultRecord,
    ImageEngineLoadRecord,
    ImageGenerationRequestRecord,
    ImageGenerationResultRecord,
    ModelSpecRecord,
    PromptMessageRecord,
)


_log = logging.getLogger(__name__)


def _with_spec(
    req: ImageGenerationRequestRecord, spec: ModelSpecRecord
) -> ImageGenerationRequestRecord:
    """요청에 spec 에서 오는 필드를 실어 준다. 그 목록이 한 곳에만 있게 한다.

    강등 시 이 투영을 손으로 다시 하면 새 spec 파생 필드가 내장 엔진 값으로 남는다(모델 신원이
    어긋나 비용이 엉뚱한 쪽에 붙는 부류의 버그).
    """
    return replace(
        req,
        model=spec.served_model_name,
        provider=spec.provider,
        credential_provider=spec.credential_provider,
    )


def _reported_identity(spec: ModelSpecRecord) -> str:
    """응답이 밝히는 모델 신원: 호출자가 비용을 귀속할 때 쓰는 식별자.

    카탈로그 key 는 프론트 옵션 key(`aiModelOptions.ts`)/단가표 key 와 글자 그대로 일치하도록
    통일되어 있으므로(model_catalog 주석 참고) 그 값을 그대로 밝힌다. served 이름(엔진 배포명,
    환경마다 다름)을 실으면 사내 모델의 단가 조회가 어긋난다.

    LoRA 승격에도 key 는 바뀌지 않는다. 조직 전용 어댑터는 과금 단위가 아니라 base 모델이 과금 단위다.
    """
    return spec.key


class InferenceGenerationService:
    """InferenceGenerationInboundPort 구현."""

    def __init__(self, inference: InferencePort, catalog: ModelCatalog) -> None:
        self._inference = inference
        self._catalog = catalog

    def list_chat_models(self) -> list[ModelSpecRecord]:
        return self._catalog.chat_models()

    async def generate(
        self,
        organization_id: str,
        model: str | None,
        system: str | None,
        messages: list[PromptMessageRecord],
        max_tokens: int | None = None,
        temperature: float = 0.7,
    ) -> GenerationResultRecord:
        spec = self._catalog.resolve_chat_by_ref(model, organization_id)
        prompt: list[PromptMessageRecord] = []
        if system:
            prompt.append(PromptMessageRecord(role="system", content=system))
        prompt.extend(messages)
        # 이 경로에는 사고 의도 파라미터가 없다(고정 스키마 출력을 받는 호출자들이라 사고를 쓰지
        #   않는다). 그래도 끌 수 없는 등급이면 사고가 도니, 예산은 그 사실을 보고 정한다.
        runs_thinking = thinking_runs(spec.thinking, None)
        req = GenerationRequestRecord(
            model=spec.served_model_name,
            messages=prompt,
            max_tokens=output_budget(
                max_tokens, thinking=runs_thinking, window=spec.max_output_tokens
            ),
            temperature=temperature,
            stream=False,
            provider=spec.provider,
            thinking_control=spec.thinking,
            organization_id=organization_id,
            credential_provider=spec.credential_provider,
        )
        result = await self._inference.generate(req)
        return replace(result, model=_reported_identity(spec))


class ImageGenerationService:
    """ImageGenerationInboundPort 구현: 무상태 이미지 생성.

    카탈로그로 이미지 모델 ref 를 resolve(키 또는 프론트 저장 id)해 provider/served/credential 을
    요청에 전파하고, ImageGenerationPort.generate 로 위임한다. 조직 키(OpenAI)는 organization_id +
    credential_provider 로 per-request 해석된다. size/quality 는 미지정 시 기본값을 채운다.

    내장 엔진이 막힌 경우(혼잡/도달불가/타임아웃) 외부 모델로 강등해 생성을 이어간다
    (`_external_fallback_spec` 참고). 강등되면 응답의 모델 신원도 그 모델로 바뀐다. 비용 귀속이
    실제로 그린 쪽을 따라가야 하기 때문이다.
    """

    def __init__(
        self,
        image: ImageGenerationPort,
        catalog: ModelCatalog,
        *,
        default_size: str,
        default_quality: str,
        external_fallback: bool = True,
    ) -> None:
        self._image = image
        self._catalog = catalog
        self._default_size = default_size
        self._default_quality = default_quality
        self._external_fallback = external_fallback

    async def generate(
        self,
        organization_id: str,
        model: str | None,
        prompt: str,
        size: str | None = None,
        quality: str | None = None,
        seed: int | None = None,
    ) -> ImageGenerationResultRecord:
        spec = self._catalog.resolve_image_by_ref(model, organization_id)
        req = ImageGenerationRequestRecord(
            model=spec.served_model_name,
            prompt=prompt,
            size=size or self._default_size,
            quality=quality or self._default_quality,
            seed=seed,
            provider=spec.provider,
            organization_id=organization_id,
            credential_provider=spec.credential_provider,
        )
        try:
            result = await self._image.generate(req)
        except ImageGenerationFailedError as exc:
            fallback = self._external_fallback_spec(spec, exc.failure, organization_id)
            if fallback is None:
                raise
            return await self._generate_degraded(req, fallback, exc)
        # 위 generate 와 같은 이유: 비용은 실제로 그린 모델에 귀속되어야 한다.
        return replace(result, model=_reported_identity(spec))

    async def _generate_degraded(
        self,
        req: ImageGenerationRequestRecord,
        fallback: ModelSpecRecord,
        original: ImageGenerationFailedError,
    ) -> ImageGenerationResultRecord:
        """내장 실패분을 외부 모델로 다시 그린다. 실패하면 원래 사유를 올린다.

        원래 사유를 보존하는 이유: 작업자가 조치할 대상은 내장 엔진이고, 외장 실패(키 미등록 등)를
        앞세우면 원인이 바뀐 것처럼 읽힌다. 외장 원문은 로그로 남긴다.
        """
        try:
            result = await self._image.generate(_with_spec(req, fallback))
        except ImageGenerationFailedError as fallback_exc:
            _log.warning(
                "내장 이미지 엔진 실패(%s) 후 외장 강등도 실패: %s",
                original.failure.value,
                fallback_exc,
            )
            raise original from fallback_exc
        _log.warning(
            "내장 이미지 엔진 실패(%s) → 외장 '%s' 로 강등해 생성했다(끊김 방지). 비용은 그 모델에 귀속된다.",
            original.failure.value,
            fallback.key,
        )
        return replace(result, model=_reported_identity(fallback))

    def _external_fallback_spec(
        self,
        spec: ModelSpecRecord,
        failure: ImageFailure,
        organization_id: str,
    ) -> ModelSpecRecord | None:
        """내장 엔진이 막혔을 때 대신 그릴 외부 모델: 없거나 대상이 아니면 None.

        강등하는 이유. 이 GPU 한 장을 영상과 공유하므로, 영상 렌더가 길어지면 이미지가 차례를
        못 받는 구간이 생긴다(혼잡/타임아웃). 기획서 씬 이미지가 그때마다 빈칸으로 남는 것보다
        조직 키로 외부에서 그려 채우는 편이 낫다. "느려도 끊기지 않게".

        어떤 사유가 대상인지는 사유 카탈로그가 소유한다(`image_failure._Spec.degradable`)
        여기서 목록을 다시 들지 않는다. 그래야 새 내부 사유를 추가할 때 강등에서 조용히 빠지지 않는다.
        조직 키가 없으면 외부 어댑터가 CREDENTIAL_MISSING 을 던지고, 호출부가 원래 사유를 복원한다.
        """
        if not self._external_fallback or spec.credential_provider is not None:
            return None  # 비활성이거나, 이미 외부 모델이었다(강등 대상 아님).
        if not is_degradable(failure):
            return None
        return self._catalog.first_external_image_spec(organization_id)

    async def load(self, model: str | None) -> ImageEngineLoadRecord | None:
        """이 모델을 실제로 그리는 엔진의 부하: generate 와 같은 경로로 provider 를 정한다.

        모델을 먼저 resolve 하는 게 핵심이다: 작업자가 고른 모델이 외부면 큐가 없고(None), 자체면
        공유 GPU 큐가 있다. 그 판단을 화면이 하도록 두면 카탈로그 지식이 프론트로 샌다.
        """
        spec = self._catalog.resolve_image_by_ref(model)
        return await self._image.load(spec.provider)
