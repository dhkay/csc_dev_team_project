"""lab Inbound 포트 (Protocol): 라우터가 호출하는 계약."""

from __future__ import annotations

from typing import Protocol

from ...domain.entities import (
    KeywordToolQuery,
    NormalizedKeywords,
    ProbeResult,
    SearchTrendQuery,
    ShoppingCategoriesQuery,
    ShoppingKeywordAgeQuery,
)


class LabProbePort(Protocol):
    """외부 API 프로브. 어떤 경우에도 업스트림 실패로 예외를 던지지 않는다(결과로 돌려준다)."""

    async def datalab_search(self, query: SearchTrendQuery) -> ProbeResult: ...

    async def shopping_categories(
        self, query: ShoppingCategoriesQuery
    ) -> ProbeResult: ...

    async def shopping_keyword_age(
        self, query: ShoppingKeywordAgeQuery
    ) -> ProbeResult: ...

    async def searchad_keywords(
        self, query: KeywordToolQuery
    ) -> tuple[ProbeResult, NormalizedKeywords | None]: ...

    async def aclose(self) -> None:
        """보유한 어댑터의 커넥션 풀 정리. 부모 앱 lifespan 이 호출한다."""
        ...
