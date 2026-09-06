"""에셋 상태 배치 조회(get_statuses): 렌더 등록 전 사전검증의 핵심 로직.

존재하는 에셋만 상태 매핑에 담고, 없는 id 는 누락한다(호출측 csc-marketing 이 MISSING 으로 취급해
업로드 안 된 자산을 참조하는 doomed 렌더 잡을 큐에 넣기 전에 거른다).
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.domains.upload.core.application.services import UploadService
from app.domains.upload.core.domain.entities import UploadAsset
from app.domains.upload.core.domain.types import UploadStatus


def _asset(aid: str, status: UploadStatus) -> UploadAsset:
    return UploadAsset(
        id=aid,
        file_name="f",
        mime_type="image/png",
        size=1,
        object_key=f"platform/{aid}",
        status=status,
        created_at=datetime.now(timezone.utc),
    )


class _FakeRepo:
    def __init__(self, assets: list[UploadAsset]) -> None:
        self._by_id = {a.id: a for a in assets}

    async def save(self, asset: UploadAsset) -> UploadAsset:
        return asset

    async def find_by_id(self, upload_id: str) -> UploadAsset | None:
        return self._by_id.get(upload_id)

    async def find_by_ids(self, ids: list[str]) -> list[UploadAsset]:
        return [self._by_id[i] for i in ids if i in self._by_id]

    async def find_by_idempotency_key(self, key: str) -> UploadAsset | None:
        return None

    async def delete_by_id(self, upload_id: str) -> bool:
        return False


def _service(assets: list[UploadAsset]) -> UploadService:
    # get_statuses 는 storage/archive 를 쓰지 않으므로 더미로 충분.
    return UploadService(
        _FakeRepo(assets), storage=object(), archive=object(), max_upload_size=10
    )


async def test_get_statuses_returns_status_for_existing_only() -> None:
    svc = _service([_asset("a", UploadStatus.UPLOADED), _asset("b", UploadStatus.PENDING)])
    out = await svc.get_statuses(["a", "b", "missing"])
    assert out == {"a": UploadStatus.UPLOADED, "b": UploadStatus.PENDING}
    assert "missing" not in out  # 없는 id 는 누락 → 호출측 MISSING


async def test_get_statuses_empty_when_none_exist() -> None:
    svc = _service([])
    assert await svc.get_statuses(["x", "y"]) == {}
