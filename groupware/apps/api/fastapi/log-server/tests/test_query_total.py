"""총계(LogPage.total) 잠금: 목록 화면이 필터를 비교할 수 있는 근거.

왜 이 값이 필요한가: 목록은 커서 페이지네이션이라 화면에 담긴 행 수가 '더 보기'를 몇 번
눌렀는지에 달려 있다. 그 수를 필터 결과로 읽으면, 같은 데이터를 두 필터로 봤을 때
(예: 채널 전체 93건을 다 펼친 뒤 채널 하나를 고르면 1페이지 50건) 없는 차이가 보인다.
총계는 그 착시를 없애려고 둔 값이므로 조건의 성질로 유지되어야 한다.

그래서 잠그는 것: (1) 첫 페이지에만 실린다, (2) 이어보기는 다시 세지 않는다,
(3) 한 페이지에 다 담기면 세지 않는다(불필요한 스캔), (4) 총계 조회도 인가된 필터를 받는다.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.domains.query.core.application.services import LogQueryService
from app.domains.query.core.domain.entities import LogRecord
from app.domains.query.core.domain.types import (
    LogFilter,
    PageRequest,
    ScopeRequest,
)


class _CountingRepo:
    """LogQueryPort 대역: 총계 호출 횟수와 넘겨받은 필터를 기록한다."""

    def __init__(self, rows: list[LogRecord], total: int) -> None:
        self.rows = rows
        self.total = total
        self.count_calls = 0
        self.count_filter: LogFilter | None = None

    async def find_many(self, filters: LogFilter, page: PageRequest) -> list[LogRecord]:
        return self.rows[: page.limit]

    async def count_many(self, filters: LogFilter) -> int:
        self.count_calls += 1
        self.count_filter = filters
        return self.total

    async def aggregate_usage(self, query) -> list:  # noqa: ANN001 - 이 파일에서 쓰지 않는다
        return []


def _record(index: int) -> LogRecord:
    return LogRecord(
        event_id=f"00000000-0000-0000-0000-{index:012d}",
        occurred_at=datetime(2026, 7, 28, 12, 0, tzinfo=timezone.utc),
        ingested_at=datetime(2026, 7, 28, 12, 0, tzinfo=timezone.utc),
        environment="prod",
        service="csc-marketing",
        scope="AI_TOOL",
        ai_tool="marketing-video",
        organization_id=42,
        kind="AUDIT",
        level="INFO",
        action="marketing.plan.generated",
        message="",
        trace_id=None,
        request_id=None,
        job_id=None,
        actor_type=None,
        actor_id=None,
        duration_ms=None,
        token_input=None,
        token_output=None,
    )


async def test_첫_페이지는_조건_전체_건수를_함께_준다() -> None:
    """화면 1페이지(3건)만 받아도 조건에 93건이 맞는다는 사실을 알 수 있어야 한다."""
    repo = _CountingRepo(rows=[_record(i) for i in range(10)], total=93)
    service = LogQueryService(repo)

    page = await service.search(
        ScopeRequest(all_orgs=True), LogFilter(), PageRequest(limit=3)
    )

    assert len(page.records) == 3
    assert page.total == 93
    assert repo.count_calls == 1


async def test_이어보기_페이지는_다시_세지_않는다() -> None:
    """총계는 필터의 성질이라 페이지마다 답이 같다. 매번 세면 같은 답에 스캔만 반복한다."""
    repo = _CountingRepo(rows=[_record(i) for i in range(10)], total=93)
    service = LogQueryService(repo)
    cursor = (datetime(2026, 7, 28, 12, 0, tzinfo=timezone.utc), "cursor-id")

    page = await service.search(
        ScopeRequest(all_orgs=True), LogFilter(), PageRequest(limit=3, cursor=cursor)
    )

    assert page.total is None
    assert repo.count_calls == 0


async def test_한_페이지에_다_담기면_세지_않는다() -> None:
    """다음 커서가 없으면 받은 행 수가 곧 총계다. 저장소를 한 번 더 때릴 이유가 없다."""
    repo = _CountingRepo(rows=[_record(0), _record(1)], total=2)
    service = LogQueryService(repo)

    page = await service.search(
        ScopeRequest(all_orgs=True), LogFilter(), PageRequest(limit=10)
    )

    assert page.total == 2
    assert repo.count_calls == 0


async def test_총계도_인가로_좁혀진_필터로_센다() -> None:
    """총계가 인가 전 필터를 세면 남의 조직 건수가 숫자로 새어 나간다."""
    repo = _CountingRepo(rows=[_record(i) for i in range(10)], total=93)
    service = LogQueryService(repo)

    await service.search(
        ScopeRequest(organization_id=42),
        LogFilter(channel_id=7),
        PageRequest(limit=3),
    )

    assert repo.count_filter is not None
    assert repo.count_filter.organization_id == 42
    assert repo.count_filter.channel_id == 7
