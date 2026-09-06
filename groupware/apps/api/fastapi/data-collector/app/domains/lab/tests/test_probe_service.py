"""LabProbeService 단위 테스트: 이 도메인의 유일한 규칙을 고정한다.

규칙: 업스트림 실패는 예외가 아니라 결과다. 401 본문이 손상 없이 호출자에게 도착해야 한다.
"""

from __future__ import annotations

import pytest

from app.domains.lab.core.application.services import LabProbeService
from app.domains.lab.core.domain.entities import (
    KeywordToolQuery,
    SearchTrendQuery,
    UpstreamExchange,
)
from app.domains.lab.core.domain.errors import (
    CredentialsNotConfiguredError,
    UpstreamUnreachableError,
)
from app.domains.lab.core.domain.types import ProbeOutcome

# sandbox/api-test/responses/04_naver_shopping_categories.json 의 실제 응답 본문.
SCOPE_401_BODY = {
    "errorMessage": "Scope Status Invalid : Authentication failed. (인증에 실패했습니다.)",
    "errorCode": "024",
}

QUERY = SearchTrendQuery(
    start_date="2026-05-01",
    end_date="2026-08-01",
    time_unit="month",
    keyword_groups=(),
)


def _exchange(status: int, body: object) -> UpstreamExchange:
    return UpstreamExchange(
        method="POST",
        url="https://openapi.naver.com/v1/datalab/search",
        sent_header_names=("X-Naver-Client-Id", "X-Naver-Client-Secret"),
        request_body={"startDate": "2026-05-01"},
        status_code=status,
        elapsed_ms=143,
        body=body,
    )


class _StubPort:
    """호출 1회를 기록하고 주어진 결과(또는 예외)를 돌려준다."""

    def __init__(self, result: object) -> None:
        self._result = result
        self.called = False
        self.closed = 0

    async def _respond(self, *_args, **_kwargs):
        self.called = True
        if isinstance(self._result, Exception):
            raise self._result
        return self._result

    search = categories = keyword_age = keywords = _respond

    async def aclose(self) -> None:
        self.closed += 1


def _service(port: _StubPort) -> LabProbeService:
    return LabProbeService(
        datalab_search=port,
        shopping_categories=port,
        shopping_keyword_age=port,
        searchad_keywords=port,
    )


@pytest.mark.asyncio
async def test_upstream_401_is_a_result_with_the_body_intact() -> None:
    result = await _service(_StubPort(_exchange(401, SCOPE_401_BODY))).datalab_search(
        QUERY
    )

    assert result.outcome is ProbeOutcome.UPSTREAM_ERROR
    assert result.exchange is not None
    assert result.exchange.status_code == 401
    # 본문은 손대지 않는다: errorCode 가 detail 문자열로 뭉개지면 진단이 불가능해진다.
    assert result.exchange.body == SCOPE_401_BODY
    # 024 는 상태코드만으로 진단이 안 되는 대표 사례라 조치 안내가 붙는다.
    assert result.hint is not None and "쇼핑인사이트" in result.hint


@pytest.mark.asyncio
async def test_upstream_2xx_is_ok_and_carries_no_hint() -> None:
    result = await _service(_StubPort(_exchange(200, {"results": []}))).datalab_search(
        QUERY
    )
    assert result.outcome is ProbeOutcome.OK
    assert result.hint is None


@pytest.mark.asyncio
async def test_missing_credentials_reports_env_names_and_skips_the_call() -> None:
    port = _StubPort(CredentialsNotConfiguredError(["NAVER_TREND_CLIENT_ID"]))
    result = await _service(port).datalab_search(QUERY)

    assert result.outcome is ProbeOutcome.CREDENTIALS_MISSING
    assert result.missing_env == ("NAVER_TREND_CLIENT_ID",)
    # 상태코드가 없다는 사실이 곧 진단이다(업스트림이 거절한 게 아니라 우리가 안 불렀다).
    assert result.exchange is None


@pytest.mark.asyncio
async def test_unreachable_upstream_is_not_confused_with_a_rejection() -> None:
    result = await _service(
        _StubPort(UpstreamUnreachableError("ConnectTimeout"))
    ).datalab_search(QUERY)
    assert result.outcome is ProbeOutcome.UNREACHABLE
    assert result.exchange is None


@pytest.mark.asyncio
async def test_keywordstool_normalizes_counts_and_flags_truncation() -> None:
    rows = [
        {"relKeyword": "김치찌개", "monthlyPcQcCnt": 1200, "monthlyMobileQcCnt": 73750},
        # 저볼륨 키워드는 숫자가 아니라 "< 10" 문자열로 온다(실측).
        {
            "relKeyword": "희귀키워드",
            "monthlyPcQcCnt": "< 10",
            "monthlyMobileQcCnt": "< 10",
        },
        {"relKeyword": "중간키워드", "monthlyPcQcCnt": 500, "monthlyMobileQcCnt": 500},
    ]
    port = _StubPort(_exchange(200, {"keywordList": rows}))
    result, normalized = await _service(port).searchad_keywords(
        KeywordToolQuery(hint_keywords=("김치찌개",), limit=2)
    )

    assert result.outcome is ProbeOutcome.OK
    assert normalized is not None
    assert normalized.keywords[0].monthly_searches == 74950  # pc + mobile
    assert normalized.keywords[1].keyword == "중간키워드"  # 검색량 내림차순
    assert (normalized.returned, normalized.total, normalized.truncated) == (2, 3, True)


@pytest.mark.asyncio
async def test_aclose_closes_every_adapter() -> None:
    """커넥션 풀 정리. 마운트된 서브앱의 lifespan 이 돌지 않아 부모가 이걸 부르는 구조라,
    위임이 끊기면 풀이 조용히 새고 아무 테스트도 실패하지 않는다."""
    port = _StubPort(_exchange(200, {}))
    await _service(port).aclose()
    assert port.closed == 4  # 어댑터 4개(테스트에선 같은 스텁을 4번 주입)


@pytest.mark.asyncio
async def test_keywordstool_does_not_normalize_a_failed_call() -> None:
    """실패 응답에 normalized 를 붙이면 빈 결과가 '키워드 0건' 으로 읽혀 실패를 가린다."""
    port = _StubPort(_exchange(403, {"title": "Unauthorized"}))
    result, normalized = await _service(port).searchad_keywords(
        KeywordToolQuery(hint_keywords=("김치찌개",))
    )
    assert result.outcome is ProbeOutcome.UPSTREAM_ERROR
    assert normalized is None
