"""Inbound Port 구현 = 비즈니스 로직 (파일 업로드).

외부(FastAPI/SQLAlchemy/스토리지)를 모르고 Outbound Port(Protocol)만 주입받는다.
1차 스토리지(로컬 파일시스템)에 2-step(presign->PUT->confirm)으로 저장하고 GET 으로 서빙한다.
영상 처리/FFmpeg 는 이 서버의 책임이 아니다(video-model 가 담당).
"""

from __future__ import annotations

import re
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone

from ..domain.entities import UploadAsset
from ..domain.types import ReapResult, UploadStatus
from .ports.outbound import ArchivePort, StoragePort, UploadRepositoryPort


# 업로드 저장 폴더 화이트리스트(앱별 분리). 임의 폴더 생성/traversal 방지.
#   platform           -> platform/<uuid>
#   groupware + 조직ID  -> groupware/<orgId>/<uuid>   (그룹웨어는 조직별 하위 분리 필수)
ALLOWED_SCOPES = frozenset({"platform", "groupware"})
# 하위 폴더 계층(조직/AI도구/개인 or 보관함 등): 슬래시로 계층을 담되 각 세그먼트는 소문자/숫자/하이픈만
# (빈 세그먼트/`..`/앞뒤, 연속 슬래시 불가 → traversal 차단). 예: "{orgId}/marketing-video/personal/{userId}", "{orgId}".
# 주의: 각 세그먼트는 반드시 불변 식별자(조직 PK, userId 등)여야 한다. 조직명/slug 는 가변이라
#       (multi-tenancy.md: slug 변경 허용) 경로에 쓰면 이름 변경 시 신규 업로드가 다른 폴더로
#       가서 기존 파일과 분리(고아)된다. 호출 측(BFF)이 불변 식별자로 구성: 이 서비스는 형식만 검증.
_PARTITION_SEGMENT_RE = re.compile(r"^[a-z0-9-]+$")


def is_valid_partition(partition: str) -> bool:
    """슬래시 계층 partition 검증: 각 세그먼트가 [a-z0-9-]+ (빈 세그먼트/`..`/앞뒤, 연속 슬래시 거부)."""
    segments = partition.split("/")
    return bool(segments) and all(_PARTITION_SEGMENT_RE.match(s) for s in segments)


