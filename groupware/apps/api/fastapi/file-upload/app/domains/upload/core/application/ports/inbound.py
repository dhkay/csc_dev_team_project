"""Inbound Port: 서비스 호출 계약 (router 가 사용). Protocol 로 선언."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import timedelta
from typing import Protocol

from ...domain.entities import StorageListing, UploadAsset
from ...domain.types import (
    ReapResult,
    StorageScope,
    StorageSort,
    StorageUsageSummary,
    UploadStatus,
)


class UploadInboundPort(Protocol):
    async def create_presign(
        self,
        file_name: str,
        mime_type: str,
        size: int,
        scope: str,
        partition: str | None = None,
        organization_id: int | None = None,
    ) -> tuple[UploadAsset, str]:
        """업로드 에셋(PENDING) 생성 + 브라우저용 presigned PUT URL 반환.

        scope = 앱 폴더("platform"|"groupware"), partition = 하위 폴더(그룹웨어 조직 식별자).
        object_key = "{scope}[/{partition}]/{uuid}".
        organization_id = 소유 인덱스(경로와 별개로 컬럼 귀속): BFF 가 세션에서 도출해 전달.
        """
        ...

    async def store_result(
        self,
        idempotency_key: str,
        file_name: str,
        mime_type: str,
        chunks: AsyncIterator[bytes],
        organization_id: int | None = None,
    ) -> UploadAsset:
        """서버간 결과 저장(worker->file-service): 스트리밍, 멱등.

        idempotency_key(=media job_id) 로 선조회 -> 있으면 기존 에셋 반환(중복 차단).
        없으면 원자적 스트리밍 저장 후 UPLOADED 에셋 1행 기록.
        organization_id = worker 가 헤더로 전달한 소유 컨텍스트(있으면 귀속 기록).
        """
        ...

    async def confirm(self, upload_id: str) -> UploadAsset:
        """업로드 완료 확인(디스크 존재 검증) -> UPLOADED 로 전이."""
        ...

    async def reap_pending_assets(
        self, older_than: timedelta, limit: int
    ) -> ReapResult:
        """오래된 PENDING 자산을 거둔다(수거자). 거둔 수와 남은 후보 유무를 돌려준다.

        PENDING 만 거둔다. 그것은 presign 만 받고 끝난 업로드이거나, 그 자산을 쓰려던 쓰기가
        실패해 확정되지 않은 것이다. 어느 쪽이든 시간이 지나면 쓰이지 않는다.

        UPLOADED 는 손대지 않는다: 누가 참조하는지는 소비 서비스만 알고, 그 판정을 이 서버에 넣으면
        자산 소유권 경계가 깨진다. 그래서 소비 서비스가 확정을 맡고(참조 행을 만들 때 함께 확정한다)
        이 수거자는 확정되지 않은 것만 본다. 계약: docs/specs/marketing-write-consistency.md
        """
        ...

    async def delete(self, upload_id: str) -> bool:
        """에셋 삭제: 스토리지 바이트 + 메타 행 제거. 없으면 False(멱등)."""
        ...

    async def archive_and_delete_organization(self, organization_id: int) -> int:
        """조직 하드 삭제 정리: 조직 소유 자산을 2차 아카이브로 옮기고 1차에서 삭제. 멱등, 처리 수 반환."""
        ...

    async def get_download(
        self, upload_id: str, token: str | None = None, internal: bool = False
    ) -> tuple[UploadAsset, str]:
        """UPLOADED 에셋의 메타 + 로컬 파일 경로 반환(라우터가 FileResponse 로 서빙).

        require_signed_download 면 서명 GET 토큰(대상 upload_id 일치)을 요구한다(PermissionError).
        internal=True(유효 서비스토큰 = 내부 서비스/worker)면 서명 요구를 우회한다.
        """
        ...

    async def mint_access_urls(
        self, ids: list[str], organization_id: int | None, all_orgs: bool
    ) -> dict[str, str]:
        """서명 접근 URL 배치 발급: org 스코프 강제(all_orgs=ROOT). 권한 밖 id 는 누락."""
        ...

    async def get_statuses(self, ids: list[str]) -> dict[str, UploadStatus]:
        """여러 에셋 상태 배치 조회: 존재하는 id 만 매핑에 담는다(없는 id 는 누락 → 호출측이 MISSING 취급).

        렌더 등록 전 사전검증(csc-marketing)이 참조 에셋(씬 이미지/BGM/효과음)이 실제로 UPLOADED 인지
        한 번에 확인하는 용도. doomed 잡(업로드 안 된 id 참조)을 큐에 넣기 전에 걸러낸다.
        """
        ...

    async def store_blob_stream(
        self, token: str, chunks: AsyncIterator[bytes]
    ) -> None:
        """서명 토큰 검증 후 바이트를 스트리밍으로 기록(본문을 메모리에 통째로 올리지 않는다)."""
        ...

    def download_url(self, upload_id: str) -> str:
        """에셋 접근 URL."""
        ...


class StorageInboundPort(Protocol):
    """스토리지 화면(공통/조직/개인 파일 브라우저) 호출 계약.

    모든 메서드가 organization_id 와 user_id 를 신원 헤더에서 온 값으로 받고, 접근 범위는
    scope 로 받는다. 판정은 BFF, 집행은 서비스라는 계약을 시그니처가 드러낸다.
    """

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
        """한 영역의 확정된 파일 한 페이지 + 전체 건수."""
        ...

    async def usage(
        self,
        organization_id: int,
        user_id: int,
        department_ids: tuple[int, ...],
        can_manage_org: bool,
    ) -> StorageUsageSummary:
        """호출자가 볼 수 있는 범위의 영역별 사용량."""
        ...

    async def read_file(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        upload_id: str,
    ) -> tuple[UploadAsset, str]:
        """스코프로 인가한 뒤 파일의 저장 경로를 돌려준다(서명 URL 을 만들지 않는다)."""
        ...

    async def read_common_file(self, upload_id: str) -> tuple[UploadAsset, str]:
        """공통 영역 파일을 신원 없이 읽는다(공개 주소). 다른 영역이면 LookupError."""
        ...

    async def create_presign(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        file_name: str,
        mime_type: str,
        size: int,
    ) -> tuple[UploadAsset, str]:
        """영역별 저장 경로로 PENDING 자산 생성 + presigned PUT URL."""
        ...

    async def confirm(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        upload_id: str,
    ) -> UploadAsset:
        """업로드 확정(PENDING → UPLOADED). 이 전이 전까지 목록에 보이지 않는다."""
        ...

    async def discard(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        upload_id: str,
    ) -> bool:
        """확정되지 않은 업로드를 지금 버린다(취소). 확정된 파일은 거부한다.

        정리를 앞당기는 호출이라 실패해도 정확성이 깨지지 않는다(확정되지 않은 자산은 수거자가 거둔다).
        """
        ...

    async def rename(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        upload_id: str,
        file_name: str,
    ) -> UploadAsset:
        """표시/다운로드 이름 변경. 저장 경로는 건드리지 않는다."""
        ...

    async def trash(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        upload_ids: list[str],
    ) -> int:
        """휴지통 이동(바이트 보존). 실제로 옮긴 건수."""
        ...

    async def restore(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        upload_ids: list[str],
    ) -> int:
        """휴지통에서 복원. 실제로 되돌린 건수."""
        ...

    async def purge(
        self,
        organization_id: int,
        user_id: int,
        scope: StorageScope,
        upload_ids: list[str],
    ) -> int:
        """영구 삭제(바이트 먼저, 그다음 행). 휴지통에 없는 항목은 거부."""
        ...
