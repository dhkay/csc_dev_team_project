"""Outbound Port: 저장소 조회 계약. Protocol 로 선언.

포트는 이미 인가로 좁혀진 필터만 받는다. 저장소 어댑터가 인가를 판단하지 않게 하려는
의도적 설계다. 인가 판단이 어댑터로 새면 저장소를 교체할 때 함께 복제된다.
"""

from __future__ import annotations

from typing import Protocol

from ...domain.entities import LogRecord, UsageBucket
from ...domain.types import LogFilter, PageRequest, UsageQuery


class LogQueryPort(Protocol):
    async def find_many(
        self,
        filters: LogFilter,
        page: PageRequest,
    ) -> list[LogRecord]:
        """최신순(occurred_at DESC, event_id DESC)으로 limit+1 건까지 조회.

        서비스가 limit+1 번째 행의 존재로 다음 커서를 만든다.
        """
        ...

    async def count_many(self, filters: LogFilter) -> int:
        """필터에 맞는 전체 행 수. 커서와 무관하게 조건 전체를 센다.

        `find_many` 의 limit+1 프로브는 '다음 페이지가 있나'만 답한다. '조건에 몇 건이
        맞나'는 별개의 질문이고, 목록 화면이 필터를 비교하려면 그 답이 있어야 한다.
        """
        ...

    async def aggregate_usage(self, query: UsageQuery) -> list[UsageBucket]: ...