class UploadService:
    def __init__(
        self,
        repository: UploadRepositoryPort,
        storage: StoragePort,
        archive: ArchivePort,
        max_upload_size: int,
        require_signed_download: bool = False,
    ) -> None:
        self._repository = repository
        self._storage = storage
        self._archive = archive
        self._max_upload_size = max_upload_size
        self._require_signed_download = require_signed_download

    async def create_presign(
        self,
        file_name: str,
        mime_type: str,
        size: int,
        scope: str,
        partition: str | None = None,
        organization_id: int | None = None,
    ) -> tuple[UploadAsset, str]:
        if size <= 0 or size > self._max_upload_size:
            raise ValueError("invalid file size")
        if scope not in ALLOWED_SCOPES:
            raise ValueError("invalid scope")
        # 그룹웨어는 조직(테넌트)별 하위 폴더로 분리: partition(조직 식별자) 필수.
        if scope == "groupware" and not partition:
            raise ValueError("groupware scope requires a partition (organization id)")
        if partition is not None and not is_valid_partition(partition):
            raise ValueError("invalid partition")
        upload_id = str(uuid.uuid4())
        # object_key = "{scope}[/{partition}]/{서버 UUID}": 사용자 파일명 비사용 +
        # 화이트리스트 스코프/검증된 partition 으로 경로 traversal 원천 차단.
        # 원본 file_name 은 DB 에만 보관(다운로드 표시용).
        prefix = f"{scope}/{partition}" if partition else scope
        object_key = f"{prefix}/{upload_id}"
        presigned_url = self._storage.presigned_put_url(
            upload_id=upload_id, object_key=object_key, mime_type=mime_type, size=size
        )
        asset = UploadAsset(
            id=upload_id,
            file_name=file_name,
            mime_type=mime_type,
            size=size,
            object_key=object_key,
            status=UploadStatus.PENDING,
            created_at=datetime.now(timezone.utc),
            # 소유 인덱스: 경로(partition)와 별개로 컬럼에 귀속 기록(조회/삭제/접근통제 기준).
            scope=scope,
            organization_id=organization_id,
        )
        await self._repository.save(asset)
        return asset, presigned_url

    async def store_blob_stream(
        self, token: str, chunks: AsyncIterator[bytes]
    ) -> None:
        """브라우저 PUT 을 스트리밍으로 저장한다(본문을 통째로 메모리에 올리지 않는다).

        200MB 짜리 파일 하나가 요청 처리 중 메모리에 그대로 얹히면 동시 업로드 몇 건에 서버가
        죽는다. 허가된 크기를 넘어서면 그 자리에서 끊는다(다 받은 뒤 재는 것은 늦다).

        선언한 크기와 정확히 같을 때만 커밋한다. 업로드가 중간에 끊기면 보통 스트림이
        예외로 끝나 임시파일이 지워지지만(write_stream_atomic), 앞단 프록시가 본문을 일찍 닫으면
        짧은 본문이 정상 종료처럼 도착할 수 있다. 그때 커밋해 버리면 잘린 파일이 확정 가능한
        상태가 되어, 목록에는 멀쩡해 보이는 깨진 파일이 남는다. 마지막에 한 번 더 재는 이유다.
        """
        grant = self._storage.verify_put_token(token)
        if grant is None:
            raise PermissionError("invalid or expired upload token")

        async def _guarded() -> AsyncIterator[bytes]:
            written = 0
            async for chunk in chunks:
                written += len(chunk)
                if written > grant.size:
                    raise ValueError("payload exceeds declared size")
                yield chunk
            if written != grant.size:
                # 생성기에서 던지면 write_stream_atomic 이 임시파일을 지우고 커밋하지 않는다.
                raise ValueError("payload is shorter than declared size")

        await self._storage.write_stream(grant.object_key, _guarded())

    async def confirm(self, upload_id: str) -> UploadAsset:
        asset = await self._repository.find_by_id(upload_id)
        if asset is None:
            raise ValueError("upload asset not found")
        if not await self._storage.exists(asset.object_key):
            raise ValueError("file not uploaded yet")
        asset.status = UploadStatus.UPLOADED
        return await self._repository.save(asset)

    async def delete(self, upload_id: str) -> bool:
        asset = await self._repository.find_by_id(upload_id)
        if asset is None:
            return False
        # 스토리지 바이트 삭제(로컬은 best-effort, 예외 없음) 후 메타 행 삭제.
        await self._storage.delete(asset.object_key)
        return await self._repository.delete_by_id(upload_id)

    async def reap_pending_assets(
        self, older_than: timedelta, limit: int
    ) -> ReapResult:
        cutoff = datetime.now(timezone.utc) - older_than
        assets = await self._repository.find_pending_before(cutoff, limit)
        for asset in assets:
            # 바이트가 있을 수도(PUT 은 됐고 확정만 안 됨) 없을 수도(presign 만) 있다. 로컬 삭제는
            #   없는 객체를 조용히 넘긴다(StoragePort 계약).
            await self._storage.delete(asset.object_key)
            await self._repository.delete_by_id(asset.id)
        # 한 번에 limit 까지만 본다. 꽉 찼으면 남은 후보가 더 있다는 뜻이라 호출부가 다시 부를 수 있다.
        return ReapResult(deleted=len(assets), has_more=len(assets) >= limit)

    async def archive_and_delete_organization(self, organization_id: int) -> int:
        """조직 소유 자산을 2차 아카이브로 옮긴 뒤 1차에서 삭제(하드 삭제 정리). 멱등.

        - UPLOADED: 1차 → 아카이브 복사 → 1차 바이트 삭제 → status=ARCHIVED(메타 보존, 복구 여지).
        - PENDING: 디스크에 바이트 없음 → 메타 행만 삭제.
        - ARCHIVED: 이미 처리됨 → 건너뜀(재호출 안전).

        반환: 아카이브로 옮긴 자산 수. object_key 는 1차와 동일하게 유지한다.
        """
        assets = await self._repository.find_by_organization_id(organization_id)
        archived = 0
        for asset in assets:
            if asset.status is UploadStatus.ARCHIVED:
                continue
            if asset.status is UploadStatus.PENDING:
                await self._repository.delete_by_id(asset.id)
                continue
            # UPLOADED: 1차 → 아카이브 복사 후 1차 바이트 삭제(메타는 ARCHIVED 로 보존).
            if await self._storage.exists(asset.object_key):
                await self._archive.write_stream(
                    asset.object_key, self._storage.open_read_stream(asset.object_key)
                )
                await self._storage.delete(asset.object_key)
            asset.status = UploadStatus.ARCHIVED
            await self._repository.save(asset)
            archived += 1
        return archived

    async def get_download(
        self, upload_id: str, token: str | None = None, internal: bool = False
    ) -> tuple[UploadAsset, str]:
        # 조직 스코프 접근통제: require_signed_download 면 서명 GET 토큰(대상 upload_id 일치)을 요구.
        # (토큰은 BFF 가 org 확인 후 서명한 것. 검증만 하면 인가 완료.)
        # internal=True(유효 서비스토큰 = 내부 서비스/worker 원본 fetch)면 서명 요구를 우회한다.
        if self._require_signed_download and not internal:
            verified = (
                self._storage.verify_download_token(token) if token else None
            )
            if verified != upload_id:
                raise PermissionError("signed access token required")
        asset = await self._repository.find_by_id(upload_id)
        if asset is None or asset.status is not UploadStatus.UPLOADED:
            raise ValueError("file not available")
        if asset.storage_area is not None and not internal:
            # 스토리지(공통/조직/개인) 파일은 이 경로로 나가지 않는다. 여기는 무기명 주소라,
            #   한 번 밖으로 복사되면 로그인 없는 외부 공개가 된다. 조직 파일에는 그런 주소가
            #   아예 없어야 하므로 서명 토큰이 유효하더라도(또는 게이트를 꺼도) 막는다.
            #   읽는 길은 서비스토큰을 가진 내부 호출자(web BFF)의 /storage/files/{id}/content 뿐이다.
            raise ValueError("file not available")
        path = self._storage.fs_path(asset.object_key)
        if path is None:
            raise ValueError("file not available")
        return asset, path

    async def mint_access_urls(
        self, ids: list[str], organization_id: int | None, all_orgs: bool
    ) -> dict[str, str]:
        """서명 접근 URL 배치 발급: 소유 인덱스로 org 스코프 강제(BFF 가 렌더 시 호출).

        all_orgs(플랫폼 ROOT) 이거나 asset.organization_id == organization_id 일 때만 발급한다.
        존재하지 않거나 권한 밖인 id 는 결과에서 누락(호출측이 미표시 처리).

        스토리지 자산은 어떤 경우에도 발급하지 않는다. 여기는 조직만 보고 영역과 소유자를
        보지 않으므로, 허용하면 uploadId 를 아는 같은 조직 사람이 남의 개인 파일 주소를 받아
        가고 그 주소는 로그인 없이 열린다. 스토리지 파일을 읽는 길은 /storage/files/{id}/content
        하나뿐이다.
        """
        assets = await self._repository.find_by_ids(ids)
        out: dict[str, str] = {}
        for asset in assets:
            if asset.status is not UploadStatus.UPLOADED:
                continue
            if asset.storage_area is not None:
                continue
            if all_orgs or (
                organization_id is not None
                and asset.organization_id == organization_id
            ):
                out[asset.id] = self._storage.signed_download_url(asset.id)
        return out

    async def get_statuses(self, ids: list[str]) -> dict[str, UploadStatus]:
        # 존재하는 에셋만 매핑에 담는다. 없는 id 는 호출측(사전검증)이 MISSING 으로 본다.
        assets = await self._repository.find_by_ids(ids)
        return {a.id: a.status for a in assets}

    async def store_result(
        self,
        idempotency_key: str,
        file_name: str,
        mime_type: str,
        chunks: AsyncIterator[bytes],
        organization_id: int | None = None,
    ) -> UploadAsset:
        # 멱등: 같은 job_id 로 이미 저장됐으면 스트림을 읽지 않고 기존 에셋 반환.
        existing = await self._repository.find_by_idempotency_key(idempotency_key)
        if existing is not None:
            return existing
        new_id = str(uuid.uuid4())
        size = await self._storage.write_stream(new_id, chunks)
        asset = UploadAsset(
            id=new_id,
            file_name=file_name,
            mime_type=mime_type,
            size=size,
            object_key=new_id,
            status=UploadStatus.UPLOADED,  # 서버간 저장은 즉시 완료 상태.
            created_at=datetime.now(timezone.utc),
            idempotency_key=idempotency_key,
            # 소유 인덱스: worker(video-model)가 org 컨텍스트를 헤더로 전달하면 귀속 기록
            # (그래야 영상 산출물도 조직 삭제/아카이브/접근통제 대상이 된다). 미전달이면 None.
            organization_id=organization_id,
        )
        return await self._repository.save(asset)

    def download_url(self, upload_id: str) -> str:
        # 서명 강제 시 confirm/store 응답 URL 도 서명본으로 준다(그 외엔 비서명: nginx vhost 정책).
        if self._require_signed_download:
            return self._storage.signed_download_url(upload_id)
        return self._storage.download_url(upload_id)
