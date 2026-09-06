"""google_trends 소스의 공개 표면: HTTP 라우터 + 카탈로그 기여(서술자, 수집 선택지).

DI 조립은 커널(domains/collection/module.py)과 합성 루트(app/collection_sources.py,
app/source_catalog.py)가 맡는다. 이 도메인은 "수집 소스 하나"이고, 커널이 저장/큐/TTL/크론을
공용으로 처리한다.

선택지의 숫자(`expected`)는 이 도메인의 보관 정책 `KEEP_COUNT` 에서 파생한다. 상수를 두 번
적지 않는다.
"""

from __future__ import annotations

from ..catalog.core.domain.entities import (
    CategoryOption,
    RefreshPolicy,
    SourceDescriptor,
    SourceOptions,
)
from ..catalog.core.domain.types import SourceStatus
from .adapters.inbound.http.router import router
from .core.domain.types import GEOS, SOURCE_ID

__all__ = ["router", "DESCRIPTOR", "build_options"]

DESCRIPTOR = SourceDescriptor(
    id=SOURCE_ID,
    label="구글 트렌드",
    description="지역별 인기 검색어",
    status=SourceStatus.AVAILABLE,
    # 공개 피드라 쿼터가 없다. 실시간성이 값이므로 30분마다 갱신하고 크론 재수집도 켠다.
    refresh=RefreshPolicy(ttl_seconds=30 * 60, auto=True),
)


def build_options() -> SourceOptions:
    # 기간 축이 없다. 이 피드는 "그 시점의 인기 목록" 하나만 준다.
    return SourceOptions(
        source_id=SOURCE_ID,
        categories=tuple(CategoryOption(value=geo, label=label) for geo, label in GEOS),
    )
