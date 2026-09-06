"""도메인 DI wiring: Port → 구현 바인딩 (파일 업로드).

router(`/uploads`)/public_router(`/blob`,`/files`) 와 서비스 조립 provider 를 노출한다.
실제 등록은 app/container.py 와 app/main.py 에서 한다.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from .adapters.inbound.http.router import public_router, router
from .adapters.inbound.http.storage_router import router as storage_router
from .adapters.outbound.db.repository import UploadRepository
from .core.application.ports.inbound import StorageInboundPort, UploadInboundPort
from .core.application.ports.outbound import ArchivePort, StoragePort
from .core.application.services import UploadService
from .core.application.storage_service import StorageService

__all__ = [
    "router",
    "public_router",
    "storage_router",
    "build_upload_service",
    "build_storage_service",
]


def build_upload_service(
    session: AsyncSession,
    storage: StoragePort,
    archive: ArchivePort,
    max_upload_size: int,
    require_signed_download: bool = False,
) -> UploadInboundPort:
    """Outbound Port(Repository, Storage, Archive) → Service 조립."""
    repository = UploadRepository(session)
    return UploadService(
        repository, storage, archive, max_upload_size, require_signed_download
    )


def build_storage_service(
    session: AsyncSession,
    storage: StoragePort,
    max_upload_size: int,
) -> StorageInboundPort:
    """스토리지 화면 서비스 조립. 아카이브는 쓰지 않는다(조직 하드 삭제는 업로드 서비스 몫)."""
    repository = UploadRepository(session)
    return StorageService(repository, storage, max_upload_size)
