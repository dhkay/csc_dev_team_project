"""카탈로그 서비스: 등록된 서술자와 선택지를 조회한다.

정적 데이터라 저장소도 외부 호출도 없다. 그래도 서비스를 두는 이유는 검증 규칙
(`is_valid_category`)이 여기 한 곳에 있어야 라우트마다 다시 구현되지 않기 때문이다.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping

from ..domain.entities import (
    DEFAULT_REFRESH,
    RefreshPolicy,
    SourceDescriptor,
    SourceOptions,
)
from ..domain.errors import SourceOptionsUnavailableError, UnknownSourceError
from ..domain.types import SourceStatus


class SourceCatalogService:
    """SourceCatalogPort 구현."""

    def __init__(
        self,
        descriptors: Iterable[SourceDescriptor],
        options: Mapping[str, SourceOptions],
    ) -> None:
        registry: dict[str, SourceDescriptor] = {}
        for descriptor in descriptors:
            if descriptor.id in registry:
                raise ValueError(f"수집 소스 id 중복: {descriptor.id!r}")
            if descriptor.status is SourceStatus.AVAILABLE and descriptor.refresh is None:
                # 정책 없이 available 이 되면 그 소스는 전역 기본값을 물려받아 매시 재수집된다.
                #   쿼터가 좁은 소스면 그대로 한도가 소진되고, 그 소진은 로그 없이 조용하다.
                raise ValueError(f"수집 정책 없는 available 소스: {descriptor.id!r}")
            registry[descriptor.id] = descriptor
        unknown = set(options) - set(registry)
        if unknown:
            # 선택지만 있고 서술자가 없는 소스는 목록에 안 나오면서 호출은 되는 유령이 된다.
            raise ValueError(f"서술자 없는 소스의 선택지: {sorted(unknown)}")
        self._descriptors = registry
        self._options = dict(options)

    def list_sources(self) -> list[SourceDescriptor]:
        return list(self._descriptors.values())

    def get_options(self, source_id: str) -> SourceOptions:
        if source_id not in self._descriptors:
            raise UnknownSourceError(source_id, sorted(self._descriptors))
        options = self._options.get(source_id)
        if options is None:
            raise SourceOptionsUnavailableError(source_id)
        return options

    def refresh_policy(self, source_id: str) -> RefreshPolicy | None:
        """이 소스의 수집 정책. planned 소스와 모르는 소스는 None 이다(모으지 않는다)."""
        descriptor = self._descriptors.get(source_id)
        return descriptor.refresh if descriptor is not None else None

    def ttl_seconds(self, source_id: str) -> int:
        """조회 캐시 신선도(초). 수집 커널의 FreshnessPolicyPort 구현이다.

        정책이 없는 소스(planned/미등록)는 조회 경로가 열려 있지 않지만, 그래도 답은 있어야
        하므로 보수적인 기본값을 준다.
        """
        policy = self.refresh_policy(source_id)
        return policy.ttl_seconds if policy is not None else DEFAULT_REFRESH.ttl_seconds

    def is_auto_refresh(self, source_id: str) -> bool:
        """크론이 이 소스를 주기적으로 재수집해도 되는가."""
        policy = self.refresh_policy(source_id)
        return policy.auto if policy is not None else False

    def is_valid_category(self, source_id: str, value: str) -> bool:
        options = self._options.get(source_id)
        if options is None:
            return False
        # 분야 축이 없는 소스는 분야 검증 대상도 아니다(빈 튜플이면 통과시키지 않는다:
        #   호출부가 분야를 보냈다는 것 자체가 계약 위반이다).
        return any(option.value == value for option in options.categories)
