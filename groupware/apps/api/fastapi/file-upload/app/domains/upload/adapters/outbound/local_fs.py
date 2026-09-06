"""로컬 파일시스템 공용 프리미티브: 1차 스토리지(storage/)와 2차 아카이브(archive/) 어댑터가 공유.

두 어댑터가 같은 "루트 밖 탈출 차단 + 원자적 스트리밍 쓰기 + best-effort 삭제" 로직을 복붙하지 않도록
여기 한 곳에 둔다. 원자성/보안(traversal)에 민감한 부분이라 단일 출처로 유지한다.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from pathlib import Path
from uuid import uuid4

from starlette.concurrency import run_in_threadpool


def resolve_within_root(root: Path, object_key: str) -> Path:
    """{root}/{object_key} 를 정규화하되 루트 밖으로 나가는 키(`..`, 절대경로 등)를 차단."""
    target = (root / object_key).resolve()
    if target != root and root not in target.parents:
        raise ValueError("invalid object key (escapes storage root)")
    return target


def safe_unlink(path: Path) -> None:
    """없는 파일/권한 오류를 삼키는 best-effort 삭제(멱등)."""
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


async def write_stream_atomic(path: Path, chunks: AsyncIterator[bytes]) -> int:
    """스트리밍 원자적 쓰기: 임시파일 기록 후 os.replace 로 commit(부분 파일 노출 차단).

    기록한 총 바이트 수를 반환. 중간 실패 시 임시파일을 정리하고 예외를 재던진다.
    """
    await run_in_threadpool(os.makedirs, str(path.parent), exist_ok=True)
    tmp = path.parent / f"{path.name}.part-{uuid4().hex}"
    total = 0
    fp = await run_in_threadpool(open, str(tmp), "wb")
    try:
        async for chunk in chunks:
            await run_in_threadpool(fp.write, chunk)
            total += len(chunk)
    except BaseException:
        await run_in_threadpool(fp.close)
        await run_in_threadpool(safe_unlink, tmp)
        raise
    await run_in_threadpool(fp.close)
    await run_in_threadpool(os.replace, str(tmp), str(path))  # 원자적 commit
    return total
