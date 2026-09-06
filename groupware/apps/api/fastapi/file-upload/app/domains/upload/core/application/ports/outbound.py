"""Outbound Port: 외부 의존성 계약 (service 가 사용, adapters 가 구현). Protocol 로 선언."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from ...domain.entities import UploadAsset
from ...domain.types import StorageListQuery, StorageUsageSummary


class UploadRepositoryPort(Protocol):
    async def save(self, asset: UploadAsset) -> UploadAsset: ...

    async def find_by_id(self, upload_id: str) -> UploadAsset | None: ...

    async def find_by_ids(self, ids: list[str]) -> list[UploadAsset]:
        """여러 id 를 한 번에 조회: 존재하는 것만 반환(사전검증 배치 조회용)."""
        ...

    async def find_by_idempotency_key(self, key: str) -> UploadAsset | None: ...

    async def find_by_organization_id(self, organization_id: int) -> list[UploadAsset]:
        """조직 소유 자산 전체 조회: 조직 삭제/아카이브 시 파일 집합 열거용(소유 인덱스 기준)."""
        ...

    async def delete_by_id(self, upload_id: str) -> bool:
        """에셋 메타 행 삭제: 삭제됐으면 True, 없었으면 False."""
        ...

    async def find_pending_before(
        self, cutoff: datetime, limit: int
    ) -> list[UploadAsset]:
        """cutoff 이전에 만들어진 PENDING 자산: 수거 대상 열거용.

        PENDING 만 고른다. UPLOADED 는 누가 참조하는지 이 서버가 알 수 없어 판정할 수 없다
        (그 판정을 여기 넣으면 자산 소유권 경계가 깨진다). PENDING 은 presign 만 받고 끝난 것이거나
        그 자산을 쓰려던 쓰기가 실패한 것이라, 시간이 지났으면 어느 쪽이든 쓰이지 않는다.
        """
        ...

    # 스토리지 화면 (storage_area IS NOT NULL 인 자산만)

    async def find_storage_page(
        self, query: StorageListQuery
    ) -> tuple[list[UploadAsset], int]:
        """한 영역의 자산 한 페이지와 조건에 걸린 전체 건수. 한 번의 조회로 둘 다 얻는다."""
        ...

    async def mark_storage_trashed(
        self, ids: list[str], deleted_by_user_id: int, deleted_at: datetime
    ) -> int:
        """여러 자산을 한 문장으로 휴지통에 넣는다. 바뀐 행 수를 돌려준다."""
        ...

    async def mark_storage_restored(self, ids: list[str], updated_at: datetime) -> int:
        """여러 자산을 한 문장으로 복원한다."""
        ...

    async def rename_storage_asset(
        self, upload_id: str, file_name: str, updated_at: datetime
    ) -> None:
        """표시 이름만 바꾼다(저장 경로와 상태는 건드리지 않는다)."""
        ...

    async def confirm_storage_asset(self, upload_id: str, updated_at: datetime) -> None:
        """PENDING → UPLOADED 로 올린다."""
        ...

    async def delete_by_ids(self, ids: list[str]) -> int:
        """여러 메타 행을 한 문장으로 삭제한다. 지워진 행 수를 돌려준다."""
        ...

    async def summarize_storage_usage(
        self,
        organization_id: int,
        user_id: int,
        department_ids: tuple[int, ...] | None,
    ) -> StorageUsageSummary:
        """호출자가 볼 수 있는 범위의 사용량 요약. department_ids 가 None 이면 전 부서."""
        ...


@dataclass(frozen=True)
class PutGrant:
    """서명된 업로드 토큰에서 복원한 PUT 허가: 어떤 키에 무엇을 쓸 수 있는지."""

    upload_id: str
    object_key: str
    mime_type: str
    size: int


class StoragePort(Protocol):
    """1차 스토리지 계약: 로컬 파일시스템 어댑터가 구현(추후 NAS/S3 어댑터로 교체 가능)."""

    def presigned_put_url(
        self, *, upload_id: str, object_key: str, mime_type: str, size: int
    ) -> str:
        """브라우저가 바이트를 직접 PUT 할 서명 URL(BFF 우회)."""
        ...

    def download_url(self, upload_id: str) -> str:
        """브라우저가 파일을 GET 할 접근 URL(비서명: nginx vhost 정책만). require_signed_download 시엔 미사용."""
        ...

    def signed_download_url(self, upload_id: str) -> str:
        """조직 스코프로 발급된 서명 접근 URL(?token=…, TTL). require_signed_download 시 GET 은 이 토큰을 요구.

        스토리지 자산에는 발급하지 않는다(services.mint_access_urls 가 걸러낸다). 그 파일들은
        조직 안에서만 오가야 해서, 가진 사람 누구나 여는 무기명 주소를 만들지 않는다.
        """
        ...

    def verify_put_token(self, token: str) -> PutGrant | None:
        """presigned PUT 토큰 검증: 유효하면 PutGrant, 아니면 None."""
        ...

    def verify_download_token(self, token: str) -> str | None:
        """서명 다운로드(GET) 토큰 검증: 유효하면 대상 upload_id, 아니면 None."""
        ...

    async def write(self, object_key: str, data: bytes) -> None:
        """스토리지에 바이트 저장(원자적 temp->commit, STORAGE_ROOT 밖 차단)."""
        ...

    async def write_stream(
        self, object_key: str, chunks: AsyncIterator[bytes]
    ) -> int:
        """스트리밍 저장(원자적 temp->commit). 기록한 총 바이트 수 반환."""
        ...

    async def exists(self, object_key: str) -> bool: ...

    async def delete(self, object_key: str) -> None:
        """스토리지에서 객체 삭제(없으면 무시). 로컬은 실패를 삼켜 best-effort."""
        ...

    def open_read_stream(self, object_key: str) -> AsyncIterator[bytes]:
        """저장된 객체를 청크 스트림으로 읽는다(아카이브 복사용). 없으면 빈 스트림."""
        ...

    def fs_path(self, object_key: str) -> str | None:
        """다운로드 서빙용 로컬 파일 경로(없으면 None). FileResponse 가 Range 처리."""
        ...


class ArchivePort(Protocol):
    """2차(선별) 아카이브 저장소 계약: 조직 하드 삭제 시 1차에서 옮겨 보관.

    1차 StoragePort 와 직교(별개 저장소). 현재 로컬/마운트 어댑터만 구현하며,
    NAS/오브젝트 스토리지로 교체 시 이 포트만 새 어댑터로 바꾼다(container._build_archive).
    """

    async def write_stream(
        self, object_key: str, chunks: AsyncIterator[bytes]
    ) -> int:
        """아카이브에 스트리밍 저장(원자적). 기록한 총 바이트 수 반환. object_key 는 1차와 동일 유지."""
        ...

    async def exists(self, object_key: str) -> bool: ...
