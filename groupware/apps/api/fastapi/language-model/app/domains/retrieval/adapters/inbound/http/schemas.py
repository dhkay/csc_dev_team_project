"""Pydantic DTO (retrieval 도메인, Phase 1)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from ....core.domain.types import DocumentStatus


class DocumentResponse(BaseModel):
    id: str
    title: str
    status: DocumentStatus
    file_id: str | None
    created_at: datetime | None


class RetrieveRequest(BaseModel):
    query: str
    top_k: int = 5


class RetrievedChunkResponse(BaseModel):
    text: str
    score: float
    document_id: str
