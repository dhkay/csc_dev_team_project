"""Outbound Adapter: UploadRepositoryPort 구현 (SQLAlchemy 2.0, AsyncSession).

SQLAlchemy 는 이 계층에서만 import. Row ↔ Domain 변환은 mappers 로만.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import ColumnElement, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.domain.entities import UploadAsset
from ....core.domain.types import (
    StorageArea,
    StorageListQuery,
    StorageSort,
    StorageUsage,
    StorageUsageSummary,
    UploadStatus,
)
from . import mappers
from .models import UploadAssetModel

# 정렬 축 → 컬럼. 수정 시각은 값이 없을 수 있어(한 번도 손대지 않은 파일) 생성 시각으로 접는다.
_SORT_COLUMNS = {
    StorageSort.NAME: UploadAssetModel.file_name,
    StorageSort.SIZE: UploadAssetModel.size,
    StorageSort.UPDATED: func.coalesce(
        UploadAssetModel.updated_at, UploadAssetModel.created_at
    ),
}


class UploadRepository:
    """UploadRepositoryPort(Protocol) 의 구현."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def find_by_id(self, upload_id: str) -> UploadAsset | None:
        result = await self._session.execute(
            select(UploadAssetModel).where(UploadAssetModel.id == upload_id)
        )
        row = result.scalar_one_or_none()
        return mappers.to_domain(row) if row is not None else None

    async def find_by_ids(self, ids: list[str]) -> list[UploadAsset]:
        if not ids:
            return []
        result = await self._session.execute(
            select(UploadAssetModel).where(UploadAssetModel.id.in_(ids))
        )
        return [mappers.to_domain(r) for r in result.scalars().all()]

    async def find_by_idempotency_key(self, key: str) -> UploadAsset | None:
        result = await self._session.execute(
            select(UploadAssetModel).where(UploadAssetModel.idempotency_key == key)
        )
        row = result.scalar_one_or_none()
        return mappers.to_domain(row) if row is not None else None

    async def find_by_organization_id(self, organization_id: int) -> list[UploadAsset]:
        result = await self._session.execute(
            select(UploadAssetModel).where(
                UploadAssetModel.organization_id == organization_id
            )
        )
        return [mappers.to_domain(r) for r in result.scalars().all()]

    async def find_pending_before(
        self, cutoff: datetime, limit: int
    ) -> list[UploadAsset]:
        # 인덱스 (status, created_at) 를 그대로 쓴다. 오래된 것부터 거둔다(한 번에 limit 건).
        result = await self._session.execute(
            select(UploadAssetModel)
            .where(
                UploadAssetModel.status == UploadStatus.PENDING.value,
                UploadAssetModel.created_at < cutoff,
            )
            .order_by(UploadAssetModel.created_at)
            .limit(limit)
        )
        return [mappers.to_domain(r) for r in result.scalars().all()]

    # 스토리지 화면 조회

    def _storage_conditions(self, query: StorageListQuery) -> list[ColumnElement[bool]]:
        """목록 조건: 조직, 영역, 인가 범위, 휴지통 여부, 검색어.

        빈 인가 집합은 와일드카드가 아니다. 서비스가 그 경우를 이미 거부하므로 여기 오지 않지만,
        혹시 오더라도 `department_id IN ()` 은 아무것도 매치하지 않아 노출로 이어지지 않는다.
        """
        conditions: list[ColumnElement[bool]] = [
            UploadAssetModel.organization_id == query.organization_id,
            UploadAssetModel.storage_area == query.area.value,
            # 확정된 것만 보여준다. 확정 전 자산이 목록에 뜨면 수거자가 거둔 뒤 사라져 유실로 읽힌다.
            UploadAssetModel.status == UploadStatus.UPLOADED.value,
        ]
        if query.trashed:
            conditions.append(UploadAssetModel.deleted_at.is_not(None))
        else:
            conditions.append(UploadAssetModel.deleted_at.is_(None))
        if query.area is StorageArea.DEPARTMENT and query.department_ids is not None:
            conditions.append(
                UploadAssetModel.department_id.in_(list(query.department_ids))
            )
        if query.area is StorageArea.PERSONAL:
            conditions.append(UploadAssetModel.owner_user_id == query.user_id)
        if query.search:
            conditions.append(UploadAssetModel.file_name.ilike(f"%{query.search}%"))
        return conditions

    async def find_storage_page(
        self, query: StorageListQuery
    ) -> tuple[list[UploadAsset], int]:
        """앞에서부터 limit 건과 조건에 걸린 전체 건수를 한 번의 조회로 가져온다.

        목록과 건수를 따로 물으면 같은 조건을 두 번 훑고 왕복도 두 번이다. 윈도 집계
        (`count(*) OVER ()`)는 페이지를 뽑는 그 스캔에서 전체 수를 함께 돌려준다.
        행이 없으면 셀 것도 없으므로 0 이다.
        """
        column = _SORT_COLUMNS[query.sort]
        order = column.desc() if query.descending else column.asc()
        result = await self._session.execute(
            select(UploadAssetModel, func.count().over().label("total"))
            .where(*self._storage_conditions(query))
            # id 를 부차 정렬로 둔다. 같은 이름/크기/시각이 여럿일 때 정렬이 결정적이지 않으면,
            #   더 보기로 페이지를 넓힐 때마다 그 행들의 자리가 바뀌어 보인다.
            .order_by(order, UploadAssetModel.id)
            .limit(query.limit)
        )
        rows = result.all()
        if not rows:
            return [], 0
        return [mappers.to_domain(row[0]) for row in rows], int(rows[0][1])

    async def summarize_storage_usage(
        self,
        organization_id: int,
        user_id: int,
        department_ids: tuple[int, ...] | None,
    ) -> StorageUsageSummary:
        # 한 번의 그룹 조회로 세 영역과 휴지통을 함께 센다. 영역별로 따로 물으면 왕복이 넷이 된다.
        visible = [UploadAssetModel.storage_area == StorageArea.COMMON.value]
        if department_ids is None:
            visible.append(
                UploadAssetModel.storage_area == StorageArea.DEPARTMENT.value
            )
        elif department_ids:
            visible.append(
                (UploadAssetModel.storage_area == StorageArea.DEPARTMENT.value)
                & UploadAssetModel.department_id.in_(list(department_ids))
            )
        visible.append(
            (UploadAssetModel.storage_area == StorageArea.PERSONAL.value)
            & (UploadAssetModel.owner_user_id == user_id)
        )
        deleted = UploadAssetModel.deleted_at.is_not(None)
        result = await self._session.execute(
            select(
                UploadAssetModel.storage_area,
                deleted.label("trashed"),
                func.coalesce(func.sum(UploadAssetModel.size), 0),
                func.count(),
            )
            .where(
                UploadAssetModel.organization_id == organization_id,
                UploadAssetModel.storage_area.is_not(None),
                UploadAssetModel.status == UploadStatus.UPLOADED.value,
                or_(*visible),
            )
            .group_by(UploadAssetModel.storage_area, deleted)
        )
        # 살아 있는 것과 버려진 것을 영역별로 따로 담는다. 휴지통 화면이 영역 단위라, 합계만
        #   두면 사이드바의 개수와 눌러서 보이는 목록이 어긋난다.
        live: dict[str, list[int]] = {a.value: [0, 0] for a in StorageArea}
        trashed_totals: dict[str, list[int]] = {a.value: [0, 0] for a in StorageArea}
        for area, trashed, size_sum, count in result.all():
            bucket = trashed_totals if trashed else live
            bucket[area][0] += int(size_sum or 0)
            bucket[area][1] += int(count or 0)
        return StorageUsageSummary(
            common=StorageUsage(*live[StorageArea.COMMON.value]),
            department=StorageUsage(*live[StorageArea.DEPARTMENT.value]),
            personal=StorageUsage(*live[StorageArea.PERSONAL.value]),
            trash_by_area={
                area: StorageUsage(*trashed_totals[area.value]) for area in StorageArea
            },
        )

    # 일괄 변경은 한 문장으로 끝낸다. id 마다 조회하고 저장하면 200개 선택이 400번의 왕복이 된다
    #   (merge 는 UPDATE 앞에 SELECT 를 한 번 더 낸다). 대상 검증은 서비스가 이미 한 번에 끝냈다.

    async def mark_storage_trashed(
        self, ids: list[str], deleted_by_user_id: int, deleted_at: datetime
    ) -> int:
        if not ids:
            return 0
        result = await self._session.execute(
            update(UploadAssetModel)
            .where(UploadAssetModel.id.in_(ids))
            .values(
                deleted_at=deleted_at,
                deleted_by_user_id=deleted_by_user_id,
                updated_at=deleted_at,
            )
        )
        return result.rowcount or 0

    async def mark_storage_restored(self, ids: list[str], updated_at: datetime) -> int:
        if not ids:
            return 0
        result = await self._session.execute(
            update(UploadAssetModel)
            .where(UploadAssetModel.id.in_(ids))
            .values(deleted_at=None, deleted_by_user_id=None, updated_at=updated_at)
        )
        return result.rowcount or 0

    async def rename_storage_asset(
        self, upload_id: str, file_name: str, updated_at: datetime
    ) -> None:
        await self._session.execute(
            update(UploadAssetModel)
            .where(UploadAssetModel.id == upload_id)
            .values(file_name=file_name, updated_at=updated_at)
        )

    async def confirm_storage_asset(self, upload_id: str, updated_at: datetime) -> None:
        await self._session.execute(
            update(UploadAssetModel)
            .where(UploadAssetModel.id == upload_id)
            .values(status=UploadStatus.UPLOADED.value, updated_at=updated_at)
        )

    async def save(self, asset: UploadAsset) -> UploadAsset:
        await self._session.merge(mappers.to_model(asset))
        await self._session.flush()
        return asset

    async def delete_by_id(self, upload_id: str) -> bool:
        result = await self._session.execute(
            delete(UploadAssetModel).where(UploadAssetModel.id == upload_id)
        )
        return (result.rowcount or 0) > 0

    async def delete_by_ids(self, ids: list[str]) -> int:
        if not ids:
            return 0
        result = await self._session.execute(
            delete(UploadAssetModel).where(UploadAssetModel.id.in_(ids))
        )
        return result.rowcount or 0
