"""SourcePlugin 구현: 네이트 실시간 검색어.

벤더 기벽은 전부 여기와 파서, 어댑터에서 흡수하고 커널에는 안정형 JSON 만 넘긴다.

| 기벽 | 흡수 위치 |
|---|---|
| 응답 인코딩이 EUC-KR 이다 | 어댑터가 바이트를 직접 디코드한다 |
| 확장자는 `.js` 지만 내용은 JSON 이다 | 파서가 그대로 json 으로 읽는다 |
| 객체가 아니라 배열의 배열이라 칸 의미가 없다 | 파서가 인덱스 의미를 상수로 고정한다 |
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .....collection.core.domain.entities import CollectionTarget
from ....core.domain.codec import encode_keywords
from ....core.domain.target import target_from_params
from ....core.domain.types import KEEP_COUNT, SOURCE_ID
from ..external.realtime_keywords import NateRealtimeKeywordAdapter
from ..parser import realtime_keywords


class NateRealtimeSource:
    """SourcePlugin 구현."""

    source_id = SOURCE_ID

    def __init__(self, client: NateRealtimeKeywordAdapter) -> None:
        self._client = client

    def make_target(self, params: Mapping[str, Any]) -> CollectionTarget:
        return target_from_params(params)

    def retention(self, target: CollectionTarget) -> int | None:
        return KEEP_COUNT

    async def collect(self, target: CollectionTarget) -> list[dict[str, Any]]:
        text = await self._client.fetch()
        # 안정형 정렬 = 순위 순(벤더가 주는 순서 그대로).
        return encode_keywords(realtime_keywords.parse(text))

    async def aclose(self) -> None:
        await self._client.aclose()
