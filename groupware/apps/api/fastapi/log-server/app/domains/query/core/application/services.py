"""Inbound Port 구현 = 조회 비즈니스 로직 + 조직 스코프 인가.

이 서비스의 가장 중요한 책임은 조회가 아니라 인가다. 저장소 어댑터는 넘겨받은 필터를
그대로 실행할 뿐이므로, 조직 경계를 지키는 코드가 사는 곳은 여기 한 군데뿐이다.

인가 규칙:
1. `all_orgs` (플랫폼 ROOT): 좁히지 않는다. 전 조직 + PLATFORM 스코프까지 본다.
2. 조직 스코프 호출자: 필터의 organization_id 를 세션 조직으로 강제하고,
   플랫폼 감사(scope=PLATFORM)는 결과에서 배제한다.
3. 둘 다 없음. 거부. 스코프 없는 조회는 곧 전체 조회라 기본값이 될 수 없다(fail-closed).
"""

from __future__ import annotations

from dataclasses import replace

from csc_log_contracts import LogScope

from app.shared.domain.errors import InvalidQueryError, ScopeDeniedError

from ..domain.entities import UsageBucket
from ..domain.types import LogFilter, LogPage, PageRequest, ScopeRequest, UsageQuery
from .ports.outbound import LogQueryPort


class LogQueryService:
    """LogQueryInboundPort 구현."""

    def __init__(self, repository: LogQueryPort) -> None:
        self._repository = repository

    async def search(
        self,
        scope: ScopeRequest,
        filters: LogFilter,
        page: PageRequest,
    ) -> LogPage:
        scoped = self._apply_scope(scope, filters)
        normalized_page = page.normalized()

        # limit+1 을 받아 '다음 페이지 존재'를 별도 count 없이 판정한다.
        probe = replace(normalized_page, limit=normalized_page.limit + 1)
        rows = await self._repository.find_many(scoped, probe)

        has_more = len(rows) > normalized_page.limit
        records = rows[: normalized_page.limit]
        next_cursor = (
            (records[-1].occurred_at, records[-1].event_id) if has_more and records else None
        )

        # 총계는 첫 페이지에서만 센다. 총계는 필터의 성질이지 페이지의 성질이 아니라서
        # 더 보기마다 다시 세면 같은 답을 얻으려고 스캔을 반복한다. 첫 페이지가 다 담았으면
        # (다음 커서 없음) 로드된 행 수가 곧 총계라 조회조차 하지 않는다.
        #
        # find_many 와 동시에 던지지 않는 이유: ClickHouse 클라이언트가 프로세스 공유
        # 싱글턴이라(container.py) 한 커넥션에 질의를 겹치지 않는다. 총계는 첫 페이지 한 번뿐이다.
        total: int | None = None
        if normalized_page.cursor is None:
            total = (
                len(records)
                if next_cursor is None
                else await self._repository.count_many(scoped)
            )

        return LogPage(records=records, next_cursor=next_cursor, total=total)

    async def usage(
        self,
        scope: ScopeRequest,
        query: UsageQuery,
    ) -> list[UsageBucket]:
        if query.since >= query.until:
            raise InvalidQueryError("since 는 until 보다 앞서야 합니다.")

        if scope.is_platform_wide:
            return await self._repository.aggregate_usage(query)

        organization_id = self._require_organization(scope, query.organization_id)
        return await self._repository.aggregate_usage(
            replace(query, organization_id=organization_id)
        )

    # ---- 인가 ----
    def _apply_scope(self, scope: ScopeRequest, filters: LogFilter) -> LogFilter:
        if scope.is_platform_wide:
            # 플랫폼 ROOT: 요청한 필터를 그대로 존중한다(특정 조직 지정도 허용).
            return filters

        organization_id = self._require_organization(scope, filters.organization_id)

        if filters.scope is LogScope.PLATFORM:
            # 플랫폼 운영 로그는 조직 관리자에게 보이지 않는다.
            raise ScopeDeniedError("플랫폼 스코프 로그는 조회할 수 없습니다.")

        return replace(filters, organization_id=organization_id)

    @staticmethod
    def _require_organization(scope: ScopeRequest, requested: int | None) -> int:
        if scope.organization_id is None:
            # 스코프 없는 조회 = 전체 조회. 기본값으로 열어두면 안 된다.
            raise ScopeDeniedError("조직 스코프가 없는 로그 조회는 허용되지 않습니다.")
        if requested is not None and requested != scope.organization_id:
            # 조용히 자기 조직으로 바꿔치기하면 호출자가 남의 데이터를 봤다고 착각한다.
            # 명시적으로 거절해 BFF 의 버그가 드러나게 한다.
            raise ScopeDeniedError("다른 조직의 로그는 조회할 수 없습니다.")
        return scope.organization_id
