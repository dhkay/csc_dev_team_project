"""Inbound Adapter: APIRouter -> Inbound Port 호출. ORM/스토리지 SDK 를 직접 import 하지 않는다.

- router(`/uploads`): presign/confirm: BFF 가 서비스토큰으로 호출(내부).
- public_router(`/blob`, `/files`): 브라우저가 직접 호출: ServiceTokenMiddleware 예외 + nginx 공인 IP 제한.
  PUT /blob 은 서명 업로드토큰으로 추가 보호.
"""

from __future__ import annotations

from datetime import timedelta
from urllib.parse import quote

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse

from csc_net_utils import require_services, verify_service_token

from app.config import get_settings
from ....core.application.ports.inbound import UploadInboundPort
from ....core.domain.entities import UploadAsset
from . import mappers
from .schemas import (
    AccessUrlsRequest,
    AccessUrlsResponse,
    AssetStatusItem,
    AssetStatusRequest,
    CreatePresignRequest,
    PresignResponse,
    ReapPendingResponse,
    UploadAssetResponse,
)

# presign 은 web BFF(사용자 업로드 중계)만, store 는 worker(video-model)만 호출.
_BFF_CALLERS = ("web-groupware", "web-control-tower")

# 확인(confirm)은 BFF 뿐 아니라 소비 서버도 부른다.
#   그 자산을 참조할 행을 만드는 쪽이 확인까지 함께 하면, 그 쓰기가 실패했을 때 자산이 PENDING 으로
#   남아 수거 대상이 된다(참조 없는 UPLOADED 가 생기지 않는다). 브라우저가 미리 확인해 버리면
#   그 고아는 아무도 거두지 못한다: 참조 여부를 아는 것은 소비 서버이고 이 서버가 아니다.
#   계약과 근거: docs/specs/marketing-write-consistency.md
_CONFIRM_CALLERS = (*_BFF_CALLERS, "csc-marketing")

# XSS 방지: 이 타입만 같은 오리진에서 inline 렌더 허용(선언 mime 그대로). 그 외(text/html,
# application/xml 등 활성 콘텐츠 가능)는 attachment + octet-stream 으로 강제 다운로드.
# image/svg+xml 은 inline 허용하되, 직접 내비게이션 시 스크립트 실행을 CSP 로 차단(아래 get_file).
# (<img> 로 로드된 SVG 는 스크립트 미실행: 위험은 SVG 를 문서로 직접 여는 경우뿐.)
INLINE_SAFE_TYPES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/svg+xml",
        "video/mp4",
        "video/webm",
        "audio/mpeg",
        "audio/mp4",
        "application/pdf",
        "text/plain",
        # 폰트(제목/자막 번인용 FONT 에셋): 정확한 content-type 으로 inline 서빙(video-model fetch/미리보기 보조).
        "font/ttf",
        "font/otf",
        "font/sfnt",
        "application/x-font-ttf",
        "application/vnd.ms-opentype",
    }
)

# SVG 직접 내비게이션 시 스크립트/외부리소스 차단(인라인 스타일만 허용): 저장형 XSS 방어.
_SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'"


def get_upload_service() -> UploadInboundPort:
    # 실제 provider 는 app/container.py 에서 오버라이드된다.
    raise NotImplementedError


router = APIRouter(prefix="/uploads", tags=["upload"])
public_router = APIRouter(tags=["files"])


@router.post(
    "/presign",
    response_model=PresignResponse,
    summary="[UPLOAD-001] presigned URL 발급",
    dependencies=[Depends(require_services(*_BFF_CALLERS))],
)
async def create_presign(
    body: CreatePresignRequest,
    service: UploadInboundPort = Depends(get_upload_service),
) -> PresignResponse:
    try:
        asset, presigned_url = await service.create_presign(
            body.file_name,
            body.mime_type,
            body.size,
            body.scope,
            body.partition,
            body.organization_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return mappers.to_presign_response(asset, presigned_url)


@router.post(
    "/store",
    response_model=UploadAssetResponse,
    summary="[UPLOAD-002] 처리 결과 저장",
    dependencies=[Depends(require_services("video-model"))],
)
async def store_result(
    request: Request,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=1),
    file_name: str = Header("result", alias="X-File-Name"),
    organization_id: int | None = Header(None, alias="X-Organization-Id"),
    service: UploadInboundPort = Depends(get_upload_service),
) -> UploadAssetResponse:
    # worker -> file-service: 결과 파일 스트리밍 저장(멱등). file-service 가 디스크, 메타 단독 기록.
    # org 헤더가 있으면 소유 귀속(영상 산출물도 조직 삭제/아카이브/접근통제 대상이 되게).
    mime_type = request.headers.get("content-type") or "application/octet-stream"
    asset = await service.store_result(
        idempotency_key,
        file_name,
        mime_type,
        request.stream(),
        organization_id,
    )
    return mappers.to_asset_response(asset, service.download_url(asset.id))


