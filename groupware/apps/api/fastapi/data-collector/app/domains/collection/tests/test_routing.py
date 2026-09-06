"""소스 레지스트리 테스트."""

from __future__ import annotations

import pytest

from app.domains.collection.adapters.outbound.sources.routing import RoutingSource
from app.domains.collection.core.domain.entities import CollectionTarget
from app.domains.collection.core.domain.errors import UnknownCollectionSourceError


class FakePlugin:
    def __init__(self, source_id: str) -> None:
        self.source_id = source_id
        self.closed = 0

    def make_target(self, params):
        return CollectionTarget(
            source=self.source_id, target_key="k", params=dict(params)
        )

    def retention(self, target):
        return 7

    async def collect(self, target):
        return [{"source": self.source_id}]

    async def aclose(self):
        self.closed += 1


@pytest.mark.asyncio
async def test_dispatches_to_the_registered_plugin() -> None:
    a, b = FakePlugin("A"), FakePlugin("B")
    router = RoutingSource([a, b])

    assert router.supports("A") and not router.supports("C")
    assert await router.collect(CollectionTarget(source="B", target_key="k")) == [
        {"source": "B"}
    ]


@pytest.mark.asyncio
async def test_unknown_source_raises_and_never_falls_back() -> None:
    """폴백하면 맞는 키 아래에 틀린 데이터가 영속 저장되고 캐시로 굳는다."""
    router = RoutingSource([FakePlugin("A")])
    with pytest.raises(UnknownCollectionSourceError):
        await router.collect(CollectionTarget(source="MISSING", target_key="k"))


def test_duplicate_source_id_is_rejected_at_construction() -> None:
    """목록으로 받으므로 조용한 shadowing 이 가능하다. 기동 시점에 막는다."""
    with pytest.raises(ValueError, match="중복"):
        RoutingSource([FakePlugin("A"), FakePlugin("A")])


def test_empty_registry_is_rejected() -> None:
    with pytest.raises(ValueError):
        RoutingSource([])


@pytest.mark.asyncio
async def test_aclose_fans_out_to_every_plugin() -> None:
    a, b = FakePlugin("A"), FakePlugin("B")
    await RoutingSource([a, b]).aclose()
    assert (a.closed, b.closed) == (1, 1)
