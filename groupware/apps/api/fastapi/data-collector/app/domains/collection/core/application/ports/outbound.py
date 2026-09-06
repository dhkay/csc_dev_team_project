"""수집 커널 Outbound 포트 (Protocol).

새 소스 = SourcePlugin 구현 1개 + 레지스트리 한 줄 + (원하면) 타입드 라우트 1개.
커널 파일은 건드리지 않는다. 이 주장이 실제로 성립하는 이유는 타깃과 결과가 제네릭이기 때문이다
(예전 포트는 인자 타입이 CrawlTarget(cid, period), 반환이 KeywordBucket 이라 데이터랩 전용이었고,
같은 주장을 적어 두고도 거짓이었다).
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any, Protocol

from ...domain.entities import CollectionTarget, StoredSnapshot


class SourcePlugin(Protocol):
    """수집 소스 1개. 커널은 이 계약만 안다.

    벤더 기벽(에러 표현, 정렬, 날짜 포맷, 인증)은 전부 collect() 안에서 흡수하고,
    커널에는 안정형 JSON 만 넘긴다.
    """

    source_id: str

    def make_target(self, params: Mapping[str, Any]) -> CollectionTarget:
        """요청 파라미터 → 타깃. 라우트와 워커가 같은 함수를 써야 키가 갈리지 않는다."""
        ...

    def retention(self, target: CollectionTarget) -> int | None:
        """보관할 항목 수. None 이면 전량 보존."""
        ...

    async def collect(self, target: CollectionTarget) -> list[dict[str, Any]]:
        """수집 + 파싱 + 안정형 정렬까지. 실패는 빈 목록으로 degrade 한다(예외를 던지지 않는다)."""
        ...

    async def aclose(self) -> None: ...


class SourcePort(Protocol):
    """소스 다중화 계약. 서비스/워커/크론이 의존하는 단일 포트."""

    def supports(self, source: str) -> bool: ...

    def make_target(
        self, source: str, params: Mapping[str, Any]
    ) -> CollectionTarget: ...

    def retention(self, target: CollectionTarget) -> int | None: ...

    async def collect(self, target: CollectionTarget) -> list[dict[str, Any]]: ...

    async def aclose(self) -> None: ...


class FreshnessPolicyPort(Protocol):
    """소스별 캐시 신선도. 카탈로그가 구현한다(정책의 주인이 소스 서술자이기 때문이다).

    커널이 전역 상수 하나로 TTL 을 정하면 쿼터가 좁은 소스가 넓은 소스의 주기를 따라간다.
    """

    def ttl_seconds(self, source_id: str) -> int: ...


class CollectionRepositoryPort(Protocol):
    """타깃별 최신 스냅샷 + 조회 이력(lazy 활성 등록)."""

    async def get(self, target: CollectionTarget) -> StoredSnapshot | None: ...

    async def upsert(
        self,
        target: CollectionTarget,
        items: list[dict[str, Any]],
        collected_at: datetime,
    ) -> None: ...

    async def mark_attempted(
        self, target: CollectionTarget, attempted_at: datetime
    ) -> None:
        """수집을 시도했다고 기록한다(성패 무관).

        이게 없으면 "아직 시도 전"과 "시도했지만 못 얻음"이 둘 다 빈 결과로 보여서
        소비자가 영원히 기다린다.
        """
        ...

    async def touch_requested(self, target: CollectionTarget) -> None: ...

    async def list_active_targets(self, max_idle_days: int) -> list[CollectionTarget]:
        """재수집 대상. max_idle_days 를 넘게 조회되지 않은 타깃은 제외한다.

        컷오프가 없으면 한 번이라도 조회된 타깃이 영원히 매시간 재수집된다(대상 사이트에도,
        우리 큐에도 계속 쌓인다).
        """
        ...


class JobQueuePort(Protocol):
    """재수집 잡 등록(같은 타깃 중복 차단)."""

    async def enqueue_refresh(self, target: CollectionTarget) -> None: ...
