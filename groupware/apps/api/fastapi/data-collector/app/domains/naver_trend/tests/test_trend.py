"""검색어 트렌드 소스 테스트: 상대 창 계산, 응답 파싱, 최신순 정렬, 자격 미설정."""

from __future__ import annotations

from datetime import date

import httpx
import pytest

from app.domains.naver_trend.adapters.outbound.collection.plugin import (
    NaverSearchTrendSource,
)
from app.domains.naver_trend.adapters.outbound.external.search_trend import (
    NaverSearchTrendAdapter,
)
from app.domains.naver_trend.adapters.outbound.parser import search_trend
from app.domains.naver_trend.core.domain.codec import decode_points, encode_points
from app.domains.naver_trend.core.domain.target import make_target
from app.domains.naver_trend.core.domain.types import Period
from app.domains.naver_trend.core.domain.window import resolve_window

# 실측 응답(sandbox/api-test/responses/03)의 구조. 날짜 필드 이름이 `period` 다.
PAYLOAD = {
    "startDate": "2026-05-01",
    "endDate": "2026-08-10",
    "timeUnit": "month",
    "results": [
        {
            "title": "김치찌개",
            "keywords": ["김치찌개"],
            "data": [
                {"period": "2026-05-01", "ratio": 100},
                {"period": "2026-06-01", "ratio": 92.12831},
                {"period": "2026-07-01", "ratio": 96.3581},
            ],
        }
    ],
}


def _adapter(handler, **overrides) -> NaverSearchTrendAdapter:
    kwargs = {
        "base_url": "https://openapi.example.com",
        "client_id": "id",
        "client_secret": "secret",
        "timeout": 1.0,
        "transport": httpx.MockTransport(handler),
    }
    kwargs.update(overrides)
    return NaverSearchTrendAdapter(**kwargs)


def test_window_excludes_today() -> None:
    """오늘은 아직 집계 중이라 마지막 점이 늘 낮게 찍힌다. 그 점을 급감으로 읽는 사고를 막는다."""
    start, end = resolve_window(Period.DAILY, date(2026, 8, 13))

    assert end == "2026-08-12"
    assert start == "2026-07-13"


def test_window_length_differs_by_period() -> None:
    """ratio 는 창 안의 상대값이라 창 길이가 곧 비교 기준이다."""
    daily = resolve_window(Period.DAILY, date(2026, 8, 13))
    monthly = resolve_window(Period.MONTHLY, date(2026, 8, 13))

    assert daily[0] == "2026-07-13"
    assert monthly[0] == "2025-08-12"


def test_parser_renames_period_to_date() -> None:
    """벤더의 `period` 는 날짜다. 우리 `period`(일간/주간/월간)와 뜻이 완전히 다르다."""
    points = search_trend.parse(PAYLOAD)

    assert [(p.date, p.ratio) for p in points] == [
        ("2026-05-01", 100.0),
        ("2026-06-01", 92.12831),
        ("2026-07-01", 96.3581),
    ]


def test_empty_results_are_normal_not_an_error() -> None:
    """검색량이 아주 적은 검색어는 자료 없이 200 이 온다."""
    assert search_trend.parse({"results": []}) == []
    assert search_trend.parse({"results": [{"data": []}]}) == []
    assert search_trend.parse("<html>") == []


def test_codec_round_trip_keeps_every_field() -> None:
    original = search_trend.parse(PAYLOAD)

    assert decode_points(encode_points(original)) == original


@pytest.mark.asyncio
async def test_collect_sends_one_group_and_returns_newest_first() -> None:
    """그룹을 여러 개 보내면 ratio 기준이 그룹 간에 섞인다. 항상 하나로 보낸다."""
    bodies: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        import json

        bodies.append(json.loads(request.content))
        return httpx.Response(200, json=PAYLOAD)

    source = NaverSearchTrendSource(_adapter(handler))
    items = await source.collect(make_target("김치찌개", Period.MONTHLY))
    await source.aclose()

    assert len(bodies[0]["keywordGroups"]) == 1
    assert bodies[0]["timeUnit"] == "month"
    # 절대 날짜는 저장하지 않고 수집 시점에 만든다. 요청에는 반드시 들어 있어야 한다.
    assert bodies[0]["startDate"] and bodies[0]["endDate"]
    # 저장은 최신순이다(커널의 보관 정책이 앞에서 자르므로 최신이 앞에 와야 한다).
    assert [i["date"] for i in items] == ["2026-07-01", "2026-06-01", "2026-05-01"]


@pytest.mark.asyncio
async def test_missing_credentials_skip_the_call_entirely() -> None:
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, json=PAYLOAD)

    source = NaverSearchTrendSource(_adapter(handler, client_secret=""))
    items = await source.collect(make_target("김치찌개", Period.DAILY))
    await source.aclose()

    assert items == []
    assert called is False


def test_target_keeps_spacing_but_not_period_dates() -> None:
    """검색어의 공백은 의미가 있다. 반면 날짜는 params 에 들어가면 안 된다."""
    assert make_target("제주 여행", Period.DAILY).params == {
        "keyword": "제주 여행",
        "period": "daily",
    }
    assert make_target("제주 여행", Period.DAILY) != make_target("제주여행", Period.DAILY)
