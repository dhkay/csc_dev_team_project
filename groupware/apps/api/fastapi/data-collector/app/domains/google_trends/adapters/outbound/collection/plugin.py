"""SourcePlugin 구현: 구글 트렌드 일별 인기 검색어.

벤더 기벽은 전부 여기와 파서에서 흡수하고 커널에는 안정형 JSON 만 넘긴다.

| 기벽 | 흡수 위치 |
|---|---|
| 폐기된 경로가 404 와 함께 HTML 을 준다 | 어댑터가 상태코드를 먼저 본다 |
| 인기 필드가 `ht:` 네임스페이스에 있다 | 파서가 지역부 이름으로 찾는다 |
| 검색량이 `1000+` 같은 구간 문자열이다 | 원문 그대로 나른다(숫자로 바꾸지 않는다) |
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .....collection.core.domain.entities import CollectionTarget
from ....core.domain.codec import encode_keywords
from ....core.domain.target import target_from_params
from ....core.domain.types import KEEP_COUNT, SOURCE_ID
from ..external.trends_rss import GoogleTrendsRssAdapter
from ..parser import trends_rss


class GoogleTrendsSource:
    """SourcePlugin 구현."""

    source_id = SOURCE_ID

    def __init__(self, client: GoogleTrendsRssAdapter) -> None:
        self._client = client

    def make_target(self, params: Mapping[str, Any]) -> CollectionTarget:
        return target_from_params(params)

    def retention(self, target: CollectionTarget) -> int | None:
        return KEEP_COUNT

    async def collect(self, target: CollectionTarget) -> list[dict[str, Any]]:
        xml_text = await self._client.fetch(str(target.params["geo"]))
        # 안정형 정렬 = 피드 순서(인기 순). 파서가 그 순서로 rank 를 매긴다.
        return encode_keywords(trends_rss.parse(xml_text))

    async def aclose(self) -> None:
        await self._client.aclose()
