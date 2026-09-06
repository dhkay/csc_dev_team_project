"""수집 소스 카탈로그 합성 루트.

새 소스 = 여기 한 줄. 구현이 있으면 그 도메인의 서술자 + 선택지를, 아직 없으면
`catalog/planned.py` 의 서술자만 등록한다.

카탈로그는 정적 데이터라 여기서 즉시 만든다(레지스트리를 조립하지 않는다): API 프로세스가
벤더 클라이언트를 만들 이유가 없어야 하기 때문이다.
"""

from __future__ import annotations

from functools import lru_cache

from .domains.catalog.core.application.services import SourceCatalogService
from .domains.catalog.planned import PLANNED_SOURCES
from .domains.datalab import module as datalab
from .domains.google_search import module as google_search
from .domains.google_trends import module as google_trends
from .domains.nate import module as nate
from .domains.naver_searchad import module as naver_searchad
from .domains.naver_trend import module as naver_trend
from .domains.wikipedia import module as wikipedia
from .domains.youtube import module as youtube

# 카탈로그에 참여하는 소스 모듈. 각 모듈이 자기 서술자와 선택지를 소유한다.
_SOURCE_MODULES = (
    datalab,
    google_search,
    google_trends,
    nate,
    naver_searchad,
    naver_trend,
    wikipedia,
    youtube,
)


@lru_cache
def get_source_catalog() -> SourceCatalogService:
    return SourceCatalogService(
        descriptors=[m.DESCRIPTOR for m in _SOURCE_MODULES] + list(PLANNED_SOURCES),
        options={m.DESCRIPTOR.id: m.build_options() for m in _SOURCE_MODULES},
    )
