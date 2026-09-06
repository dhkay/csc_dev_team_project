"""서버 간 아웃바운드 HTTP 클라이언트 (httpx async).

`csc-net-utils[http]` 익스트라에서만 사용 가능(httpx 필요). httpx 미설치 앱에서 import 되지 않도록
패키지 `__init__` 은 이 모듈을 노출하지 않는다. 필요한 앱이 명시적으로 import 한다:
    from csc_net_utils.http_client import ServiceHttpClient

계약: docs/specs/service-http-contract.md §3 (토큰 주입, 타임아웃, 재시도, 에러 봉투).
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Any

import httpx

from .request_context import correlation_headers


class ServiceHttpError(Exception):
    """정규화된 서버 간 HTTP 에러(상태, 봉투 보존)."""

    def __init__(self, status_code: int, message: str, body: Any | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body = body


def _extract_message(body: Any, fallback: str) -> str:
    if isinstance(body, dict):
        for key in ("error", "message", "detail"):
            value = body.get(key)
            if isinstance(value, str) and value:
                return value
    return fallback


class ServiceHttpClient:
    """X-Service-Token 자동 주입 + 타임아웃 + 재시도(네트워크/타임아웃/5xx)."""

    def __init__(
        self,
        base_url: str,
        *,
        token_provider: Callable[[], str] | None = None,
        timeout: float = 10.0,
        retries: int = 0,
        backoff: Callable[[int], float] | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = token_provider
        self._timeout = timeout
        self._retries = retries
        self._backoff = backoff or (lambda attempt: float(min(2**attempt, 30)))
        self._transport = transport  # 테스트 주입용(MockTransport). prod 는 None.
        # 커넥션 재사용: 아래 _client() 주석 참고.
        self._pool: httpx.AsyncClient | None = None
        self._pool_lock = asyncio.Lock()

    def _client(self) -> httpx.AsyncClient:
        """지연 생성되는 공유 AsyncClient.

        요청마다 `async with httpx.AsyncClient(...)` 로 새로 만들면 호출마다 커넥션 풀을 만들고
        버려서 TCP 와 TLS 핸드셰이크가 매번 발생한다. 트래픽이 늘수록 지연과 TIME_WAIT 소켓이
        함께 늘어난다. 클라이언트를 인스턴스 수명 동안 재사용하면 keep-alive 로 커넥션이 유지된다.

        어댑터들이 이 클라이언트를 싱글톤으로 들고 있으므로(video-model worker 등) 수명은 그들과 같다.
        """
        if self._pool is None:
            self._pool = httpx.AsyncClient(
                timeout=self._timeout,
                transport=self._transport,
                # 서버 간 호출은 상대가 소수(도커 서비스명)라 작은 풀로 충분하다.
                limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
            )
        return self._pool

    async def aclose(self) -> None:
        """공유 클라이언트를 닫는다(앱 종료 시). 호출하지 않아도 프로세스 종료로 정리된다."""
        async with self._pool_lock:
            if self._pool is not None:
                await self._pool.aclose()
                self._pool = None

    def _headers(self, has_body: bool) -> dict[str, str]:
        # 상관관계(trace/request id) 전파: 컨텍스트가 없으면 빈 dict 라 비용이 사실상 0.
        headers: dict[str, str] = correlation_headers()
        if has_body:
            headers["Content-Type"] = "application/json"
        if self._token is not None:
            headers["X-Service-Token"] = self._token()
        return headers

    async def request(
        self, method: str, path: str, *, json: Any | None = None
    ) -> Any:
        last_exc: Exception | None = None
        for attempt in range(self._retries + 1):
            try:
                resp = await self._client().request(
                    method,
                    f"{self._base_url}{path}",
                    json=json,
                    headers=self._headers(json is not None),
                )
                if resp.status_code >= 400:
                    body = _safe_json(resp)
                    err = ServiceHttpError(
                        resp.status_code,
                        _extract_message(body, "서버 간 요청 실패"),
                        body,
                    )
                    # 4xx 는 재시도하지 않음.
                    if resp.status_code < 500 or attempt >= self._retries:
                        raise err
                    last_exc = err
                else:
                    return _safe_json(resp)
            except (httpx.TransportError, httpx.TimeoutException) as exc:
                last_exc = exc
                if attempt >= self._retries:
                    raise ServiceHttpError(503, "서비스에 연결할 수 없습니다") from exc
            await asyncio.sleep(self._backoff(attempt))
        assert last_exc is not None
        raise last_exc

    async def get(self, path: str) -> Any:
        return await self.request("GET", path)

    async def post(self, path: str, json: Any | None = None) -> Any:
        return await self.request("POST", path, json=json)

    async def patch(self, path: str, json: Any | None = None) -> Any:
        return await self.request("PATCH", path, json=json)

    async def delete(self, path: str) -> Any:
        return await self.request("DELETE", path)


def _safe_json(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except ValueError:
        return resp.text or None
