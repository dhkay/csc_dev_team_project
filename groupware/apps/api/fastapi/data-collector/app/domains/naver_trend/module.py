"""naver_trend 소스의 공개 표면: HTTP 라우터 + 카탈로그 기여(서술자, 수집 선택지).

DI 조립은 커널(domains/collection/module.py)과 합성 루트(app/collection_sources.py,
app/source_catalog.py)가 맡는다.

선택지의 숫자(`expected`)는 이 도메인의 보관 정책 `KEEP_COUNT` 에서 파생한다. 상수를 두 번
적지 않는다.
"""

from __future__ import annotations

from ..catalog.core.domain.entities import (
    InputOption,
    PeriodOption,
    RefreshPolicy,
    SourceDescriptor,
    SourceOptions,
)
from ..catalog.core.domain.types import SourceStatus
from .adapters.inbound.http.router import router
from .core.domain.types import KEEP_COUNT, KEYWORD_MAX_LENGTH, SOURCE_ID, Period

__all__ = ["router", "DESCRIPTOR", "build_options"]

_PERIOD_LABELS: dict[Period, str] = {
    Period.DAILY: "일간",
    Period.WEEKLY: "주간",
    Period.MONTHLY: "월간",
}

DESCRIPTOR = SourceDescriptor(
    id=SOURCE_ID,
    label="네이버 검색어 트렌드",
    description="검색어별 검색 추이",
    status=SourceStatus.AVAILABLE,
    # 하루 단위 집계라 자주 다시 물어볼 이유가 없다. 일 1,000회 한도 안에서 여유를 둔다.
    refresh=RefreshPolicy(ttl_seconds=6 * 60 * 60, auto=True),
)


def build_options() -> SourceOptions:
    return SourceOptions(
        source_id=SOURCE_ID,
        periods=tuple(
            PeriodOption(
                value=period.value,
                label=_PERIOD_LABELS[period],
                expected=KEEP_COUNT[period],
            )
            for period in Period
        ),
        inputs=(
            InputOption(
                name="keyword",
                label="검색어",
                required=True,
                max_length=KEYWORD_MAX_LENGTH,
                example="김치찌개",
            ),
        ),
    )
