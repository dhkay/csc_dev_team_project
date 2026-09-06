"""SourcePlugin 구현: 위키백과 문서 요약.

벤더 기벽은 전부 여기와 파서, 어댑터에서 흡수하고 커널에는 안정형 JSON 만 넘긴다.

| 기벽 | 흡수 위치 |
|---|---|
| 언어판마다 부르는 API 와 응답 구조가 다르다 | 어댑터가 갈라 부르고 파서가 갈라 읽는다 |
| action API 의 `query.pages` 가 배열이 아니다 | 요청에 `formatversion=2`, 파서가 두 형태 모두 수용 |
| 없는 문서가 `missing` 플래그 또는 404 로 온다 | 둘 다 빈 목록으로 좁힌다 |
| 리다이렉트로 요청 제목과 응답 제목이 다르다 | 확정된 제목을 저장한다 |
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .....collection.core.domain.entities import CollectionTarget
from ....core.domain.codec import encode_summaries
from ....core.domain.target import target_from_params
from ....core.domain.types import KEEP_COUNT, SOURCE_ID, Language
from ..external.wikipedia import WikipediaAdapter
from ..parser import article_summary


class WikipediaSummarySource:
    """SourcePlugin 구현."""

    source_id = SOURCE_ID

    def __init__(self, client: WikipediaAdapter) -> None:
        self._client = client

    def make_target(self, params: Mapping[str, Any]) -> CollectionTarget:
        return target_from_params(params)

    def retention(self, target: CollectionTarget) -> int | None:
        return KEEP_COUNT

    async def collect(self, target: CollectionTarget) -> list[dict[str, Any]]:
        lang = Language(target.params["lang"])
        payload = await self._client.fetch(lang, str(target.params["title"]))
        if payload is None:
            return []
        if lang is Language.KO:
            summaries = article_summary.parse_action_api(
                payload, self._client.page_base_url(lang)
            )
        else:
            summaries = article_summary.parse_rest_summary(payload)
        return encode_summaries(summaries)

    async def aclose(self) -> None:
        await self._client.aclose()
