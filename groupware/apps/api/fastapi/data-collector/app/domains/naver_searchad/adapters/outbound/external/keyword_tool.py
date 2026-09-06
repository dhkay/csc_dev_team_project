"""네이버 검색광고 키워드도구 호출 어댑터.

호스트도 인증도 네이버 오픈API 와 완전히 다르다(HMAC-SHA256 서명). 서명 규칙은
`app/shared/naver_signing.py` 한 곳에 있고 /lab 프로브도 같은 것을 쓴다.

서명은 캐시하지 않는다. 타임스탬프가 서명 입력에 들어가고 유효 폭이 1분 미만이다(실측:
30초 과거 200, 60초 과거 403). 그래서 호출 시점마다 새로 만든다.

자격이 없으면 호출 자체를 하지 않는다. 빈 헤더로 부르면 401 이 오고, 그 401 은 "키가 틀렸다"
처럼 보여서 미설정과 구분되지 않는다. 로그에 무엇이 비었는지 남기고 빈 결과로 끝낸다.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ......shared.naver_signing import sign, timestamp_ms
from ......shared.vendor_http import create_vendor_client

logger = logging.getLogger(__name__)

_PATH = "/keywordstool"


class NaverSearchAdKeywordToolAdapter:
    """GET /keywordstool. 실패는 None 이다."""

    def __init__(
        self,
        *,
        base_url: str,
        access_license: str,
        secret_key: str,
        customer_id: str,
        timeout: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client = create_vendor_client(
            base_url=base_url, timeout=timeout, transport=transport
        )
        self._access_license = access_license
        self._secret_key = secret_key
        self._customer_id = customer_id

    def _missing_credentials(self) -> list[str]:
        return [
            name
            for name, value in (
                ("NAVER_SEARCHAD_ACCESS_LICENSE", self._access_license),
                ("NAVER_SEARCHAD_SECRET_KEY", self._secret_key),
                ("NAVER_SEARCHAD_CUSTOMER_ID", self._customer_id),
            )
            if not value
        ]

    async def fetch(self, keyword: str) -> Any | None:
        missing = self._missing_credentials()
        if missing:
            logger.warning("검색광고 자격 미설정: %s", ", ".join(missing))
            return None

        ts = timestamp_ms()
        headers = {
            "X-Timestamp": ts,
            "X-API-KEY": self._access_license,
            "X-Customer": self._customer_id,
            # 서명 대상은 쿼리를 제외한 path 뿐이다. 쿼리를 넣으면 401 이 난다.
            "X-Signature": sign(self._secret_key, ts, "GET", _PATH),
        }
        try:
            response = await self._client.get(
                _PATH,
                headers=headers,
                # 공백이 들어가면 매칭이 어긋난다. 씨앗은 이미 정규화되어 오지만 한 번 더 지운다.
                params={"hintKeywords": keyword.replace(" ", ""), "showDetail": "1"},
            )
        except httpx.RequestError as exc:
            logger.warning("검색광고 연결 실패(%s): %s", keyword, exc)
            return None
        if response.status_code != httpx.codes.OK:
            logger.warning(
                "검색광고 응답 이상(%s, status=%s)", keyword, response.status_code
            )
            return None
        try:
            return response.json()
        except ValueError:
            logger.warning("검색광고 응답이 JSON 이 아니다(%s)", keyword)
            return None

    async def aclose(self) -> None:
        await self._client.aclose()
