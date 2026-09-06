"""실제 로컬 FS 어댑터(스토리지/아카이브) 왕복 테스트: 공용 local_fs 리팩터 안전망.

기존 서비스 테스트는 FakeStorage 를 쓰므로 실제 어댑터 경로가 커버되지 않았다. 여기서
LocalFilesystemStorageAdapter/LocalFilesystemArchiveAdapter 를 tmp_path 에 직접 돌려
원자적 쓰기/읽기/삭제/루트 탈출 차단을 검증한다.
"""

from __future__ import annotations

import pytest

from app.domains.upload.adapters.outbound.archive.local_archive import (
    LocalFilesystemArchiveAdapter,
)
from app.domains.upload.adapters.outbound.storage.local_storage import (
    LocalFilesystemStorageAdapter,
)


async def _agen(*chunks: bytes):
    for c in chunks:
        yield c


def _storage(tmp_path) -> LocalFilesystemStorageAdapter:
    return LocalFilesystemStorageAdapter(
        storage_root=str(tmp_path / "s"),
        public_base_url="http://x",
        url_secret="k",
        url_ttl_seconds=60,
    )


async def test_storage_write_stream_roundtrip(tmp_path) -> None:
    s = _storage(tmp_path)
    n = await s.write_stream("a/b/c", _agen(b"foo", b"bar"))
    assert n == 6
    assert await s.exists("a/b/c")
    got = b""
    async for chunk in s.open_read_stream("a/b/c"):
        got += chunk
    assert got == b"foobar"
    assert s.fs_path("a/b/c") is not None
    await s.delete("a/b/c")
    assert not await s.exists("a/b/c")
    assert s.fs_path("a/b/c") is None


async def test_storage_write_bytes_roundtrip(tmp_path) -> None:
    s = _storage(tmp_path)
    await s.write("k/v", b"abc")
    assert await s.exists("k/v")


async def test_storage_rejects_traversal(tmp_path) -> None:
    s = _storage(tmp_path)
    assert await s.exists("../escape") is False
    with pytest.raises(ValueError):
        await s.write_stream("../escape", _agen(b"x"))


async def test_archive_write_stream_and_exists(tmp_path) -> None:
    a = LocalFilesystemArchiveAdapter(archive_root=str(tmp_path / "arch"))
    n = await a.write_stream("groupware/7/uuid", _agen(b"zzz"))
    assert n == 3
    assert await a.exists("groupware/7/uuid")
    assert await a.exists("nope") is False
    with pytest.raises(ValueError):
        await a.write_stream("../escape", _agen(b"x"))
