"""FileGatewayPort 구현: file-service 에 HTTP 로만 접근(디스크 미접촉).

- download_source: GET /files/{id} 스트리밍 -> 로컬 temp.
- store_result: POST /uploads/store 스트리밍 업로드(Idempotency-Key=job_id) -> result_file_id.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from typing import BinaryIO

import httpx

from ....core.domain.errors import MissingRenderInputError


async def _file_chunks(fp: BinaryIO, size: int = 1024 * 1024) -> AsyncIterator[bytes]:
    while True:
        chunk = fp.read(size)
        if not chunk:
            break
        yield chunk


class HttpFileGateway:
    """FileGatewayPort(Protocol) 구현."""

    def __init__(
        self,
        base_url: str,
        token_provider: Callable[[], str],
        timeout: float = 60.0,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._token = token_provider
        self._timeout = timeout

    def _headers(self) -> dict[str, str]:
        return {"X-Service-Token": self._token()}

    async def download_source(self, file_id: str, dest_path: str) -> None:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            async with client.stream(
                "GET", f"{self._base}/files/{file_id}", headers=self._headers()
            ) as resp:
                if resp.status_code == 404:
                    # 입력이 사라졌다. 재시도해도 영원히 404 다. 전용 예외로 알려 워커가 즉시 실패로
                    #   확정하게 한다(스위퍼가 10번 부활시키며 '만드는중' 을 유지하는 낭비 방지).
                    raise MissingRenderInputError(
                        f"렌더 입력 파일을 찾을 수 없습니다(file_id={file_id})"
                        ": 업로드가 삭제됐거나 만료됐습니다"
                    )
                resp.raise_for_status()
                with open(dest_path, "wb") as fp:
                    async for chunk in resp.aiter_bytes():
                        fp.write(chunk)

    async def store_result(
        self,
        job_id: str,
        file_name: str,
        mime_type: str,
        src_path: str,
        organization_id: int | None = None,
    ) -> str:
        headers = {
            **self._headers(),
            "Idempotency-Key": job_id,
            "X-File-Name": file_name,
            "Content-Type": mime_type,
        }
        # 소유 귀속: file-service 가 X-Organization-Id 로 upload_assets 에 기록.
        if organization_id is not None:
            headers["X-Organization-Id"] = str(organization_id)
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            with open(src_path, "rb") as fp:
                resp = await client.post(
                    f"{self._base}/uploads/store",
                    headers=headers,
                    content=_file_chunks(fp),
                )
            resp.raise_for_status()
            return resp.json()["id"]
