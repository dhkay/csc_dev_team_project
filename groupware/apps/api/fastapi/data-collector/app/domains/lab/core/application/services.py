"""lab 서비스: LabProbePort 구현.

이 도메인의 규칙은 하나다: 업스트림 실패는 예외가 아니라 결과다.
그 규칙을 여기 한 곳에만 두어, 소스가 늘어도 "401 을 삼켜 버리는" 구현이 복제되지 않게 한다.

core 는 FastAPI/httpx 를 모른다(Outbound 포트만 의존).
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from ..domain.entities import (
    KeywordToolQuery,
    KeywordVolume,
    NormalizedKeywords,
    ProbeResult,
    SearchTrendQuery,
    ShoppingCategoriesQuery,
    ShoppingKeywordAgeQuery,
    UpstreamExchange,
)
from ..domain.errors import CredentialsNotConfiguredError, UpstreamUnreachableError
from ..domain.types import LabSource, ProbeOutcome
from .ports.outbound import (
    NaverDatalabSearchPort,
    NaverSearchAdKeywordToolPort,
    NaverShoppingCategoriesPort,
    NaverShoppingKeywordAgePort,
)

# 업스트림 errorCode → 조치 안내. 상태코드만으로는 진단이 안 되는 것만 넣는다.
_HINTS: dict[str, str] = {
    "024": (
        "Scope Status Invalid = 자격은 유효하나 이 API 권한이 앱에 없다. "
        "네이버 개발자센터 > 내 애플리케이션 > API 설정에서 '데이터랩(쇼핑인사이트)' 를 체크한다. "
        "새 키 발급이 아니라 기존 앱에 항목을 추가하는 것이라 Client ID/Secret 은 그대로다. "
        "검색어 트렌드와는 별개 항목이라 따로 체크해야 한다."
    ),
}


def _to_count(value: object) -> int:
    """검색량 정규화. 저볼륨 키워드는 숫자가 아니라 "< 10" 문자열로 온다."""
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    return int(digits) if digits else 0


class LabProbeService:
    """LabProbePort 구현."""

    def __init__(
        self,
        *,
        datalab_search: NaverDatalabSearchPort,
        shopping_categories: NaverShoppingCategoriesPort,
        shopping_keyword_age: NaverShoppingKeywordAgePort,
        searchad_keywords: NaverSearchAdKeywordToolPort,
    ) -> None:
        self._datalab_search = datalab_search
        self._shopping_categories = shopping_categories
        self._shopping_keyword_age = shopping_keyword_age
        self._searchad_keywords = searchad_keywords

    async def aclose(self) -> None:
        """보유 어댑터의 커넥션 풀 정리(RoutingInference 와 동형)."""
        for adapter in (
            self._datalab_search,
            self._shopping_categories,
            self._shopping_keyword_age,
            self._searchad_keywords,
        ):
            await adapter.aclose()

    async def datalab_search(self, query: SearchTrendQuery) -> ProbeResult:
        return await self._run(
            LabSource.NAVER_DATALAB_SEARCH, lambda: self._datalab_search.search(query)
        )

    async def shopping_categories(self, query: ShoppingCategoriesQuery) -> ProbeResult:
        return await self._run(
            LabSource.NAVER_SHOPPING_CATEGORIES,
            lambda: self._shopping_categories.categories(query),
        )

    async def shopping_keyword_age(self, query: ShoppingKeywordAgeQuery) -> ProbeResult:
        return await self._run(
            LabSource.NAVER_SHOPPING_KEYWORD_AGE,
            lambda: self._shopping_keyword_age.keyword_age(query),
        )

    async def searchad_keywords(
        self, query: KeywordToolQuery
    ) -> tuple[ProbeResult, NormalizedKeywords | None]:
        result = await self._run(
            LabSource.NAVER_SEARCHAD_KEYWORDSTOOL,
            lambda: self._searchad_keywords.keywords(query),
        )
        if result.outcome is not ProbeOutcome.OK or result.exchange is None:
            return result, None
        return result, self._normalize_keywords(result.exchange, query.limit)

    async def _run(
        self, source: LabSource, call: Callable[[], Awaitable[UpstreamExchange]]
    ) -> ProbeResult:
        try:
            exchange = await call()
        except CredentialsNotConfiguredError as exc:
            # 호출 자체를 하지 않았다. 상태코드가 없다는 사실이 곧 진단이다.
            return ProbeResult(
                source=source,
                outcome=ProbeOutcome.CREDENTIALS_MISSING,
                error="자격증명이 설정되지 않아 호출하지 않았습니다.",
                missing_env=exc.missing,
            )
        except UpstreamUnreachableError as exc:
            return ProbeResult(
                source=source, outcome=ProbeOutcome.UNREACHABLE, error=str(exc)
            )

        outcome = (
            ProbeOutcome.OK
            if exchange.status_code < 400
            else ProbeOutcome.UPSTREAM_ERROR
        )
        return ProbeResult(
            source=source, outcome=outcome, exchange=exchange, hint=self._hint(exchange)
        )

    @staticmethod
    def _hint(exchange: UpstreamExchange) -> str | None:
        body = exchange.body
        if not isinstance(body, dict):
            return None
        code = body.get("errorCode")
        return _HINTS.get(str(code)) if code is not None else None

    @staticmethod
    def _normalize_keywords(
        exchange: UpstreamExchange, limit: int
    ) -> NormalizedKeywords:
        """LAB-004 만 정규화한다.

        이유 둘: (1) 원본이 791행/170KB 라 그대로 렌더하면 Scalar 가 못 쓴다. 절단이 필요한데
        절단은 반드시 표시해야 거짓말이 되지 않는다. (2) 검색량이 "< 10" 문자열로도 오는데,
        그 파싱 규칙을 여기서 테스트와 함께 확정해 두면 나중에 실사용 승격 시 검증된 채로 옮겨진다.
        다른 셋은 raw 만 준다: 성공 응답 형태를 아직 실측하지 못해(LAB-002/003 은 401) 정규화하면 창작이 된다.
        """
        body = exchange.body
        rows = body.get("keywordList") if isinstance(body, dict) else None
        if not isinstance(rows, list):
            return NormalizedKeywords()

        volumes = [
            KeywordVolume(
                keyword=str(row.get("relKeyword", "")),
                monthly_searches=_to_count(row.get("monthlyPcQcCnt"))
                + _to_count(row.get("monthlyMobileQcCnt")),
            )
            for row in rows
            if isinstance(row, dict)
        ]
        volumes.sort(key=lambda v: v.monthly_searches, reverse=True)
        kept = volumes[:limit] if limit > 0 else volumes
        return NormalizedKeywords(
            keywords=tuple(kept),
            returned=len(kept),
            total=len(volumes),
            truncated=len(kept) < len(volumes),
        )
