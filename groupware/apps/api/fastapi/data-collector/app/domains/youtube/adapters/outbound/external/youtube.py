"""YouTube Data API v3 호출 어댑터.

호출 두 번이 한 수집이다. `search.list` 로 영상 id 를 얻고 `videos.list` 로 통계를 채운다.
검색 응답의 설명은 잘려서 오고 통계도 없기 때문에 상세 조회가 따로 필요하다.

쿼터 비중이 다르다. `search.list` 는 호출당 100 유닛, `videos.list` 는 1 유닛이고 하루 한도가
10,000 이다. 즉 하루에 가능한 수집이 100회 남짓이다. 그래서 검색은 한 번만 부르고 페이지를
넘기지 않는다.

자격이 없으면 호출 자체를 하지 않는다. 키가 없으면 403 이 오는데, 그 403 은 쿼터 소진과
구분되지 않아 원인을 오판하게 만든다.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ......shared.vendor_http import create_vendor_client

logger = logging.getLogger(__name__)

# 검색 조건. 국내 마케팅 기준으로 고정한다(선택지로 열면 타깃 수가 배로 늘고 쿼터도 그만큼 든다).
#   벤더 파라미터 이름이라 도메인이 아니라 이 어댑터가 소유한다.
_SEARCH_PARAMS: dict[str, str] = {
    "part": "snippet",
    # type 을 빼면 채널과 재생목록이 섞여 들어오고 id 구조가 달라진다.
    "type": "video",
    "regionCode": "KR",
    "relevanceLanguage": "ko",
    "order": "viewCount",
}


class YouTubeAdapter:
    """search.list + videos.list. 실패는 None 이다."""

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

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    async def search(self, keyword: str, max_results: int) -> Any | None:
        if not self.configured:
            logger.warning("YouTube 자격 미설정: YOUTUBE_API_KEY")
            return None
        return await self._get(
            "/youtube/v3/search",
            {**_SEARCH_PARAMS, "q": keyword, "maxResults": str(max_results)},
            keyword,
        )

    async def videos(self, video_ids: list[str]) -> Any | None:
        if not video_ids or not self.configured:
            return None
        return await self._get(
            "/youtube/v3/videos",
            {
                "part": "snippet,contentDetails,statistics",
                "id": ",".join(video_ids),
            },
            ",".join(video_ids[:3]),
        )

    async def _get(self, path: str, params: dict[str, str], label: str) -> Any | None:
        try:
            response = await self._client.get(
                path, params={**params, "key": self._api_key}
            )
        except httpx.RequestError as exc:
            logger.warning("YouTube 연결 실패(%s): %s", label, exc)
            return None
        if response.status_code != httpx.codes.OK:
            # 403 은 자격 문제일 수도, 쿼터 소진일 수도 있다. 본문에 그 사유가 들어 있으므로
            #   앞부분을 남긴다(키는 쿼리에 있으므로 URL 은 로그에 넣지 않는다).
            logger.warning(
                "YouTube 응답 이상(%s, status=%s, body=%s)",
                label,
                response.status_code,
                response.text[:200],
            )
            return None
        try:
            return response.json()
        except ValueError:
            logger.warning("YouTube 응답이 JSON 이 아니다(%s)", label)
            return None

    async def aclose(self) -> None:
        await self._client.aclose()