@router.post(
    "/{upload_id}/confirm",
    response_model=UploadAssetResponse,
    summary="[UPLOAD-003] 업로드 확인",
    dependencies=[Depends(require_services(*_CONFIRM_CALLERS))],
)
async def confirm(
    upload_id: str,
    service: UploadInboundPort = Depends(get_upload_service),
) -> UploadAssetResponse:
    try:
        asset = await service.confirm(upload_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return mappers.to_asset_response(asset, service.download_url(asset.id))


@router.delete(
    "/{upload_id}",
    summary="[UPLOAD-004] 업로드 에셋 삭제(스토리지 바이트 + 메타)",
    dependencies=[Depends(require_services("csc-marketing"))],
)
async def delete_upload(
    upload_id: str,
    service: UploadInboundPort = Depends(get_upload_service),
) -> dict:
    # 소유 도메인(csc-marketing saved-plan)이 저장본 삭제 시 참조 이미지를 정리(cascade). 멱등.
    deleted = await service.delete(upload_id)
    return {"deleted": deleted}


@router.post(
    "/organizations/{organization_id}/archive-and-delete",
    summary="[UPLOAD-006] 조직 자산 아카이브 후 1차 삭제(하드 삭제 정리)",
    dependencies=[Depends(require_services("csc-control-tower"))],
)
async def archive_and_delete_organization(
    organization_id: int,
    service: UploadInboundPort = Depends(get_upload_service),
) -> dict:
    # 조직 하드 삭제(purge) 시 control-tower 가 호출: 그 조직 소유 자산을 2차 아카이브로 옮기고 1차 삭제. 멱등.
    archived = await service.archive_and_delete_organization(organization_id)
    return {"archived": archived}


@router.post(
    "/access-urls",
    response_model=AccessUrlsResponse,
    summary="[UPLOAD-007] 서명 접근 URL 배치 발급(조직 스코프)",
    dependencies=[Depends(require_services(*_BFF_CALLERS))],
)
async def mint_access_urls(
    body: AccessUrlsRequest,
    service: UploadInboundPort = Depends(get_upload_service),
) -> AccessUrlsResponse:
    # BFF 가 렌더 시 호출: 자기 조직 자산만(all_orgs=플랫폼 ROOT) 서명 URL 발급. 권한 밖 id 는 누락.
    urls = await service.mint_access_urls(body.ids, body.organization_id, body.all_orgs)
    return AccessUrlsResponse(urls=urls)


@router.post(
    "/reap-pending",
    response_model=ReapPendingResponse,
    summary="[UPLOAD-008] 확정되지 않은 오래된 업로드 정리",
    description=(
        "업로드가 시작만 되고 끝나지 않은 자산을 지운다. 업로드 주소만 받고 파일을 보내지 않은 경우와, "
        "파일은 올라왔지만 그것을 쓰려던 저장이 실패한 경우가 여기 해당한다. "
        "지정한 시간(기본 24시간)보다 오래된 것만 지우므로 진행 중인 업로드는 건드리지 않는다. "
        "완료된 자산은 어떤 경우에도 지우지 않는다. "
        "같은 일을 하는 정리 작업이 매일 한 번 자동으로 돌며, 이 경로는 즉시 정리해야 하는 운영 상황에서 "
        "사용한다. 여러 번 요청해도 안전하다. "
        "한 번에 지우는 수에 상한이 있어, 응답의 has_more 가 참이면 남은 것이 더 있다는 뜻이다."
    ),
    dependencies=[Depends(require_services(*_BFF_CALLERS))],
)
async def reap_pending(
    service: UploadInboundPort = Depends(get_upload_service),
) -> ReapPendingResponse:
    settings = get_settings()
    result = await service.reap_pending_assets(
        timedelta(hours=settings.pending_reap_after_hours),
        settings.pending_reap_batch_limit,
    )
    return ReapPendingResponse(deleted=result.deleted, has_more=result.has_more)


@router.post(
    "/status",
    response_model=list[AssetStatusItem],
    summary="[UPLOAD-005] 에셋 상태 배치 조회(사전검증)",
    dependencies=[Depends(require_services("csc-marketing", "video-model"))],
)
async def get_statuses(
    body: AssetStatusRequest,
    service: UploadInboundPort = Depends(get_upload_service),
) -> list[AssetStatusItem]:
    # 렌더 등록 전 사전검증: 존재하는 id 만 반환(없는 id 는 호출측이 MISSING 으로 처리).
    statuses = await service.get_statuses(body.ids)
    return [AssetStatusItem(id=i, status=s) for i, s in statuses.items()]


@public_router.put("/blob", summary="[FILES-001] 브라우저 직접 업로드(PUT)")
async def put_blob(
    request: Request,
    token: str = Query(..., min_length=1),
    service: UploadInboundPort = Depends(get_upload_service),
) -> dict:
    # 본문을 통째로 메모리에 올리지 않고 스트리밍으로 저장한다. 스토리지 화면이 200MB 까지 받으므로
    #   동시 업로드 몇 건이면 그것만으로 서버가 죽는다. 허가 크기 초과는 받는 중에 끊는다.
    try:
        await service.store_blob_stream(token, request.stream())
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@public_router.get("/files/{upload_id}", summary="[FILES-002] 브라우저 직접 다운로드(GET)")
async def get_file(
    upload_id: str,
    request: Request,
    token: str | None = Query(None),
    service: UploadInboundPort = Depends(get_upload_service),
) -> FileResponse:
    # 내부 서비스(video-model worker 등)는 유효 X-Service-Token 이면 서명 다운로드 토큰 없이 허용
    # (원본 fetch 경로). 브라우저는 서비스토큰이 없으므로 require_signed_download 시 서명 토큰 필수.
    internal = False
    svc_token = request.headers.get("X-Service-Token")
    if svc_token:
        settings = get_settings()
        internal = (
            verify_service_token(
                svc_token, settings.service_token_secret, settings.allowed_services_set
            )
            is not None
        )
    # require_signed_download 면 service 가 서명 토큰(대상 upload_id 일치)을 검증 → 실패 시 403.
    try:
        asset, path = await service.get_download(upload_id, token, internal)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return build_file_response(asset, path)


def build_file_response(asset: UploadAsset, path: str) -> FileResponse:
    """저장된 파일 하나를 내려주는 응답. 서빙 규칙을 여기 한 곳에 둔다.

    스토리지 경로(storage_router)도 이 함수를 쓴다. 마임 판정과 Content-Disposition 을 각자
    적으면 한쪽만 고쳐졌을 때 같은 파일이 경로에 따라 다르게 열린다(예: SVG 가 한쪽에서만 실행된다).
    """
    # 안전 타입만 선언 mime + inline, 그 외는 octet-stream + attachment(저장형 XSS 차단).
    safe = asset.mime_type in INLINE_SAFE_TYPES
    media_type = asset.mime_type if safe else "application/octet-stream"
    disp = "inline" if safe else "attachment"
    # 비ASCII(한글) 파일명 대응: RFC 5987 filename*.
    disposition = f"{disp}; filename*=UTF-8''{quote(asset.file_name)}"
    headers = {
        "Content-Disposition": disposition,
        "X-Content-Type-Options": "nosniff",
    }
    # SVG inline 서빙: 직접 내비게이션 시 스크립트 실행 차단(<img> 로드는 원래 미실행).
    if media_type == "image/svg+xml":
        headers["Content-Security-Policy"] = _SVG_CSP
    # FileResponse 가 Range(206/Accept-Ranges), sendfile 을 처리 -> 영상 재생/시킹 지원.
    return FileResponse(path, media_type=media_type, headers=headers)
