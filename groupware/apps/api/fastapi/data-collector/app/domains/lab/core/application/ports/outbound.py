"""lab Outbound 포트 (Protocol).

소스마다 별도 포트를 둔다. 하나의 `probe(source, payload: Any)` 로 합치면 payload 가 Any 가 되고
서비스 안에 `match source:` 가 생겨, 포트가 계약이기를 멈추고 타입 검사가 도와주지 않게 된다.

새 소스 추가 = 포트 1 + 어댑터 1 + 라우트 1 + LabSource 한 줄. 기존 코드는 손대지 않는다.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Protocol

from ...domain.entities import (
    KeywordToolQuery,
    SearchTrendQuery,
    ShoppingCategoriesQuery,
    ShoppingKeywordAgeQuery,
    UpstreamExchange,
)
from ...domain.types import LabSource


class CredentialProviderPort(Protocol):
    """소스별 자격증명. 미설정 키는 빈 문자열로 온다(키 존재 여부만 계약).

    자격 확인은 어댑터가 한다(자기 필수 키 목록을 알기 때문). 여기서 예외를 던지면
    응답의 missingEnv 를 정확히 채울 수 없다.

    지금 구현은 플랫폼 env 하나뿐이지만 async 로 선언한다: 나중에 조직별 해석(csc-marketing
    내부 호출)으로 바꿔도 포트 시그니처가 흔들리지 않아야 한다.
    """

    async def for_source(self, source: LabSource) -> Mapping[str, str]: ...


class UpstreamProbePort(Protocol):
    """프로브 어댑터 공통: 커넥션 풀을 보유하므로 종료 훅을 계약에 넣는다.

    마운트된 서브앱의 lifespan 은 돌지 않으므로 부모 lifespan 이 이걸 호출한다.
    """

    async def aclose(self) -> None: ...


class NaverDatalabSearchPort(UpstreamProbePort, Protocol):
    async def search(self, query: SearchTrendQuery) -> UpstreamExchange: ...


class NaverShoppingCategoriesPort(UpstreamProbePort, Protocol):
    async def categories(self, query: ShoppingCategoriesQuery) -> UpstreamExchange: ...


class NaverShoppingKeywordAgePort(UpstreamProbePort, Protocol):
    async def keyword_age(self, query: ShoppingKeywordAgeQuery) -> UpstreamExchange: ...


class NaverSearchAdKeywordToolPort(UpstreamProbePort, Protocol):
    async def keywords(self, query: KeywordToolQuery) -> UpstreamExchange: ...
