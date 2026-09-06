"""SourcePlugin 구현: 구글 검색 결과(SerpApi 경유).

벤더 기벽은 전부 여기와 파서, 어댑터에서 흡수하고 커널에는 안정형 JSON 만 넘긴다.

| 기벽 | 흡수 위치 |
|---|---|
| 응답 키가 검색어마다 다르다(`organic_results` 부재) | 파서가 존재를 가정하지 않는다 |
| 결과 링크가 추적 파라미터 붙은 리다이렉트로도 온다 | 파서가 목적지(`link`)를 고른다 |
| 서명 링크(`raw_html_file`)가 응답에 있다 | 읽지도 저장하지도 않는다 |
| 요금제 쿼터가 좁다 | 자동 재수집을 끈다(module.py) |
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .....collection.core.domain.entities import CollectionTarget
from ....core.domain.codec import encode_results
from ....core.domain.target import target_from_params
from ....core.domain.types import KEEP_COUNT, SOURCE_ID
from ..external.serpapi import SerpApiAdapter
from ..parser import serp


class GoogleSearchSource:
    """SourcePlugin 구현."""

    source_id = SOURCE_ID

    def __init__(self, client: SerpApiAdapter) -> None:
        self._client = client

    def make_target(self, params: Mapping[str, Any]) -> CollectionTarget:
        return target_from_params(params)

    def retention(self, target: CollectionTarget) -> int | None:
        return KEEP_COUNT

    async def collect(self, target: CollectionTarget) -> list[dict[str, Any]]:
        payload = await self._client.fetch(str(target.params["keyword"]))
        if payload is None:
            return []
        # 안정형 정렬 = 구글이 준 순위 순서.
        return encode_results(serp.parse(payload))

    async def aclose(self) -> None:
        await self._client.aclose()
