"""네이버 오픈API(openapi.naver.com) 어댑터 3종: 데이터랩 검색어 트렌드, 쇼핑인사이트 2건.

셋 다 같은 호스트, 같은 인증(Client ID/Secret 헤더), 같은 실패 양식을 쓴다. 그래서 클라이언트와
자격 확인을 한 베이스에 두고 경로와 본문만 다르게 한다.

주의(실측): 쇼핑인사이트 두 건은 현재 401 `errorCode: "024"` 다. 키가 틀린 게 아니라 개발자센터
앱에 '데이터랩(쇼핑인사이트)' 항목이 없다. 스코프 검사가 라우팅보다 먼저 걸리므로 지금은 이 401 로
경로 정확성을 판별할 수 없다(특히 LAB-003 의 category 단수 경로는 스코프를 연 뒤 재확인해야 한다).
"""

from __future__ import annotations

import httpx

from .....core.domain.entities import (
    SearchTrendQuery,
    ShoppingCategoriesQuery,
    ShoppingKeywordAgeQuery,
    UpstreamExchange,
)
from .....core.application.ports.outbound import CredentialProviderPort
from .....core.domain.errors import CredentialsNotConfiguredError
from .....core.domain.types import LabSource
from ._client import create_http_client, exchange


class _NaverOpenApiBase:
    """오픈API 공통: 자격 확인 + 인증 헤더 구성."""

    _source: LabSource
    _required: tuple[str, ...]

    def __init__(
        self,
        *,
        base_url: str,
        credentials: CredentialProviderPort,
        timeout: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client = create_http_client(
            base_url=base_url, timeout=timeout, transport=transport
        )
        self._credentials = credentials

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _auth_headers(self) -> dict[str, str]:
        creds = await self._credentials.for_source(self._source)
        missing = [key for key in self._required if not creds.get(key)]
        if missing:
            raise CredentialsNotConfiguredError(missing)
        client_id, client_secret = self._required
        return {
            "X-Naver-Client-Id": creds[client_id],
            "X-Naver-Client-Secret": creds[client_secret],
            "Content-Type": "application/json",
        }


class NaverDatalabSearchAdapter(_NaverOpenApiBase):
    """LAB-001: POST /v1/datalab/search (실측 200)."""

    _source = LabSource.NAVER_DATALAB_SEARCH
    _required = ("NAVER_TREND_CLIENT_ID", "NAVER_TREND_CLIENT_SECRET")

    async def search(self, query: SearchTrendQuery) -> UpstreamExchange:
        headers = await self._auth_headers()
        body: dict[str, object] = {
            "startDate": query.start_date,
            "endDate": query.end_date,
            "timeUnit": query.time_unit,
            "keywordGroups": [
                {"groupName": group.group_name, "keywords": list(group.keywords)}
                for group in query.keyword_groups
            ],
        }
        if query.device:
            body["device"] = query.device
        if query.gender:
            body["gender"] = query.gender
        if query.ages:
            body["ages"] = list(query.ages)
        # json= 로 넘긴다: httpx 가 UTF-8 로 직렬화한다. 미리 문자열로 만들어 content= 로 넘기면
        #   인코딩이 어긋나 키워드가 깨지고, 그때 네이버는 HTTP 200 + 빈 data 를 준다(조용한 실패).
        return await exchange(
            self._client,
            method="POST",
            path="/v1/datalab/search",
            headers=headers,
            json_body=body,
        )


class NaverShoppingCategoriesAdapter(_NaverOpenApiBase):
    """LAB-002: POST /v1/datalab/shopping/categories (실측 401, 스코프 미등록)."""

    _source = LabSource.NAVER_SHOPPING_CATEGORIES
    _required = ("NAVER_SHOPPING_CLIENT_ID", "NAVER_SHOPPING_CLIENT_SECRET")

    async def categories(self, query: ShoppingCategoriesQuery) -> UpstreamExchange:
        headers = await self._auth_headers()
        body: dict[str, object] = {
            "startDate": query.start_date,
            "endDate": query.end_date,
            "timeUnit": query.time_unit,
            # category 는 **배열**이다(LAB-003 의 단수 문자열과 다르다).
            "category": [
                {"name": c.name, "param": list(c.param)} for c in query.category
            ],
        }
        if query.device:
            body["device"] = query.device
        if query.gender:
            body["gender"] = query.gender
        if query.ages:
            body["ages"] = list(query.ages)
        return await exchange(
            self._client,
            method="POST",
            path="/v1/datalab/shopping/categories",
            headers=headers,
            json_body=body,
        )


class NaverShoppingKeywordAgeAdapter(_NaverOpenApiBase):
    """LAB-003: POST /v1/datalab/shopping/category/keyword/age (실측 401, 스코프 미등록).

    경로의 `category` 는 단수다(인수인계 PDF 는 `categories` 로 적었으나 그건 오타).
    다만 스코프 401 이 라우팅보다 먼저 걸려 아직 경로가 실증되지는 않았다.
    """

    _source = LabSource.NAVER_SHOPPING_KEYWORD_AGE
    _required = ("NAVER_SHOPPING_CLIENT_ID", "NAVER_SHOPPING_CLIENT_SECRET")

    async def keyword_age(self, query: ShoppingKeywordAgeQuery) -> UpstreamExchange:
        headers = await self._auth_headers()
        body = {
            "startDate": query.start_date,
            "endDate": query.end_date,
            "timeUnit": query.time_unit,
            "category": query.category,  # 단수 문자열
            "keyword": query.keyword,
        }
        return await exchange(
            self._client,
            method="POST",
            path="/v1/datalab/shopping/category/keyword/age",
            headers=headers,
            json_body=body,
        )
