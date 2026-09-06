"""구글 트렌드 RSS 호출 어댑터.

경로 주의: 동작하는 주소는 `trends.google.com/trending/rss?geo=..` 다. 예전 문서에 흔히 적힌
`/trends/trendingsearches/daily/rss` 는 404 이면서 HTML 을 돌려준다(실측). 상태코드를 보지 않고
파싱하면 조용히 0건이 된다. 그래서 여기서 상태코드를 먼저 확인한다.

자격증명이 없는 소스다(공개 피드).
"""

from __future__ import annotations

import logging

import httpx

from ......shared.vendor_http import create_vendor_client

logger = logging.getLogger(__name__)


class GoogleTrendsRssAdapter:
    """지역별 일별 인기 검색어 RSS 원문을 가져온다. 실패는 빈 문자열이다."""

    def __init__(
        self,
        *,
        base_url: str,
        timeout: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client = create_vendor_client(
            base_url=base_url, timeout=timeout, transport=transport
        )

    async def fetch(self, geo: str) -> str:
        try:
            response = await self._client.get("/trending/rss", params={"geo": geo})
        except httpx.RequestError as exc:
            logger.warning("구글 트렌드 연결 실패(geo=%s): %s", geo, exc)
            return ""
        if response.status_code != httpx.codes.OK:
            # 404 여도 본문은 HTML 이라 파서가 "빈 피드"로 착각할 수 있다. 여기서 끊는다.
            logger.warning(
                "구글 트렌드 응답 이상(geo=%s, status=%s)", geo, response.status_code
            )
            return ""
        return response.text

    async def aclose(self) -> None:
        await self._client.aclose()
