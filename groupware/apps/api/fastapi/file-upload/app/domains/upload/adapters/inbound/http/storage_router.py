"""Inbound Adapter: 스토리지 화면(공통/조직/개인 파일 브라우저) API.

호출자는 web-groupware BFF 하나다. 조직과 유저는 신원 헤더로, 접근 범위는 본문 스코프로 온다.
어느 경로도 ServiceTokenMiddleware 면제 대상이 아니다(익명 방문자는 이 서버를 직접 부르지 않는다).

도메인 예외를 HTTP 로 옮기는 것은 이 계층의 책임이다. 서비스는 HTTP 를 모른다.
  ValueError      -> 400  잘못된 입력
  PermissionError -> 403  볼 수는 있지만 할 수 없는 동작
  LookupError     -> 404  없거나 스코프 밖(403 을 주면 남의 부서 파일의 존재를 알려 주는 오라클이 된다)
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from csc_net_utils import Identity, get_identity, require_services

from ....core.application.ports.inbound import StorageInboundPort
from ....core.domain.entities import UploadAsset
from ....core.domain.types import StorageScope, StorageUsage
from .router import build_file_response
from .schemas import PresignResponse
from .storage_schemas import (
    StorageAffectedResponse,
    StorageFileItem,
    StorageIdsRequest,
    StorageListRequest,
    StorageListResponse,
    StoragePresignRequest,
    StorageRenameRequest,
    StorageScopeInput,
    StorageScopeRequest,
    StorageUsageItem,
    StorageUsageRequest,
    StorageUsageResponse,
)

# 스토리지 화면은 groupware 사용자 화면 하나가 쓴다. control-tower 도 여기 넣지 않는다
# (플랫폼이 조직 파일을 열람하는 경로는 별도 결정이 필요한 일이고, 지금 그런 요구가 없다).
_STORAGE_CALLERS = ("web-groupware",)


def get_storage_service() -> StorageInboundPort:
    # 실제 provider 는 app/container.py 에서 오버라이드된다.
    raise NotImplementedError


@dataclass(frozen=True)
class StorageActor:
    """신원 헤더를 이 도메인 타입으로 옮긴 값(공유 인프라 타입이 도메인에 새지 않게)."""

    organization_id: int
    user_id: int


async def get_actor(identity: Identity = Depends(get_identity)) -> StorageActor:
    try:
        return StorageActor(
            organization_id=int(identity.organization_id),
            user_id=int(identity.user_id),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail="신원 헤더가 정수가 아닙니다."
        ) from exc


router = APIRouter(
    prefix="/storage",
    tags=["storage"],
    dependencies=[Depends(require_services(*_STORAGE_CALLERS))],
)


def _to_scope(scope: StorageScopeInput) -> StorageScope:
    return StorageScope(
        area=scope.area,
        department_id=scope.department_id,
        department_ids=tuple(scope.department_ids),
        can_manage_org=scope.can_manage_org,
        is_team_leader=scope.is_team_leader,
    )


def _to_file_item(asset: UploadAsset) -> StorageFileItem:
    return StorageFileItem(
        id=asset.id,
        file_name=asset.file_name,
        mime_type=asset.mime_type,
        size=asset.size,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
        owner_user_id=asset.owner_user_id,
        deleted_at=asset.deleted_at,
        deleted_by_user_id=asset.deleted_by_user_id,
    )


def _usage_item(usage: StorageUsage) -> StorageUsageItem:
    return StorageUsageItem(bytes=usage.bytes, files=usage.files)


def _http_error(exc: Exception) -> HTTPException:
    """도메인 예외 → HTTP. 매핑을 한 곳에 두어 라우트마다 어긋나지 않게 한다."""
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc))
    return HTTPException(status_code=400, detail=str(exc))


@router.post(
    "/list",
    response_model=StorageListResponse,
    summary="[STORAGE-001] 스토리지 목록 조회",
    description=(
        "한 영역(공통, 조직의 한 부서, 개인)의 파일 목록을 한 페이지 돌려준다. "
        "확정이 끝난 파일만 담기며, 올라가는 중이거나 실패한 업로드는 나타나지 않는다. "
        "휴지통을 보려면 trashed 를 참으로 준다. "
        "검색어를 주면 그 영역에서 이름에 포함된 파일만 걸러 낸다. "
        "정렬은 이름, 크기, 수정 시각 중 하나이며 방향을 따로 준다."
    ),
    responses={
        400: {"description": "스코프가 유효하지 않거나 신원 헤더가 없다"},
        403: {"description": "그 부서에 접근할 수 없다"},
    },
)
async def list_items(
    body: StorageListRequest,
    actor: StorageActor = Depends(get_actor),
    service: StorageInboundPort = Depends(get_storage_service),
) -> StorageListResponse:
    try:
        listing = await service.list_items(
            actor.organization_id,
            actor.user_id,
            _to_scope(body.scope),
            trashed=body.trashed,
            search=body.search,
            sort=body.sort,
            descending=body.descending,
            limit=body.limit,
        )
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http_error(exc) from exc
    return StorageListResponse(
        files=[_to_file_item(a) for a in listing.assets],
        total=listing.total,
        has_more=len(listing.assets) < listing.total,
    )


@router.post(
    "/usage",
    response_model=StorageUsageResponse,
    summary="[STORAGE-002] 스토리지 사용량 요약",
    description=(
        "호출자가 볼 수 있는 범위의 사용 용량과 파일 수를 영역별로 돌려준다. "
        "공통은 조직 전체, 조직은 접근 가능한 부서의 합, 개인은 본인 것이다. "
        "휴지통은 세 영역의 삭제 대기 파일을 합쳐 따로 센다. "
        "용량 상한은 두지 않으므로 이 값은 현황일 뿐 제한이 아니다."
    ),
    responses={400: {"description": "신원 헤더가 없다"}},
)
async def usage(
    body: StorageUsageRequest,
    actor: StorageActor = Depends(get_actor),
    service: StorageInboundPort = Depends(get_storage_service),
) -> StorageUsageResponse:
    summary = await service.usage(
        actor.organization_id,
        actor.user_id,
        tuple(body.department_ids),
        body.can_manage_org,
    )
    return StorageUsageResponse(
        common=_usage_item(summary.common),
        department=_usage_item(summary.department),
        personal=_usage_item(summary.personal),
        trash_by_area={
            area.value: _usage_item(usage)
            for area, usage in summary.trash_by_area.items()
        },
    )


@router.post(
    "/files/{upload_id}/content",
    summary="[STORAGE-003] 스토리지 파일 내려받기",
    description=(
        "파일 하나의 내용을 돌려준다. 호출자가 그 파일을 볼 수 있는지 확인한 뒤 내용을 실어 "
        "주므로, 확인과 전송이 한 번의 요청으로 끝난다. "
        "\n\n"
        "**스토리지 파일에는 접근 주소를 따로 발급하지 않는다.** 다른 업로드 자산과 달리 "
        "이 파일들은 조직 안에서만 오가야 하므로, 로그인 없이 열리는 주소가 만들어질 수 있는 "
        "길을 두지 않는다. 내용을 받는 길은 이 요청 하나뿐이고, 화면에 필요한 파일은 웹 서버가 "
        "받아서 사용자에게 전달한다. "
        "\n\n"
        "구간 요청(Range)을 지원해 큰 영상도 앞뒤로 건너뛰며 재생할 수 있다."
    ),
    response_class=FileResponse,
    responses={
        400: {"description": "스코프가 유효하지 않거나 신원 헤더가 없다"},
        403: {"description": "그 부서에 접근할 수 없다"},
        404: {"description": "그 스코프에 그 파일이 없다"},
    },
)
async def read_file(
    upload_id: str,
    body: StorageScopeRequest,
    actor: StorageActor = Depends(get_actor),
    service: StorageInboundPort = Depends(get_storage_service),
) -> FileResponse:
    try:
        asset, path = await service.read_file(
            actor.organization_id, actor.user_id, _to_scope(body.scope), upload_id
        )
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http_error(exc) from exc
    return build_file_response(asset, path)


@router.get(
    "/common/{upload_id}",
    summary="[STORAGE-011] 공통 파일 내려받기(신원 없이)",
    description=(
        "공통 영역 파일 하나의 내용을 돌려준다. 조직과 사용자를 묻지 않는다. "
        "공통은 조직 전원이 함께 쓰는 공간이고 그 주소는 다른 곳에 이미지로 붙여 넣기 위해 "
        "밖으로 나가므로, 이 경로는 로그인하지 않은 방문자에게 전달될 것을 전제로 한다. "
        "\n\n"
        "**공통 파일만 열린다.** 조직과 개인 파일의 id 로 불러도 404 이며, 그 이유를 구분해 "
        "알려 주지 않는다(id 를 넣어 보며 존재를 알아내는 창구가 되지 않도록). 확정되지 않았거나 "
        "휴지통에 있는 파일도 마찬가지다."
    ),
    response_class=FileResponse,
    responses={404: {"description": "없거나, 공통이 아니거나, 휴지통에 있다"}},
)
async def read_common_file(
    upload_id: str,
    service: StorageInboundPort = Depends(get_storage_service),
) -> FileResponse:
    try:
        asset, path = await service.read_common_file(upload_id)
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http_error(exc) from exc
    return build_file_response(asset, path)


@router.post(
    "/presign",
    response_model=PresignResponse,
    summary="[STORAGE-004] 스토리지 업로드 주소 발급",
    description=(
        "파일을 올릴 임시 주소를 발급하고 대기 상태의 자산을 하나 만든다. "
        "이 응답만으로는 아직 파일이 없으며, 주소로 본문을 보낸 뒤 확인 요청까지 마쳐야 목록에 나타난다. "
        "확인 없이 남은 자산은 하루가 지나면 자동으로 정리된다. "
        "저장 위치는 영역과 조직, 부서, 사용자 식별자로 정해지며 파일 이름은 경로에 쓰이지 않는다."
    ),
    responses={
        400: {"description": "이름이나 크기가 유효하지 않다"},
        403: {"description": "그 영역에 올릴 수 없다"},
    },
)
async def create_presign(
    body: StoragePresignRequest,
    actor: StorageActor = Depends(get_actor),
    service: StorageInboundPort = Depends(get_storage_service),
) -> PresignResponse:
    try:
        asset, presigned_url = await service.create_presign(
            actor.organization_id,
            actor.user_id,
            _to_scope(body.scope),
            body.file_name,
            body.mime_type,
            body.size,
        )
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http_error(exc) from exc
    return PresignResponse(
        upload_id=asset.id, object_key=asset.object_key, presigned_url=presigned_url
    )


@router.post(
    "/files/{upload_id}/confirm",
    response_model=StorageFileItem,
    summary="[STORAGE-005] 스토리지 업로드 확인",
    description=(
        "본문 전송이 끝난 자산을 확정한다. 확정된 뒤에야 목록과 사용량에 반영된다. "
        "본문이 도착하지 않았으면 400 을 준다. 여러 번 요청해도 결과는 같다."
    ),
    responses={
        400: {"description": "본문이 아직 도착하지 않았다"},
        403: {"description": "그 영역에 접근할 수 없다"},
        404: {"description": "대상이 없거나 접근 범위 밖이다"},
    },
)
async def confirm(
    upload_id: str,
    body: StorageScopeRequest,
    actor: StorageActor = Depends(get_actor),
    service: StorageInboundPort = Depends(get_storage_service),
) -> StorageFileItem:
    try:
        asset = await service.confirm(
            actor.organization_id, actor.user_id, _to_scope(body.scope), upload_id
        )
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http_error(exc) from exc
    return _to_file_item(asset)


@router.post(
    "/files/{upload_id}/discard",
    response_model=StorageAffectedResponse,
    summary="[STORAGE-010] 스토리지 업로드 취소",
    description=(
        "확정되지 않은 업로드를 지금 버린다. 올리던 파일과 그 기록을 함께 없앤다. "
        "이미 확정된 파일에는 쓸 수 없다(400). 그 경우는 휴지통을 거쳐야 한다. "
        "이 요청은 정리를 앞당길 뿐이다. 보내지 못했거나 실패해도 그 자산은 확정되지 않은 채로 "
        "남아 하루 뒤 자동으로 정리되므로, 호출자는 실패를 무시해도 된다."
    ),
    responses={
        400: {"description": "이미 확정된 파일이다"},
        403: {"description": "남이 올리던 파일이다"},
        404: {"description": "대상이 없거나 접근 범위 밖이다"},
    },
)
async def discard(
    upload_id: str,
    body: StorageScopeRequest,
    actor: StorageActor = Depends(get_actor),
    service: StorageInboundPort = Depends(get_storage_service),
) -> StorageAffectedResponse:
    try:
        removed = await service.discard(
            actor.organization_id, actor.user_id, _to_scope(body.scope), upload_id
        )
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http_error(exc) from exc
    return StorageAffectedResponse(affected=1 if removed else 0)


@router.patch(
    "/files/{upload_id}",
    response_model=StorageFileItem,
    summary="[STORAGE-006] 스토리지 파일 이름 변경",
    description=(
        "파일 이름을 바꾼다. 이 이름은 목록 표시와 내려받을 때의 파일명에 함께 쓰인다. "
        "저장 위치는 바뀌지 않으므로 이미 발급된 접근 주소는 그대로 유효하다. "
        "올린 사람, 그 부서의 팀장, 조직 관리 권한자만 바꿀 수 있다."
    ),
    responses={
        400: {"description": "이름이 비었거나 사용할 수 없는 문자를 포함한다"},
        403: {"description": "남이 올린 파일이다"},
        404: {"description": "대상이 없거나 접근 범위 밖이다"},
    },
)
async def rename(
    upload_id: str,
    body: StorageRenameRequest,
    actor: StorageActor = Depends(get_actor),
    service: StorageInboundPort = Depends(get_storage_service),
) -> StorageFileItem:
    try:
        asset = await service.rename(
            actor.organization_id,
            actor.user_id,
            _to_scope(body.scope),
            upload_id,
            body.file_name,
        )
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http_error(exc) from exc
    return _to_file_item(asset)


@router.post(
    "/items/trash",
    response_model=StorageAffectedResponse,
    summary="[STORAGE-007] 스토리지 파일 휴지통 이동",
    description=(
        "선택한 파일을 휴지통으로 보낸다. 파일 본문은 남아 있어 언제든 되돌릴 수 있다. "
        "이미 휴지통에 있는 항목은 세지 않는다. "
        "올린 사람, 그 부서의 팀장, 조직 관리 권한자만 보낼 수 있다."
    ),
    responses={
        403: {"description": "남이 올린 파일이다"},
        404: {"description": "대상이 없거나 접근 범위 밖이다"},
    },
)
async def trash(
    body: StorageIdsRequest,
    actor: StorageActor = Depends(get_actor),
    service: StorageInboundPort = Depends(get_storage_service),
) -> StorageAffectedResponse:
    try:
        affected = await service.trash(
            actor.organization_id, actor.user_id, _to_scope(body.scope), body.ids
        )
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http_error(exc) from exc
    return StorageAffectedResponse(affected=affected)


@router.post(
    "/items/restore",
    response_model=StorageAffectedResponse,
    summary="[STORAGE-008] 스토리지 파일 복원",
    description=(
        "휴지통의 파일을 원래 영역으로 되돌린다. 휴지통에 없던 항목은 세지 않는다. "
        "지운 사람, 올린 사람, 그 부서의 팀장, 조직 관리 권한자가 되돌릴 수 있다."
    ),
    responses={
        403: {"description": "되돌릴 권한이 없다"},
        404: {"description": "대상이 없거나 접근 범위 밖이다"},
    },
)
async def restore(
    body: StorageIdsRequest,
    actor: StorageActor = Depends(get_actor),
    service: StorageInboundPort = Depends(get_storage_service),
) -> StorageAffectedResponse:
    try:
        affected = await service.restore(
            actor.organization_id, actor.user_id, _to_scope(body.scope), body.ids
        )
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http_error(exc) from exc
    return StorageAffectedResponse(affected=affected)


@router.post(
    "/items/purge",
    response_model=StorageAffectedResponse,
    summary="[STORAGE-009] 스토리지 파일 영구 삭제",
    description=(
        "휴지통의 파일을 되돌릴 수 없게 지운다. 파일 본문과 기록을 함께 없앤다. "
        "휴지통을 거치지 않은 파일은 지울 수 없다(400). "
        "지운 사람, 올린 사람, 그 부서의 팀장, 조직 관리 권한자가 지울 수 있다."
    ),
    responses={
        400: {"description": "휴지통에 없는 항목이다"},
        403: {"description": "지울 권한이 없다"},
        404: {"description": "대상이 없거나 접근 범위 밖이다"},
    },
)
async def purge(
    body: StorageIdsRequest,
    actor: StorageActor = Depends(get_actor),
    service: StorageInboundPort = Depends(get_storage_service),
) -> StorageAffectedResponse:
    try:
        affected = await service.purge(
            actor.organization_id, actor.user_id, _to_scope(body.scope), body.ids
        )
    except (ValueError, PermissionError, LookupError) as exc:
        raise _http_error(exc) from exc
    return StorageAffectedResponse(affected=affected)
