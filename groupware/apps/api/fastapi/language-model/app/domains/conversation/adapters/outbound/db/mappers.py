"""ORM 모델 ↔ Domain Entity 변환. ORM 이 도메인 밖으로 새지 않게 한다."""

from __future__ import annotations

from .....inference.core.domain.types import TokenUsage
from ....core.domain.entities import ChatMessage, ChatSession
from ....core.domain.types import MessageRole
from .models import ChatMessageModel, ChatSessionModel


def session_to_domain(row: ChatSessionModel) -> ChatSession:
    return ChatSession(
        id=row.id,
        organization_id=row.organization_id,
        user_id=row.user_id,
        title=row.title,
        model=row.model,
        enable_thinking=row.enable_thinking,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def session_to_model(entity: ChatSession) -> ChatSessionModel:
    return ChatSessionModel(
        id=entity.id,
        organization_id=entity.organization_id,
        user_id=entity.user_id,
        title=entity.title,
        model=entity.model,
        enable_thinking=entity.enable_thinking,
        created_at=entity.created_at,
        updated_at=entity.updated_at,
    )


def _usage_to_json(usage: TokenUsage | None) -> dict[str, int] | None:
    if usage is None:
        return None
    return {"prompt": usage.prompt, "completion": usage.completion, "total": usage.total}


def _usage_from_json(raw: dict | None) -> TokenUsage | None:
    if not raw:
        return None
    return TokenUsage(
        prompt=raw.get("prompt", 0),
        completion=raw.get("completion", 0),
        total=raw.get("total", 0),
    )


def message_to_domain(row: ChatMessageModel) -> ChatMessage:
    return ChatMessage(
        id=row.id,
        session_id=row.session_id,
        role=MessageRole(row.role),
        content=row.content,
        model=row.model,
        token_usage=_usage_from_json(row.token_usage),
        created_at=row.created_at,
    )


def message_to_model(entity: ChatMessage) -> ChatMessageModel:
    return ChatMessageModel(
        id=entity.id,
        session_id=entity.session_id,
        role=entity.role.value,
        content=entity.content,
        model=entity.model,
        token_usage=_usage_to_json(entity.token_usage),
        created_at=entity.created_at,
    )
