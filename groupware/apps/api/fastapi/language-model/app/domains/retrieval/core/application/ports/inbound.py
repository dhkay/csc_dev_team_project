"""Inbound Port: RAG (retrieval 도메인). Protocol 로 선언 (Phase 1 스캐폴드)."""

from __future__ import annotations

from typing import Protocol

from .....conversation.core.domain.types import IdentityRecord
from ...domain.entities import RagDocument
from ...domain.types import RetrievedChunkRecord


class RetrievalInboundPort(Protocol):
    async def list_documents(self, identity: IdentityRecord) -> list[RagDocument]: ...

    async def retrieve(
        self, identity: IdentityRecord, query: str, top_k: int = 5
    ) -> list[RetrievedChunkRecord]:
        """org 격리 검색. Phase 1 은 빈 결과(스텁)."""
        ...
