"""ORM 모델 ↔ Domain Entity 변환 (retrieval)."""

from __future__ import annotations

from ....core.domain.entities import RagDocument
from ....core.domain.types import DocumentStatus
from .models import RagDocumentModel


def to_domain(row: RagDocumentModel) -> RagDocument:
    return RagDocument(
        id=row.id,
        organization_id=row.organization_id,
        user_id=row.user_id,
        title=row.title,
        status=DocumentStatus(row.status),
        file_id=row.file_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def to_model(entity: RagDocument) -> RagDocumentModel:
    return RagDocumentModel(
        id=entity.id,
        organization_id=entity.organization_id,
        user_id=entity.user_id,
        title=entity.title,
        status=entity.status.value,
        file_id=entity.file_id,
        created_at=entity.created_at,
        updated_at=entity.updated_at,
    )
