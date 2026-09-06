"""datalab 소스의 공개 표면: HTTP 라우터 + 카탈로그 기여(서술자, 수집 선택지).

DI 조립은 커널(domains/collection/module.py)과 합성 루트(app/collection_sources.py,
app/source_catalog.py)가 맡는다. 이 도메인은 이제 "수집 소스 하나"이고, 커널이 저장/큐/TTL/
크론을 공용으로 처리한다.

선택지의 숫자(`expected`)는 이 도메인의 보관 정책 `KEEP_COUNT` 에서 파생한다. 상수를 두 번
적지 않는다. 소비자가 같은 숫자를 베껴 두고 주석으로 반드시 일치라고 적는 방식은 그 주석이
먼저 낡는다.
"""

from __future__ import annotations

from ..catalog.core.domain.entities import (
    CategoryOption,
    PeriodOption,
    RefreshPolicy,
    SourceDescriptor,
    SourceOptions,
)
from ..catalog.core.domain.types import SourceStatus
from .adapters.inbound.http.router import router
from .core.domain.categories import DATALAB_CATEGORIES
from .core.domain.types import KEEP_COUNT, SOURCE_ID, Period

__all__ = ["router", "DESCRIPTOR", "build_options"]

_PERIOD_LABELS: dict[Period, str] = {
    Period.DAILY: "일간",
    Period.WEEKLY: "주간",
    Period.MONTHLY: "월간",
}

DESCRIPTOR = SourceDescriptor(
    id=SOURCE_ID,
    label="네이버 쇼핑인사이트",
    description="분야별 인기 검색어",
    status=SourceStatus.AVAILABLE,
    # 쿼터가 없는 직접 수집이라 30분마다 갱신하고 크론 재수집도 켠다(현행 유지).
    refresh=RefreshPolicy(ttl_seconds=30 * 60, auto=True),
)


def build_options() -> SourceOptions:
    return SourceOptions(
        source_id=SOURCE_ID,
        categories=tuple(
            CategoryOption(value=cid, label=label) for cid, label in DATALAB_CATEGORIES
        ),
        periods=tuple(
            PeriodOption(
                value=period.value,
                label=_PERIOD_LABELS[period],
                expected=KEEP_COUNT[period],
            )
            for period in Period
        ),
    )
