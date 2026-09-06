"""도메인 Enum/Type (retrieval 도메인, RAG). FastAPI/SQLAlchemy import 금지."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class DocumentStatus(str, Enum):
    PENDING = "PENDING"      # 등록, 인제스트 대기
    INGESTING = "INGESTING"  # 청킹/임베딩 중(워커)
    READY = "READY"          # 벡터 저장 완료, 검색 가능
    FAILED = "FAILED"        # 인제스트 실패


@dataclass(frozen=True)
class RetrievedChunkRecord:
    text: str
    score: float
    document_id: str
    metadata: dict = field(default_factory=dict)


@dataclass(frozen=True)
class VectorPointRecord:
    id: str
    vector: list[float]
    text: str
    metadata: dict = field(default_factory=dict)
