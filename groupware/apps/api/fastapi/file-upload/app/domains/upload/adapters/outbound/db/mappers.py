"""ORM 모델 ↔ Domain Entity 변환. ORM 모델이 도메인 밖으로 새지 않게 한다."""

from __future__ import annotations

from ....core.domain.entities import UploadAsset
from ....core.domain.types import StorageArea, UploadStatus
from .models import UploadAssetModel


def to_domain(row: UploadAssetModel) -> UploadAsset:
    return UploadAsset(
        id=row.id,
        file_name=row.file_name,
        mime_type=row.mime_type,
        size=row.size,
        object_key=row.object_key,
        status=UploadStatus(row.status),
        created_at=row.created_at,
        idempotency_key=row.idempotency_key,
        scope=row.scope,
        organization_id=row.organization_id,
        storage_area=StorageArea(row.storage_area) if row.storage_area else None,
        department_id=row.department_id,
        owner_user_id=row.owner_user_id,
        deleted_at=row.deleted_at,
        deleted_by_user_id=row.deleted_by_user_id,
        updated_at=row.updated_at,
    )


def to_model(entity: UploadAsset) -> UploadAssetModel:
    return UploadAssetModel(
        id=entity.id,
        file_name=entity.file_name,
        mime_type=entity.mime_type,
        size=entity.size,
        object_key=entity.object_key,
        status=entity.status.value,
        created_at=entity.created_at,
        idempotency_key=entity.idempotency_key,
        scope=entity.scope,
        organization_id=entity.organization_id,
        storage_area=entity.storage_area.value if entity.storage_area else None,
        department_id=entity.department_id,
        owner_user_id=entity.owner_user_id,
        deleted_at=entity.deleted_at,
        deleted_by_user_id=entity.deleted_by_user_id,
        updated_at=entity.updated_at,
    )
