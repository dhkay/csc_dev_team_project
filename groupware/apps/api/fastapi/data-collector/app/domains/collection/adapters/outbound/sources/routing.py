"""SourcePort 구현: source → SourcePlugin 레지스트리 디스패치.

language-model 의 RoutingInference 와 같은 골격이다(dict 디스패치 + aclose fan-out).
다만 기본 폴백을 두지 않는다. 추론은 엉뚱한 provider 로 폴백해도 응답 하나가 나빠질 뿐이지만,
수집은 엉뚱한 소스가 답하면 맞는 키 아래에 틀린 데이터가 영속 저장되고 캐시로 굳는다.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from ....core.domain.entities import CollectionTarget
from ....core.domain.errors import UnknownCollectionSourceError
from ....core.application.ports.outbound import SourcePlugin


class RoutingSource:
    """등록된 플러그인으로 디스패치한다."""

    def __init__(self, plugins: Iterable[SourcePlugin]) -> None:
        registry: dict[str, SourcePlugin] = {}
        for plugin in plugins:
            if plugin.source_id in registry:
                # dict 리터럴이 아니라 목록으로 받으므로 조용한 shadowing 이 가능하다. 막는다.
                raise ValueError(f"수집 소스 id 중복: {plugin.source_id!r}")
            registry[plugin.source_id] = plugin
        if not registry:
            raise ValueError("등록된 수집 소스가 없습니다")
        self._plugins = registry

    def _pick(self, source: str) -> SourcePlugin:
        plugin = self._plugins.get(source)
        if plugin is None:
            raise UnknownCollectionSourceError(source, sorted(self._plugins))
        return plugin

    def supports(self, source: str) -> bool:
        return source in self._plugins

    def make_target(self, source: str, params: Mapping[str, Any]) -> CollectionTarget:
        return self._pick(source).make_target(params)

    def retention(self, target: CollectionTarget) -> int | None:
        return self._pick(target.source).retention(target)

    async def collect(self, target: CollectionTarget) -> list[dict[str, Any]]:
        return await self._pick(target.source).collect(target)

    async def aclose(self) -> None:
        for plugin in self._plugins.values():
            await plugin.aclose()
