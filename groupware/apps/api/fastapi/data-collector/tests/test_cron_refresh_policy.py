"""크론 재수집이 소스별 정책을 따른다는 불변식.

쿼터가 좁은 소스(SerpApi 무료 월 100회, YouTube 검색 하루 100회분)를 매시 재수집하면 타깃 몇
개만으로 한도가 사라진다. 그리고 그 소진은 조용하다: 업스트림이 429/403 을 주면 수집이 빈
결과가 되고, 커널은 빈 결과를 덮어쓰지 않으므로 데이터만 낡는다.

여기서 막지 못하면 운영에서 알아채는 방법은 로그를 뒤지는 것뿐이다.
"""

from __future__ import annotations

import pytest

from app.domains.collection.core.domain.entities import CollectionTarget
from app.source_catalog import get_source_catalog


class _FakeQueue:
    def __init__(self) -> None:
        self.enqueued: list[CollectionTarget] = []

    async def enqueue_refresh(self, target: CollectionTarget) -> None:
        self.enqueued.append(target)


class _FakeSources:
    def supports(self, source: str) -> bool:
        return source != "GONE"


@pytest.mark.asyncio
async def test_cron_skips_sources_that_opted_out_of_auto_refresh(monkeypatch) -> None:
    from app import worker

    targets = [
        CollectionTarget(source="NAVER_SHOPPING_INSIGHT", target_key="a", params={}),
        CollectionTarget(source="GOOGLE_SEARCH", target_key="b", params={}),
        CollectionTarget(source="YOUTUBE_VIDEO", target_key="c", params={}),
        CollectionTarget(source="GONE", target_key="d", params={}),
    ]

    class _Repo:
        def __init__(self, session) -> None:
            del session

        async def list_active_targets(self, max_idle_days: int) -> list[CollectionTarget]:
            del max_idle_days
            return targets

    class _Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

    queue = _FakeQueue()
    monkeypatch.setattr(worker, "CollectionRepository", _Repo)
    monkeypatch.setattr(worker, "_session_factory", lambda: _Session())
    monkeypatch.setattr(worker, "ArqJobQueue", lambda _redis: queue)

    await worker.refresh_active_targets({"redis": None, "sources": _FakeSources()})

    enqueued = {t.source for t in queue.enqueued}
    assert enqueued == {"NAVER_SHOPPING_INSIGHT"}
    # 쿼터가 좁은 소스는 조회가 있을 때만 모은다.
    assert "GOOGLE_SEARCH" not in enqueued
    assert "YOUTUBE_VIDEO" not in enqueued
    # 레지스트리에서 빠진 소스의 잔여 행도 그대로 건너뛴다(매시간 실패만 쌓이는 것을 막는다).
    assert "GONE" not in enqueued


def test_quota_bound_sources_declare_auto_refresh_off() -> None:
    """정책은 서술자에 있고, 크론은 그것만 본다. 둘 중 하나만 고치면 조용히 어긋난다."""
    catalog = get_source_catalog()

    for source_id in ("GOOGLE_SEARCH", "YOUTUBE_VIDEO"):
        assert catalog.is_auto_refresh(source_id) is False, source_id
    for source_id in ("NAVER_SHOPPING_INSIGHT", "GOOGLE_TRENDS", "NATE_REALTIME"):
        assert catalog.is_auto_refresh(source_id) is True, source_id
