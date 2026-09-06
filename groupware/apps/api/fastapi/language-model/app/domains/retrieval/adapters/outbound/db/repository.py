"""Outbound Adapter: DocumentRepositoryPort 구현 (SQLAlchemy async)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.domain.entities import RagDocument
from . import mappers
from .models import RagDocumentModel


class DocumentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_record(self, document: RagDocument) -> RagDocument:
        self._session.add(mappers.to_model(document))
        await self._session.flush()
        return document

    async def find_records(
        self, organization_id: str, user_id: str
    ) -> list[RagDocument]:
        stmt = (
            select(RagDocumentModel)
            .where(
                RagDocumentModel.organization_id == organization_id,
                RagDocumentModel.user_id == user_id,
            )
            .order_by(RagDocumentModel.created_at.desc())
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [mappers.to_domain(r) for r in rows]
