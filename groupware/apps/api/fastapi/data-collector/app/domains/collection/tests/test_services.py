"""수집 커널 서비스 테스트.

이 파일이 지키는 두 규칙은 소스가 몇 개가 되든 커널 한 곳에만 있어야 한다:
  1. 빈 결과는 이전 데이터를 덮어쓰지 않는다.
  2. 상태는 추측이 아니라 저장된 사실에서 판정한다.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.domains.collection.core.application.services import (
    CollectionQueryService,
    CollectionRunService,
)
from app.domains.collection.core.domain.entities import CollectionTarget, StoredSnapshot
from app.domains.collection.core.domain.types import CollectionStatus

TARGET = CollectionTarget(source="SRC", target_key="k", params={"cid": "k"})
ITEM = {"date": "2026-08-10", "keywords": []}


class FakeRepo:
    def __init__(self, row: StoredSnapshot | None = None) -> None:
        self.row = row
        self.touched: list[CollectionTarget] = []
        self.attempts: list[datetime] = []
        self.upserts: list[list[dict]] = []

    async def get(self, target):
        return self.row

    async def upsert(self, target, items, collected_at):
        self.upserts.append(items)
        self.row = StoredSnapshot(
            items=items, collected_at=collected_at, last_attempted_at=collected_at
        )

    async def mark_attempted(self, target, attempted_at):
        self.attempts.append(attempted_at)

    async def touch_requested(self, target):
        self.touched.append(target)

    async def list_active_targets(self, max_idle_days):
        return []


class FakeFreshness:
    """소스별 TTL 정책 스텁. 실물은 카탈로그가 소스 서술자에서 답한다."""

    def __init__(self, ttl: int = 1800) -> None:
        self.ttl = ttl
        self.asked: list[str] = []

    def ttl_seconds(self, source_id: str) -> int:
        self.asked.append(source_id)
        return self.ttl


class FakeQueue:
    def __init__(self) -> None:
        self.enqueued: list[CollectionTarget] = []

    async def enqueue_refresh(self, target):
        self.enqueued.append(target)


class FakeSources:
    def __init__(self, items: list[dict], keep: int | None = None) -> None:
        self.items = items
        self.keep = keep

    def supports(self, source):
        return True

    def make_target(self, source, params):
        return TARGET

    def retention(self, target):
        return self.keep

    async def collect(self, target):
        return self.items

    async def aclose(self):
        return None


def _fresh(items=None) -> StoredSnapshot:
    now = datetime.now(timezone.utc)
    return StoredSnapshot(
        items=items if items is not None else [ITEM],
        collected_at=now,
        last_attempted_at=now,
    )


# ---- 상태 판정 ----


@pytest.mark.asyncio
async def test_never_attempted_is_collecting_not_failed() -> None:
    """행이 없으면 조회가 곧 잡을 등록하므로 '수집 중'이다."""
    repo, queue = FakeRepo(None), FakeQueue()
    snapshot = await CollectionQueryService(repo, queue, FakeFreshness()).get_latest(TARGET)

    assert snapshot.status is CollectionStatus.COLLECTING
    assert snapshot.items == []
    assert queue.enqueued == [TARGET]


@pytest.mark.asyncio
async def test_attempted_but_empty_is_failed_not_collecting() -> None:
    """시도 기록이 있는데 데이터가 없으면 실패다.

    이 구분이 없으면 영영 성공하지 못하는 타깃이 화면에서 영구 로딩으로 굳는다.
    """
    row = StoredSnapshot(
        items=None, collected_at=None, last_attempted_at=datetime.now(timezone.utc)
    )
    snapshot = await CollectionQueryService(
        FakeRepo(row), FakeQueue(), FakeFreshness()
    ).get_latest(TARGET)

    assert snapshot.status is CollectionStatus.FAILED


@pytest.mark.asyncio
async def test_fresh_data_is_ok_and_does_not_enqueue() -> None:
    repo, queue = FakeRepo(_fresh()), FakeQueue()
    snapshot = await CollectionQueryService(repo, queue, FakeFreshness()).get_latest(TARGET)

    assert snapshot.status is CollectionStatus.OK
    assert snapshot.items == [ITEM]
    assert queue.enqueued == []
    assert repo.touched == [TARGET]  # 조회는 항상 활성 등록


@pytest.mark.asyncio
async def test_stale_data_is_still_ok_but_triggers_refresh() -> None:
    """오래됐다고 상태가 나빠지지는 않는다. 가진 값을 주고 뒤에서 갱신한다."""
    old = datetime.now(timezone.utc) - timedelta(hours=10)
    row = StoredSnapshot(items=[ITEM], collected_at=old, last_attempted_at=old)
    repo, queue = FakeRepo(row), FakeQueue()
    snapshot = await CollectionQueryService(repo, queue, FakeFreshness()).get_latest(TARGET)

    assert snapshot.status is CollectionStatus.OK
    assert queue.enqueued == [TARGET]


@pytest.mark.asyncio
async def test_staleness_is_asked_per_source() -> None:
    """신선도는 전역 상수가 아니라 그 소스의 정책이다.

    쿼터가 좁은 소스에 넓은 소스의 주기를 적용하면 조회 몇 번으로 한도가 소진된다.
    같은 나이(2시간)의 데이터가 TTL 에 따라 갱신 대상이 되기도, 아니기도 해야 한다.
    """
    old = datetime.now(timezone.utc) - timedelta(hours=2)
    row = StoredSnapshot(items=[ITEM], collected_at=old, last_attempted_at=old)

    short, long = FakeFreshness(ttl=1800), FakeFreshness(ttl=24 * 3600)
    q_short, q_long = FakeQueue(), FakeQueue()
    await CollectionQueryService(FakeRepo(row), q_short, short).get_latest(TARGET)
    await CollectionQueryService(FakeRepo(row), q_long, long).get_latest(TARGET)

    assert q_short.enqueued == [TARGET]
    assert q_long.enqueued == []
    assert short.asked == [TARGET.source]  # 타깃의 소스로 물어본다


# ---- 수집 실행 ----


@pytest.mark.asyncio
async def test_run_applies_retention_and_records_attempt() -> None:
    repo = FakeRepo()
    items = [{"n": i} for i in range(15)]
    await CollectionRunService(FakeSources(items, keep=12), repo).run(TARGET)

    assert len(repo.upserts[0]) == 12
    assert len(repo.attempts) == 1


@pytest.mark.asyncio
async def test_run_keeps_everything_when_retention_is_none() -> None:
    repo = FakeRepo()
    await CollectionRunService(
        FakeSources([{"n": i} for i in range(5)], keep=None), repo
    ).run(TARGET)
    assert len(repo.upserts[0]) == 5


@pytest.mark.asyncio
async def test_empty_result_does_not_overwrite_but_still_records_attempt() -> None:
    """빈 결과는 이전 정상 데이터를 지우지 않는다. 다만 시도했다는 사실은 남는다.

    시도 기록이 남아야 소비자가 '수집 중'과 '실패'를 구분할 수 있다.
    """
    good = _fresh()
    repo = FakeRepo(good)
    await CollectionRunService(FakeSources([], keep=12), repo).run(TARGET)

    assert repo.upserts == []  # upsert 자체를 건너뛴다
    assert repo.row is good  # 이전 데이터 보존
    assert len(repo.attempts) == 1
