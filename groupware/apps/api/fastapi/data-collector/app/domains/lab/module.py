"""lab 도메인 DI 와이어링.

자격증명 공급자를 여기 한 곳에서 고른다. 실사용 승격 시 EnvCredentialProvider 를 조직별 해석
구현으로 바꾸면 되고, 서비스/포트/스키마/라우터는 그대로다.
"""

from __future__ import annotations

from .adapters.inbound.http.router import router
from .adapters.outbound.credentials.env_credentials import EnvCredentialProvider
from .adapters.outbound.external.naver.openapi import (
    NaverDatalabSearchAdapter,
    NaverShoppingCategoriesAdapter,
    NaverShoppingKeywordAgeAdapter,
)
from .adapters.outbound.external.naver.searchad import NaverSearchAdKeywordToolAdapter
from .core.application.services import LabProbeService

__all__ = ["router", "build_lab_probe_service"]


def build_lab_probe_service(settings) -> LabProbeService:  # noqa: ANN001
    """프로세스 수명 싱글톤으로 조립한다(httpx 풀 재사용).

    커넥션 풀 정리는 서비스의 aclose() 가 어댑터로 위임한다. 마운트된 서브앱의 lifespan 은
    실행되지 않으므로 부모 앱 lifespan 이 그 aclose 를 부른다(container 참고).
    """
    credentials = EnvCredentialProvider(settings)
    base_url = settings.naver_openapi_base_url
    timeout = settings.lab_http_timeout

    return LabProbeService(
        datalab_search=NaverDatalabSearchAdapter(
            base_url=base_url, credentials=credentials, timeout=timeout
        ),
        shopping_categories=NaverShoppingCategoriesAdapter(
            base_url=base_url, credentials=credentials, timeout=timeout
        ),
        shopping_keyword_age=NaverShoppingKeywordAgeAdapter(
            base_url=base_url, credentials=credentials, timeout=timeout
        ),
        searchad_keywords=NaverSearchAdKeywordToolAdapter(
            base_url=settings.naver_searchad_base_url,
            credentials=credentials,
            timeout=timeout,
        ),
    )
