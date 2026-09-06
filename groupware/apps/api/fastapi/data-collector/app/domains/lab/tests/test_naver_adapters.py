"""네이버 어댑터 테스트: 벤더 계약(헤더/본문/서명)을 고정한다.

여기서 잡는 실패들은 전부 성공처럼 보이는 종류다. 인코딩이 깨지면 네이버는 200 + 빈 data 를 주고,
서명이 틀리면 자격 문제로 오진하게 된다.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json

import httpx
import pytest

from app.shared.naver_signing import sign
from app.domains.lab.adapters.outbound.external.naver.openapi import (
    NaverDatalabSearchAdapter,
)
from app.domains.lab.adapters.outbound.external.naver.searchad import (
    NaverSearchAdKeywordToolAdapter,
)
from app.domains.lab.core.domain.entities import (
    KeywordGroup,
    KeywordToolQuery,
    SearchTrendQuery,
)
from app.domains.lab.core.domain.errors import CredentialsNotConfiguredError
from app.domains.lab.core.domain.types import LabSource


class _Credentials:
    def __init__(self, values: dict[str, str]) -> None:
        self._values = values

    async def for_source(self, source: LabSource) -> dict[str, str]:
        return self._values


def _capture() -> tuple[list[httpx.Request], httpx.MockTransport]:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"results": []})

    return seen, httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_datalab_search_sends_client_headers_and_utf8_body() -> None:
    seen, transport = _capture()
    adapter = NaverDatalabSearchAdapter(
        base_url="https://openapi.naver.com",
        credentials=_Credentials(
            {"NAVER_TREND_CLIENT_ID": "id", "NAVER_TREND_CLIENT_SECRET": "secret"}
        ),
        timeout=5.0,
        transport=transport,
    )
    exchange = await adapter.search(
        SearchTrendQuery(
            start_date="2026-05-01",
            end_date="2026-08-01",
            time_unit="month",
            keyword_groups=(KeywordGroup(group_name="g", keywords=("김치찌개",)),),
        )
    )
    await adapter.aclose()

    request = seen[0]
    assert request.headers["X-Naver-Client-Id"] == "id"
    assert request.headers["X-Naver-Client-Secret"] == "secret"
    # 한글이 바이트 단위로 살아 있어야 한다. 깨지면 네이버가 200 + 빈 data 를 주므로
    #   상태코드로는 절대 드러나지 않는다(실측 함정).
    body = json.loads(request.content.decode("utf-8"))
    assert body["keywordGroups"][0]["keywords"] == ["김치찌개"]
    # 시크릿 값이 아니라 이름만 기록된다.
    assert "X-Naver-Client-Secret" in exchange.sent_header_names
    assert "secret" not in str(exchange.sent_header_names)


@pytest.mark.asyncio
async def test_missing_credentials_raises_before_any_http_call() -> None:
    seen, transport = _capture()
    adapter = NaverDatalabSearchAdapter(
        base_url="https://openapi.naver.com",
        credentials=_Credentials(
            {"NAVER_TREND_CLIENT_ID": "", "NAVER_TREND_CLIENT_SECRET": ""}
        ),
        timeout=5.0,
        transport=transport,
    )
    with pytest.raises(CredentialsNotConfiguredError) as excinfo:
        await adapter.search(
            SearchTrendQuery(
                start_date="a", end_date="b", time_unit="month", keyword_groups=()
            )
        )
    await adapter.aclose()

    assert excinfo.value.missing == (
        "NAVER_TREND_CLIENT_ID",
        "NAVER_TREND_CLIENT_SECRET",
    )
    assert seen == []  # 호출을 시도조차 하지 않는다


@pytest.mark.asyncio
async def test_keywordstool_signs_the_path_without_the_query_string() -> None:
    seen, transport = _capture()
    adapter = NaverSearchAdKeywordToolAdapter(
        base_url="https://api.searchad.naver.com",
        credentials=_Credentials(
            {
                "NAVER_SEARCHAD_ACCESS_LICENSE": "license",
                "NAVER_SEARCHAD_SECRET_KEY": "topsecret",
                "NAVER_SEARCHAD_CUSTOMER_ID": "12345",
            }
        ),
        timeout=5.0,
        transport=transport,
    )
    await adapter.keywords(
        KeywordToolQuery(hint_keywords=("김치 찌개", "된장"), month="202608")
    )
    await adapter.aclose()

    request = seen[0]
    ts = request.headers["X-Timestamp"]
    assert len(ts) == 13  # 밀리초. 초 단위면 403 이 난다
    # 서명 대상은 쿼리를 제외한 path 뿐이다. 쿼리를 포함하면 401.
    assert request.headers["X-Signature"] == sign(
        "topsecret", ts, "GET", "/keywordstool"
    )
    assert "hintKeywords" not in sign("topsecret", ts, "GET", "/keywordstool")
    # 씨앗 키워드는 공백 제거 후 콤마 결합.
    assert request.url.params["hintKeywords"] == "김치찌개,된장"


def test_signature_matches_a_fixed_vector() -> None:
    expected = base64.b64encode(
        hmac.new(
            b"topsecret", b"1786680067000.GET./keywordstool", hashlib.sha256
        ).digest()
    ).decode()
    assert sign("topsecret", "1786680067000", "GET", "/keywordstool") == expected


@pytest.mark.asyncio
async def test_keywordstool_caps_hint_keywords_at_five() -> None:
    seen, transport = _capture()
    adapter = NaverSearchAdKeywordToolAdapter(
        base_url="https://api.searchad.naver.com",
        credentials=_Credentials(
            {
                "NAVER_SEARCHAD_ACCESS_LICENSE": "license",
                "NAVER_SEARCHAD_SECRET_KEY": "topsecret",
                "NAVER_SEARCHAD_CUSTOMER_ID": "12345",
            }
        ),
        timeout=5.0,
        transport=transport,
    )
    await adapter.keywords(
        KeywordToolQuery(hint_keywords=tuple(f"k{i}" for i in range(9)))
    )
    await adapter.aclose()

    assert seen[0].url.params["hintKeywords"] == "k0,k1,k2,k3,k4"
