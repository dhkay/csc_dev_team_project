"""SerpApi 호출 어댑터(구글 검색 결과).

쿼터를 쓰는 호출이다. 요금제가 월 검색 횟수를 정하고 한 번의 수집이 그 한 번을 쓴다.
그래서 재시도를 늘리지 않고(공용 클라이언트가 연결 단계에서만 1회 재시도), 실패는 그대로
빈 결과로 끝낸다. 실패를 붙잡고 다시 부르면 쿼터만 두 번 태운다.

자격이 없으면 호출 자체를 하지 않는다. SerpApi 는 키가 없으면 401 을 주는데, 그 401 은
"키가 틀렸다"처럼 보여 미설정과 구분되지 않는다.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ......shared.vendor_http import create_vendor_client

logger = logging.getLogger(__name__)

_PATH = "/search.json"

# 검색 지역과 언어. 국내 마케팅 기준으로 고정한다(선택지로 열면 쿼터가 배로 든다).
#   벤더 파라미터 이름이라 도메인이 아니라 이 어댑터가 소유한다.
_LOCATION_PARAMS: dict[str, str] = {
    "hl": "ko",
    "gl": "kr",
    "google_domain": "google.co.kr",
}


class SerpApiAdapter:
    """GET /search.json. 실패는 None 이다."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        timeout: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client = create_vendor_client(
            base_url=base_url, timeout=timeout, transport=transport
        )
        self._api_key = api_key

    async def fetch(self, keyword: str) -> Any | None:
        if not self._api_key:
            logger.warning("SerpApi 자격 미설정: SERPAPI_API_KEY")
            return None
        try:
            response = await self._client.get(
                _PATH,
                params={
                    "engine": "google",
                    "q": keyword,
                    "api_key": self._api_key,
                    **_LOCATION_PARAMS,
                },
            )
        except httpx.RequestError as exc:
            logger.warning("SerpApi 연결 실패(%s): %s", keyword, exc)
            return None
        if response.status_code != httpx.codes.OK:
            # 429 는 쿼터 소진이다. 본문에 사유가 들어 있어 앞부분만 남긴다(키는 쿼리에 있으므로
            #   URL 은 로그에 넣지 않는다).
            logger.warning(
                "SerpApi 응답 이상(%s, status=%s, body=%s)",
                keyword,
                response.status_code,
                response.text[:200],
            )
            return None
        try:
            return response.json()
        except ValueError:
            logger.warning("SerpApi 응답이 JSON 이 아니다(%s)", keyword)
            return None

    async def aclose(self) -> None:
        await self._client.aclose()
