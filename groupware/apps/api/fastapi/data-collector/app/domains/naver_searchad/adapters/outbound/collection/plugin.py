"""SourcePlugin 구현: 네이버 검색광고 키워드도구(연관 키워드와 검색량).

벤더 기벽은 전부 여기와 파서, 어댑터에서 흡수하고 커널에는 안정형 JSON 만 넘긴다.

| 기벽 | 흡수 위치 |
|---|---|
| 요청마다 HMAC 서명이 필요하고 1분 안에 만료된다 | 어댑터가 호출 시점에 만든다 |
| 서명 대상이 쿼리를 제외한 path 뿐이다 | 어댑터가 path 만 서명한다 |
| 검색량이 적으면 숫자가 아니라 `< 10` 문자열이 온다 | 파서가 0 으로 좁힌다 |
| 응답 순서가 흔들리고 수백 건이 온다 | 파서가 검색량 순으로 고정하고 커널이 상위만 남긴다 |
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .....collection.core.domain.entities import CollectionTarget
from ....core.domain.codec import encode_keywords
from ....core.domain.target import target_from_params
from ....core.domain.types import KEEP_COUNT, SOURCE_ID
from ..external.keyword_tool import NaverSearchAdKeywordToolAdapter
from ..parser import keyword_tool


class NaverAdKeywordSource:
    """SourcePlugin 구현."""

    source_id = SOURCE_ID

    def __init__(self, client: NaverSearchAdKeywordToolAdapter) -> None:
        self._client = client

    def make_target(self, params: Mapping[str, Any]) -> CollectionTarget:
        return target_from_params(params)

    def retention(self, target: CollectionTarget) -> int | None:
        return KEEP_COUNT

    async def collect(self, target: CollectionTarget) -> list[dict[str, Any]]:
        payload = await self._client.fetch(str(target.params["keyword"]))
        if payload is None:
            return []
        # 안정형 정렬 = 총 검색량 내림차순(파서가 확정한다).
        return encode_keywords(keyword_tool.parse(payload))

    async def aclose(self) -> None:
        await self._client.aclose()
