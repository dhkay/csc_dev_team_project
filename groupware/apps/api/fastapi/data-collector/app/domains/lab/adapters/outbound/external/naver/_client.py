"""외부 벤더용 httpx 클라이언트 + 왕복 기록 헬퍼.

csc_net_utils 의 ServiceHttpClient 를 쓰지 않는다. 그건 내부 서비스 간 호출용이라
(1) 외부 호스트에까지 X-Service-Token 과 상관관계 헤더를 실어 보내고,
(2) 400 이상에서 예외를 던지며 성공 시엔 body 만 남겨 상태코드/헤더/소요시간을 버린다.
이 표면은 정확히 그 정보를 보려고 존재하므로 반대 성질이 필요하다. 인증은 어댑터가 벤더 규약대로 채운다.
(language-model 의 외부 벤더 클라이언트와 같은 판단이다.)
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from .....core.domain.entities import UpstreamExchange
from .....core.domain.errors import UpstreamUnreachableError


def create_http_client(
    *, base_url: str, timeout: float, transport: httpx.AsyncBaseTransport | None = None
) -> httpx.AsyncClient:
    """벤더 호출용 클라이언트. transport 주입 훅은 테스트(MockTransport)용이다."""
    return httpx.AsyncClient(
        base_url=base_url,
        timeout=timeout,
        # 재시도는 연결 수립 단계에만 건다. 요청이 벤더에 도달한 뒤의 재시도는
        #   중복 호출이 되고 쿼터를 두 번 태운다.
        transport=transport or httpx.AsyncHTTPTransport(retries=1),
    )


async def exchange(
    client: httpx.AsyncClient,
    *,
    method: str,
    path: str,
    headers: dict[str, str],
    params: dict[str, Any] | None = None,
    json_body: Any | None = None,
) -> UpstreamExchange:
    """1회 호출의 왕복 기록. 4xx/5xx 로 예외를 던지지 않는다(그게 이 표면의 결과값이다)."""
    started = time.perf_counter()
    try:
        response = await client.request(
            method, path, headers=headers, params=params, json=json_body
        )
    except httpx.RequestError as exc:
        # 연결 실패/타임아웃: 상태코드가 존재하지 않아 업스트림 판단이 불가능하다.
        raise UpstreamUnreachableError(f"{type(exc).__name__}: {exc}") from exc
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    try:
        body: Any = response.json()
    except ValueError:
        body = response.text

    return UpstreamExchange(
        method=method,
        url=str(response.request.url),
        # 값이 아니라 **이름만** 싣는다. 네 API 모두 헤더로 인증하므로 값을 실으면
        #   Scalar 화면과 게이트웨이 프록시 로그에 살아 있는 시크릿이 찍힌다.
        sent_header_names=tuple(headers.keys()),
        request_body=json_body,
        status_code=response.status_code,
        elapsed_ms=elapsed_ms,
        body=body,
    )
