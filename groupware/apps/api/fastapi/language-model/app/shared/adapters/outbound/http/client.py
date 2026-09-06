"""외부 벤더/엔진 호출용 httpx 클라이언트 생성.

한곳에서 만드는 이유. 벤더 어댑터마다 `httpx.AsyncClient(...)` 를 직접 만들면 재시도 여부가 조용히
갈린다. 한쪽만 연결 재시도를 걸어 두면 다른 쪽은 연결이 한 번 튄 순간 기획서 생성이 그대로
500 으로 끝난다.

재시도 루프를 직접 짜지 않는 이유. 여기서 재시도해도 되는 건 연결이 맺어지지 않은 요청뿐이다.
요청이 벤더에 도달한 뒤 실패한 것을 다시 보내면 같은 작업을 두 번 청구당한다(이미지 생성처럼
호출당 과금되는 경로에서는 곧바로 돈이 샌다).
`httpx.AsyncHTTPTransport(retries=N)` 이 정확히 그 경계를 지킨다. 재시도는 httpcore 의
`_connect`(연결 수립) 안에서만 일어나고 `handle_async_request`(요청 전송 이후)에는 관여하지
않는다. 그래서 손으로 짠 루프보다 안전하고, 무엇이 재시도되는지가 타입으로 드러난다.

csc_net_utils 의 `ServiceHttpClient` 와 다른 물건이다. 그쪽은 내부 서비스 간 호출용이라
`X-Service-Token` 을 붙인다. 여기 클라이언트는 외부 벤더와 자체 GPU 엔진을 부르므로 서비스토큰이
없고, 인증은 어댑터가 벤더 규약대로(x-api-key, Authorization 등) 채운다.
"""

from __future__ import annotations

import httpx

#: 연결 수립 실패 시 재시도 횟수. 1 = 최초 시도 + 재시도 1회.
#:
#: 순간적으로 튄 연결을 한 번 더 시도해 살리는 게 목적이라 1 로 둔다. 크게 잡으면 엔진이 정말
#: 죽었을 때 사용자를 그만큼 더 기다리게 만들 뿐이다(연결 실패는 대개 즉시 나므로 지연은 작지만,
#: 죽은 대상을 여러 번 두드리는 건 진단만 흐린다).
DEFAULT_CONNECT_RETRIES = 1


def create_http_client(
    *,
    base_url: str,
    timeout: float,
    headers: dict[str, str] | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
    retries: int = DEFAULT_CONNECT_RETRIES,
) -> httpx.AsyncClient:
    """벤더/엔진 호출용 AsyncClient.

    :param transport: 테스트가 주입하는 대역(MockTransport). 주면 재시도 트랜스포트 대신 그걸
        그대로 쓴다(대역이 재시도에 가려지면 테스트가 무엇을 검증하는지 흐려진다).
    :param retries: 연결 수립 재시도 횟수. 상태 조회처럼 빨리 포기하는 편이 나은 보조 호출은
        0 을 넘겨 즉시 실패시킨다.
    """
    return httpx.AsyncClient(
        base_url=base_url.rstrip("/"),
        timeout=timeout,
        headers=headers,
        transport=transport or httpx.AsyncHTTPTransport(retries=retries),
    )
