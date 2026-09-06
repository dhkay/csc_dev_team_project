"""SourcePlugin 구현: 네이버 데이터랩 쇼핑인사이트 인기 검색어.

벤더 기벽을 전부 여기서 흡수하고 커널에는 안정형 JSON 만 넘긴다.

| 기벽 | 흡수 위치 |
|---|---|
| 실패를 "ERROR:" 문자열로 표현 | 파서가 빈 목록으로 좁힌다 |
| 오름차순(과거→최신) 반환 | 아래 reverse() 로 항상 최신순으로 만든다 |
| `2026/07/01` 슬래시 날짜 | 파서가 `YYYY-MM-DD`(월간은 `YYYY-MM`)로 정규화 |
| 날짜당 상위 20+ | 파서가 상위 10개로 자른다 |
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from typing import Any

from .....collection.core.domain.entities import CollectionTarget
from ....core.domain.codec import encode_buckets
from ....core.domain.target import target_from_params
from ....core.domain.types import KEEP_COUNT, SOURCE_ID, TIME_UNIT_FOR, Period
from ..navigation.direct_http import DirectHttpNavigation
from ..parser.datalab_shopping_keywords import DatalabShoppingKeywordParser


class DatalabShoppingKeywordsSource:
    """SourcePlugin 구현."""

    source_id = SOURCE_ID

    def __init__(
        self, navigation: DirectHttpNavigation, parser: DatalabShoppingKeywordParser
    ) -> None:
        self._navigation = navigation
        self._parser = parser

    def make_target(self, params: Mapping[str, Any]) -> CollectionTarget:
        return target_from_params(params)

    def retention(self, target: CollectionTarget) -> int | None:
        return KEEP_COUNT[Period(target.params["period"])]

    async def collect(self, target: CollectionTarget) -> list[dict[str, Any]]:
        period = Period(target.params["period"])
        # getKeywordRank 는 timeUnit 하나로 날짜별 랭킹 배열을 한 번에 준다(범위 계산 불필요).
        time_unit = TIME_UNIT_FOR[period].value
        # 수집(urllib)은 동기 블로킹이라 스레드로 오프로드한다. 블로킹 여부는 이 소스의 성질이라
        #   커널이 알 필요가 없다.
        raw = await asyncio.to_thread(
            self._navigation.acquire_html, str(target.params["cid"]), time_unit
        )
        buckets = self._parser.parse(raw, period)  # 오름차순
        buckets.reverse()  # 안정형 정렬 = 최신순
        return encode_buckets(buckets)

    async def aclose(self) -> None:
        # urllib 기반이라 유지할 커넥션 풀이 없다.
        return None
