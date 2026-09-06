"""도메인 엔티티: 순수 dataclass (RAG 문서 메타).

문서 메타는 languagemodeldb, 벡터는 Qdrant(테넌트 org 격리). Phase 1 은 스캐폴드.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .types import DocumentStatus


@dataclass
class RagDocument:
    id: str
    organization_id: str
    user_id: str
    title: str
    status: DocumentStatus
    file_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
