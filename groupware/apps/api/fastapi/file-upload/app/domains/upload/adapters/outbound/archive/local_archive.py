"""Outbound Adapter: ArchivePort 구현 (2차 아카이브 = 로컬/마운트 파일시스템).

1차 StoragePort(local_storage.py)와 직교하는 별개 저장소(ARCHIVE_ROOT). 조직 하드 삭제 시
1차에서 옮겨 보관한다. NAS 는 마운트면 이 어댑터 그대로 + ARCHIVE_ROOT 만 바꾸면 되고,
오브젝트 스토리지(S3/R2)로 갈 땐 이 포트만 새 어댑터로 교체한다(container._build_archive).
object_key 는 1차와 동일하게 유지해 대응 관계를 보존한다.

루트 탈출 차단/원자적 스트리밍 쓰기는 1차 스토리지와 공용(local_fs): 원자성/보안 로직 단일 출처.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from pathlib import Path

from starlette.concurrency import run_in_threadpool

from ..local_fs import resolve_within_root, write_stream_atomic


class LocalFilesystemArchiveAdapter:
    """ArchivePort(Protocol) 의 로컬 파일시스템 구현."""

    def __init__(self, *, archive_root: str) -> None:
        self._root = Path(archive_root).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    async def write_stream(
        self, object_key: str, chunks: AsyncIterator[bytes]
    ) -> int:
        return await write_stream_atomic(resolve_within_root(self._root, object_key), chunks)

    async def exists(self, object_key: str) -> bool:
        try:
            path = resolve_within_root(self._root, object_key)
        except ValueError:
            return False
        return await run_in_threadpool(os.path.isfile, path)
