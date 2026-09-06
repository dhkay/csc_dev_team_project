"""DI 조립: Depends provider 정의.

AsyncSession 팩토리(async_sessionmaker) + 오브젝트 스토리지 어댑터 + 업로드 서비스 provider 조립.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .config import Settings, get_settings
from .domains.upload.adapters.outbound.archive.local_archive import (
    LocalFilesystemArchiveAdapter,
)
from .domains.upload.adapters.outbound.storage.local_storage import (
    LocalFilesystemStorageAdapter,
)
from .domains.upload.core.application.ports.inbound import (
    StorageInboundPort,
    UploadInboundPort,
)
from .domains.upload.core.application.ports.outbound import ArchivePort, StoragePort
from .domains.upload.module import build_storage_service, build_upload_service


def _build_storage(settings: Settings) -> StoragePort:
    """STORAGE_BACKEND 로 스토리지 어댑터를 선택한다(환경별 인프라 교체 지점).

    StoragePort 만 구현하면 새 백엔드를 여기 한 줄로 꽂는다. NAS 는 마운트 FS 이므로
    backend=local 그대로 두고 STORAGE_ROOT 만 NAS 경로로 바꾸면 된다. 오브젝트 스토리지
    (s3/r2)는 별도 어댑터를 구현해 아래 분기에 추가: presigned URL/서빙 방식이 달라진다.
    """
    backend = settings.storage_backend
    if backend == "local":
        return LocalFilesystemStorageAdapter(
            storage_root=settings.storage_root,
            public_base_url=settings.public_upload_base_url,
            url_secret=settings.upload_url_secret,
            url_ttl_seconds=settings.upload_url_ttl_seconds,
            download_ttl_seconds=settings.download_url_ttl_seconds,
        )
    # elif backend in ("s3", "r2"): return S3StorageAdapter(...)
    raise ValueError(f"지원하지 않는 STORAGE_BACKEND: {backend!r} (지원: local)")


def _build_archive(settings: Settings) -> ArchivePort:
    """ARCHIVE_BACKEND 로 2차 아카이브 어댑터를 선택한다(1차 스토리지와 동형 교체 지점)."""
    backend = settings.archive_backend
    if backend == "local":
        return LocalFilesystemArchiveAdapter(archive_root=settings.archive_root)
    # elif backend in ("s3", "r2"): return S3ArchiveAdapter(...)
    raise ValueError(f"지원하지 않는 ARCHIVE_BACKEND: {backend!r} (지원: local)")


_settings = get_settings()
# DB 가 재시작하거나(배포/점검) 유휴 커넥션이 끊기면(pgbouncer/클라우드 PG idle timeout) 풀에 남은
#   커넥션은 죽어 있다. pre_ping 이 없으면 그걸 검사 없이 꺼내 써서 그 요청이 500 으로 죽는다.
#   증상은 `InterfaceError: connection is closed` 다.
_engine = create_async_engine(
    _settings.database_url,
    pool_pre_ping=True,
    pool_recycle=1800,
)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False)
_storage = _build_storage(_settings)
_archive = _build_archive(_settings)


async def get_session() -> AsyncIterator[AsyncSession]:
    # 요청 단위 트랜잭션: 정상 종료 시 commit, 예외 시 rollback.
    # (레포지토리는 flush 만 하므로 여기서 commit 하지 않으면 변경이 유실된다.)
    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def provide_upload_service(session: AsyncSession) -> UploadInboundPort:
    return build_upload_service(
        session,
        _storage,
        _archive,
        _settings.max_upload_size,
        _settings.require_signed_download,
    )


async def provide_storage_service(session: AsyncSession) -> StorageInboundPort:
    # 스토리지 화면은 상한이 따로다(문서/영상까지 올리는 공간이라 다른 경로보다 크다).
    return build_storage_service(session, _storage, _settings.storage_max_upload_size)
