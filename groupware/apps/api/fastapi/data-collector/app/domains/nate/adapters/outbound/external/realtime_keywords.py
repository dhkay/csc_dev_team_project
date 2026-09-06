"""네이트 실시간 검색어 호출 어댑터.

인코딩 주의: 응답은 UTF-8 이 아니라 EUC-KR 이다(실측). 헤더에 charset 이 없어 httpx 의
`.text` 는 한글을 깨뜨린다. 그래서 바이트를 직접 디코드한다.

캐시 무효화용 `v` 파라미터를 붙인다. 붙이지 않으면 중간 캐시가 오래된 목록을 돌려줄 수 있고,
그러면 실시간 검색어라는 이름이 무색해진다.

자격증명이 없는 소스다(공개 데이터).
"""

from __future__ import annotations

import logging
import time

import httpx

from ......shared.vendor_http import create_vendor_client

logger = logging.getLogger(__name__)

_ENCODING = "euc-kr"


class NateRealtimeKeywordAdapter:
    """실시간 검색어 원문을 가져온다. 실패는 빈 문자열이다."""

    def __init__(
        self,
        *,
        base_url: str,
        path: str,
        timeout: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client = create_vendor_client(
            base_url=base_url, timeout=timeout, transport=transport
        )
        self._path = path

    async def fetch(self) -> str:
        try:
            response = await self._client.get(
                self._path, params={"v": str(int(time.time()))}
            )
        except httpx.RequestError as exc:
            logger.warning("네이트 연결 실패: %s", exc)
            return ""
        if response.status_code != httpx.codes.OK:
            logger.warning("네이트 응답 이상(status=%s)", response.status_code)
            return ""
        # errors="replace": 한 글자가 깨졌다고 목록 전체를 버리지 않는다.
        return response.content.decode(_ENCODING, errors="replace")

    async def aclose(self) -> None:
        await self._client.aclose()
