"""미들웨어/컨텍스트 오버헤드 측정.

주장을 코드 옆에 근거로 남기기 위한 것이다. 두 가지를 잰다:
1. 순수 ASGI vs BaseHTTPMiddleware: 왜 전자로 썼는지.
2. id 생성 후보 비교(generate_id vs secrets.token_hex vs uuid): Python 은 풀링이 오히려 느려서
   generate_id 가 os.urandom 직접 호출인 이유(측정값은 request_context.generate_id 주석에 있다).

실행: uv run --package csc-net-utils python bench_middleware.py
"""

from __future__ import annotations

import asyncio
import time
import uuid
from secrets import token_hex

import httpx
from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware

from csc_net_utils import CorrelationIdMiddleware, generate_id

REQUESTS = 3000


class _NoopBaseHTTP(BaseHTTPMiddleware):
    """비교군: 아무 일도 안 하는 BaseHTTPMiddleware. 순수 프레임워크 오버헤드만 측정."""

    async def dispatch(self, request, call_next):  # noqa: ANN001, ANN201
        return await call_next(request)


class _NoopPureAsgi:
    """비교군: 아무 일도 안 하는 순수 ASGI 미들웨어."""

    def __init__(self, app) -> None:  # noqa: ANN001
        self.app = app

    async def __call__(self, scope, receive, send) -> None:  # noqa: ANN001
        await self.app(scope, receive, send)


def _app(middleware: type | None) -> FastAPI:
    app = FastAPI()

    @app.get("/p")
    async def ping() -> dict[str, int]:
        return {"n": 1}

    if middleware is not None:
        app.add_middleware(middleware)
    return app


async def _measure(app: FastAPI, label: str) -> float:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://b") as c:
        await c.get("/p")  # 워밍업
        start = time.perf_counter()
        for _ in range(REQUESTS):
            await c.get("/p")
        elapsed = time.perf_counter() - start
    per_req_us = elapsed / REQUESTS * 1e6
    print(f"  {label:<34} {per_req_us:8.1f} µs/req   ({REQUESTS/elapsed:,.0f} req/s)")
    return per_req_us


def _bench_ids() -> None:
    print("\n[2] id 생성 (100,000회)")
    n = 100_000
    for label, fn in (
        ("generate_id() 풀링 8B hex", generate_id),
        ("secrets.token_hex(8)", lambda: token_hex(8)),
        ("uuid.uuid4().hex", lambda: uuid.uuid4().hex),
        ("str(uuid.uuid4())", lambda: str(uuid.uuid4())),
    ):
        fn()  # 워밍업
        start = time.perf_counter()
        for _ in range(n):
            fn()
        elapsed = time.perf_counter() - start
        print(f"  {label:<34} {elapsed / n * 1e9:8.0f} ns/개   ({n/elapsed:,.0f}/s)")


async def main() -> None:
    print(f"\n[1] 미들웨어 오버헤드 (요청 {REQUESTS:,}회, ASGITransport 인프로세스)")
    base = await _measure(_app(None), "미들웨어 없음 (기준선)")
    pure = await _measure(_app(_NoopPureAsgi), "순수 ASGI (no-op)")
    heavy = await _measure(_app(_NoopBaseHTTP), "BaseHTTPMiddleware (no-op)")
    real = await _measure(_app(CorrelationIdMiddleware), "CorrelationIdMiddleware (실제)")

    print()
    print(f"  순수 ASGI 오버헤드            +{pure - base:6.1f} µs/req")
    print(f"  BaseHTTPMiddleware 오버헤드   +{heavy - base:6.1f} µs/req"
          f"  ({(heavy - base) / max(pure - base, 0.01):.1f}배)")
    print(f"  상관관계 미들웨어 실측         +{real - base:6.1f} µs/req")

    _bench_ids()
    print()


if __name__ == "__main__":
    asyncio.run(main())
