"""Outbound Port: Repository 계약. Protocol 로 선언.

모든 메서드가 organization_id + user_id 를 받는다. 교차 테넌트 조회 경로가 존재하지 않는다.
`Record` 접미사 = 행 CRUD.
"""

from __future__ import annotations

from typing import Protocol

from ...domain.entities import ChatMessage, ChatSession
from ...domain.types import EffectiveAssistantConfig


class AssistantConfigResolverPort(Protocol):
    """AI 어시스턴트 병합 설정 해석 아웃바운드 포트.

    csc-groupware `/internal/assistant-config/resolve?organizationId=` 를 서비스토큰으로 호출해
    조직 오버라이드 + 플랫폼 전역이 병합된 effective config 를 per-org 로 가져온다(짧은 TTL 캐시).
    """

    async def resolve(self, organization_id: str) -> EffectiveAssistantConfig: ...


class ConversationRepositoryPort(Protocol):
    async def create_session_record(self, session: ChatSession) -> ChatSession: ...

    async def find_session_record(
        self, organization_id: str, user_id: str, session_id: str
    ) -> ChatSession | None: ...

    async def find_session_records(
        self, organization_id: str, user_id: str
    ) -> list[ChatSession]: ...

    async def update_session_record(self, session: ChatSession) -> ChatSession: ...

    async def delete_session_record(
        self, organization_id: str, user_id: str, session_id: str
    ) -> None: ...

    async def create_message_record(self, message: ChatMessage) -> ChatMessage: ...

    async def find_message_records(self, session_id: str) -> list[ChatMessage]: ...
