"""스토리지 화면(공통/조직/개인 파일 브라우저)의 비즈니스 로직.

업로드 도메인의 자산 중 `storage_area` 가 있는 것만 다룬다. 마케팅 씬 이미지나 영상 산출물,
아바타처럼 다른 경로로 들어온 자산은 이 서비스의 어떤 조회에도 나타나지 않는다.

인가 판정은 BFF 가 하고 집행은 여기서 한다. BFF 가 세션과 조직 디렉터리에서 도출한 스코프
(영역, 지금 보는 부서, 인가된 부서 집합, 조직 관리 권한 여부)를 보내고, 이 서비스는 서버가 자기
값으로 아는 것(조직, 본인 user id, 대상 행의 실제 소유 컬럼)을 반드시 다시 확인한다.
그래서 스코프를 부풀려 보내도 조직 경계와 개인 영역은 넘지 못한다.

여기서는 FastAPI, SQLAlchemy 를 import 하지 않는다.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from datetime import datetime, timezone

from ..domain.entities import StorageListing, UploadAsset
from ..domain.types import (
    StorageArea,
    StorageListQuery,
    StorageScope,
    StorageSort,
    StorageUsageSummary,
    UploadStatus,
)
from .ports.outbound import StoragePort, UploadRepositoryPort
from .services import is_valid_partition
from .storage_scope import (
    assert_can_modify,
    assert_can_restore,
    assert_in_scope,
    assert_scope,
)

logger = logging.getLogger(__name__)

# 파일 이름 제약: 경로 구분자와 윈도우 예약 문자를 막는다. 실제 저장 경로는 서버 UUID 라
#   이 검사는 traversal 방어가 아니라 표시/다운로드 이름의 위생이다.
_FORBIDDEN_NAME_CHARS = frozenset('/\\:*?"<>|')
_MAX_NAME_LENGTH = 255
# 한 번에 돌려주는 최대 건수: 호출자가 더 큰 값을 보내도 여기서 자른다.
MAX_PAGE_SIZE = 200


def clean_item_name(raw: str) -> str:
    """사용자가 지정한 파일 이름을 다듬고 검증한다. 어긋나면 ValueError."""
    name = raw.strip()
    if not name:
        raise ValueError("name must not be empty")
    if len(name) > _MAX_NAME_LENGTH:
        raise ValueError("name is too long")
    if name in (".", ".."):
        raise ValueError("invalid name")
    if any(ch in _FORBIDDEN_NAME_CHARS for ch in name):
        raise ValueError("name contains forbidden characters")
    if any(ord(ch) < 32 for ch in name):
        raise ValueError("name contains control characters")
    return name


class StorageService:
    def __init__(
        self,
        repository: UploadRepositoryPort,
        storage: StoragePort,
        max_upload_size: int,
    ) -> None:
        self._repository = repository
        self._storage = storage
        self._max_upload_size = max_upload_size

    # 인가 규칙은 storage_scope 모듈이 소유한다(폴더/공유 서비스가 같은 규칙을 공유하려면
    #   서비스 안에 두면 안 된다). 여기서는 그것을 부르기만 한다.

    # 조회

    async def list_items(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        *,
        trashed: bool = False,
        search: str | None = None,
        sort: StorageSort = StorageSort.NAME,
        descending: bool = False,
        limit: int = 50,
    ) -> StorageListing:
        assert_scope(scope)
        # 부서 영역의 목록은 지금 보고 있는 부서 하나만 담는다. 인가 집합은 접근 가능 여부를
        #   판정할 뿐이고, 하위 부서 파일까지 섞어 보여 주는 화면이 아니다.
        department_ids = (
            (scope.department_id,)
            if scope.area is StorageArea.DEPARTMENT and scope.department_id is not None
            else None
        )
        query = StorageListQuery(
            organization_id=organization_id,
            area=scope.area,
            user_id=user_id,
            department_ids=department_ids,
            trashed=trashed,
            search=(search or "").strip() or None,
            sort=sort,
            descending=descending,
            limit=max(1, min(limit, MAX_PAGE_SIZE)),
        )
        assets, total = await self._repository.find_storage_page(query)
        return StorageListing(assets=assets, total=total)

    async def usage(
        self,
        organization_id: int,
        user_id: int,
        department_ids: tuple[int, ...],
        can_manage_org: bool,
    ) -> StorageUsageSummary:
        return await self._repository.summarize_storage_usage(
            organization_id,
            user_id,
            None if can_manage_org else department_ids,
        )

    async def read_file(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        upload_id: str,
    ) -> tuple[UploadAsset, str]:
        """인가한 뒤 파일의 저장 경로를 돌려준다(라우터가 그 바이트를 스트리밍한다).

        스토리지 파일에는 서명 접근 URL 을 발급하지 않는다. 서명 URL 은 그것을 가진 누구나
        열 수 있는 무기명 주소라, 한 번 밖으로 복사되면 로그인 없는 외부 공개가 된다. 공통과
        조직 파일은 그러면 안 되므로 발급 경로 자체를 두지 않았다(정책이 아니라 구조로 막는다).
        읽는 길은 이 호출 하나뿐이고, 그 호출자는 서비스토큰을 가진 web BFF 다.

        스코프 밖 대상은 LookupError(404) 다. 403 은 남의 부서에 그 파일이 있다는 사실을 알려 준다.
        """
        assert_scope(scope)
        asset = await self._require_asset(organization_id, user_id, scope, upload_id)
        if asset.status is not UploadStatus.UPLOADED or asset.deleted_at is not None:
            # 확정 전이거나 휴지통에 있는 파일은 목록에도 없다. 존재를 드러내지 않는다.
            raise LookupError("storage item not found")
        path = self._storage.fs_path(asset.object_key)
        if path is None:
            raise LookupError("storage item not found")
        return asset, path

    async def read_common_file(self, upload_id: str) -> tuple[UploadAsset, str]:
        """공통 영역 파일 하나를 신원 없이 읽는다. 공개 주소가 이 함수를 통한다.

        공통은 조직 전원이 함께 쓰는 공간이고, 그 파일의 주소는 다른 곳에 이미지로 붙여 넣기
        위해 밖으로 나간다. 그래서 조직도 사용자도 묻지 않는다. 대신 정말 공통인지를 매번
        다시 본다: 다른 영역 파일의 id 로 이 경로를 불러도 열리지 않아야 한다.

        조직과 개인 파일은 여기서 404 다. 그 파일들을 읽는 길은 스코프를 확인하는 read_file
        하나뿐이고, 그 호출자는 세션을 가진 web BFF 다.
        """
        asset = await self._repository.find_by_id(upload_id)
        if (
            asset is None
            or asset.storage_area is not StorageArea.COMMON
            or asset.status is not UploadStatus.UPLOADED
            or asset.deleted_at is not None
        ):
            # 없음과 "공통이 아님" 을 구분하지 않는다. 구분하면 id 를 넣어 보며 존재를 알아내는
            #   창구가 된다.
            raise LookupError("file not found")
        path = self._storage.fs_path(asset.object_key)
        if path is None:
            raise LookupError("file not found")
        return asset, path

    # 업로드

    def _partition_for(
        self, organization_id: int, user_id: int, scope: StorageScope
    ) -> str:
        """저장 경로의 하위 폴더. 모든 세그먼트가 불변 id 라 개명에 영향받지 않는다.

        폴더 id 는 넣지 않는다. 파일을 다른 폴더로 옮기는 일이 바이트를 옮기는 일이 되면 안 된다.
        영역 사이를 옮긴 뒤 이 키는 만들어진 자리를 가리키는 낡은 값이 되는데, 그게 맞다.
        소유의 단일 출처는 경로가 아니라 컬럼이다.
        """
        base = f"{organization_id}/storage"
        if scope.area is StorageArea.COMMON:
            return f"{base}/common"
        if scope.area is StorageArea.DEPARTMENT:
            return f"{base}/dept/{scope.department_id}"
        return f"{base}/personal/{user_id}"

    async def create_presign(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        file_name: str,
        mime_type: str,
        size: int,
    ) -> tuple[UploadAsset, str]:
        assert_scope(scope)
        name = clean_item_name(file_name)
        if size <= 0 or size > self._max_upload_size:
            raise ValueError("invalid file size")
        partition = self._partition_for(organization_id, user_id, scope)
        if not is_valid_partition(partition):
            raise ValueError("invalid partition")
        upload_id = str(uuid.uuid4())
        object_key = f"groupware/{partition}/{upload_id}"
        presigned_url = self._storage.presigned_put_url(
            upload_id=upload_id, object_key=object_key, mime_type=mime_type, size=size
        )
        asset = UploadAsset(
            id=upload_id,
            file_name=name,
            mime_type=mime_type,
            size=size,
            object_key=object_key,
            status=UploadStatus.PENDING,
            created_at=datetime.now(timezone.utc),
            scope="groupware",
            organization_id=organization_id,
            storage_area=scope.area,
            department_id=(
                scope.department_id if scope.area is StorageArea.DEPARTMENT else None
            ),
            owner_user_id=user_id,
        )
        await self._repository.save(asset)
        return asset, presigned_url

    async def confirm(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        upload_id: str,
    ) -> UploadAsset:
        """PENDING 을 UPLOADED 로 올린다. 이 전이 전까지 목록에 보이지 않는다.

        확정 전 자산이 목록에 뜨면 수거자가 거둔 뒤 사라져 사용자에게는 유실로 읽힌다.
        """
        assert_scope(scope)
        asset = await self._require_asset(organization_id, user_id, scope, upload_id)
        if not await self._storage.exists(asset.object_key):
            raise ValueError("file not uploaded yet")
        now = datetime.now(timezone.utc)
        await self._repository.confirm_storage_asset(asset.id, now)
        asset.status = UploadStatus.UPLOADED
        asset.updated_at = now
        return asset

    async def discard(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        upload_id: str,
    ) -> bool:
        """확정되지 않은 업로드를 지금 버린다(업로드 취소).

        확정 전 자산만 받는다. 확정된 파일을 지우는 길은 휴지통뿐이고, 그 앞에 되돌릴 수 있는
        단계가 하나 있어야 한다. 여기로 확정된 파일이 들어오면 400 이다.

        이 호출은 정리를 앞당길 뿐 정확성의 근거가 아니다. 취소한 탭이 그대로 닫히거나 이
        요청이 실패해도 그 자산은 확정되지 않은 채 남아 하루 뒤 기존 수거자가 거둔다. 그래서
        호출부는 실패를 무시해도 되고, 무시해야 한다(취소를 되돌릴 이유가 없다).

        바이트를 먼저 지우고 그다음 행을 지운다(영구 삭제와 같은 순서, 같은 이유).
        """
        assert_scope(scope)
        asset = await self._require_asset(organization_id, user_id, scope, upload_id)
        if asset.status is not UploadStatus.PENDING:
            raise ValueError("upload is already confirmed")
        assert_can_modify(asset, user_id, scope)
        await self._storage.delete(asset.object_key)
        return await self._repository.delete_by_id(asset.id)

    # 변경

    async def rename(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        upload_id: str,
        file_name: str,
    ) -> UploadAsset:
        assert_scope(scope)
        name = clean_item_name(file_name)
        asset = await self._require_asset(organization_id, user_id, scope, upload_id)
        assert_can_modify(asset, user_id, scope)
        # 이름은 표시와 다운로드 파일명일 뿐이라 저장 경로(object_key)는 손대지 않는다.
        now = datetime.now(timezone.utc)
        await self._repository.rename_storage_asset(asset.id, name, now)
        asset.file_name = name
        asset.updated_at = now
        return asset

    async def trash(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        upload_ids: list[str],
    ) -> int:
        """휴지통으로 보낸다. 바이트는 건드리지 않으므로 복원이 언제나 가능하다."""
        targets = await self._resolve_targets(
            organization_id, user_id, scope, upload_ids, assert_can_modify
        )
        pending = [a.id for a in targets if a.deleted_at is None]
        now = datetime.now(timezone.utc)
        return await self._repository.mark_storage_trashed(pending, user_id, now)

    async def restore(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        upload_ids: list[str],
    ) -> int:
        targets = await self._resolve_targets(
            organization_id, user_id, scope, upload_ids, assert_can_restore
        )
        trashed = [a.id for a in targets if a.deleted_at is not None]
        now = datetime.now(timezone.utc)
        return await self._repository.mark_storage_restored(trashed, now)

    async def purge(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        upload_ids: list[str],
    ) -> int:
        """영구 삭제: 바이트를 먼저 지우고 그다음 행을 지운다.

        중간에 실패하면 바이트 없는 행이 남고, 조회는 이미 "파일을 찾을 수 없음" 으로 답하며
        재실행이 멱등이다. 반대 순서는 아무도 열거할 수 없는 고아 바이트를 남긴다.

        바이트 삭제는 파일마다 해야 하지만(파일시스템에는 일괄 삭제가 없다), 메타 행은 한 문장으로
        지운다.
        """
        targets = await self._resolve_targets(
            organization_id, user_id, scope, upload_ids, assert_can_restore
        )
        for asset in targets:
            if asset.deleted_at is None:
                # 휴지통을 거치지 않은 영구 삭제는 받지 않는다. 되돌릴 수 없는 동작 앞에는
                #   반드시 되돌릴 수 있는 단계가 하나 있어야 한다.
                raise ValueError("item is not in trash")
        for asset in targets:
            await self._storage.delete(asset.object_key)
            if await self._storage.exists(asset.object_key):
                # 보상 실패를 삼키지 않는다. 고아 바이트가 생겼다는 사실 자체가 남아야 한다.
                logger.warning(
                    "스토리지 영구 삭제: 바이트가 남았다 upload_id=%s object_key=%s",
                    asset.id,
                    asset.object_key,
                )
        return await self._repository.delete_by_ids([a.id for a in targets])

    # 내부

    async def _require_asset(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        upload_id: str,
    ) -> UploadAsset:
        asset = await self._repository.find_by_id(upload_id)
        if asset is None:
            raise LookupError("storage item not found")
        assert_in_scope(asset, organization_id, user_id, scope)
        return asset

    async def _resolve_targets(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        upload_ids: list[str],
        assert_allowed: Callable[[UploadAsset, int, StorageScope], None],
    ) -> list[UploadAsset]:
        """일괄 동작의 대상을 한 번의 조회로 모으고 전부 검증한다.

        하나라도 스코프 밖이거나 권한이 없으면 그 자리에서 던진다. 그래서 일부만 처리되고 나머지가
        거부되는 상태가 생기지 않는다(요청 세션이 통째로 롤백된다).
        """
        assert_scope(scope)
        wanted = list(dict.fromkeys(upload_ids))
        assets = await self._repository.find_by_ids(wanted)
        found = {a.id: a for a in assets}
        for upload_id in wanted:
            asset = found.get(upload_id)
            if asset is None:
                raise LookupError("storage item not found")
            assert_in_scope(asset, organization_id, user_id, scope)
            assert_allowed(asset, user_id, scope)
        return [found[i] for i in wanted]
