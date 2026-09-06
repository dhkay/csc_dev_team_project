"""google_search 소스의 공개 표면: HTTP 라우터 + 카탈로그 기여(서술자, 수집 선택지).

DI 조립은 커널(domains/collection/module.py)과 합성 루트(app/collection_sources.py,
app/source_catalog.py)가 맡는다.
"""

from __future__ import annotations

from ..catalog.core.domain.entities import (
    InputOption,
    RefreshPolicy,
    SourceDescriptor,
    SourceOptions,
)
from ..catalog.core.domain.types import SourceStatus
from .adapters.inbound.http.router import router
from .core.domain.types import KEYWORD_MAX_LENGTH, SOURCE_ID

__all__ = ["router", "DESCRIPTOR", "build_options"]

DESCRIPTOR = SourceDescriptor(
    id=SOURCE_ID,
    label="구글 검색 결과",
    description="검색어별 상위 문서",
    status=SourceStatus.AVAILABLE,
    # **자동 재수집을 끈다.** 요금제가 월 검색 횟수로 제한되는데(무료 100회), 매시 재수집이면
    #   검색어 하나로 한도가 나흘 만에 사라진다. 조회가 있을 때만, 그것도 하루 지난 뒤에 모은다.
    refresh=RefreshPolicy(ttl_seconds=24 * 60 * 60, auto=False),
)


def build_options() -> SourceOptions:
    return SourceOptions(
        source_id=SOURCE_ID,
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
