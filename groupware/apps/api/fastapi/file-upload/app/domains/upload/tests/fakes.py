"""Outbound Port 의 인메모리 fake: 업로드/스토리지 서비스 단위 테스트가 공유한다.

fake 를 한 벌로 두는 이유: 두 벌이면 한쪽만 계약을 따라가고, 그 어긋남이 테스트 통과로 가려진다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime

from app.domains.upload.core.application.ports.outbound import PutGrant
from app.domains.upload.core.domain.entities import UploadAsset
from app.domains.upload.core.domain.types import (
    StorageArea,
    StorageListQuery,
    StorageSort,
    StorageUsage,
    StorageUsageSummary,
    UploadStatus,
)



def _sort_key(asset: UploadAsset, sort: StorageSort):
    if sort is StorageSort.NAME:
        return asset.file_name
    if sort is StorageSort.SIZE:
        return asset.size
    if sort is StorageSort.UPDATED:
        return asset.updated_at or asset.created_at
    return asset.created_at


class FakeUploadRepository:
    def __init__(self) -> None:
        self.saved: dict[str, UploadAsset] = {}

    async def find_by_id(self, upload_id: str) -> UploadAsset | None:
        return self.saved.get(upload_id)

    async def find_by_ids(self, ids: list[str]) -> list[UploadAsset]:
        return [self.saved[i] for i in ids if i in self.saved]

    async def find_by_idempotency_key(self, key: str) -> UploadAsset | None:
        return next(
            (a for a in self.saved.values() if a.idempotency_key == key), None
        )

    async def find_by_organization_id(self, organization_id: int) -> list[UploadAsset]:
        return [a for a in self.saved.values() if a.organization_id == organization_id]

    async def save(self, asset: UploadAsset) -> UploadAsset:
        self.saved[asset.id] = asset
        return asset

    async def delete_by_id(self, upload_id: str) -> bool:
        return self.saved.pop(upload_id, None) is not None

    async def find_pending_before(
        self, cutoff: datetime, limit: int
    ) -> list[UploadAsset]:
        pending = [
            a
            for a in self.saved.values()
            if a.status is UploadStatus.PENDING and a.created_at < cutoff
        ]
        pending.sort(key=lambda a: a.created_at)
        return pending[:limit]

    # 스토리지 조회

    def _matches(self, asset: UploadAsset, query: StorageListQuery) -> bool:
        if asset.organization_id != query.organization_id:
            return False
        if asset.storage_area is not query.area:
            return False
        if asset.status is not UploadStatus.UPLOADED:
            return False
        if query.trashed != (asset.deleted_at is not None):
            return False
        if query.area is StorageArea.DEPARTMENT and query.department_ids is not None:
            if asset.department_id not in query.department_ids:
                return False
        if query.area is StorageArea.PERSONAL and asset.owner_user_id != query.user_id:
            return False
        if query.search and query.search.lower() not in asset.file_name.lower():
            return False
        return True

    def _filtered(self, query: StorageListQuery) -> list[UploadAsset]:
        return [a for a in self.saved.values() if self._matches(a, query)]

    async def find_storage_page(
        self, query: StorageListQuery
    ) -> tuple[list[UploadAsset], int]:
        items = self._filtered(query)
        total = len(items)
        # SQL 과 같은 순서를 흉내 낸다: `ORDER BY <축> [DESC], id ASC`.
        #   한 번에 튜플로 정렬하면 내림차순일 때 id 까지 뒤집혀, 실제 페이지 경계와 달라진다.
        items.sort(key=lambda a: a.id)
        items.sort(key=lambda a: _sort_key(a, query.sort), reverse=query.descending)
        return items[: query.limit], total

    async def mark_storage_trashed(
        self, ids: list[str], deleted_by_user_id: int, deleted_at: datetime
    ) -> int:
        changed = 0
        for upload_id in ids:
            asset = self.saved.get(upload_id)
            if asset is None:
                continue
            asset.deleted_at = deleted_at
            asset.deleted_by_user_id = deleted_by_user_id
            asset.updated_at = deleted_at
            changed += 1
        return changed

    async def mark_storage_restored(self, ids: list[str], updated_at: datetime) -> int:
        changed = 0
        for upload_id in ids:
            asset = self.saved.get(upload_id)
            if asset is None:
                continue
            asset.deleted_at = None
            asset.deleted_by_user_id = None
            asset.updated_at = updated_at
            changed += 1
        return changed

    async def rename_storage_asset(
        self, upload_id: str, file_name: str, updated_at: datetime
    ) -> None:
        asset = self.saved.get(upload_id)
        if asset is not None:
            asset.file_name = file_name
            asset.updated_at = updated_at

    async def confirm_storage_asset(self, upload_id: str, updated_at: datetime) -> None:
        asset = self.saved.get(upload_id)
        if asset is not None:
            asset.status = UploadStatus.UPLOADED
            asset.updated_at = updated_at

    async def delete_by_ids(self, ids: list[str]) -> int:
        return sum(1 for i in ids if self.saved.pop(i, None) is not None)

    async def summarize_storage_usage(
        self,
        organization_id: int,
        user_id: int,
        department_ids: tuple[int, ...] | None,
    ) -> StorageUsageSummary:
        totals = {
            StorageArea.COMMON: [0, 0],
            StorageArea.DEPARTMENT: [0, 0],
            StorageArea.PERSONAL: [0, 0],
        }
        trashed_totals: dict = {area: [0, 0] for area in StorageArea}
        for asset in self.saved.values():
            if asset.organization_id != organization_id or asset.storage_area is None:
                continue
            if asset.status is not UploadStatus.UPLOADED:
                continue
            if asset.storage_area is StorageArea.DEPARTMENT:
                if department_ids is not None and asset.department_id not in department_ids:
                    continue
            if asset.storage_area is StorageArea.PERSONAL:
                if asset.owner_user_id != user_id:
                    continue
            bucket = trashed_totals if asset.deleted_at is not None else totals
            bucket[asset.storage_area][0] += asset.size
            bucket[asset.storage_area][1] += 1
        return StorageUsageSummary(
            common=StorageUsage(*totals[StorageArea.COMMON]),
            department=StorageUsage(*totals[StorageArea.DEPARTMENT]),
            personal=StorageUsage(*totals[StorageArea.PERSONAL]),
            trash_by_area={a: StorageUsage(*trashed_totals[a]) for a in StorageArea},
        )


class FakeStorage:
    """StoragePort 의 인메모리 fake: 토큰/바이트를 dict 로 보관."""

    def __init__(self) -> None:
        self.blobs: dict[str, bytes] = {}
        self.grants: dict[str, PutGrant] = {}
        # 삭제가 실패하는 상황(권한/마운트 문제)을 흉내 내 보상 로깅 경로를 시험한다.
        self.delete_fails: set[str] = set()

    def presigned_put_url(self, *, upload_id, object_key, mime_type, size) -> str:
        token = f"tok-{upload_id}"
        self.grants[token] = PutGrant(upload_id, object_key, mime_type, size)
        return f"https://files.local/blob?token={token}"

    def download_url(self, upload_id: str) -> str:
        return f"https://files.local/files/{upload_id}"

    def signed_download_url(self, upload_id: str) -> str:
        # fake 서명: 토큰 = "sig-{uid}". verify 가 uid 를 되돌린다.
        return f"https://files.local/files/{upload_id}?token=sig-{upload_id}"

    def verify_download_token(self, token: str):
        return token[4:] if token.startswith("sig-") else None

    def verify_put_token(self, token: str):
        return self.grants.get(token)

    async def write(self, object_key: str, data: bytes) -> None:
        self.blobs[object_key] = data

    async def write_stream(
        self, object_key: str, chunks: AsyncIterator[bytes]
    ) -> int:
        data = b""
        async for chunk in chunks:
            data += chunk
        self.blobs[object_key] = data
        return len(data)

    async def exists(self, object_key: str) -> bool:
        return object_key in self.blobs

    async def delete(self, object_key: str) -> None:
        if object_key in self.delete_fails:
            return
        self.blobs.pop(object_key, None)

    async def open_read_stream(self, object_key: str):
        # 아카이브 복사용: 저장된 바이트를 한 청크로 흘려보낸다(없으면 빈 스트림).
        if object_key in self.blobs:
            yield self.blobs[object_key]

    def fs_path(self, object_key: str):
        return f"/fake/{object_key}" if object_key in self.blobs else None


class FakeArchive:
    """ArchivePort 의 인메모리 fake: 아카이브된 바이트를 dict 로 보관."""

    def __init__(self) -> None:
        self.blobs: dict[str, bytes] = {}

    async def write_stream(self, object_key: str, chunks) -> int:
        data = b""
        async for chunk in chunks:
            data += chunk
        self.blobs[object_key] = data
        return len(data)

    async def exists(self, object_key: str) -> bool:
        return object_key in self.blobs
