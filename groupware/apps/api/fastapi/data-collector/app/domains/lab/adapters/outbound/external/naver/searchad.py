"""네이버 검색광고 키워드도구 어댑터 (LAB-004, 실측 200).

호스트도 인증도 오픈API 와 완전히 다르다(HMAC-SHA256 서명). 그래서 별도 파일이다.
"""

from __future__ import annotations

import httpx

from .....core.domain.entities import KeywordToolQuery, UpstreamExchange
from .....core.application.ports.outbound import CredentialProviderPort
from .....core.domain.errors import CredentialsNotConfiguredError
from .....core.domain.types import LabSource
from .......shared.naver_signing import sign, timestamp_ms
from ._client import create_http_client, exchange

_PATH = "/keywordstool"
_REQUIRED = (
    "NAVER_SEARCHAD_ACCESS_LICENSE",
    "NAVER_SEARCHAD_SECRET_KEY",
    "NAVER_SEARCHAD_CUSTOMER_ID",
)


class NaverSearchAdKeywordToolAdapter:
    """GET /keywordstool. 서명은 호출 시점에 새로 만든다(30초 남짓만 유효)."""

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

    async def keywords(self, query: KeywordToolQuery) -> UpstreamExchange:
        creds = await self._credentials.for_source(
            LabSource.NAVER_SEARCHAD_KEYWORDSTOOL
        )
        missing = [key for key in _REQUIRED if not creds.get(key)]
        if missing:
            raise CredentialsNotConfiguredError(missing)

        ts = timestamp_ms()
        headers = {
            # X-Timestamp 는 시크릿이 아니다. 시계 어긋남으로 인한 403 은 이 값이 응답에
            #   남아 있어야 밖에서 진단할 수 있다(sent_header_names 에 이름이 실린다).
            "X-Timestamp": ts,
            "X-API-KEY": creds["NAVER_SEARCHAD_ACCESS_LICENSE"],
            "X-Customer": creds["NAVER_SEARCHAD_CUSTOMER_ID"],
            "X-Signature": sign(creds["NAVER_SEARCHAD_SECRET_KEY"], ts, "GET", _PATH),
        }

        # hintKeywords: 최대 5개, 공백을 제거하고 콤마로 결합한다(공백이 들어가면 매칭이 어긋난다).
        seeds = [k.strip() for k in query.hint_keywords if k.strip()][:5]
        params: dict[str, str] = {
            "hintKeywords": ",".join(seeds).replace(" ", ""),
            "showDetail": "1" if query.show_detail else "0",
        }
        if query.month:
            params["month"] = query.month

        return await exchange(
            self._client, method="GET", path=_PATH, headers=headers, params=params
        )
