"""도메인 엔티티 → 응답 DTO 변환 (conversation 도메인)."""

from __future__ import annotations

from .....inference.core.domain.types import ModelSpecRecord
from ....core.domain.entities import ChatMessage, ChatSession
from .schemas import MessageResponse, ModelResponse, SessionResponse


def to_session_response(session: ChatSession) -> SessionResponse:
    return SessionResponse(
        id=session.id,
        title=session.title,
        model=session.model,
        enable_thinking=session.enable_thinking,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def to_model_response(spec: ModelSpecRecord, *, is_default: bool = False) -> ModelResponse:
    return ModelResponse(
        id=spec.key,
        label=spec.display_label,
        # 호스팅 배지: 외부 자격증명(조직 키)을 요구하면 "api", 아니면 자체 호스팅 "self".
        serving="api" if spec.credential_provider else "self",
        vendor=spec.vendor,
        available=spec.available,
        supports_thinking=spec.supports_thinking,
        is_default=is_default,
        params=spec.params,
        description=spec.description,
        context_length=spec.context_length,
    )


def to_message_response(message: ChatMessage) -> MessageResponse:
    return MessageResponse(
        id=message.id,
        role=message.role.to_openai(),
        content=message.content,
        model=message.model,
        created_at=message.created_at,
    )
