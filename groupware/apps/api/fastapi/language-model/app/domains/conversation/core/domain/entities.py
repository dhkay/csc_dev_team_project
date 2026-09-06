"""도메인 엔티티: 순수 dataclass (ORM 무관).

조직 소속원 개인별 대화 세션(ChatSession)과 메시지(ChatMessage). 세션은 (organization_id,
user_id) 로 격리되며 교차 테넌트 조회 경로는 존재하지 않는다(repository 가 강제).
TokenUsage 는 inference 도메인의 것을 재사용(usage 는 추론 개념).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ....inference.core.domain.types import TokenUsage
from .types import MessageRole


@dataclass
class ChatSession:
    id: str
    organization_id: str
    user_id: str
    title: str
    model: str
    # 이 대화창의 사고형 추론(<think>) on/off: 대화별로 유저가 토글, 재진입 시 복원.
    enable_thinking: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass
class ChatMessage:
    id: str
    session_id: str
    role: MessageRole
    content: str
    model: str | None = None
    token_usage: TokenUsage | None = None
    created_at: datetime | None = None
