"""SourcePlugin 구현: 네이버 데이터랩 검색어 트렌드.

벤더 기벽은 전부 여기와 파서, 어댑터에서 흡수하고 커널에는 안정형 JSON 만 넘긴다.

| 기벽 | 흡수 위치 |
|---|---|
| 요청에 절대 날짜가 필요하다 | 수집 시점에 창을 계산한다(타깃엔 기간 이름만 저장) |
| 응답의 날짜 필드 이름이 `period` 다 | 파서가 `date` 로 바꾼다(우리 `period` 와 뜻이 다르다) |
| ratio 가 창 안의 상대값이다 | 창을 기간마다 고정해 재수집해도 기준이 흔들리지 않게 한다 |
| 데이터가 없는 키워드도 200 이다 | 파서가 빈 목록으로 좁힌다 |
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any

from .....collection.core.domain.entities import CollectionTarget
from ....core.domain.codec import encode_points
from ....core.domain.target import target_from_params
from ....core.domain.types import KEEP_COUNT, SOURCE_ID, TIME_UNIT_FOR, Period
from ....core.domain.window import resolve_window
from ..external.search_trend import NaverSearchTrendAdapter
from ..parser import search_trend


class NaverSearchTrendSource:
    """SourcePlugin 구현."""

    source_id = SOURCE_ID

    def __init__(self, client: NaverSearchTrendAdapter) -> None:
        self._client = client

    def make_target(self, params: Mapping[str, Any]) -> CollectionTarget:
        return target_from_params(params)

    def retention(self, target: CollectionTarget) -> int | None:
        return KEEP_COUNT[Period(target.params["period"])]

    async def collect(self, target: CollectionTarget) -> list[dict[str, Any]]:
        period = Period(target.params["period"])
        # KST 가 아니라 UTC 기준으로 어제를 잡는다. 하루 경계에서 한 점이 덜 오거나 더 올 수는
        #   있지만, 컨테이너 시간대에 따라 결과가 달라지지 않는 편이 재수집에 안전하다.
        start_date, end_date = resolve_window(
            period, datetime.now(timezone.utc).date()
        )
        payload = await self._client.fetch(
            keyword=str(target.params["keyword"]),
            time_unit=TIME_UNIT_FOR[period].value,
            start_date=start_date,
            end_date=end_date,
        )
        if payload is None:
            return []
        points = search_trend.parse(payload)
        # 안정형 정렬 = 최신순. 벤더는 과거부터 주는데, 화면이 최근을 먼저 보여주고
        #   커널의 보관 정책(상위 N)도 앞에서 자르므로 최신이 앞에 와야 한다.
        points.reverse()
        return encode_points(points)

    async def aclose(self) -> None:
        await self._client.aclose()
