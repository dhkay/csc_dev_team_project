"""csc_net_utils.http_client.ServiceHttpClient 테스트 (httpx MockTransport).
TS `@csc/net-utils` createHttpClient 와 동일 계약. 계약: docs/specs/service-http-contract.md §3.
"""

import httpx
import pytest

from csc_net_utils.http_client import ServiceHttpClient, ServiceHttpError

NO_BACKOFF = lambda _attempt: 0.0  # noqa: E731 - 테스트 빠르게


def _client(handler, **kw) -> ServiceHttpClient:
    return ServiceHttpClient(
        "http://svc",
        transport=httpx.MockTransport(handler),
        backoff=NO_BACKOFF,
        **kw,
    )


@pytest.mark.asyncio
async def test_성공시_json_반환하고_X_Service_Token_주입():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["token"] = req.headers.get("X-Service-Token")
        seen["url"] = str(req.url)
        return httpx.Response(200, json={"ok": True})

    client = _client(handler, token_provider=lambda: "tok-123")
    assert await client.post("/jobs", json={"a": 1}) == {"ok": True}
    assert seen["token"] == "tok-123"
    assert seen["url"] == "http://svc/jobs"


@pytest.mark.asyncio
async def test_4xx_는_재시도없이_ServiceHttpError():
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(409, json={"code": "DUP", "message": "중복"})

    client = _client(handler, retries=3)
    with pytest.raises(ServiceHttpError) as ei:
        await client.post("/x", json={})
    assert ei.value.status_code == 409
    assert calls["n"] == 1  # 4xx → 재시도 없음


@pytest.mark.asyncio
async def test_5xx_는_retries_만큼_재시도후_던짐():
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503, json={"message": "down"})

    client = _client(handler, retries=2)
    with pytest.raises(ServiceHttpError):
        await client.get("/x")
    assert calls["n"] == 3  # 최초 1 + 재시도 2


@pytest.mark.asyncio
async def test_네트워크_실패는_503():
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    client = _client(handler, retries=1)
    with pytest.raises(ServiceHttpError) as ei:
        await client.get("/x")
    assert ei.value.status_code == 503
