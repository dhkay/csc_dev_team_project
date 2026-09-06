"""도메인 DI wiring: retrieval (Phase 1 스캐폴드)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from ..inference.core.application.ports.outbound import InferencePort
from .adapters.inbound.http.router import router
from .adapters.outbound.db.repository import DocumentRepository
from .adapters.outbound.vector.qdrant_store import QdrantVectorStore
from .core.application.ports.inbound import RetrievalInboundPort
from .core.application.services import RetrievalService

__all__ = ["router", "build_retrieval_service"]


def build_retrieval_service(
    session: AsyncSession,
    inference: InferencePort,
    qdrant_url: str,
    qdrant_api_key: str,
    embedding_model: str,
) -> RetrievalInboundPort:
    documents = DocumentRepository(session)
    vectors = QdrantVectorStore(qdrant_url, qdrant_api_key)
    return RetrievalService(documents, vectors, inference, embedding_model)
