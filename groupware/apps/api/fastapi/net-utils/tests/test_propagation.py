"""서비스 경계를 넘는 상관관계 전파: 이 파이프라인 전체의 존재 이유.

인바운드 미들웨어와 아웃바운드 클라이언트를 실제로 연결해 검증한다. 둘을 따로 테스트하면
각자 통과하면서도 중간에서 끊길 수 있다(헤더 이름 불일치 등). 여기서는 A → B 홉을 실제로 태운다.

같이 잠그는 것: 커넥션 재사용(성능). 예전 구현은 요청마다 AsyncClient 를 새로 만들어
호출마다 TCP 핸드셰이크가 발생했다. 트래픽이 늘수록 지연과 TIME_WAIT 이 함께 늘던 구조다.
"""

from __future__ import annotations

import httpx
from fastapi import FastAPI, Request

from csc_net_utils import (
    CorrelationIdMiddleware,
    ServiceTokenMiddleware,
    create_service_token,
    get_request_context,
)
from csc_net_utils.http_client import ServiceHttpClient

SECRET = "propagation-secret"


def downstream_app() -> FastAPI:
    """B 서버: 받은 상관관계를 그대로 돌려준다."""
    app = FastAPI()

    @app.get("/echo")
    async def echo(request: Request) -> dict[str, str | int | None]:
        ctx = get_request_context()
        return {
            "trace_id": ctx.trace_id if ctx else None,
            "request_id": ctx.request_id if ctx else None,
            "organization_id": ctx.organization_id if ctx else None,
            "service": getattr(request.state, "service", None),
        }

    app.add_middleware(
        ServiceTokenMiddleware, secret=SECRET, allowed_services={"caller"}
    )
    app.add_middleware(CorrelationIdMiddleware)
    return app


def client_to(app: FastAPI) -> ServiceHttpClient:
    return ServiceHttpClient(
        "http://downstream",
        token_provider=lambda: create_service_token(SECRET, "caller"),
        transport=httpx.ASGITransport(app=app),
    )


async def test_trace_는_홉을_넘어_유지되고_request_는_갈린다() -> None:
    """상관관계의 핵심 계약. 이게 깨지면 '행위 1건 전체'를 못 모은다."""
    downstream = downstream_app()

    # A 서버: 요청을 받아 B 를 호출하고 양쪽 컨텍스트를 비교한다.
    upstream = FastAPI()
    http = client_to(downstream)

    @upstream.get("/call")
    async def call() -> dict:
        mine = get_request_context()
        theirs = await http.get("/echo")
        return {"mine": {"trace": mine.trace_id, "request": mine.request_id}, "theirs": theirs}

    upstream.add_middleware(CorrelationIdMiddleware)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=upstream), base_url="http://up"
    ) as c:
        body = (await c.get("/call", headers={"X-Trace-Id": "root-trace"})).json()

    assert body["mine"]["trace"] == "root-trace"
    assert body["theirs"]["trace_id"] == "root-trace"          # 이어짐
    assert body["theirs"]["request_id"] != body["mine"]["request"]  # 홉마다 갈림


async def test_진입점에서_trace_가_생성되어_전파된다() -> None:
    """브라우저는 trace 를 안 보낸다. 진입점(BFF/첫 서버)이 만들어야 한다."""
    downstream = downstream_app()
    upstream = FastAPI()
    http = client_to(downstream)

    @upstream.get("/call")
    async def call() -> dict:
        return {"mine": get_request_context().trace_id, "theirs": await http.get("/echo")}

    upstream.add_middleware(CorrelationIdMiddleware)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=upstream), base_url="http://up"
    ) as c:
        body = (await c.get("/call")).json()  # trace 헤더 없이 호출

    assert body["mine"]
    assert body["theirs"]["trace_id"] == body["mine"]


async def test_조직_헤더가_컨텍스트로_들어온다() -> None:
    """로그가 자동으로 조직 스코프를 갖게 하는 경로."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=downstream_app()), base_url="http://d"
    ) as c:
        body = (
            await c.get(
                "/echo",
                headers={
                    "X-Service-Token": create_service_token(SECRET, "caller"),
                    "X-Organization-Id": "42",
                    "X-User-Id": "7",
                },
            )
        ).json()

    assert body["organization_id"] == 42


async def test_잘못된_조직_헤더는_요청을_깨뜨리지_않는다() -> None:
    """org 헤더는 로그 스코프 힌트일 뿐 인가 근거가 아니다. 400 을 내면 안 쓰는 라우트까지 깨진다."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=downstream_app()), base_url="http://d"
    ) as c:
        resp = await c.get(
            "/echo",
            headers={
                "X-Service-Token": create_service_token(SECRET, "caller"),
                "X-Organization-Id": "not-a-number",
            },
        )

    assert resp.status_code == 200
    assert resp.json()["organization_id"] is None


async def test_컨텍스트_밖_호출은_상관관계_헤더를_붙이지_않는다() -> None:
    """워커/크론이 가짜 trace 를 만들어 로그를 오염시키지 않게."""
    seen: dict[str, str | None] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        seen["trace"] = request.headers.get("x-trace-id")
        return httpx.Response(200, json={})

    http = ServiceHttpClient(
        "http://x",
        token_provider=lambda: "t",
        transport=httpx.MockTransport(handler),
    )
    await http.get("/y")

    assert seen["trace"] is None


async def test_클라이언트는_커넥션을_재사용한다() -> None:
    """요청마다 AsyncClient 를 새로 만들면 매번 TCP 핸드셰이크가 발생한다(예전 구현)."""
    http = ServiceHttpClient(
        "http://x",
        transport=httpx.MockTransport(lambda _r: httpx.Response(200, json={})),
    )

    await http.get("/a")
    first = http._client()
    await http.get("/b")

    assert http._client() is first  # 같은 인스턴스 재사용
    await http.aclose()
