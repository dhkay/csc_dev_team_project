"""위키백과 호출 어댑터. 언어판마다 호스트와 API 가 다르다.

| 언어 | 부르는 것 | 이유 |
|---|---|---|
| ko | `ko.wikipedia.org/w/api.php` | 한국어 REST 요약은 문서 커버리지가 낮다 |
| en | `en.wikipedia.org/api/rest_v1/page/summary/{title}` | 요약과 대표 이미지를 한 번에 준다 |

제목이 path 파라미터라는 점이 REST 쪽 함정이다. 공백을 언더스코어로 바꾸고 URL 인코딩해야
한다. 인코딩을 빠뜨리면 슬래시가 든 제목에서 경로가 갈라져 404 가 난다.

User-Agent 가 자격증명을 대신한다. 위키미디어는 브라우저를 흉내 낸 UA 로 오는 API 호출을
403 으로 막고, 도구 이름과 연락처가 든 서술형 UA 를 요구한다(위키미디어 UA 정책). 실측으로
Chrome UA 두 종은 403, 서술형 UA 는 200 이었다. 그래서 이 소스만 공용 기본 UA 를 덮어쓴다.
그 UA 는 설정값이다: 연락처가 바뀌면 재배포 없이 고칠 수 있어야 한다.

자격증명(키)은 없는 소스다.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

import httpx

from ......shared.vendor_http import create_vendor_client
from ....core.domain.types import Language

logger = logging.getLogger(__name__)


class WikipediaAdapter:
    """언어판별 문서 요약 원문(JSON)을 가져온다. 실패는 None 이다."""

    def __init__(
        self,
        *,
        base_url_template: str,
        user_agent: str,
        timeout: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        # 언어판마다 호스트가 다르므로 클라이언트도 언어별로 하나씩 둔다(커넥션 풀 재사용).
        self._base_urls = {
            lang: base_url_template.format(lang=lang.value) for lang in Language
        }
        self._clients = {
            lang: create_vendor_client(
                base_url=base_url,
                timeout=timeout,
                headers={"User-Agent": user_agent},
                transport=transport,
            )
            for lang, base_url in self._base_urls.items()
        }

    def page_base_url(self, lang: Language) -> str:
        """문서 주소의 앞부분. action API 응답에는 주소가 없어 제목과 이어 붙여 만든다.

        호스트를 여기서 다시 적지 않고 설정된 base_url 에서 파생한다. 두 벌로 두면 설정을 바꿔도
        저장되는 링크는 옛 호스트를 가리킨 채 남는다.
        """
        return f"{self._base_urls[lang]}/wiki/"

    async def fetch(self, lang: Language, title: str) -> Any | None:
        client = self._clients[lang]
        if lang is Language.KO:
            request = client.get(
                "/w/api.php",
                params={
                    "action": "query",
                    "format": "json",
                    # formatversion=2 를 주면 query.pages 가 pageid 키 객체가 아니라 배열이 된다.
                    "formatversion": "2",
                    "prop": "extracts",
                    # 서두만 평문으로. 이게 없으면 문서 전체가 HTML 로 와서 저장 크기가 폭증한다.
                    "exintro": "1",
                    "explaintext": "1",
                    "redirects": "1",
                    "titles": title,
                },
            )
        else:
            request = client.get(f"/api/rest_v1/page/summary/{quote(title, safe='')}")

        try:
            response = await request
        except httpx.RequestError as exc:
            logger.warning("위키백과 연결 실패(%s/%s): %s", lang.value, title, exc)
            return None
        if response.status_code == httpx.codes.NOT_FOUND:
            # 없는 문서다. 수집 실패와 구분해 조용히 빈 결과로 만든다.
            return None
        if response.status_code != httpx.codes.OK:
            logger.warning(
                "위키백과 응답 이상(%s/%s, status=%s)",
                lang.value,
                title,
                response.status_code,
            )
            return None
        try:
            return response.json()
        except ValueError:
            logger.warning("위키백과 응답이 JSON 이 아니다(%s/%s)", lang.value, title)
            return None

    async def aclose(self) -> None:
        for client in self._clients.values():
            await client.aclose()
