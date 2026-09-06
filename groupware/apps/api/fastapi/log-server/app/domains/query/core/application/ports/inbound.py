"""Inbound Port: 조회 서비스 호출 계약. Protocol 로 선언.

모든 메서드가 `ScopeRequest` 를 첫 인자로 강제한다. 인가 입력을 선택 인자로 두면
언젠가 빼먹은 호출이 생기고, 그게 곧 조직 간 로그 유출이다.
"""

from __future__ import annotations

from typing import Protocol

from ...domain.entities import UsageBucket
from ...domain.types import LogFilter, LogPage, PageRequest, ScopeRequest, UsageQuery


class LogQueryInboundPort(Protocol):
    async def search(
        self,
        scope: ScopeRequest,
        filters: LogFilter,
        page: PageRequest,
    ) -> LogPage:
        """조건에 맞는 로그를 최신순으로 조회한다. 조직 스코프는 서비스가 강제한다."""
        ...

    async def usage(
        self,
        scope: ScopeRequest,
        query: UsageQuery,
    ) -> list[UsageBucket]:
        """조직/도구별 사용량 집계(호출 수, 토큰 합, p95 지연)."""
        ...
