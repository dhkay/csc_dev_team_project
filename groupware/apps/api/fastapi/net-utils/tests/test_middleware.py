"""미들웨어 계약 잠금: 순수 ASGI 전환 후에도 동작이 같아야 한다.

`ServiceTokenMiddleware` 를 BaseHTTPMiddleware 에서 순수 ASGI 로 바꿨다(성능). 겉보기 계약이
하나라도 달라지면 전 서비스의 인증이 조용히 틀어지므로 여기서 못 박는다.
"""

from __future__ import annotations

import httpx
import pytest
from fastapi import Depends, FastAPI, Request

from csc_net_utils import (
    CorrelationIdMiddleware,
    ServiceTokenMiddleware,
    create_service_token,
    get_trace_id,
    require_services,
)

SECRET = "test-secret"


def build_app(*, exempt: tuple[str, ...] | None = None) -> FastAPI:
    app = FastAPI()

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/who")
    async def who(request: Request) -> dict[str, str | None]:
        # 미들웨어가 남긴 호출자 신원 + 컨텍스트를 그대로 돌려준다.
        return {
            "service": getattr(request.state, "service", None),
            "trace_id": get_trace_id(),
            "state_trace": getattr(request.state, "trace_id", None),
        }

    @app.get("/only-video", dependencies=[Depends(require_services("video-model"))])
    async def only_video() -> dict[str, bool]:
        return {"ok": True}

    kwargs = {"exempt_prefixes": exempt} if exempt else {}
    app.add_middleware(
        ServiceTokenMiddleware,
        secret=SECRET,
        allowed_services={"web-groupware", "video-model"},
        **kwargs,
    )
    app.add_middleware(CorrelationIdMiddleware)
    return app


def client(app: FastAPI) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")


def token(service: str) -> dict[str, str]:
    return {"X-Service-Token": create_service_token(SECRET, service)}


# ---- ServiceTokenMiddleware ----
async def test_토큰이_없으면_401() -> None:
    async with client(build_app()) as c:
        resp = await c.get("/who")

    assert resp.status_code == 401


async def test_허용되지_않은_서비스는_401() -> None:
    async with client(build_app()) as c:
        resp = await c.get("/who", headers=token("stranger"))

    assert resp.status_code == 401


async def test_유효_토큰은_통과하고_신원이_남는다() -> None:
    async with client(build_app()) as c:
        resp = await c.get("/who", headers=token("web-groupware"))

    assert resp.status_code == 200
    assert resp.json()["service"] == "web-groupware"


async def test_헬스_경로는_토큰_없이_통과한다() -> None:
    async with client(build_app()) as c:
        resp = await c.get("/health")

    assert resp.status_code == 200


async def test_커스텀_면제_prefix_가_적용된다() -> None:
    """file-upload 의 /blob, /files 처럼 브라우저 직접 경로용."""
    app = build_app(exempt=("/health", "/who"))
    async with client(app) as c:
        resp = await c.get("/who")

    assert resp.status_code == 200
    assert resp.json()["service"] is None  # 면제라 신원 없음


async def test_라우트별_require_services_가_좁힌다() -> None:
    async with client(build_app()) as c:
        allowed = await c.get("/only-video", headers=token("video-model"))
        denied = await c.get("/only-video", headers=token("web-groupware"))

    assert allowed.status_code == 200
    assert denied.status_code == 403  # 전역은 통과, 라우트에서 거부


# ---- CorrelationIdMiddleware ----
async def test_응답에_상관관계_헤더가_실린다() -> None:
    async with client(build_app()) as c:
        resp = await c.get("/who", headers=token("web-groupware"))

    assert resp.headers["x-trace-id"]
    assert resp.headers["x-request-id"]
    assert resp.headers["x-trace-id"] != resp.headers["x-request-id"]


async def test_들어온_trace_를_이어받는다() -> None:
    async with client(build_app()) as c:
        resp = await c.get(
            "/who", headers={**token("web-groupware"), "X-Trace-Id": "upstream-trace"}
        )

    assert resp.headers["x-trace-id"] == "upstream-trace"
    assert resp.json()["trace_id"] == "upstream-trace"


async def test_잘못된_trace_는_무시하고_새로_만든다() -> None:
    async with client(build_app()) as c:
        resp = await c.get("/who", headers={**token("web-groupware"), "X-Trace-Id": "bad value!"})

    assert resp.headers["x-trace-id"] != "bad value!"
    assert len(resp.headers["x-trace-id"]) == 16


async def test_401_응답에도_상관관계가_붙는다() -> None:
    """거부된 요청이야말로 장애 조사에서 가장 보고 싶은 대상이다."""
    async with client(build_app()) as c:
        resp = await c.get("/who")

    assert resp.status_code == 401
    assert resp.headers["x-trace-id"]


async def test_요청_사이에_컨텍스트가_새지_않는다() -> None:
    async with client(build_app()) as c:
        first = await c.get("/who", headers={**token("web-groupware"), "X-Trace-Id": "trace-one"})
        second = await c.get("/who", headers=token("web-groupware"))

    assert first.json()["trace_id"] == "trace-one"
    assert second.json()["trace_id"] != "trace-one"


async def test_request_state_로도_읽을_수_있다() -> None:
    """contextvar 를 못 쓰는 자리(의존성/예외핸들러)를 위한 통로."""
    async with client(build_app()) as c:
        resp = await c.get("/who", headers={**token("web-groupware"), "X-Trace-Id": "via-state"})

    assert resp.json()["state_trace"] == "via-state"


@pytest.mark.parametrize("kind", ["websocket", "lifespan"])
async def test_http_가_아닌_스코프는_그대로_통과시킨다(kind: str) -> None:
    """순수 ASGI 미들웨어는 http 외 스코프를 반드시 패스스루해야 한다(안 하면 앱이 기동조차 안 된다)."""
    seen: list[str] = []

    async def inner(scope, receive, send) -> None:  # noqa: ANN001
        seen.append(scope["type"])

    mw = CorrelationIdMiddleware(ServiceTokenMiddleware(inner, secret=SECRET, allowed_services=[]))
    await mw({"type": kind}, None, None)

    assert seen == [kind]
