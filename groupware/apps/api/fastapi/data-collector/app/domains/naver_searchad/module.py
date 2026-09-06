"""naver_searchad 소스의 공개 표면: HTTP 라우터 + 카탈로그 기여(서술자, 수집 선택지).

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
    label="네이버 검색광고 키워드도구",
    description="연관 키워드, 검색량",
    status=SourceStatus.AVAILABLE,
    # 월간 검색 수라 하루에도 거의 변하지 않는다. 6시간이면 충분하고, 씨앗마다 타깃이 하나씩
    #   생기는 소스라 주기를 짧게 두면 재수집 잡이 키워드 수만큼 매시간 쌓인다.
    refresh=RefreshPolicy(ttl_seconds=6 * 60 * 60, auto=True),
)


def build_options() -> SourceOptions:
    # 분야도 기간도 없다. 입력은 씨앗 키워드 하나뿐이다.
    return SourceOptions(
        source_id=SOURCE_ID,
        inputs=(
            InputOption(
                name="keyword",
                label="키워드",
                required=True,
                max_length=KEYWORD_MAX_LENGTH,
                example="김치찌개",
            ),
        ),
    )
