"""Outbound Adapter: StoragePort 구현 (1차 = 서버 로컬 파일시스템).

스토리지 I/O 는 이 계층에만. presigned PUT URL 은 서명 토큰(signing.py)으로 발급하고,
바이트는 STORAGE_ROOT 하위에만 기록한다(traversal 차단). 추후 NAS/S3 어댑터로 교체 가능.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

from starlette.concurrency import run_in_threadpool

from ....core.application.ports.outbound import PutGrant
from ..local_fs import resolve_within_root, safe_unlink, write_stream_atomic
from . import signing


class LocalFilesystemStorageAdapter:
    """StoragePort(Protocol) 의 로컬 파일시스템 구현."""

    def __init__(
        self,
        *,
        storage_root: str,
        public_base_url: str,
        url_secret: str,
        url_ttl_seconds: int,
        download_ttl_seconds: int = 3600,
    ) -> None:
        self._root = Path(storage_root).resolve()
        self._base_url = public_base_url.rstrip("/")
        self._secret = url_secret
        self._ttl = url_ttl_seconds
        self._download_ttl = download_ttl_seconds
        self._root.mkdir(parents=True, exist_ok=True)

    # URL 발급
    def presigned_put_url(
        self, *, upload_id: str, object_key: str, mime_type: str, size: int
    ) -> str:
        token = signing.sign(
            {"uid": upload_id, "key": object_key, "mime": mime_type, "size": size},
            self._secret,
            self._ttl,
        )
        return f"{self._base_url}/blob?token={quote(token)}"

    def download_url(self, upload_id: str) -> str:
        return f"{self._base_url}/files/{quote(upload_id)}"

    def signed_download_url(self, upload_id: str) -> str:
        # 조직 스코프로 발급된 서명 GET 토큰(TTL). require_signed_download 시 GET 이 요구.
        # web BFF 도 동일 포맷(signing.sign_download)으로 서명하므로 file-upload/web 양쪽 발급이 호환.
        token = signing.sign_download(upload_id, self._secret, self._download_ttl)
        return f"{self._base_url}/files/{quote(upload_id)}?token={quote(token)}"

    def verify_put_token(self, token: str) -> PutGrant | None:
        claims = signing.verify(token, self._secret)
        if claims is None:
            return None
        try:
            return PutGrant(
                upload_id=str(claims["uid"]),
                object_key=str(claims["key"]),
                mime_type=str(claims["mime"]),
                size=int(claims["size"]),
            )
        except (KeyError, ValueError, TypeError):
            return None

    def verify_download_token(self, token: str) -> str | None:
        # 다운로드 전용 포맷만 통과: PUT 토큰(JSON JWT)은 이 파서를 못 지나 교차사용 차단.
        return signing.verify_download(token, self._secret)

    # 파일 I/O: 루트 탈출 차단/원자적 스트리밍 쓰기/best-effort 삭제는 공용 local_fs 로 위임.
    def _resolve(self, object_key: str) -> Path:
        return resolve_within_root(self._root, object_key)

    async def write(self, object_key: str, data: bytes) -> None:
        # 원자적 쓰기: 임시파일 기록 후 os.replace 로 commit(부분 파일 노출 차단).
        path = self._resolve(object_key)
        await run_in_threadpool(self._write_atomic_sync, path, data)

    async def write_stream(
        self, object_key: str, chunks: AsyncIterator[bytes]
    ) -> int:
        return await write_stream_atomic(self._resolve(object_key), chunks)

    @staticmethod
    def _write_atomic_sync(path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.parent / f"{path.name}.part-{uuid4().hex}"
        tmp.write_bytes(data)
        os.replace(str(tmp), str(path))

    async def exists(self, object_key: str) -> bool:
        try:
            path = self._resolve(object_key)
        except ValueError:
            return False
        return await run_in_threadpool(os.path.isfile, path)

    async def delete(self, object_key: str) -> None:
        # 스토리지 루트 밖 키/없는 파일은 조용히 무시(best-effort: 삭제 멱등).
        try:
            path = self._resolve(object_key)
        except ValueError:
            return
        await run_in_threadpool(safe_unlink, path)

    async def open_read_stream(self, object_key: str) -> AsyncIterator[bytes]:
        # 아카이브 복사용 청크 리더: 없는/루트 밖 키는 빈 스트림.
        try:
            path = self._resolve(object_key)
        except ValueError:
            return
        if not await run_in_threadpool(os.path.isfile, path):
            return
        fp = await run_in_threadpool(open, str(path), "rb")
        try:
            while True:
                chunk = await run_in_threadpool(fp.read, 1024 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            await run_in_threadpool(fp.close)

    def fs_path(self, object_key: str) -> str | None:
        try:
            path = self._resolve(object_key)
        except ValueError:
            return None
        return str(path) if path.is_file() else None
