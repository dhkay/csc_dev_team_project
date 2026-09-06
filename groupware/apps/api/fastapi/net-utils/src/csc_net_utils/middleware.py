"""ASGI 미들웨어: 상관관계 컨텍스트 + 보안 Layer 3(서버 간 인증).

계약: docs/specs/service-http-contract.md §1, §4.
TS 측 동일 구현: packages/net-utils (ServiceTokenGuard / correlationIdMiddleware).

둘 다 `BaseHTTPMiddleware` 가 아니라 순수 ASGI 로 작성했다. BaseHTTPMiddleware 는 요청마다
anyio 태스크 그룹 + 메모리 오브젝트 스트림 2개를 만들어 본문을 중계한다. 미들웨어 하나당 비용이라
스택을 쌓을수록 선형으로 늘고, 본문 스트리밍이 한 번 더 복사된다. 이 두 미들웨어는 모든 요청에
붙으므로 그 비용을 지불할 이유가 없다. 둘 다 헤더만 보고 본문은 건드리지 않는다.
(벤치: apps/api/fastapi/net-utils/bench_middleware.py)
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence

from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .request_context import (
    REQUEST_ID_HEADER,
    TRACE_ID_HEADER,
    context_from_headers,
    reset_request_context,
    set_request_context,
)
from .service_token import verify_service_token

# 헬스/문서: 모든 앱 공통 검증 제외.
DEFAULT_EXEMPT_PREFIXES: tuple[str, ...] = (
    "/health",
    "/info",
    "/docs",
    "/openapi.json",
    "/redoc",
)


def require_services(*allowed: str) -> Callable[[Request], None]:
    """라우트별 호출자 신원 제한 의존성. 미들웨어가 통과시킨(state.service 가 있는) 요청만 도달한다.

    starlette 의 HTTPException 을 쓴다. FastAPI 가 같은 핸들러로 처리하므로 응답은 동일하고
    (`{"detail": ...}`), 이 모듈이 웹 프레임워크가 아니라 ASGI 툴킷에만 의존하게 된다.
    """

    def _dep(request: Request) -> None:
        if getattr(request.state, "service", None) not in allowed:
            raise HTTPException(status_code=403, detail="허용되지 않은 서비스입니다.")

    return _dep


def _find_header(scope: Scope, name: bytes) -> str | None:
    """ASGI 스코프에서 헤더 1개를 찾는다.

    dict 를 만들지 않고 선형 스캔한다. 헤더는 보통 10~20개라 dict 생성보다 스캔이 싸다.
    """
    for key, value in scope["headers"]:
        if key == name:
            return value.decode("latin-1")
    return None


_TRACE_KEY = b"x-trace-id"
_ORG_KEY = b"x-organization-id"
_USER_KEY = b"x-user-id"


def _scan_correlation_headers(scope: Scope) -> tuple[str | None, str | None, str | None]:
    """trace/org/user 헤더를 한 번의 스캔으로 뽑는다(헤더별로 훑지 않는다)."""
    trace = org = user = None
    for key, value in scope["headers"]:
        if key == _TRACE_KEY:
            trace = value.decode("latin-1")
        elif key == _ORG_KEY:
            org = value.decode("latin-1")
        elif key == _USER_KEY:
            user = value.decode("latin-1")
    return trace, org, user


def _as_int(raw: str | None) -> int | None:
    """헤더 문자열 → 양의 정수. 형식이 어긋나면 None(요청을 거부하지는 않는다).

    이 값은 로그 스코프 힌트일 뿐 인가 근거가 아니다. 인가는 라우트가 본문/의존성으로 받은
    값을 서비스 계층에서 검증한다. 여기서 400 을 던지면 org 헤더를 안 쓰는 엔드포인트까지 깨진다.
    """
    if not raw:
        return None
    try:
        value = int(raw)
    except ValueError:
        return None
    return value if value > 0 else None


class CorrelationIdMiddleware:
    """인바운드 요청에 trace/request id 컨텍스트를 깐다 (순수 ASGI).

    - trace_id: 헤더에 있으면 채택(끝에서 끝까지 유지), 없으면 생성.
    - request_id: 항상 새로 생성: 홉마다 달라야 "이 호출만" 을 집어낼 수 있다.
    - 두 값을 응답 헤더로 되돌려 호출자가 서버 로그를 바로 찾게 한다.

    서비스토큰 미들웨어보다 바깥에 두어야 한다. 그래야 401 응답에도 상관관계가 붙는다
    장애 조사에서 가장 보고 싶은 게 거부된 요청이다.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # org/user 도 같이 담는다. 이게 있어야 로그가 자동으로 조직 스코프를 갖는다.
        # (BFF 가 세션에서 도출해 보낸 값. 신뢰 경계 = 서비스토큰 계층.)
        trace_raw, org_raw, user_raw = _scan_correlation_headers(scope)
        context = context_from_headers(
            {TRACE_ID_HEADER: trace_raw} if trace_raw else {},
            organization_id=_as_int(org_raw),
            user_id=_as_int(user_raw),
        )

        # 다운스트림(라우터/서비스/로그)이 request.state 로도 읽을 수 있게 남긴다.
        state = scope.setdefault("state", {})
        state["trace_id"] = context.trace_id
        state["request_id"] = context.request_id

        trace_header = (TRACE_ID_HEADER.encode(), context.trace_id.encode())
        request_header = (REQUEST_ID_HEADER.encode(), context.request_id.encode())

        async def send_with_correlation(message: Message) -> None:
            if message["type"] == "http.response.start":
                message.setdefault("headers", []).extend((trace_header, request_header))
            await send(message)

        token = set_request_context(context)
        try:
            await self.app(scope, receive, send_with_correlation)
        finally:
            reset_request_context(token)


class ServiceTokenMiddleware:
    """보안 Layer 3: `X-Service-Token`(HS256) 검증 (순수 ASGI).

    BFF/다른 백엔드가 보내는 토큰을 검증한다. NestJS ServiceTokenGuard, TS `@csc/net-utils` 와
    동일 계약. 검증 로직은 `service_token.verify_service_token` 위임.

    - 헬스/문서 경로는 검증 제외. 앱별 추가 예외(/blob, /files 등)는 `exempt_prefixes` 로 주입.
    - 통과 시 `request.state.service` 에 호출자 신원을 남겨 라우트별 `require_services` 로 좁힌다.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        secret: str,
        allowed_services: Iterable[str],
        exempt_prefixes: Sequence[str] = DEFAULT_EXEMPT_PREFIXES,
    ) -> None:
        self.app = app
        self._secret = secret
        self._allowed = set(allowed_services)
        self._exempt = tuple(exempt_prefixes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        if scope["path"].startswith(self._exempt):
            await self.app(scope, receive, send)
            return

        token = _find_header(scope, b"x-service-token")
        service = verify_service_token(token, self._secret, self._allowed) if token else None
        if service is None:
            response = JSONResponse(
                {"detail": "유효하지 않은 서비스 토큰입니다."},
                status_code=401,
            )
            await response(scope, receive, send)
            return

        # 라우트별 require_services 가 읽을 호출자 신원.
        scope.setdefault("state", {})["service"] = service
        await self.app(scope, receive, send)
