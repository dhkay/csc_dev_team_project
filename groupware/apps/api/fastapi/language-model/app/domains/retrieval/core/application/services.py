"""Inbound Port 구현: RAG 검색/문서 (retrieval 도메인). Phase 1 스캐폴드.

Phase 2 에서 retrieve 가 InferencePort.embed(query) → VectorStorePort.search 로 채워진다.
지금은 벡터 스토어 스텁이 [] 를 돌려주므로 안전하게 빈 결과를 반환한다.
"""

from __future__ import annotations

from ....conversation.core.domain.types import IdentityRecord
from ....inference.core.application.ports.outbound import InferencePort
from ..domain.entities import RagDocument
from ..domain.types import RetrievedChunkRecord
from .ports.outbound import DocumentRepositoryPort, VectorStorePort


class RetrievalService:
    def __init__(
        self,
        documents: DocumentRepositoryPort,
        vectors: VectorStorePort,
        inference: InferencePort,
        embedding_model: str,
    ) -> None:
        self._documents = documents
        self._vectors = vectors
        self._inference = inference
        self._embedding_model = embedding_model

    async def list_documents(self, identity: IdentityRecord) -> list[RagDocument]:
        return await self._documents.find_records(
            identity.organization_id, identity.user_id
        )

    async def retrieve(
        self, identity: IdentityRecord, query: str, top_k: int = 5
    ) -> list[RetrievedChunkRecord]:
        # Phase 1: 벡터 스토어 스텁 → []. (Phase 2: embed(query) 후 search)
        return await self._vectors.search(identity.organization_id, [], top_k)
