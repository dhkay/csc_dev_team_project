"""조직 스코프 인가 잠금: 이 파일이 지키는 건 조회가 아니라 조직 경계다.

저장소 어댑터는 넘겨받은 필터를 그대로 실행하므로, 여기가 뚫리면 곧바로 조직 간 로그
유출이다. 그래서 "무엇이 허용되는가"보다 "무엇이 거부되는가"를 더 촘촘히 잠근다.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from csc_log_contracts import LogScope

from app.domains.query.core.application.services import LogQueryService
from app.domains.query.core.domain.entities import LogRecord
from app.domains.query.core.domain.types import (
    LogFilter,
    PageRequest,
    ScopeRequest,
    UsageQuery,
)
from app.shared.domain.errors import InvalidQueryError, ScopeDeniedError


class _FakeRepo:
    """LogQueryPort 의 대역: 서비스가 넘긴 필터를 그대로 기록해 검증에 쓴다."""

    def __init__(self, rows: list[LogRecord] | None = None) -> None:
        self.rows = rows or []
        self.last_filter: LogFilter | None = None
        self.last_usage: UsageQuery | None = None
        self.count_calls = 0

    async def find_many(self, filters: LogFilter, page: PageRequest) -> list[LogRecord]:
        self.last_filter = filters
        return self.rows[: page.limit]

    async def count_many(self, filters: LogFilter) -> int:
        self.count_calls += 1
        return len(self.rows)

    async def aggregate_usage(self, query: UsageQuery) -> list:
        self.last_usage = query
        return []


def _record(index: int) -> LogRecord:
    return LogRecord(
        event_id=f"00000000-0000-0000-0000-{index:012d}",
        occurred_at=datetime(2026, 7, 28, 12, 0, tzinfo=timezone.utc),
        ingested_at=datetime(2026, 7, 28, 12, 0, tzinfo=timezone.utc),
        environment="prod",
        service="video-model",
        scope="ORGANIZATION",
        ai_tool="marketing-video",
        organization_id=42,
        kind="EVENT",
        level="INFO",
        action="video_job.created",
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


async def test_조직_호출자는_자기_조직으로_강제된다() -> None:
    repo = _FakeRepo()
    service = LogQueryService(repo)

    await service.search(
        ScopeRequest(organization_id=42),
        LogFilter(organization_id=None),  # 요청이 조직을 안 줘도
        PageRequest(),
    )

    assert repo.last_filter is not None
    assert repo.last_filter.organization_id == 42  # 세션 조직으로 채워진다


async def test_남의_조직을_요청하면_거부된다() -> None:
    """조용히 자기 조직으로 바꿔치기하지 않는다. BFF 버그가 드러나야 한다."""
    service = LogQueryService(_FakeRepo())

    with pytest.raises(ScopeDeniedError):
        await service.search(
            ScopeRequest(organization_id=42),
            LogFilter(organization_id=43),
            PageRequest(),
        )


async def test_스코프가_없으면_거부된다() -> None:
    """스코프 없는 조회 = 전체 조회. 기본값으로 열려 있으면 안 된다(fail-closed)."""
    service = LogQueryService(_FakeRepo())

    with pytest.raises(ScopeDeniedError):
        await service.search(ScopeRequest(), LogFilter(), PageRequest())


async def test_조직_관리자에게_플랫폼_감사로그는_보이지_않는다() -> None:
    service = LogQueryService(_FakeRepo())

    with pytest.raises(ScopeDeniedError):
        await service.search(
            ScopeRequest(organization_id=42),
            LogFilter(scope=LogScope.PLATFORM),
            PageRequest(),
        )


async def test_플랫폼_ROOT_는_좁혀지지_않는다() -> None:
    repo = _FakeRepo()
    service = LogQueryService(repo)

    await service.search(
        ScopeRequest(all_orgs=True),
        LogFilter(scope=LogScope.PLATFORM),
        PageRequest(),
    )

    assert repo.last_filter is not None
    assert repo.last_filter.organization_id is None
    assert repo.last_filter.scope is LogScope.PLATFORM


async def test_플랫폼_ROOT_는_특정_조직을_지목할_수_있다() -> None:
    repo = _FakeRepo()
    service = LogQueryService(repo)

    await service.search(
        ScopeRequest(all_orgs=True), LogFilter(organization_id=43), PageRequest()
    )

    assert repo.last_filter is not None
    assert repo.last_filter.organization_id == 43


async def test_사용량_집계도_조직으로_강제된다() -> None:
    repo = _FakeRepo()
    service = LogQueryService(repo)
    now = datetime.now(timezone.utc)

    await service.usage(
        ScopeRequest(organization_id=42),
        UsageQuery(since=now - timedelta(days=7), until=now),
    )

    assert repo.last_usage is not None
    assert repo.last_usage.organization_id == 42


async def test_사용량_기간이_뒤집히면_거부된다() -> None:
    service = LogQueryService(_FakeRepo())
    now = datetime.now(timezone.utc)

    with pytest.raises(InvalidQueryError):
        await service.usage(
            ScopeRequest(all_orgs=True),
            UsageQuery(since=now, until=now - timedelta(days=1)),
        )


async def test_페이지_한도를_넘으면_잘린다_그리고_커서가_생긴다() -> None:
    """limit+1 조회로 다음 페이지 존재를 별도 count 없이 판정한다."""
    repo = _FakeRepo(rows=[_record(i) for i in range(5)])
    service = LogQueryService(repo)

    page = await service.search(
        ScopeRequest(all_orgs=True), LogFilter(), PageRequest(limit=3)
    )

    assert len(page.records) == 3
    assert page.next_cursor is not None


async def test_결과가_한도보다_적으면_커서가_없다() -> None:
    repo = _FakeRepo(rows=[_record(0), _record(1)])
    service = LogQueryService(repo)

    page = await service.search(
        ScopeRequest(all_orgs=True), LogFilter(), PageRequest(limit=10)
    )

    assert len(page.records) == 2
    assert page.next_cursor is None
