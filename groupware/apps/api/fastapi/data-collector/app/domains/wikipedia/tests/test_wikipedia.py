"""위키백과 소스 테스트: 언어판별 API 분기, 응답 구조 차이, 없는 문서, 제목 정규화."""

from __future__ import annotations

import httpx
import pytest

from app.domains.wikipedia.adapters.outbound.collection.plugin import (
    WikipediaSummarySource,
)
from app.domains.wikipedia.adapters.outbound.external.wikipedia import WikipediaAdapter
from app.domains.wikipedia.adapters.outbound.parser import article_summary
from app.domains.wikipedia.core.domain.codec import decode_summaries, encode_summaries
from app.domains.wikipedia.core.domain.target import make_target
from app.domains.wikipedia.core.domain.types import Language

# formatversion=2 응답(배열)
ACTION_V2 = {
    "query": {
        "pages": [
            {"pageid": 86418, "title": "김치찌개", "extract": "김치를 넣고 끓인 찌개이다."}
        ]
    }
}
# 옛 응답(pageid 키 객체). 캐시나 프록시를 거쳐 이 형태가 올 수 있다.
ACTION_V1 = {
    "query": {
        "pages": {
            "86418": {"pageid": 86418, "title": "김치찌개", "extract": "김치를 넣고 끓인 찌개이다."}
        }
    }
}
REST = {
    "title": "Kimchi-jjigae",
    "extract": "Kimchi-jjigae is a Korean stew.",
    "content_urls": {"desktop": {"page": "https://en.wikipedia.org/wiki/Kimchi-jjigae"}},
    "thumbnail": {"source": "https://upload.example.com/thumb.jpg"},
}


def test_action_api_pages_may_be_a_list_or_an_object() -> None:
    """`query.pages` 는 배열이 아니라 pageid 키 객체일 수 있다. 인덱스 0 으로 못 꺼낸다."""
    base = "https://ko.wikipedia.org/wiki/"
    from_v2 = article_summary.parse_action_api(ACTION_V2, base)
    from_v1 = article_summary.parse_action_api(ACTION_V1, base)

    assert from_v2 == from_v1
    assert from_v2[0].title == "김치찌개"
    # action API 는 문서 주소를 주지 않으므로 제목으로 만든다.
    assert from_v2[0].url == "https://ko.wikipedia.org/wiki/김치찌개"


def test_missing_page_is_empty_not_an_entry() -> None:
    """없는 문서는 pageid 대신 missing 플래그로 온다. 빈 제목의 항목을 만들면 안 된다."""
    payload = {"query": {"pages": [{"title": "없는문서", "missing": True}]}}

    assert article_summary.parse_action_api(payload, "https://ko.wikipedia.org/wiki/") == []


def test_rest_summary_has_a_different_shape() -> None:
    summaries = article_summary.parse_rest_summary(REST)

    assert summaries[0].url == "https://en.wikipedia.org/wiki/Kimchi-jjigae"
    assert summaries[0].thumbnail_url == "https://upload.example.com/thumb.jpg"


def test_codec_round_trip_keeps_every_field() -> None:
    original = article_summary.parse_rest_summary(REST)

    assert decode_summaries(encode_summaries(original)) == original


def test_title_normalization_collapses_to_one_target() -> None:
    """공백과 언더스코어는 위키백과에서 같은 문서다. 두 행으로 저장되면 안 된다."""
    assert make_target(Language.KO, "김치 찌개") == make_target(Language.KO, "김치_찌개")
    # 언어가 다르면 다른 문서다.
    assert make_target(Language.KO, "김치찌개") != make_target(Language.EN, "김치찌개")


@pytest.mark.asyncio
async def test_korean_calls_action_api_and_english_calls_rest() -> None:
    """언어판마다 부르는 API 가 다르다. 한 파서로 둘 다 읽으려 하면 한쪽이 조용히 빈다."""
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        if "/w/api.php" in request.url.path:
            return httpx.Response(200, json=ACTION_V2)
        return httpx.Response(200, json=REST)

    source = WikipediaSummarySource(
        WikipediaAdapter(
            base_url_template="https://{lang}.wikipedia.example.com",
            user_agent="csc-data-collector/1.0 (https://example.com; ops@example.com)",
            timeout=1.0,
            transport=httpx.MockTransport(handler),
        )
    )
    ko = await source.collect(make_target(Language.KO, "김치찌개"))
    en = await source.collect(make_target(Language.EN, "Kimchi jjigae"))
    await source.aclose()

    assert ko[0]["title"] == "김치찌개"
    # 문서 주소는 설정된 호스트에서 파생한다(호스트 문자열을 코드에 두 벌로 두지 않는다).
    assert ko[0]["url"] == "https://ko.wikipedia.example.com/wiki/김치찌개"
    assert en[0]["title"] == "Kimchi-jjigae"  # 리다이렉트로 확정된 제목
    assert "/w/api.php" in seen[0]
    # 제목이 path 라 URL 인코딩된다(인코딩을 빼면 슬래시 든 제목에서 경로가 갈라진다).
    assert "/api/rest_v1/page/summary/Kimchi_jjigae" in seen[1]


@pytest.mark.asyncio
async def test_user_agent_identifies_the_tool_not_a_browser() -> None:
    """위키미디어는 브라우저를 흉내 낸 UA 를 403 으로 막는다(실측: Chrome UA 403, 서술형 200).

    공용 클라이언트 기본값이 브라우저 UA 라 이 소스가 덮어쓴다. 그 덮어쓰기가 사라지면 수집이
    전부 403 이 되고, 커널은 빈 결과를 덮어쓰지 않으므로 로그 말고는 아무 징후가 없다.
    """
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers["user-agent"])
        return httpx.Response(200, json=REST)

    source = WikipediaSummarySource(
        WikipediaAdapter(
            base_url_template="https://{lang}.wikipedia.example.com",
            user_agent="csc-data-collector/1.0 (https://example.com; ops@example.com)",
            timeout=1.0,
            transport=httpx.MockTransport(handler),
        )
    )
    await source.collect(make_target(Language.EN, "Kimchi"))
    await source.aclose()

    assert seen[0].startswith("csc-data-collector/")
    assert "Mozilla" not in seen[0]


@pytest.mark.asyncio
async def test_unknown_article_degrades_to_empty() -> None:
    """REST 는 없는 문서에 404 를 준다. 수집 실패가 아니라 빈 결과다."""
    source = WikipediaSummarySource(
        WikipediaAdapter(
            base_url_template="https://{lang}.wikipedia.example.com",
            user_agent="csc-data-collector/1.0 (https://example.com; ops@example.com)",
            timeout=1.0,
            transport=httpx.MockTransport(lambda _: httpx.Response(404, json={})),
        )
    )
    assert await source.collect(make_target(Language.EN, "Nope")) == []
    await source.aclose()
