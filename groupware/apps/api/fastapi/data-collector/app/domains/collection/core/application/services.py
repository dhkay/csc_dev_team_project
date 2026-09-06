"""수집 커널 서비스.

core 는 FastAPI/SQLAlchemy/httpx 를 모른다(Outbound 포트만 의존).
소스가 몇 개든 아래 두 규칙은 여기 한 곳에만 있다:
  1. 빈 결과는 이전 데이터를 덮어쓰지 않는다.
  2. 상태(ok/collecting/failed)는 추측이 아니라 저장된 사실에서 판정한다.
"""

from __future__ import annotations

from datetime import datetime, timezone

from ..domain.entities import CollectionSnapshot, CollectionTarget, StoredSnapshot
from ..domain.types import CollectionStatus
from .ports.outbound import (
    CollectionRepositoryPort,
    FreshnessPolicyPort,
    JobQueuePort,
    SourcePort,
)


def _resolve_status(row: StoredSnapshot | None) -> CollectionStatus:
    """저장된 사실만으로 상태를 정한다.

    행 자체가 없는 경우도 collecting 이다: 조회는 곧 touch + enqueue 를 유발하므로,
    이 응답을 받는 시점엔 이미 잡이 등록돼 있다.
    """
    if row is not None and row.items is not None and row.collected_at is not None:
        return CollectionStatus.OK
    if row is not None and row.last_attempted_at is not None:
        # 시도했는데 쓸 데이터가 없다. 계속 기다리게 두면 영구 로딩이 된다.
        return CollectionStatus.FAILED
    return CollectionStatus.COLLECTING


class CollectionQueryService:
    """CollectionInboundPort 구현(API 측): 캐시 조회 + lazy refresh 등록.

    조회 시 타깃을 '활성'으로 등록(touch)해 크론이 주기적으로 재수집하게 한다.
    캐시가 없거나 TTL 초과면 백그라운드 refresh 를 걸고, 지금 가진 값을 상태와 함께 반환한다.

    API 프로세스는 SourcePort 를 주입받지 않는다: 조회와 enqueue 에 벤더 지식이 필요 없고,
    그래야 API 컨테이너가 쓰지도 않을 벤더 클라이언트를 만들지 않는다.
    """

    def __init__(
        self,
        repository: CollectionRepositoryPort,
        queue: JobQueuePort,
        freshness: FreshnessPolicyPort,
    ) -> None:
        self._repo = repository
        self._queue = queue
        self._freshness = freshness

    async def get_latest(self, target: CollectionTarget) -> CollectionSnapshot:
        row = await self._repo.get(target)
        await self._repo.touch_requested(target)
        status = _resolve_status(row)
        if status is not CollectionStatus.OK or self._is_stale(target.source, row):
            await self._queue.enqueue_refresh(target)
        return CollectionSnapshot(
            target=target,
            status=status,
            items=list(row.items) if row is not None and row.items is not None else [],
            collected_at=row.collected_at if row is not None else None,
        )

    async def enqueue_refresh(self, target: CollectionTarget) -> None:
        await self._repo.touch_requested(target)
        await self._queue.enqueue_refresh(target)

    def _is_stale(self, source: str, row: StoredSnapshot | None) -> bool:
        if row is None or row.collected_at is None:
            return True
        age = (datetime.now(timezone.utc) - row.collected_at).total_seconds()
        return age >= self._freshness.ttl_seconds(source)


class CollectionRunService:
    """워커/크론 측: 수집 → 보관 정책 적용 → 저장.

    소스가 안정형 items 를 주고, 커널은 보관 수와 무결성만 결정한다.
    """

    def __init__(
        self, sources: SourcePort, repository: CollectionRepositoryPort
    ) -> None:
        self._sources = sources
        self._repo = repository

    async def run(self, target: CollectionTarget) -> None:
        items = await self._sources.collect(target)
        keep = self._sources.retention(target)
        if keep is not None:
            items = items[:keep]

        # 성패와 무관하게 "시도했다"를 먼저 남긴다. 이 기록이 있어야 소비자가
        #   "아직 수집 전"과 "시도했지만 못 얻음"을 구분할 수 있다.
        await self._repo.mark_attempted(target, datetime.now(timezone.utc))

        # 빈 결과는 절대 덮어쓰지 않는다. 덮어쓰면 한 번의 실패가 이전 정상 데이터를 지워
        #   그 타깃이 영구 빈 상태로 남고, collected_at 도 사라져 신선도 판단마저 무너진다.
        #   skip 하면 이전 데이터가 보존되고 다음 조회가 재수집을 유도한다.
        if not items:
            return
        await self._repo.upsert(target, items, datetime.now(timezone.utc))
