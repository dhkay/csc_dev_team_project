"""구글 트렌드 소스 테스트: RSS 파싱, 저장 형태 왕복, 플러그인 계약."""

from __future__ import annotations

import httpx
import pytest

from app.domains.google_trends.adapters.outbound.collection.plugin import (
    GoogleTrendsSource,
)
from app.domains.google_trends.adapters.outbound.external.trends_rss import (
    GoogleTrendsRssAdapter,
)
from app.domains.google_trends.adapters.outbound.parser import trends_rss
from app.domains.google_trends.core.domain.codec import decode_keywords, encode_keywords
from app.domains.google_trends.core.domain.target import make_target

# 실측 응답(sandbox/api-test/responses/08)의 구조를 줄인 것. ht: 네임스페이스가 핵심이다.
RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:ht="https://trends.google.com/trending/rss" version="2.0">
  <channel>
    <title>Daily Search Trends</title>
    <item>
      <title>우트로</title>
      <ht:approx_traffic>2000+</ht:approx_traffic>
      <ht:news_item>
        <ht:news_item_title>K-푸드 수출 확대</ht:news_item_title>
        <ht:news_item_url>https://example.com/a</ht:news_item_url>
      </ht:news_item>
      <ht:news_item>
        <ht:news_item_title>두 번째 기사</ht:news_item_title>
        <ht:news_item_url>https://example.com/b</ht:news_item_url>
      </ht:news_item>
    </item>
    <item>
      <title>기사 없는 검색어</title>
      <ht:approx_traffic>1000+</ht:approx_traffic>
    </item>
  </channel>
</rss>
"""


def test_parses_ht_namespace_and_ranks_by_feed_order() -> None:
    keywords = trends_rss.parse(RSS)

    assert [(k.rank, k.keyword) for k in keywords] == [(1, "우트로"), (2, "기사 없는 검색어")]
    assert keywords[0].approx_traffic == "2000+"
    # 관련 기사는 첫 건만 나른다(피드는 여러 건을 준다).
    assert keywords[0].news_title == "K-푸드 수출 확대"
    assert keywords[0].news_url == "https://example.com/a"
    # 기사가 없는 항목도 정상이다. 빈 문자열이지 누락이 아니다.
    assert keywords[1].news_title == ""


def test_html_instead_of_xml_degrades_to_empty() -> None:
    """폐기된 경로는 404 와 함께 HTML 을 준다. 예외가 아니라 빈 목록이어야 한다.

    예외로 터지면 워커 잡이 재시도로 쌓이고, 커널의 '빈 결과는 덮어쓰지 않는다' 보호도 못 받는다.
    """
    assert trends_rss.parse("<html><body>404</body></html>") == []
    assert trends_rss.parse("") == []


def test_codec_round_trip_keeps_every_field() -> None:
    original = trends_rss.parse(RSS)

    assert decode_keywords(encode_keywords(original)) == original


@pytest.mark.asyncio
async def test_non_200_is_not_parsed_as_an_empty_feed() -> None:
    """상태코드를 보지 않으면 404 본문(HTML)이 '검색어 0건'으로 조용히 굳는다."""
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(404, text="<html>not found</html>")

    source = GoogleTrendsSource(
        GoogleTrendsRssAdapter(
            base_url="https://trends.example.com",
            timeout=1.0,
            transport=httpx.MockTransport(handler),
        )
    )
    items = await source.collect(make_target("KR"))
    await source.aclose()

    assert items == []
    assert calls[0].url.params["geo"] == "KR"
    assert calls[0].url.path == "/trending/rss"


@pytest.mark.asyncio
async def test_collect_returns_stable_json() -> None:
    source = GoogleTrendsSource(
        GoogleTrendsRssAdapter(
            base_url="https://trends.example.com",
            timeout=1.0,
            transport=httpx.MockTransport(lambda _: httpx.Response(200, text=RSS)),
        )
    )
    items = await source.collect(make_target("kr"))
    await source.aclose()

    assert items[0] == {
        "rank": 1,
        "keyword": "우트로",
        "approxTraffic": "2000+",
        "newsTitle": "K-푸드 수출 확대",
        "newsUrl": "https://example.com/a",
    }


def test_target_key_is_case_insensitive() -> None:
    """같은 지역을 다른 표기로 요청해도 한 행, 한 잡으로 수렴해야 한다."""
    assert make_target("kr") == make_target("KR")
    assert make_target("KR").params == {"geo": "KR"}
