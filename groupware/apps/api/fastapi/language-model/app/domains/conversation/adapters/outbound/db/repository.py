"""Outbound Adapter: ConversationRepositoryPort 구현 (SQLAlchemy 2.0, AsyncSession).

모든 세션 쿼리는 (organization_id, user_id) 술어로 스코프한다. 교차 테넌트 조회 불가.
메시지는 세션을 테넌트 술어로 먼저 resolve 한 뒤에만 접근한다(서비스가 강제).
"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.domain.entities import ChatMessage, ChatSession
from . import mappers
from .models import ChatMessageModel, ChatSessionModel


class ConversationRepository:
    """ConversationRepositoryPort(Protocol) 의 구현."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_session_record(self, session: ChatSession) -> ChatSession:
        self._session.add(mappers.session_to_model(session))
        await self._session.flush()
        return session

    async def find_session_record(
        self, organization_id: str, user_id: str, session_id: str
    ) -> ChatSession | None:
        stmt = select(ChatSessionModel).where(
            ChatSessionModel.id == session_id,
            ChatSessionModel.organization_id == organization_id,
            ChatSessionModel.user_id == user_id,
        )
        row = (await self._session.execute(stmt)).scalar_one_or_none()
        return mappers.session_to_domain(row) if row is not None else None

    async def find_session_records(
        self, organization_id: str, user_id: str
    ) -> list[ChatSession]:
        stmt = (
            select(ChatSessionModel)
            .where(
                ChatSessionModel.organization_id == organization_id,
                ChatSessionModel.user_id == user_id,
            )
            .order_by(ChatSessionModel.updated_at.desc())
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [mappers.session_to_domain(r) for r in rows]

    async def update_session_record(self, session: ChatSession) -> ChatSession:
        await self._session.merge(mappers.session_to_model(session))
        await self._session.flush()
        return session

    async def delete_session_record(
        self, organization_id: str, user_id: str, session_id: str
    ) -> None:
        await self._session.execute(
            delete(ChatSessionModel).where(
                ChatSessionModel.id == session_id,
                ChatSessionModel.organization_id == organization_id,
                ChatSessionModel.user_id == user_id,
            )
        )
        await self._session.flush()

    async def create_message_record(self, message: ChatMessage) -> ChatMessage:
        self._session.add(mappers.message_to_model(message))
        await self._session.flush()
        return message

    async def find_message_records(self, session_id: str) -> list[ChatMessage]:
        stmt = (
            select(ChatMessageModel)
            .where(ChatMessageModel.session_id == session_id)
            .order_by(ChatMessageModel.created_at.asc())
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [mappers.message_to_domain(r) for r in rows]
