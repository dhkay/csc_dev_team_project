"""네이버 데이터랩 검색어 트렌드 호출 어댑터.

오픈API 라 헤더 두 개(Client ID/Secret)로 인증한다. 검색광고와 달리 서명이 없다.

한글 본문은 httpx 의 `json=` 으로 보낸다. 셸에서 흔히 겪는 인코딩 사고(한글을 인라인으로
넣으면 200 인데 결과가 빈 배열)는 셸이 바이트를 깨뜨려 생기는 것이라 서버 코드에는 없다.
직접 문자열을 만들어 보내지만 않으면 된다.

자격이 없으면 호출 자체를 하지 않는다. 빈 헤더로 부르면 401 이 오고, 그 401 은 "키가 틀렸다"
처럼 보여서 미설정과 구분되지 않는다.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ......shared.vendor_http import create_vendor_client

logger = logging.getLogger(__name__)

_PATH = "/v1/datalab/search"


class NaverSearchTrendAdapter:
    """POST /v1/datalab/search. 실패는 None 이다."""

    def __init__(
        self,
        *,
        base_url: str,
        client_id: str,
        client_secret: str,
        timeout: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client = create_vendor_client(
            base_url=base_url, timeout=timeout, transport=transport
        )
        self._client_id = client_id
        self._client_secret = client_secret

    def _missing_credentials(self) -> list[str]:
        return [
            name
            for name, value in (
                ("NAVER_TREND_CLIENT_ID", self._client_id),
                ("NAVER_TREND_CLIENT_SECRET", self._client_secret),
            )
            if not value
        ]

    async def fetch(
        self, *, keyword: str, time_unit: str, start_date: str, end_date: str
    ) -> Any | None:
        missing = self._missing_credentials()
        if missing:
            logger.warning("데이터랩 검색어 트렌드 자격 미설정: %s", ", ".join(missing))
            return None

        body = {
            "startDate": start_date,
            "endDate": end_date,
            "timeUnit": time_unit,
            # 그룹 하나로만 요청한다. 여러 그룹을 섞으면 ratio 의 기준(최댓값 100)이 그룹 간에
            #   공유되어, 한 키워드의 추이만 보려는 목적과 어긋난다.
            "keywordGroups": [{"groupName": keyword, "keywords": [keyword]}],
        }
        try:
            response = await self._client.post(
                _PATH,
                headers={
                    "X-Naver-Client-Id": self._client_id,
                    "X-Naver-Client-Secret": self._client_secret,
                },
                json=body,
            )
        except httpx.RequestError as exc:
            logger.warning("데이터랩 연결 실패(%s): %s", keyword, exc)
            return None
        if response.status_code != httpx.codes.OK:
            logger.warning(
                "데이터랩 응답 이상(%s, status=%s, body=%s)",
                keyword,
                response.status_code,
                response.text[:200],
            )
            return None
        try:
            return response.json()
        except ValueError:
            logger.warning("데이터랩 응답이 JSON 이 아니다(%s)", keyword)
            return None

    async def aclose(self) -> None:
        await self._client.aclose()
