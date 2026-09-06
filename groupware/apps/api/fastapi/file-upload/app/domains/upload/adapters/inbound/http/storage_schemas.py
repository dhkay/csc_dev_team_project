"""스토리지 화면 요청/응답 DTO (Pydantic).

스코프 객체가 모든 요청에 실린다. 인가 판정은 BFF 가 하고 이 서버는 집행만 한다는 계약을
요청 모양이 그대로 드러낸다. 자세한 근거는 core/application/storage_service.py 머리말.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from ....core.application.storage_service import MAX_PAGE_SIZE
from ....core.domain.types import StorageArea, StorageSort


class StorageScopeInput(BaseModel):
    """호출자가 지금 보는 영역과 그가 접근할 수 있는 범위. BFF 가 세션에서 도출해 주입한다."""

    area: StorageArea
    # 지금 보고 있는 부서. area=DEPARTMENT 일 때 필수.
    department_id: int | None = None
    # 인가 집합(팀장이면 하위 서브트리까지 펼친 값). 비어 있으면 와일드카드가 아니라 거부다.
    department_ids: list[int] = Field(default_factory=list)
    # 전 부서 접근을 뜻하는 유일한 값. ROOT, 대표, 시스템관리 권한자.
    can_manage_org: bool = False
    # 팀장 여부: 자기 부서 파일의 이름 변경과 삭제를 허용하는 근거.
    is_team_leader: bool = False


class StorageListRequest(BaseModel):
    scope: StorageScopeInput
    # true 면 휴지통 목록. 두 목록은 같은 인가 규칙을 쓴다.
    trashed: bool = False
    search: str | None = Field(default=None, max_length=100)
    sort: StorageSort = StorageSort.NAME
    descending: bool = False
    # 상한은 서비스가 소유한다. 여기 숫자를 따로 적으면 한쪽만 바뀌었을 때 화면이 요청한 크기가
    #   스키마 검증에서 422 로 튕긴다(원인이 화면에 드러나지 않는 종류의 어긋남이다).
    limit: int = Field(default=50, ge=1, le=MAX_PAGE_SIZE)


class StorageFileItem(BaseModel):
    id: str
    file_name: str
    mime_type: str
    size: int
    created_at: datetime
    updated_at: datetime | None
    # 올린 사람. 이름은 담지 않는다. 표시 이름은 호출측이 렌더 시점에 id 로 조인한다
    # (개명이 저장된 값을 낡게 만들지 않도록).
    owner_user_id: int | None
    deleted_at: datetime | None
    deleted_by_user_id: int | None


class StorageListResponse(BaseModel):
    files: list[StorageFileItem]
    total: int
    has_more: bool


class StorageUsageRequest(BaseModel):
    department_ids: list[int] = Field(default_factory=list)
    can_manage_org: bool = False


class StorageUsageItem(BaseModel):
    bytes: int
    files: int


class StorageUsageResponse(BaseModel):
    common: StorageUsageItem
    department: StorageUsageItem
    personal: StorageUsageItem
    # 영역별 휴지통(키 = 영역 이름). 휴지통 화면이 영역 단위라 합계가 아니라 이 형태로 준다.
    trash_by_area: dict[str, StorageUsageItem]


class StoragePresignRequest(BaseModel):
    scope: StorageScopeInput
    file_name: str = Field(min_length=1)
    mime_type: str = Field(min_length=1)
    size: int = Field(gt=0)


class StorageScopeRequest(BaseModel):
    """스코프만 필요한 요청(확정 등)."""

    scope: StorageScopeInput


class StorageRenameRequest(BaseModel):
    scope: StorageScopeInput
    file_name: str = Field(min_length=1)


class StorageIdsRequest(BaseModel):
    scope: StorageScopeInput
    ids: list[str] = Field(min_length=1, max_length=MAX_PAGE_SIZE)


class StorageAffectedResponse(BaseModel):
    """몇 건이 실제로 바뀌었는지. 이미 그 상태였던 항목은 세지 않는다."""

    affected: int
