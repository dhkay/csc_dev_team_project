"""스키마 ↔ 도메인 변환."""

from __future__ import annotations

from ....core.domain.entities import (
    CategorySpec,
    KeywordGroup,
    KeywordToolQuery,
    NormalizedKeywords,
    ProbeResult,
    SearchTrendQuery,
    ShoppingCategoriesQuery,
    ShoppingKeywordAgeQuery,
)
from .schemas import (
    KeywordToolProbeResponse,
    KeywordVolumeSchema,
    NormalizedKeywordsSchema,
    ProbeResponse,
    SearchTrendRequest,
    ShoppingCategoriesRequest,
    ShoppingKeywordAgeRequest,
    UpstreamSchema,
)


def to_search_trend_query(body: SearchTrendRequest) -> SearchTrendQuery:
    return SearchTrendQuery(
        start_date=body.startDate,
        end_date=body.endDate,
        time_unit=body.timeUnit,
        keyword_groups=tuple(
            KeywordGroup(group_name=g.groupName, keywords=tuple(g.keywords))
            for g in body.keywordGroups
        ),
        device=body.device,
        gender=body.gender,
        ages=tuple(body.ages),
    )


def to_shopping_categories_query(
    body: ShoppingCategoriesRequest,
) -> ShoppingCategoriesQuery:
    return ShoppingCategoriesQuery(
        start_date=body.startDate,
        end_date=body.endDate,
        time_unit=body.timeUnit,
        category=tuple(
            CategorySpec(name=c.name, param=tuple(c.param)) for c in body.category
        ),
        device=body.device,
        gender=body.gender,
        ages=tuple(body.ages),
    )


def to_shopping_keyword_age_query(
    body: ShoppingKeywordAgeRequest,
) -> ShoppingKeywordAgeQuery:
    return ShoppingKeywordAgeQuery(
        start_date=body.startDate,
        end_date=body.endDate,
        time_unit=body.timeUnit,
        category=body.category,
        keyword=body.keyword,
    )


def to_keyword_tool_query(
    hint_keywords: list[str], show_detail: bool, month: str | None, limit: int
) -> KeywordToolQuery:
    return KeywordToolQuery(
        hint_keywords=tuple(hint_keywords),
        show_detail=show_detail,
        month=month,
        limit=limit,
    )


def to_probe_response(result: ProbeResult) -> ProbeResponse:
    return ProbeResponse(**_probe_fields(result))


def to_keyword_tool_response(
    result: ProbeResult, normalized: NormalizedKeywords | None
) -> KeywordToolProbeResponse:
    return KeywordToolProbeResponse(
        **_probe_fields(result),
        normalized=(
            NormalizedKeywordsSchema(
                keywords=[
                    KeywordVolumeSchema(
                        keyword=v.keyword, monthlySearches=v.monthly_searches
                    )
                    for v in normalized.keywords
                ],
                returned=normalized.returned,
                total=normalized.total,
                truncated=normalized.truncated,
            )
            if normalized is not None
            else None
        ),
    )


def _probe_fields(result: ProbeResult) -> dict[str, object]:
    exchange = result.exchange
    return {
        "source": result.source,
        "outcome": result.outcome,
        "upstream": (
            UpstreamSchema(
                method=exchange.method,
                url=exchange.url,
                status=exchange.status_code,
                elapsedMs=exchange.elapsed_ms,
                sentHeaders=list(exchange.sent_header_names),
                requestBody=exchange.request_body,
                body=exchange.body,
            )
            if exchange is not None
            else None
        ),
        "hint": result.hint,
        "missingEnv": list(result.missing_env),
        "error": result.error,
    }
