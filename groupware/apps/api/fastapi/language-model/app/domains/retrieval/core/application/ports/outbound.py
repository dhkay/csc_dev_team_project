"""Outbound Port: RAG (retrieval 도메인). Protocol 로 선언.

VectorStorePort = Qdrant(테넌트 org 격리), DocumentRepositoryPort = 문서 메타(languagemodeldb).
임베딩은 inference 도메인의 InferencePort.embed 를 재사용한다(별도 EmbeddingPort 두지 않음).
"""

from __future__ import annotations

from typing import Protocol

from ...domain.entities import RagDocument
from ...domain.types import RetrievedChunkRecord, VectorPointRecord


class VectorStorePort(Protocol):
    async def ensure_collection(self, organization_id: str) -> None: ...

    async def upsert(
        self, organization_id: str, points: list[VectorPointRecord]
    ) -> None: ...

    async def search(
        self, organization_id: str, vector: list[float], top_k: int
    ) -> list[RetrievedChunkRecord]: ...


class DocumentRepositoryPort(Protocol):
    async def create_record(self, document: RagDocument) -> RagDocument: ...

    async def find_records(self, organization_id: str, user_id: str) -> list[RagDocument]: ...
