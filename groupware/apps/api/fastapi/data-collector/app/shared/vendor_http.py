"""외부 벤더 호출용 httpx 클라이언트 팩토리 (실사용 수집 어댑터 공용).

csc_net_utils 의 ServiceHttpClient 를 쓰지 않는다. 그건 내부 서비스 간 호출용이라 외부
호스트에까지 `X-Service-Token` 을 실어 보낸다. 수집 대상은 남의 서버다.

여기 있는 것은 클라이언트 생성 규칙 하나뿐이다. 인증, 파라미터, 파싱은 각 소스 어댑터가
벤더 규약대로 채운다(그게 소스가 소유해야 하는 지식이다).
"""

from __future__ import annotations

import httpx

# 수집 대상 사이트가 브라우저 UA 를 기대하는 경우가 있어 기본값을 둔다. 소스가 필요하면 덮어쓴다.
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/108.0.0.0 Safari/537.36"
)


def create_vendor_client(
    *,
    base_url: str,
    timeout: float,
    headers: dict[str, str] | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> httpx.AsyncClient:
    """벤더 호출용 클라이언트.

    재시도는 연결 수립 단계에만 건다. 요청이 벤더에 도달한 뒤의 재시도는 중복 호출이 되어
    쿼터를 두 번 태운다.

    transport 주입 훅은 테스트(httpx.MockTransport)용이다. 이게 없으면 어댑터 테스트가 실제
    네트워크를 타야 해서 CI 에서 쓸 수 없다.
    """
    return httpx.AsyncClient(
        base_url=base_url,
        timeout=timeout,
        headers={"User-Agent": DEFAULT_USER_AGENT, **(headers or {})},
        transport=transport or httpx.AsyncHTTPTransport(retries=1),
        # 리다이렉트는 따라간다(Wikipedia 제목 정규화 등 정상 동작에 필요하다).
        follow_redirects=True,
    )
