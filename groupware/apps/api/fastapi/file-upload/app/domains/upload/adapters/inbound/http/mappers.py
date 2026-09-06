"""Domain Entity → 응답 DTO 변환."""

from __future__ import annotations

from ....core.domain.entities import UploadAsset
from .schemas import PresignResponse, UploadAssetResponse


def to_asset_response(asset: UploadAsset, access_url: str) -> UploadAssetResponse:
    return UploadAssetResponse(
        id=asset.id,
        file_name=asset.file_name,
        mime_type=asset.mime_type,
        size=asset.size,
        object_key=asset.object_key,
        status=asset.status,
        created_at=asset.created_at,
        access_url=access_url,
    )


def to_presign_response(asset: UploadAsset, presigned_url: str) -> PresignResponse:
    return PresignResponse(
        upload_id=asset.id,
        object_key=asset.object_key,
        presigned_url=presigned_url,
    )
