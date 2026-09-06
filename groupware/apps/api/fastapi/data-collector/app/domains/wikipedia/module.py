"""wikipedia 소스의 공개 표면: HTTP 라우터 + 카탈로그 기여(서술자, 수집 선택지).

DI 조립은 커널(domains/collection/module.py)과 합성 루트(app/collection_sources.py,
app/source_catalog.py)가 맡는다.
"""

from __future__ import annotations

from ..catalog.core.domain.entities import (
    CategoryOption,
    InputOption,
    RefreshPolicy,
    SourceDescriptor,
    SourceOptions,
)
from ..catalog.core.domain.types import SourceStatus
from .adapters.inbound.http.router import router
from .core.domain.types import (
    LANGUAGE_LABELS,
    SOURCE_ID,
    TITLE_MAX_LENGTH,
    Language,
)

__all__ = ["router", "DESCRIPTOR", "build_options"]

DESCRIPTOR = SourceDescriptor(
    id=SOURCE_ID,
    label="위키백과",
    description="문서 서두 요약",
    status=SourceStatus.AVAILABLE,
    # 문서는 자주 바뀌지 않는다. 하루에 한 번이면 충분하고, 그만큼 남의 서버 부담도 줄인다.
    refresh=RefreshPolicy(ttl_seconds=24 * 60 * 60, auto=True),
)


def build_options() -> SourceOptions:
    return SourceOptions(
        source_id=SOURCE_ID,
        categories=tuple(
            CategoryOption(value=lang.value, label=LANGUAGE_LABELS[lang])
            for lang in Language
        ),
        inputs=(
            InputOption(
                name="title",
                label="문서 제목",
                required=True,
                max_length=TITLE_MAX_LENGTH,
                example="김치찌개",
            ),
        ),
    )
