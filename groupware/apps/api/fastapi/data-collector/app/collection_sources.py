"""수집 소스 레지스트리 합성 루트.

새 소스 = 여기 한 줄 + app/main.py 의 include_router 한 줄. 커널은 건드리지 않는다.
language-model 의 provider 레지스트리, file-upload 의 _build_storage 와 같은 자리다.

워커 전용이다: API 프로세스는 이 레지스트리를 만들지 않는다(조회/enqueue 에 벤더 지식이
필요 없고, 그래야 API 컨테이너가 쓰지도 않을 벤더 클라이언트를 띄우지 않는다).
"""

from __future__ import annotations

from .config import Settings
from .domains.collection.adapters.outbound.sources.routing import RoutingSource
from .domains.datalab.adapters.outbound.navigation.direct_http import DirectHttpNavigation
from .domains.datalab.adapters.outbound.parser.datalab_shopping_keywords import (
    DatalabShoppingKeywordParser,
)
from .domains.datalab.adapters.outbound.collection.plugin import (
    DatalabShoppingKeywordsSource,
)
from .domains.google_search.adapters.outbound.collection.plugin import (
    GoogleSearchSource,
)
from .domains.google_search.adapters.outbound.external.serpapi import SerpApiAdapter
from .domains.google_trends.adapters.outbound.collection.plugin import (
    GoogleTrendsSource,
)
from .domains.google_trends.adapters.outbound.external.trends_rss import (
    GoogleTrendsRssAdapter,
)
from .domains.nate.adapters.outbound.collection.plugin import NateRealtimeSource
from .domains.nate.adapters.outbound.external.realtime_keywords import (
    NateRealtimeKeywordAdapter,
)
from .domains.naver_searchad.adapters.outbound.collection.plugin import (
    NaverAdKeywordSource,
)
from .domains.naver_searchad.adapters.outbound.external.keyword_tool import (
    NaverSearchAdKeywordToolAdapter,
)
from .domains.naver_trend.adapters.outbound.collection.plugin import (
    NaverSearchTrendSource,
)
from .domains.naver_trend.adapters.outbound.external.search_trend import (
    NaverSearchTrendAdapter,
)
from .domains.wikipedia.adapters.outbound.collection.plugin import (
    WikipediaSummarySource,
)
from .domains.wikipedia.adapters.outbound.external.wikipedia import WikipediaAdapter
from .domains.youtube.adapters.outbound.collection.plugin import YouTubeVideoSource
from .domains.youtube.adapters.outbound.external.youtube import YouTubeAdapter


def build_source_registry(settings: Settings) -> RoutingSource:
    return RoutingSource(
        [
            DatalabShoppingKeywordsSource(
                navigation=DirectHttpNavigation(
                    datalab_url=settings.datalab_shopping_url,
                    user_agent=settings.crawl_user_agent,
                    timeout=settings.crawl_timeout_seconds,
                ),
                parser=DatalabShoppingKeywordParser(),
            ),
            GoogleTrendsSource(
                GoogleTrendsRssAdapter(
                    base_url=settings.google_trends_base_url,
                    timeout=settings.vendor_http_timeout,
                )
            ),
            NateRealtimeSource(
                NateRealtimeKeywordAdapter(
                    base_url=settings.nate_base_url,
                    path=settings.nate_realtime_path,
                    timeout=settings.vendor_http_timeout,
                )
            ),
            GoogleSearchSource(
                SerpApiAdapter(
                    base_url=settings.serpapi_base_url,
                    api_key=settings.serpapi_api_key,
                    timeout=settings.vendor_http_timeout,
                )
            ),
            YouTubeVideoSource(
                YouTubeAdapter(
                    base_url=settings.youtube_base_url,
                    api_key=settings.youtube_api_key,
                    timeout=settings.vendor_http_timeout,
                )
            ),
            NaverAdKeywordSource(
                NaverSearchAdKeywordToolAdapter(
                    base_url=settings.naver_searchad_base_url,
                    access_license=settings.naver_searchad_access_license,
                    secret_key=settings.naver_searchad_secret_key,
                    customer_id=settings.naver_searchad_customer_id,
                    timeout=settings.vendor_http_timeout,
                )
            ),
            NaverSearchTrendSource(
                NaverSearchTrendAdapter(
                    base_url=settings.naver_openapi_base_url,
                    client_id=settings.naver_trend_client_id,
                    client_secret=settings.naver_trend_client_secret,
                    timeout=settings.vendor_http_timeout,
                )
            ),
            WikipediaSummarySource(
                WikipediaAdapter(
                    base_url_template=settings.wikipedia_base_url_template,
                    user_agent=settings.wikipedia_user_agent,
                    timeout=settings.vendor_http_timeout,
                )
            ),
        ]
    )
