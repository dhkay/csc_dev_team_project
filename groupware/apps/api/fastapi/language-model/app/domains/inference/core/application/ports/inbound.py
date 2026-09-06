"""Inbound Port: 무상태 텍스트 생성(inference 도메인).

챗봇(대화 세션)과 별개로, 어떤 백엔드든 서비스토큰으로 호출해 한 번의 비스트리밍 생성을
받는 재사용 진입점. 세션/DB 영속 없음. 모델 resolve + provider 라우팅 + 조직키 해석은 구현체가 담당.
"""

from __future__ import annotations

from typing import Protocol

from ...domain.types import (
    GenerationResultRecord,
    ImageEngineLoadRecord,
    ImageGenerationResultRecord,
    ModelSpecRecord,
    PromptMessageRecord,
)


class InferenceGenerationInboundPort(Protocol):
    """무상태 생성 Inbound Port."""

    async def generate(
        self,
        organization_id: str,
        model: str | None,
        system: str | None,
        messages: list[PromptMessageRecord],
        max_tokens: int | None = None,
        temperature: float = 0.7,
    ) -> GenerationResultRecord: ...

    def list_chat_models(self) -> list[ModelSpecRecord]:
        """전체 chat 모델 카탈로그(org 무관): 플랫폼 관리(control-tower)가 허용/기본 모델 UI 에 쓴다."""
        ...


class ImageGenerationInboundPort(Protocol):
    """무상태 이미지 생성 Inbound Port: 텍스트 생성과 별개 역량."""

    async def generate(
        self,
        organization_id: str,
        model: str | None,
        prompt: str,
        size: str | None = None,
        quality: str | None = None,
        seed: int | None = None,
    ) -> ImageGenerationResultRecord: ...

    async def load(self, model: str | None) -> ImageEngineLoadRecord | None:
        """이 모델을 그리는 엔진의 현재 부하(공유 큐). 큐가 없는 벤더는 None."""
        ...
