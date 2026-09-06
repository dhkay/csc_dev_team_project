"""nate 소스의 공개 표면: HTTP 라우터 + 카탈로그 기여(서술자, 수집 선택지).

DI 조립은 커널(domains/collection/module.py)과 합성 루트(app/collection_sources.py,
app/source_catalog.py)가 맡는다.
"""

from __future__ import annotations

from ..catalog.core.domain.entities import (
    RefreshPolicy,
    SourceDescriptor,
    SourceOptions,
)
from ..catalog.core.domain.types import SourceStatus
from .adapters.inbound.http.router import router
from .core.domain.types import SOURCE_ID

__all__ = ["router", "DESCRIPTOR", "build_options"]

DESCRIPTOR = SourceDescriptor(
    id=SOURCE_ID,
    label="네이트 실시간 검색어",
    description="지금 많이 검색되는 말",
    status=SourceStatus.AVAILABLE,
    # 공개 데이터라 쿼터가 없다. 실시간성이 값이므로 30분마다 갱신하고 크론 재수집도 켠다.
    refresh=RefreshPolicy(ttl_seconds=30 * 60, auto=True),
)


def build_options() -> SourceOptions:
    # 세 축이 모두 비었다. 고를 것도, 써 넣을 것도 없는 소스다(목록 하나만 제공한다).
    return SourceOptions(source_id=SOURCE_ID)
