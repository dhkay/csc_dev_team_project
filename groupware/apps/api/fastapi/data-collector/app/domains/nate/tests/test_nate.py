"""네이트 실시간 검색어 소스 테스트: EUC-KR 디코딩, 배열-의-배열 파싱, 저장 형태 왕복."""

from __future__ import annotations

import httpx
import pytest

from app.domains.nate.adapters.outbound.collection.plugin import NateRealtimeSource
from app.domains.nate.adapters.outbound.external.realtime_keywords import (
    NateRealtimeKeywordAdapter,
)
from app.domains.nate.adapters.outbound.parser import realtime_keywords
from app.domains.nate.core.domain.codec import decode_keywords, encode_keywords
from app.domains.nate.core.domain.target import make_target

# 실측 응답(sandbox/api-test/responses/09)의 구조. 객체가 아니라 배열의 배열이다.
RAW = (
    '[["1",  "메가프로젝트 점검회의",  "s",  "0",  "대통령 메가프로젝트"], '
    '["2",  "청년 AI 만남",  "s",  "0",  "AI 서울시장"]]'
)


def test_parses_positional_rows() -> None:
    keywords = realtime_keywords.parse(RAW)

    assert [(k.rank, k.keyword) for k in keywords] == [
        (1, "메가프로젝트 점검회의"),
        (2, "청년 AI 만남"),
    ]


def test_broken_rows_are_skipped_not_fatal() -> None:
    """칸이 모자란 행 하나가 목록 전체를 버리게 만들면 안 된다."""
    keywords = realtime_keywords.parse('[["1"], ["2", "정상"], "문자열", ["", ""]]')

    assert [k.keyword for k in keywords] == ["정상"]


def test_non_json_degrades_to_empty() -> None:
    """차단 페이지나 점검 안내는 JSON 이 아니다. 예외가 아니라 빈 목록이어야 한다."""
    assert realtime_keywords.parse("<html>maintenance</html>") == []
    assert realtime_keywords.parse("") == []


def test_codec_round_trip_keeps_every_field() -> None:
    original = realtime_keywords.parse(RAW)

    assert decode_keywords(encode_keywords(original)) == original


@pytest.mark.asyncio
async def test_euc_kr_body_is_decoded() -> None:
    """UTF-8 로 읽으면 한글이 통째로 깨진다. 실제로 EUC-KR 바이트를 준다."""
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, content=RAW.encode("euc-kr"))

    source = NateRealtimeSource(
        NateRealtimeKeywordAdapter(
            base_url="https://nate.example.com",
            path="/js/data/live.js",
            timeout=1.0,
            transport=httpx.MockTransport(handler),
        )
    )
    items = await source.collect(make_target())
    await source.aclose()

    assert items[0] == {"rank": 1, "keyword": "메가프로젝트 점검회의"}
    # 캐시 무효화 파라미터를 붙인다. 없으면 중간 캐시가 오래된 목록을 돌려줄 수 있다.
    assert "v" in captured[0].url.params


@pytest.mark.asyncio
async def test_connection_failure_degrades_to_empty() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    source = NateRealtimeSource(
        NateRealtimeKeywordAdapter(
            base_url="https://nate.example.com",
            path="/js/data/live.js",
            timeout=1.0,
            transport=httpx.MockTransport(handler),
        )
    )
    assert await source.collect(make_target()) == []
    await source.aclose()


def test_single_target_has_a_readable_key() -> None:
    """고를 것이 없는 소스라도 저장된 행을 눈으로 알아볼 수 있어야 한다."""
    assert make_target().target_key == "realtime"
    assert make_target().params == {}
