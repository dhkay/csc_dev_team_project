"""검색광고 키워드도구 소스 테스트: 서명 헤더, 검색량 파싱, 정렬, 자격 미설정."""

from __future__ import annotations

import httpx
import pytest

from app.domains.naver_searchad.adapters.outbound.collection.plugin import (
    NaverAdKeywordSource,
)
from app.domains.naver_searchad.adapters.outbound.external.keyword_tool import (
    NaverSearchAdKeywordToolAdapter,
)
from app.domains.naver_searchad.adapters.outbound.parser import keyword_tool
from app.domains.naver_searchad.core.domain.codec import (
    decode_keywords,
    encode_keywords,
)
from app.domains.naver_searchad.core.domain.target import make_target

# 실측 응답(sandbox/api-test/responses/06)의 구조. 검색량이 적은 행은 `< 10` 문자열로 온다.
PAYLOAD = {
    "keywordList": [
        {
            "relKeyword": "김치찌개레시피",
            "monthlyPcQcCnt": 460,
            "monthlyMobileQcCnt": 10100,
            "compIdx": "높음",
        },
        {
            "relKeyword": "김치찌개",
            "monthlyPcQcCnt": 6250,
            "monthlyMobileQcCnt": 68700,
            "compIdx": "중간",
        },
        {
            "relKeyword": "아주희귀한말",
            "monthlyPcQcCnt": "< 10",
            "monthlyMobileQcCnt": "< 10",
            "compIdx": "낮음",
        },
    ]
}


def _adapter(handler, **overrides) -> NaverSearchAdKeywordToolAdapter:
    kwargs = {
        "base_url": "https://searchad.example.com",
        "access_license": "license",
        "secret_key": "secret",
        "customer_id": "1234",
        "timeout": 1.0,
        "transport": httpx.MockTransport(handler),
    }
    kwargs.update(overrides)
    return NaverSearchAdKeywordToolAdapter(**kwargs)


def test_sorts_by_total_searches_and_ranks() -> None:
    """벤더 순서를 그대로 두면 재수집마다 저장 내용이 흔들린다. 정렬을 여기서 고정한다."""
    keywords = keyword_tool.parse(PAYLOAD)

    assert [k.keyword for k in keywords] == ["김치찌개", "김치찌개레시피", "아주희귀한말"]
    assert [k.rank for k in keywords] == [1, 2, 3]
    assert keywords[0].monthly_searches == 6250 + 68700
    assert keywords[0].pc_searches == 6250
    assert keywords[0].mobile_searches == 68700


def test_range_valued_search_counts_do_not_kill_the_batch() -> None:
    """`< 10` 에 int() 를 그대로 걸면 그 한 건 때문에 목록 전체가 사라진다."""
    rare = keyword_tool.parse(PAYLOAD)[-1]

    assert rare.keyword == "아주희귀한말"
    assert rare.monthly_searches == 0


def test_codec_round_trip_keeps_every_field() -> None:
    original = keyword_tool.parse(PAYLOAD)

    assert decode_keywords(encode_keywords(original)) == original


@pytest.mark.asyncio
async def test_signature_headers_are_built_per_call() -> None:
    """서명은 1분 안에 만료된다. 저장해 두고 재사용하면 403 이 난다."""
    seen: list[httpx.Headers] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers)
        return httpx.Response(200, json=PAYLOAD)

    source = NaverAdKeywordSource(_adapter(handler))
    await source.collect(make_target("김치찌개"))
    await source.collect(make_target("된장찌개"))
    await source.aclose()

    assert seen[0]["x-api-key"] == "license"
    assert seen[0]["x-customer"] == "1234"
    assert seen[0]["x-signature"]
    # 타임스탬프가 서명 입력에 들어가므로 호출마다 서명이 새로 만들어진다.
    assert seen[0]["x-timestamp"] and seen[1]["x-timestamp"]


@pytest.mark.asyncio
async def test_missing_credentials_skip_the_call_entirely() -> None:
    """빈 자격으로 부르면 401 이 오고, 그 401 은 '키가 틀렸다'와 구분되지 않는다."""
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, json=PAYLOAD)

    source = NaverAdKeywordSource(_adapter(handler, secret_key=""))
    items = await source.collect(make_target("김치찌개"))
    await source.aclose()

    assert items == []
    assert called is False


def test_target_key_ignores_spacing() -> None:
    """검색광고 API 가 공백을 무시하므로 같은 결과가 두 행으로 저장되면 안 된다."""
    assert make_target("수분 크림") == make_target("수분크림")
    assert make_target("수분 크림").params == {"keyword": "수분크림"}
