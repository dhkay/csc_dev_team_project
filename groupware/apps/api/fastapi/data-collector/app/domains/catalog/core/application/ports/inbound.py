"""카탈로그 Inbound 포트."""

from __future__ import annotations

from typing import Protocol

from ...domain.entities import RefreshPolicy, SourceDescriptor, SourceOptions


class SourceCatalogPort(Protocol):
    """소스 목록과 소스별 수집 선택지, 그리고 소스별 수집 정책."""

    def list_sources(self) -> list[SourceDescriptor]: ...

    def get_options(self, source_id: str) -> SourceOptions: ...

    def refresh_policy(self, source_id: str) -> RefreshPolicy | None: ...

    def ttl_seconds(self, source_id: str) -> int:
        """조회 캐시 신선도(초). 수집 커널이 이 값으로 재수집 여부를 정한다."""
        ...

    def is_auto_refresh(self, source_id: str) -> bool:
        """크론이 주기적으로 재수집해도 되는 소스인가. 쿼터가 좁은 소스는 False 다."""
        ...

    def is_valid_category(self, source_id: str, value: str) -> bool:
        """분야 값이 이 소스의 선택지에 있는가.

        수집 요청을 받는 라우트가 쓰는 검증 훅이다. 이게 없으면 알 수 없는 값이 그대로
        벤더에 전달되고, 빈 응답이 "아직 수집 중"과 구분되지 않아 영구 로딩으로 굳는다.
        """
        ...
