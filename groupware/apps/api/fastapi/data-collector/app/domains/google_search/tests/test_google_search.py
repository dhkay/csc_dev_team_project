"""구글 검색(SerpApi) 소스 테스트: 가변 응답 키, 목적지 링크, 쿼터 소진 응답, 자격 미설정."""

from __future__ import annotations

import httpx
import pytest

from app.domains.google_search.adapters.outbound.collection.plugin import (
    GoogleSearchSource,
)
from app.domains.google_search.adapters.outbound.external.serpapi import SerpApiAdapter
from app.domains.google_search.adapters.outbound.parser import serp
from app.domains.google_search.core.domain.codec import decode_results, encode_results
from app.domains.google_search.core.domain.target import make_target

# 실측 응답(sandbox/api-test/responses/07)의 구조를 줄인 것.
PAYLOAD = {
    "search_metadata": {"status": "Success", "raw_html_file": "https://serpapi.com/searches/x.html"},
    "organic_results": [
        {
            "position": 1,
            "title": "돼지고기 김치찌개 맛내는 비법",
            "link": "https://www.10000recipe.com/recipe/1785098",
            "redirect_link": "https://www.google.com/url?sa=t&url=https://www.10000recipe.com/recipe/1785098",
            "snippet": "돼지고기와 신김치로 끓이는 기본 레시피.",
            "source": "만개의레시피",
        }
    ],
}
# 레시피성 검색어는 organic_results 없이 recipes_results 만 오기도 한다(실측).
RECIPES_ONLY = {"search_metadata": {"status": "Success"}, "recipes_results": [{"title": "레시피"}]}


def _source(handler, api_key: str = "key") -> GoogleSearchSource:
    return GoogleSearchSource(
        SerpApiAdapter(
            base_url="https://serpapi.example.com",
            api_key=api_key,
            timeout=1.0,
            transport=httpx.MockTransport(handler),
        )
    )


def test_absent_organic_results_is_normal_not_an_error() -> None:
    """특정 키의 존재를 가정하면 검색어에 따라 조용히 터진다."""
    assert serp.parse(RECIPES_ONLY) == []
    assert serp.parse({}) == []
    assert serp.parse("<html>") == []


def test_stores_destination_link_not_the_tracking_redirect() -> None:
    """나중에 그 링크를 여는 쪽은 목적지를 원한다. 추적 리다이렉트는 저장하지 않는다."""
    result = serp.parse(PAYLOAD)[0]

    assert result.link == "https://www.10000recipe.com/recipe/1785098"
    assert result.rank == 1
    assert result.source == "만개의레시피"


def test_codec_round_trip_keeps_every_field() -> None:
    original = serp.parse(PAYLOAD)

    assert decode_results(encode_results(original)) == original


@pytest.mark.asyncio
async def test_signed_raw_html_link_is_never_stored() -> None:
    """`raw_html_file` 은 서명 링크다. 저장하면 그 자체가 유출 경로가 된다."""
    items = await _source(lambda _: httpx.Response(200, json=PAYLOAD)).collect(
        make_target("김치찌개")
    )

    assert items and all("serpapi.com/searches" not in str(v) for v in items[0].values())


@pytest.mark.asyncio
async def test_request_is_scoped_to_korea() -> None:
    seen: list[httpx.QueryParams] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.params)
        return httpx.Response(200, json=PAYLOAD)

    await _source(handler).collect(make_target("김치찌개"))

    assert seen[0]["engine"] == "google"
    assert seen[0]["hl"] == "ko"
    assert seen[0]["gl"] == "kr"


@pytest.mark.asyncio
async def test_quota_exhausted_degrades_to_empty() -> None:
    """429 를 붙잡고 재시도하면 쿼터만 두 번 태운다. 빈 결과로 끝낸다."""
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(429, json={"error": "run out of searches"})

    assert await _source(handler).collect(make_target("김치찌개")) == []
    assert calls == 1


@pytest.mark.asyncio
async def test_missing_api_key_skips_the_call_entirely() -> None:
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, json=PAYLOAD)

    assert await _source(handler, api_key="").collect(make_target("김치찌개")) == []
    assert called is False
