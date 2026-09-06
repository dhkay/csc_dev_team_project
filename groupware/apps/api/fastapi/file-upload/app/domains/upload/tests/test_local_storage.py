"""LocalFilesystemStorageAdapter 테스트: 실제 임시 디렉토리(tmp_path) 사용."""

from __future__ import annotations

import pathlib
from urllib.parse import unquote

import pytest

from app.domains.upload.adapters.outbound.storage.local_storage import (
    LocalFilesystemStorageAdapter,
)


def make_adapter(tmp_path) -> LocalFilesystemStorageAdapter:
    return LocalFilesystemStorageAdapter(
        storage_root=str(tmp_path),
        public_base_url="https://files.local",
        url_secret="test-secret",
        url_ttl_seconds=600,
    )


async def test_write_exists_path_roundtrip(tmp_path) -> None:
    adapter = make_adapter(tmp_path)
    await adapter.write("uid-1", b"hello-bytes")

    assert await adapter.exists("uid-1") is True
    p = adapter.fs_path("uid-1")
    assert p is not None
    assert pathlib.Path(p).read_bytes() == b"hello-bytes"


def test_fs_path_none_for_missing_or_traversal(tmp_path) -> None:
    adapter = make_adapter(tmp_path)
    assert adapter.fs_path("does-not-exist") is None
    assert adapter.fs_path("../../etc/passwd") is None


async def test_write_rejects_path_traversal(tmp_path) -> None:
    adapter = make_adapter(tmp_path)
    with pytest.raises(ValueError):
        await adapter.write("../escape", b"x")


async def test_exists_false_for_traversal(tmp_path) -> None:
    adapter = make_adapter(tmp_path)
    assert await adapter.exists("../../etc/passwd") is False


def test_token_sign_verify_roundtrip(tmp_path) -> None:
    adapter = make_adapter(tmp_path)
    url = adapter.presigned_put_url(
        upload_id="uid-1", object_key="uid-1", mime_type="image/png", size=10
    )
    token = unquote(url.split("token=", 1)[1])

    grant = adapter.verify_put_token(token)
    assert grant is not None
    assert grant.upload_id == "uid-1"
    assert grant.object_key == "uid-1"
    assert grant.size == 10


def test_verify_rejects_garbage_token(tmp_path) -> None:
    adapter = make_adapter(tmp_path)
    assert adapter.verify_put_token("not-a-token") is None
