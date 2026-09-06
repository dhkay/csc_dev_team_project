"""VectorStorePort 구현: Qdrant (Phase 1 스텁).

Phase 2 에서 qdrant-client 로 실구현한다. 테넌트 격리 = org별 컬렉션(rag_{org}) +
검색마다 organization_id 페이로드 필터(무필터 검색 금지). 지금은 검색이 항상 [] 를 반환해
RAG 를 아직 프롬프트에 결합하지 않는다.
"""

from __future__ import annotations

from ....core.domain.types import RetrievedChunkRecord, VectorPointRecord


def _collection(organization_id: str) -> str:
    # org별 컬렉션: 코스 격리(추가로 검색 시 payload 필터).
    return f"rag_{organization_id}"


class QdrantVectorStore:
    """VectorStorePort(Protocol) 구현: Phase 1 스텁."""

    def __init__(self, url: str, api_key: str = "") -> None:
        self._url = url
        self._api_key = api_key

    async def ensure_collection(self, organization_id: str) -> None:
        # Phase 2: qdrant.create_collection(_collection(org), ...) if not exists.
        return None

    async def upsert(
        self, organization_id: str, points: list[VectorPointRecord]
    ) -> None:
        # Phase 2: qdrant.upsert(_collection(org), points with organization_id payload).
        return None

    async def search(
        self, organization_id: str, vector: list[float], top_k: int
    ) -> list[RetrievedChunkRecord]:
        # Phase 2: qdrant.search(_collection(org), vector, filter org, limit top_k).
        return []
